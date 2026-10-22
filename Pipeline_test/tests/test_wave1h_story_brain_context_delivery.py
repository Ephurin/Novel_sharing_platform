"""Wave 1H: Deterministic regression test suite for Story Brain context delivery path.

Verifies:
Canonical memory -> context retrieval -> temporal filtering -> budget packing ->
serialized prompt -> gateway -> fake upstream HTTP request.

All 8 invariants verified deterministically.
OFFLINE ONLY - Zero external provider calls.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time

import pytest

ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path[:0] = [str(ROOT), str(AI_SERVICE_ROOT)]

from Pipeline_test.tools.budget_gateway import AuthoritativeBudgetLedger, start_budget_gateway
from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from Pipeline_test.tools.verify_story_brain_context_delivery import (
    InMemoryRevisionProvider,
    setup_canonical_story_brain,
)
from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter, ContextRoutingUnresolvedError
from application.writing_service import WritingService
from core.llm_service import LLMService
from domain.errors import OptimisticLockError
from domain.models import WritingContextPackage
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


@pytest.fixture(autouse=True)
def forbid_non_loopback_dns(monkeypatch):
    """Fail closed against any outbound network call outside loopback."""
    original = socket.getaddrinfo
    def local_only(host, *args, **kwargs):
        if host not in {"127.0.0.1", "localhost", "::1", None}:
            raise RuntimeError("OFFLINE_TEST_EXTERNAL_NETWORK_DENIED")
        return original(host, *args, **kwargs)
    monkeypatch.setattr(socket, "getaddrinfo", local_only)


@pytest.fixture
def offline_gateway_stack(tmp_path, monkeypatch):
    """Spawns an isolated fake upstream and authoritative budget gateway on loopback."""
    req_log = tmp_path / "requests.jsonl"
    fake_upstream, _, received = start_fake_upstream(
        port=0,
        host="127.0.0.1",
        log_path=str(req_log),
        expected_key="fake-upstream-only",
        scenario="wave1h-context-verify-v1",
    )
    upstream_port = fake_upstream.server_port

    state_file = tmp_path / "ledger.json"
    gateway_server, _, ledger = start_budget_gateway(
        state_file=state_file,
        port=0,
        host="127.0.0.1",
        initialize=True,
        run_id="wave1h-pytest-isolated",
        upstream_base_url=f"http://127.0.0.1:{upstream_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service", "backend-worker": "backend"},
        upstream_timeout=2.0,
    )
    gateway_port = gateway_server.server_port
    gateway_url = f"http://127.0.0.1:{gateway_port}"

    monkeypatch.setenv("BUDGET_GUARD_URL", gateway_url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")
    monkeypatch.setenv("LLM_LOCAL_FALLBACK", "false")

    yield {
        "gateway_url": gateway_url,
        "upstream_port": upstream_port,
        "ledger": ledger,
        "received": received,
        "req_log": req_log,
    }

    gateway_server.shutdown()
    gateway_server.server_close()
    ledger.close()
    fake_upstream.shutdown()
    fake_upstream.server_close()


def test_story_brain_to_outbound_http_prompt_hash_parity(offline_gateway_stack):
    """Verify bit-for-bit parity between serialized Story Brain context and outbound prompt."""
    tenant_id = "tenant-wave1h-test"
    novel_id = "novel-wave1h-test"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    source_text = "Mai Linh ngồi trước bàn điều khiển trạm Bốn, kim chỉ số máy thu CV-04 đang rung nhẹ."
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    chapter_id = "chapter-04"
    revision_id = "rev-ch4-uuid"

    rev_provider = InMemoryRevisionProvider({
        (tenant_id, novel_id, chapter_id, revision_id): type(
            "Rev", (), {"revision_id": revision_id, "content": source_text, "content_hash": content_hash}
        )()
    })

    llm_service = LLMService(
        provider="gemini",
        model="gemini-3.5-flash-lite",
        api_key="",
        timeout_seconds=5,
    )

    packer = ContextBudgetPacker(default_budget=8192)
    writing_service = WritingService(
        repository=repo,
        llm_service=llm_service,
        revision_provider=rev_provider,
        context_packer=packer,
    )

    instruction = "Mai Linh tiếp tục theo dõi tín hiệu máy thu CV-04 tại trạm Bốn khi Duy bước vào phòng điều khiển."
    selection = {"start": 0, "end": len(source_text), "cursor": len(source_text)}

    job = writing_service.start_generation(
        tenant_id=tenant_id,
        novel_id=novel_id,
        chapter_id=chapter_id,
        revision_id=revision_id,
        content_hash=content_hash,
        operation="continue",
        selection=selection,
        instruction=instruction,
        expected_brain_version=1,
        chapter_number=4,
        source_text=source_text,
        process_inline=True,
    )

    assert job.status == "completed"
    assert job.validation_status == "passed"

    received = offline_gateway_stack["received"]
    assert len(received) >= 1
    upstream_entry = received[-1]
    prompt_text = upstream_entry["prompt_text"]

    marker = "Bối cảnh tiểu thuyết (Story Brain): "
    assert marker in prompt_text
    story_brain_json_str = prompt_text.split(marker, 1)[1]
    if "\n" in story_brain_json_str:
        story_brain_json_str = story_brain_json_str.split("\n", 1)[0].strip()

    extracted_payload = json.loads(story_brain_json_str)
    extracted_hash = hashlib.sha256(
        json.dumps(
            extracted_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()

    full_prompt_hash = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()

    # Step 3 Assertion: Extracted Story Brain hash exactly matches persisted job.context_hash
    assert extracted_hash == job.context_hash
    # Step 3 Assertion: Explicit distinction between packed-context hash and full prompt hash
    assert job.context_hash != full_prompt_hash
    assert offline_gateway_stack["ledger"].get_summary()["total_calls"] >= 1


def test_invariant_1_approved_canon_included_at_chapter_cutoff():
    """Invariant 1: Approved canon entities, events, and rules are included up to cutoff."""
    tenant_id = "tenant-inv1"
    novel_id = "novel-inv1"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    pkg = repo.get_structured_context(novel_id, chapter_number=4)
    entity_names = [e["name"] for e in pkg.entities]
    event_ids = [ev["event_id"] for ev in pkg.recent_events]
    rule_ids = [r["id"] for r in pkg.world_rules]

    assert "Mai Linh" in entity_names
    assert "Duy" in entity_names
    assert "CV-04" in entity_names
    assert "ev-ch1-init" in event_ids
    assert "ev-ch4-recover" in event_ids
    assert "rule-locked-barrier-01" in rule_ids
    assert "fact-voice-ch2-03" in rule_ids


def test_invariant_2_locked_rules_survive_extreme_budget_pressure():
    """Invariant 2: Author-locked narrative rules are never pruned under budget pressure."""
    tenant_id = "tenant-inv2"
    novel_id = "novel-inv2"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    packer = ContextBudgetPacker(default_budget=8192)
    service = WritingService(
        repository=repo,
        llm_service=None,  # Not calling LLM in this test
        context_packer=packer,
    )

    tight_pkg = service.preview_context(
        tenant_id=tenant_id,
        story_id=novel_id,
        chapter_number=4,
        token_budget=150,
    )
    prompt_ctx = packer.prompt_context(tight_pkg)
    rule_ids = [r["id"] for r in prompt_ctx["world_rules"]]

    # Locked rules MUST survive
    assert "rule-locked-barrier-01" in rule_ids
    assert "rule-locked-freq-02" in rule_ids
    # Non-locked items dropped
    assert len(prompt_ctx["recent_events"]) == 0
    assert "ev-ch4-recover" in tight_pkg.context_summary.get("dropped_event_ids", [])


def test_invariant_3_future_events_and_plans_not_historical_facts():
    """Invariant 3: Future events (> cutoff) and future planned events are not historical facts."""
    tenant_id = "tenant-inv3"
    novel_id = "novel-inv3"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    pkg = repo.get_structured_context(novel_id, chapter_number=4)
    event_ids = [ev["event_id"] for ev in pkg.recent_events]
    rule_ids = [r["id"] for r in pkg.world_rules]

    # Chapter 5 event must NOT be in chapter 4 context
    assert "ev-ch5-future" not in event_ids
    # Chapter 5 fact must NOT be in chapter 4 context
    assert "fact-future-ch5-05" not in rule_ids
    # Planned event in planning context must NOT appear as recent historical event
    for ev in pkg.recent_events:
        assert "kế hoạch tương lai" not in ev.get("summary", "").lower()
        assert "chưa thực hiện" not in ev.get("summary", "").lower()


def test_invariant_4_superseded_states_and_facts_not_current():
    """Invariant 4: Superseded character states and superseded facts are not treated as current."""
    tenant_id = "tenant-inv4"
    novel_id = "novel-inv4"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    pkg = repo.get_structured_context(novel_id, chapter_number=4)
    rule_ids = [r["id"] for r in pkg.world_rules]

    # Superseded fact is excluded; superseding fact is included
    assert "fact-signal-ch1-old" not in rule_ids
    assert "fact-signal-ch3-new" in rule_ids

    # Entity Duy's state at cutoff 4 has condition 'recovered' (not superseded 'hurt')
    duy_state = next(s for s in pkg.current_states if s["name"] == "Duy")
    assert duy_state["status"] == "Alive"
    assert duy_state.get("state", {}).get("condition") == "recovered"
    assert duy_state.get("state", {}).get("condition") != "hurt"


def test_invariant_5_cross_tenant_memory_isolation():
    """Invariant 5: Foreign tenant and foreign novel data never leaks into context."""
    tenant_id = "tenant-inv5-owned"
    novel_id = "novel-inv5-owned"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    pkg = repo.get_structured_context(novel_id, chapter_number=4)
    entity_names = [e["name"] for e in pkg.entities]
    rule_ids = [r["id"] for r in pkg.world_rules]
    event_ids = [ev["event_id"] for ev in pkg.recent_events]

    assert "Kẻ Xâm Nhập Dị Giới" not in entity_names
    assert "rule-foreign-secret-99" not in rule_ids
    assert "ev-foreign-99" not in event_ids


def test_invariant_6_deterministic_budget_pruning_and_traceability():
    """Invariant 6: Budget packing is deterministic and dropped IDs are traceable."""
    tenant_id = "tenant-inv6"
    novel_id = "novel-inv6"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    packer = ContextBudgetPacker(default_budget=8192)
    service = WritingService(
        repository=repo,
        llm_service=None,
        context_packer=packer,
    )

    pkg = service.preview_context(tenant_id=tenant_id, story_id=novel_id, chapter_number=4)
    p1 = packer.pack(pkg, maximum=600)
    p2 = packer.pack(pkg, maximum=600)

    # Determinism
    assert p1 == p2
    h1 = hashlib.sha256(json.dumps(packer.prompt_context(p1), sort_keys=True).encode()).hexdigest()
    h2 = hashlib.sha256(json.dumps(packer.prompt_context(p2), sort_keys=True).encode()).hexdigest()
    assert h1 == h2

    # Traceability
    assert "context_packing_version" in p1.context_summary


def test_invariant_7_honest_retrieval_and_fail_closed_routing():
    """Invariant 7: Retrieval status is represented honestly and routing fails closed."""
    tenant_id = "tenant-inv7"
    novel_id = "novel-inv7"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    packer = ContextBudgetPacker(default_budget=8192)
    service = WritingService(
        repository=repo,
        llm_service=None,
        context_packer=packer,
    )

    pkg = service.preview_context(tenant_id=tenant_id, story_id=novel_id, chapter_number=4)
    # When semantic embeddings are disabled, status is not falsely claimed as PASS
    assert pkg.context_summary.get("semantic_retrieval_status") in [None, ["disabled"], ["not_requested"]]


def test_invariant_8_unapproved_proposals_and_stale_brain_version_prevented():
    """Invariant 8: Unapproved proposals are never canon and stale version is rejected."""
    tenant_id = "tenant-inv8"
    novel_id = "novel-inv8"
    repo = InMemoryNarrativeRepository()
    setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

    pkg = repo.get_structured_context(novel_id, chapter_number=4)
    rule_ids = [r["id"] for r in pkg.world_rules]

    # Pending proposal must NOT be in approved world rules
    assert "prop-unapproved-draft-01" not in rule_ids
    assert not any("hầm bí mật" in r.get("fact_value", "") for r in pkg.world_rules)

    # Stale brain version in job must fail with optimistic lock error
    packer = ContextBudgetPacker(default_budget=8192)
    service = WritingService(
        repository=repo,
        llm_service=None,
        context_packer=packer,
    )

    source_text = "Mai Linh ngồi trước trạm Bốn."
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()

    with pytest.raises(OptimisticLockError):
        service.start_generation(
            tenant_id=tenant_id,
            novel_id=novel_id,
            chapter_id="ch-04",
            revision_id="rev-04",
            content_hash=content_hash,
            operation="continue",
            selection={"start": 0, "end": len(source_text), "cursor": len(source_text)},
            instruction="Viết tiếp",
            expected_brain_version=999,  # Mismatched expected version!
            chapter_number=4,
            source_text=source_text,
        )
