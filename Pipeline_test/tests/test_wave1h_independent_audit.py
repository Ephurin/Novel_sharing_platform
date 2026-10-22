"""Independent offline evidence checks; no production behavior is replaced."""
import copy
import hashlib
import ipaddress
import json
import socket
import uuid
from types import SimpleNamespace

import pytest

from Pipeline_test.tests.test_wave1h_story_brain_context_delivery import (
    offline_gateway_stack, forbid_non_loopback_dns,
)
from Pipeline_test.tools.verify_story_brain_context_delivery import setup_canonical_story_brain
from application.context_budget import ContextBudgetPacker
from application.writing_service import WritingService
from core.llm_service import LLMService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


@pytest.fixture(autouse=True)
def deny_external_connect(monkeypatch):
    """Also reject direct IP connections, which a DNS-only guard cannot cover."""
    original = socket.socket.connect

    def connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            assert ipaddress.ip_address(address[0]).is_loopback, "EXTERNAL_CONNECT_DENIED"
        return original(sock, address)

    monkeypatch.setattr(socket.socket, "connect", connect)


def generate(stack, monkeypatch, *, mutate=False, fail_gateway=False, upstream_failure=False):
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id="audit-owned", novel_id="audit-novel")
    text = "Mai Linh theo dõi máy thu CV-04 tại trạm Bốn."
    source_hash = hashlib.sha256(text.encode()).hexdigest()
    nonce = "independent-" + uuid.uuid4().hex
    if upstream_failure:
        nonce += " fault:500"
    llm = LLMService(provider="gemini", model="gemini-3.5-flash-lite", api_key="", timeout_seconds=2)
    actual_generate = llm.generate_writing_draft

    def dispatch(**kwargs):
        if mutate:
            # Injection occurs AFTER WritingService has saved context_hash.
            kwargs["context_package"]["author_constraints"].append("INJECTED_AFTER_HASH")
        return actual_generate(**kwargs)

    monkeypatch.setattr(llm, "generate_writing_draft", dispatch)
    if fail_gateway:
        # Deny dispatch at this test-owned gateway; never fall back to a provider.
        monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "invalid-offline-token")
    service = WritingService(repository=repo, llm_service=llm, context_packer=ContextBudgetPacker())
    job = service.start_generation(
        tenant_id="audit-owned", novel_id="audit-novel", chapter_id="audit-ch4",
        revision_id="audit-rev4", content_hash=source_hash, operation="continue",
        selection={"start": 0, "end": len(text), "cursor": len(text)},
        instruction=nonce, expected_brain_version=1, chapter_number=4,
        source_text=text, process_inline=True,
    )
    return job, nonce


def verify_capture(job, nonce, stack, entry=None):
    """Independent acceptance assertion, not a new production context builder."""
    assert job.status == "completed", "GENERATION_FAILED"
    assert len(stack["received"]) == 1, "AMBIGUOUS_CAPTURE"
    entry = entry or stack["received"][0]
    calls = stack["ledger"].get_summary()["call_history"]
    assert len(calls) == 1, "AMBIGUOUS_DISPATCH"
    assert entry["dispatch_id"] == calls[0]["ticket_id"], "WRONG_DISPATCH"
    assert calls[0]["status"] == "SUCCESS", "TRANSMISSION_FAILED"
    prompt = entry["prompt_text"]
    assert nonce in prompt, "STALE_REQUEST"
    marker = "Bối cảnh tiểu thuyết (Story Brain): "
    payload = json.loads(prompt.split(marker, 1)[1].split("\n", 1)[0])
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                                      separators=(",", ":"), default=str).encode()).hexdigest()
    assert digest == job.context_hash, "CONTEXT_HASH_MISMATCH"
    assert hashlib.sha256(prompt.encode()).hexdigest() != digest
    return digest


def test_independent_correlated_capture(offline_gateway_stack, monkeypatch):
    job, nonce = generate(offline_gateway_stack, monkeypatch)
    digest = verify_capture(job, nonce, offline_gateway_stack)
    entry = offline_gateway_stack["received"][0]
    print(json.dumps({"independent_http_capture": {
        "job_id": job.job_id, "dispatch_id": entry["dispatch_id"],
        "context_hash": job.context_hash, "extracted_context_hash": digest,
        "full_prompt_hash": hashlib.sha256(entry["prompt_text"].encode()).hexdigest(),
        "path": entry["path"], "output_limit": entry["output_limit"],
        "capture_correlated": True, "fixture_kind": "direct_in_memory_synthetic",
    }}, sort_keys=True))


def test_post_hash_mutation_detected(offline_gateway_stack, monkeypatch):
    job, nonce = generate(offline_gateway_stack, monkeypatch, mutate=True)
    with pytest.raises(AssertionError, match="CONTEXT_HASH_MISMATCH"):
        verify_capture(job, nonce, offline_gateway_stack)


@pytest.mark.parametrize("fault", ["wrong_dispatch", "stale_request", "mismatched_hash"])
def test_capture_faults_rejected(offline_gateway_stack, monkeypatch, fault):
    job, nonce = generate(offline_gateway_stack, monkeypatch)
    verify_capture(job, nonce, offline_gateway_stack)  # Positive control before injection.
    entry = copy.deepcopy(offline_gateway_stack["received"][0])
    if fault == "wrong_dispatch":
        entry["dispatch_id"] = "old-dispatch"
        expected = "WRONG_DISPATCH"
    elif fault == "stale_request":
        entry["prompt_text"] = entry["prompt_text"].replace(nonce, "previous-job")
        expected = "STALE_REQUEST"
    else:
        job = SimpleNamespace(status="completed", context_hash="0" * 64)
        expected = "CONTEXT_HASH_MISMATCH"
    with pytest.raises(AssertionError, match=expected):
        verify_capture(job, nonce, offline_gateway_stack, entry)


def test_gateway_denial_fails_generation(offline_gateway_stack, monkeypatch):
    job, nonce = generate(offline_gateway_stack, monkeypatch, fail_gateway=True)
    assert job.status == "failed"
    assert not offline_gateway_stack["received"]
    with pytest.raises(AssertionError, match="GENERATION_FAILED"):
        verify_capture(job, nonce, offline_gateway_stack)


def test_direct_external_ip_denied():
    with socket.socket() as sock:
        with pytest.raises(AssertionError, match="EXTERNAL_CONNECT_DENIED"):
            sock.connect(("192.0.2.1", 443))


def test_upstream_transmission_failure(offline_gateway_stack, monkeypatch):
    job, nonce = generate(offline_gateway_stack, monkeypatch, upstream_failure=True)
    assert job.status == "failed"
    assert offline_gateway_stack["received"], "Fault must reach the actual fake HTTP upstream"
    calls = offline_gateway_stack["ledger"].get_summary()["call_history"]
    assert calls and all(call["status"] != "SUCCESS" for call in calls)
    with pytest.raises(AssertionError, match="GENERATION_FAILED"):
        verify_capture(job, nonce, offline_gateway_stack)
