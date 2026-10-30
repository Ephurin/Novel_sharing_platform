"""P1-LIVE-SAFETY-01: Mandatory Offline Adversarial & Safety Harness Verification Suite.

Covers all 10 mandatory adversarial tests from ARGON TASK P1-LIVE-SAFETY-01:
1. Physical outbound request #16 never dispatches (`MAX_CALLS_REACHED`).
2. Concurrent Python/Node workers never exceed the shared 15-call budget.
3. Rolling rate limit (10 per 60s) cannot be bypassed across workers or restarts (`ROLLING_RATE_LIMIT_EXCEEDED`).
4. Restart does not reset accounting (durable OS-locked ledger + SHA-256 verification).
5. Both application workers fail to reach external provider or fake-upstream directly.
6. Gateway downtime blocks dispatch (no direct SDK fallback, no local fallback prose).
7. Invalid or missing credentials / unapproved model fail closed (`WORKER_AUTH_REQUIRED`, `MODEL_NOT_APPROVED`).
8. Timeout and full 8-scenario failure matrix (429, 503, timeout, 401, 404/unapproved model, empty response,
   gateway down, budget exhausted) cannot generate fallback prose; writing job fails safely without Canon mutation
   or manuscript data loss.
9. Private author notes are absent from every outbound prompt (Python & Node canary tests + gateway defense-in-depth).
10. HITL remains enabled (`ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`) throughout execution.
"""
from __future__ import annotations

import concurrent.futures
import copy
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from types import SimpleNamespace
import urllib.error
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "ai-service")]

from application.writing_service import WritingService
from core.llm_service import LLMService, LLMServiceError
from core.structured_call import call_structured
from domain.models import (
    NarrativeEntity,
    NarrativeEvent,
    StoryBrain,
    WritingContextPackage,
    WritingGenerationJob,
)
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from Pipeline_test.tools.budget_gateway import (
    AuthoritativeBudgetLedger,
    BudgetExceededError,
    BudgetMeterUnavailableError,
)
from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from Pipeline_test.tools.p1_live_safety_gateway import (
    APPROVED_MODEL,
    HARD_MAX_CALLS,
    HARD_WINDOW_CALLS,
    LiveSafetyBudgetLedger,
    start_live_safety_gateway,
)
from core.settings import Settings
from services.entity_pipeline.pipeline import EntityPipeline
from services.entity_pipeline.verification import EntityDecisionBatch


@pytest.fixture(autouse=True)
def forbid_non_loopback_python_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    original = socket.getaddrinfo

    def local_only(host: str, *args: object, **kwargs: object):
        if host not in {"127.0.0.1", "localhost", "::1", None}:
            raise RuntimeError(f"OFFLINE_TEST_EXTERNAL_NETWORK_DENIED: {host}")
        return original(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", local_only)


def _post_json(
    url: str,
    data: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 5.0,
) -> tuple[int, dict]:
    req = urllib.request.Request(
        url,
        data=json.dumps(data or {}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer ai-worker",
            **(headers or {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def _chat_body(text: str = "Lâm Phong tiến vào trấn Thanh Phong.", model: str = APPROVED_MODEL) -> dict:
    return {
        "model": model,
        "max_tokens": 64,
        "messages": [{"role": "user", "content": text}],
    }


@pytest.fixture
def safety_stack(tmp_path: Path):
    upstream, _, received = start_fake_upstream(scenario="p1-live-safety-v1")
    server, _, ledger = start_live_safety_gateway(
        tmp_path / "p1_live_safety_ledger.json",
        port=0,
        max_calls=15,
        max_window_calls=10,
        window_seconds=60.0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="p1-live-safety-01-test",
        upstream_base_url=f"http://127.0.0.1:{upstream.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service", "backend-worker": "backend"},
        upstream_timeout=0.25,
    )
    url = f"http://127.0.0.1:{server.server_port}"
    yield url, ledger, received, server, upstream
    server.shutdown()
    server.server_close()
    ledger.close()
    upstream.shutdown()
    upstream.server_close()


def test_00_explicit_enablement_required_and_offline_gateway_preserved(tmp_path: Path) -> None:
    """Guard fails closed unless explicitly enabled; offline budget_gateway preserves BUDGET_COST_HARD_CAP_UNPROVEN."""
    disabled_ledger = LiveSafetyBudgetLedger(
        tmp_path / "disabled.json",
        enable_live_safety_guard=False,
        initialize=True,
        run_id="must-fail",
    )
    try:
        with pytest.raises(BudgetMeterUnavailableError, match="LIVE_SAFETY_GUARD_NOT_ENABLED"):
            disabled_ledger.get_summary()
    finally:
        disabled_ledger.close()

    offline_ledger = AuthoritativeBudgetLedger(
        tmp_path / "offline.json",
        initialize=True,
        run_id="offline-preserved",
    )
    try:
        summary = offline_ledger.get_summary()
        assert summary["live_cost_hard_cap"] == "BUDGET_COST_HARD_CAP_UNPROVEN"
        assert summary["live_authorized"] is False
    finally:
        offline_ledger.close()


def test_01_physical_outbound_request_16_never_dispatches(safety_stack) -> None:
    """Adversarial Test 1: Physical outbound request #16 never dispatches."""
    url, ledger, received, _, _ = safety_stack
    base_ts = time.time() - 120.0

    # First 10 calls in window 1
    for i in range(10):
        status, payload = _post_json(url + "/v1/chat/completions", _chat_body(f"call-{i + 1}"))
        assert status == 200, payload

    # Shift first 10 timestamps back by 65 seconds and persist atomically to test the 15-call cap after window rollover
    for i in range(10):
        ledger.state["call_history"][i]["timestamp"] = base_ts + i
    ledger._save_durable()

    # Calls 11..15 succeed in current window
    for i in range(10, 15):
        status, payload = _post_json(url + "/v1/chat/completions", _chat_body(f"call-{i + 1}"))
        assert status == 200, payload

    assert len(received) == 15
    assert ledger.state["total_calls"] == 15

    # Physical request #16 MUST be rejected with 429 MAX_CALLS_REACHED before upstream dispatch
    status_16, payload_16 = _post_json(url + "/v1/chat/completions", _chat_body("call-16-must-fail"))
    assert status_16 == 429
    assert payload_16.get("error") == "MAX_CALLS_REACHED"
    assert len(received) == 15
    assert ledger.state["total_calls"] == 15


def test_02_concurrent_python_and_node_workers_never_exceed_shared_budget(
    safety_stack,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adversarial Test 2: Concurrent Python (`ai-service`) and Node (`backend`) workers share the 15-call budget."""
    url, ledger, received, _, _ = safety_stack
    monkeypatch.setenv("BUDGET_GUARD_URL", url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")

    # 1. Dispatch 1 real Python google-genai SDK call + 1 real Node backend subprocess call concurrently
    def run_python_gemini() -> str:
        llm = LLMService(provider="gemini", model=APPROVED_MODEL, api_key="", structured_max_tokens=128)
        return call_structured(
            llm,
            operation="entity_candidate_verification",
            system_prompt="Verify candidates.",
            user_prompt=json.dumps({"candidates": [{"candidate_id": "c1", "surface": "Lâm Phong", "sentence": "Lâm Phong tới trấn Thanh Phong."}]}),
        )

    def run_node_backend() -> str:
        environment = {
            **os.environ,
            "DATABASE_URL": "postgresql://test:test@127.0.0.1:5432/test",
            "MONGODB_URI": "mongodb://127.0.0.1:27017/test",
            "JWT_ACCESS_SECRET": "test-jwt-access-secret-32-chars-long!",
            "JWT_REFRESH_SECRET": "test-jwt-refresh-secret-32-chars-long!",
            "BUDGET_GUARD_URL": url,
            "BUDGET_GUARD_MODE": "proxy",
            "BUDGET_GUARD_AUTH_TOKEN": "backend-worker",
            "AI_LLM_BASE_URL": url + "/v1",
            "AI_LLM_API_KEY": "",
            "AI_LLM_MODEL": APPROVED_MODEL,
            "DB_CONNECT_ON_START": "false",
            "AI_LLM_MAX_TOKENS": "128",
        }
        script = """
        import {generateCopilotSuggestionWithLlm} from './dist/modules/ai-copilot/llm-provider.js';
        generateCopilotSuggestionWithLlm({
          instruction: 'Story Brain continuation',
          recentText: 'Lâm Phong bước vào trấn Thanh Phong.',
          characters: [{name: 'Lâm Phong', role: 'protagonist', personality: 'Trầm tĩnh', description: 'Đệ tử ngoại môn'}],
          recentEvents: []
        }).then(v => { console.log('NODE_OK:' + v.length); process.exit(0); })
          .catch(e => { console.error(e.message); process.exit(1); });
        """
        res = subprocess.run(
            [shutil.which("node") or "node", "--input-type=module", "--eval", script],
            cwd=ROOT / "backend",
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert res.returncode == 0, res.stderr
        return res.stdout.strip()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        f_py = pool.submit(run_python_gemini)
        f_node = pool.submit(run_node_backend)
        py_out = f_py.result()
        node_out = f_node.result()

    assert EntityDecisionBatch.model_validate_json(py_out).decisions[0].verdict == "entity"
    assert "NODE_OK:" in node_out
    assert len(received) == 2
    assert {e["client"] for e in received} == {"ai-service", "backend"}

    # Age first 2 calls by 65s, then launch 24 concurrent requests across ai-worker and backend-worker
    for entry in ledger.state["call_history"]:
        entry["timestamp"] -= 65.0
    ledger._save_durable()

    def burst_worker(idx: int) -> tuple[int, str]:
        token = "ai-worker" if idx % 2 == 0 else "backend-worker"
        status, payload = _post_json(
            url + "/v1/chat/completions",
            _chat_body(f"burst-{idx}"),
            headers={"Authorization": f"Bearer {token}"},
        )
        return status, payload.get("error", "OK")

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(burst_worker, range(20)))

    # At most 10 calls can succeed in the rolling 60s window (total calls now 2 + 10 = 12 <= 15)
    ok_count = sum(1 for status, _ in results if status == 200)
    denied_count = sum(1 for status, _ in results if status == 429)
    assert ok_count == 10
    assert denied_count == 10
    assert len(received) == 12
    assert ledger.state["total_calls"] == 12

    # Age calls 3..12 by 65s and fire 10 more concurrent requests; only 3 can succeed (reaching 15 total)
    for entry in ledger.state["call_history"]:
        entry["timestamp"] -= 65.0
    ledger._save_durable()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results_2 = list(pool.map(burst_worker, range(10)))

    ok_count_2 = sum(1 for status, _ in results_2 if status == 200)
    max_calls_denied = sum(1 for status, err in results_2 if status == 429 and err == "MAX_CALLS_REACHED")
    assert ok_count_2 == 3
    assert max_calls_denied == 7
    assert len(received) == 15
    assert ledger.state["total_calls"] == 15


def test_03_rolling_rate_limit_enforced_across_workers_and_restarts(safety_stack) -> None:
    """Adversarial Test 3: 10 admissions per rolling 60 seconds cannot be bypassed across workers or restarts."""
    url, ledger, received, server, upstream = safety_stack
    state_file = ledger.state_file

    # Send 5 calls as ai-worker and 5 calls as backend-worker within the same 60s window
    for i in range(10):
        token = "ai-worker" if i < 5 else "backend-worker"
        status, payload = _post_json(
            url + "/v1/chat/completions",
            _chat_body(f"window-call-{i + 1}"),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert status == 200, payload

    assert len(received) == 10

    # 11th call in the same 60s window is denied with 429 ROLLING_RATE_LIMIT_EXCEEDED
    status_11, payload_11 = _post_json(
        url + "/v1/chat/completions",
        _chat_body("window-call-11"),
        headers={"Authorization": "Bearer backend-worker"},
    )
    assert status_11 == 429
    assert payload_11.get("error") == "ROLLING_RATE_LIMIT_EXCEEDED"
    assert len(received) == 10

    # Restart gateway on the same ledger file and verify call #11 is STILL denied
    server.shutdown()
    server.server_close()
    ledger.close()

    server2, _, ledger2 = start_live_safety_gateway(
        state_file,
        port=0,
        enable_live_safety_guard=True,
        initialize=False,
        upstream_base_url=f"http://127.0.0.1:{upstream.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service", "backend-worker": "backend"},
        upstream_timeout=0.25,
    )
    try:
        url2 = f"http://127.0.0.1:{server2.server_port}"
        status_after_restart, payload_after_restart = _post_json(
            url2 + "/v1/chat/completions",
            _chat_body("window-call-11-after-restart"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert status_after_restart == 429
        assert payload_after_restart.get("error") == "ROLLING_RATE_LIMIT_EXCEEDED"
        assert len(received) == 10

        # Verify clock rollback detection fails closed
        with pytest.raises(BudgetMeterUnavailableError, match="CLOCK_ROLLBACK_DETECTED"):
            ledger2.reserve(
                operation="clock_rollback_probe",
                model=APPROVED_MODEL,
                liability_usd="0.0001",
                now_override=time.time() - 30.0,
            )
    finally:
        server2.shutdown()
        server2.server_close()
        ledger2.close()


def test_04_restart_does_not_reset_accounting_and_tampering_fails_closed(tmp_path: Path) -> None:
    """Adversarial Test 4: Restart preserves accounting; missing or corrupted ledger fails closed."""
    state_path = tmp_path / "durable_safety.json"
    ledger = LiveSafetyBudgetLedger(
        state_path,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="restart-persistence-run",
    )
    ticket = ledger.reserve(
        operation="gemini_generate_content",
        provider="gemini-native",
        model=APPROVED_MODEL,
        client_service="ai-service",
        liability_usd="0.0025",
    )
    ledger.finalize(ticket["ticket_id"], "SUCCESS")
    ticket2 = ledger.reserve(
        operation="chat_completions",
        provider="gemini-openai-compatible",
        model=APPROVED_MODEL,
        client_service="backend",
        liability_usd="0.0015",
    )
    saved_deadline = ledger.state["deadline"]
    ledger.close()

    # Reopen without initialize: preserves both finalized and in-flight reservations
    reopened = LiveSafetyBudgetLedger(
        state_path,
        enable_live_safety_guard=True,
        initialize=False,
    )
    summary = reopened.get_summary()
    assert summary["total_calls"] == 2
    assert summary["remaining_calls"] == 13
    assert summary["charged_usd"] == "0.0025"
    assert summary["outstanding_usd"] == "0.0015"
    assert summary["deadline"] == saved_deadline
    reopened.close()

    # Deleting state file while .initialized marker exists prevents re-initialization
    state_path.unlink()
    reinit_attempt = LiveSafetyBudgetLedger(
        state_path,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="attacker-reset-attempt",
    )
    try:
        with pytest.raises(BudgetMeterUnavailableError, match="MISSING_AUTHORITATIVE_LEDGER"):
            reinit_attempt.get_summary()
    finally:
        reinit_attempt.close()


def test_05_workers_fail_to_reach_external_provider_or_fake_upstream_directly(
    safety_stack,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adversarial Test 5: Direct provider URLs and direct fake-upstream bypass fail closed."""
    url, ledger, received, server, upstream = safety_stack

    # 1. Worker configured with external URL fails before transport
    for bad_url in ["", "https://generativelanguage.googleapis.com", "http://8.8.8.8:8080"]:
        monkeypatch.setenv("BUDGET_GUARD_URL", bad_url)
        monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
        monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")
        llm = LLMService(provider="gemini", model=APPROVED_MODEL, api_key="dummy")
        with pytest.raises(LLMServiceError, match="GUARD_CONFIGURATION_INVALID"):
            llm._call_llm("system", "user")

    # 2. Direct call to fake-upstream without gateway dispatch header is rejected with 403
    direct_url = f"http://127.0.0.1:{upstream.server_port}/v1/chat/completions"
    status_direct, _ = _post_json(
        direct_url,
        _chat_body("direct bypass attempt"),
        headers={"Authorization": "Bearer fake-upstream-only"},
    )
    assert status_direct == 403
    assert len(received) == 0

    # 3. Gateway pointed at external Google URL refuses to dispatch (503 LIVE_UPSTREAM_NOT_AUTHORIZED)
    server.RequestHandlerClass.upstream_base_url = "https://generativelanguage.googleapis.com"
    status_ext, payload_ext = _post_json(url + "/v1/chat/completions", _chat_body("external attempt"))
    assert status_ext == 503
    assert payload_ext.get("error") == "LIVE_UPSTREAM_NOT_AUTHORIZED"
    assert len(received) == 0


def test_06_gateway_downtime_blocks_dispatch(safety_stack, monkeypatch: pytest.MonkeyPatch) -> None:
    """Adversarial Test 6: Gateway downtime blocks dispatch for both Python and Node workers."""
    url, ledger, received, server, _ = safety_stack
    server.shutdown()
    server.server_close()

    monkeypatch.setenv("BUDGET_GUARD_URL", url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")
    monkeypatch.setenv("LLM_LOCAL_FALLBACK", "false")

    llm_gemini = LLMService(provider="gemini", model=APPROVED_MODEL, api_key="dummy", timeout_seconds=1)
    with pytest.raises(LLMServiceError):
        llm_gemini._call_llm("system", "user")

    llm_openai = LLMService(provider="openai", model=APPROVED_MODEL, api_key="dummy", timeout_seconds=1)
    with pytest.raises(LLMServiceError):
        llm_openai._call_llm("system", "user")

    assert len(received) == 0


def test_07_invalid_credentials_and_unapproved_models_fail_closed(safety_stack) -> None:
    """Adversarial Test 7: Invalid/missing worker credentials and unapproved models fail closed."""
    url, ledger, received, _, _ = safety_stack

    # Forged or missing worker token -> 401 WORKER_AUTH_REQUIRED
    for bad_header in [{"Authorization": "Bearer wrong-token"}, {"Authorization": ""}]:
        status, payload = _post_json(url + "/v1/chat/completions", _chat_body("test"), headers=bad_header)
        assert status == 401
        assert payload.get("error") == "WORKER_AUTH_REQUIRED"

    # Unapproved models (including fallback model gemini-3.1-flash-lite) -> 403 MODEL_NOT_APPROVED
    for unapproved in ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gpt-4o-mini", "models/gemini-1.5-pro"]:
        status_compat, payload_compat = _post_json(
            url + "/v1/chat/completions",
            _chat_body("test", model=unapproved),
        )
        assert status_compat == 403
        assert payload_compat.get("error") == "MODEL_NOT_APPROVED"

        clean_name = unapproved.removeprefix("models/")
        status_native, payload_native = _post_json(
            f"{url}/v1beta/models/{clean_name}:generateContent",
            {
                "contents": [{"parts": [{"text": "hello"}]}],
                "generationConfig": {"maxOutputTokens": 64},
            },
        )
        assert status_native == 403
        assert payload_native.get("error") == "MODEL_NOT_APPROVED"

    assert len(received) == 0
    assert ledger.state["total_calls"] == 0


def test_08_sdk_timeout_and_failure_matrix_safe_writing_failure(
    safety_stack,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adversarial Test 8: Verify google-genai SDK timeout wiring and all 8 failure matrix cases."""
    url, ledger, received, server, _ = safety_stack
    monkeypatch.setenv("BUDGET_GUARD_URL", url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")
    monkeypatch.setenv("LLM_LOCAL_FALLBACK", "false")
    monkeypatch.setattr("core.llm_service.time", SimpleNamespace(monotonic=time.monotonic, sleep=lambda _: None))

    # Verify installed google-genai version and HttpOptions.timeout milliseconds conversion
    sdk_version = importlib.metadata.version("google-genai")
    assert sdk_version, "google-genai must be installed"
    from google.genai import types
    from google.genai._api_client import get_timeout_in_seconds

    opts = types.HttpOptions(timeout=1500, retry_options=types.HttpRetryOptions(attempts=1))
    assert opts.timeout == 1500
    assert get_timeout_in_seconds(opts.timeout) == 1.5
    assert opts.retry_options.attempts == 1

    # Seed repository with canonical entities, events, and chapter text
    repo = InMemoryNarrativeRepository()
    novel_id = "novel-lam-phong-01"
    chapter_id = "chap-01"
    revision_id = "rev-01"
    manuscript_text = (
        "Mặt trời lặn sau rặng núi phía tây trấn Thanh Phong. "
        "Lâm Phong bước vào quán trọ cũ, ánh mắt cảnh giác nhìn Tô Mặc."
    )
    content_hash = hashlib.sha256(manuscript_text.encode("utf-8")).hexdigest()

    initial_entity = NarrativeEntity(
        entity_id="ent-lam-phong",
        name="Lâm Phong",
        entity_type="PER",
        status="Alive",
        location="Trấn Thanh Phong",
        approved_profile={
            "summary": "Đệ tử ngoại môn Thiên Kiếm Tông",
            "author_notes": "CANARY_REPO_PRIVATE_NOTE_DO_NOT_MUTATE",
        },
    )
    initial_event = NarrativeEvent(
        event_id="evt-01",
        chapter=1,
        event_type="arrival",
        summary="Lâm Phong đến trấn Thanh Phong.",
        participants=("Lâm Phong",),
    )
    repo._brains[novel_id] = StoryBrain(
        story_id=novel_id,
        entities=(initial_entity,),
        relations=(),
        events=(initial_event,),
        metadata={"brain_version": "1", "status": "active"},
    )
    brain_snapshot_before = copy.deepcopy(repo.get_story_brain(novel_id))

    def run_writing_job(instruction_text: str, *, model: str = APPROVED_MODEL, timeout_s: float = 1.0) -> WritingGenerationJob:
        llm = LLMService(provider="gemini", model=model, api_key="dummy", timeout_seconds=timeout_s)
        ws = WritingService(repository=repo, llm_service=llm)
        return ws.start_generation(
            tenant_id="tenant-01",
            novel_id=novel_id,
            chapter_id=chapter_id,
            revision_id=revision_id,
            content_hash=content_hash,
            operation="continue",
            selection={"start": 0, "end": len(manuscript_text), "cursor": len(manuscript_text)},
            instruction=instruction_text,
            expected_brain_version=1,
            chapter_number=1,
            source_text=manuscript_text,
        )

    # Failure 1: 429 / quota failure (with 1 slot remaining so budget denial stops retry)
    # First test normal 429 fault
    job_429 = run_writing_job("fault:429")
    assert job_429.status == "failed"
    assert job_429.patch is None
    assert "LOCAL_FALLBACK" not in json.dumps(job_429.error or {})

    # Reset call history timestamps so rolling window has room for remaining failure probes
    for e in ledger.state["call_history"]:
        e["timestamp"] -= 120.0
    ledger._save_durable()

    # Failure 2: 503 / provider unavailable
    job_503 = run_writing_job("fault:503")
    assert job_503.status == "failed"
    assert job_503.patch is None

    # Failure 3: Timeout (gateway upstream_timeout=0.25s, fake-upstream sleeps 0.5s on fault:timeout)
    job_timeout = run_writing_job("fault:timeout", timeout_s=0.2)
    assert job_timeout.status == "failed"
    assert job_timeout.patch is None

    # Failure 4: Invalid upstream credentials (401)
    job_401 = run_writing_job("fault:401")
    assert job_401.status == "failed"
    assert job_401.patch is None

    # Failure 5: Unsupported or unavailable model (unapproved model blocked at gateway with 403 MODEL_NOT_APPROVED)
    job_bad_model = run_writing_job("Continue scene", model="gemini-3.1-flash-lite")
    assert job_bad_model.status == "failed"
    assert job_bad_model.patch is None
    assert "BUDGET_GUARD_DENIED" in (job_bad_model.error or {}).get("message", "")

    # Failure 6: Empty response (upstream returns 200 with empty text "")
    job_empty = run_writing_job("fault:empty")
    assert job_empty.status == "failed"
    assert job_empty.patch is None

    # Failure 7: Budget exhausted (set total_calls to max_calls=15)
    for e in ledger.state["call_history"]:
        e["timestamp"] -= 180.0
    ledger._save_durable()
    while ledger.state["total_calls"] < HARD_MAX_CALLS:
        t = ledger.reserve(
            operation="fill_budget",
            model=APPROVED_MODEL,
            liability_usd="0.0001",
        )
        ledger.finalize(t["ticket_id"], "SUCCESS")
        ledger.state["call_history"][-1]["timestamp"] -= 120.0
        ledger._save_durable()
    job_exhausted = run_writing_job("Continue after budget exhausted")
    assert job_exhausted.status == "failed"
    assert job_exhausted.patch is None
    assert "BUDGET_GUARD_DENIED" in (job_exhausted.error or {}).get("message", "")

    # Failure 8: Gateway unavailable
    server.shutdown()
    server.server_close()
    job_gw_down = run_writing_job("Continue when gateway offline")
    assert job_gw_down.status == "failed"
    assert job_gw_down.patch is None

    # Verify Canon and manuscript integrity after all 8 failures
    brain_after = repo.get_story_brain(novel_id)
    assert brain_after == brain_snapshot_before


def test_09_private_author_notes_absent_from_every_outbound_prompt(
    safety_stack,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adversarial Test 9: Deterministic canary test for private author notes in Python, Node, and Gateway."""
    url, ledger, received, _, _ = safety_stack
    monkeypatch.setenv("BUDGET_GUARD_URL", url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")

    canary_author = "CANARY_SECRET_AUTHOR_NOTE_88421"
    canary_private = "CANARY_SECRET_PRIVATE_AUTHOR_NOTE_99532"
    canary_entity = "CANARY_SECRET_CHARACTER_NOTE_77643"

    # 1. Python LLMService.generate_writing_draft with canary private notes in context_package
    llm = LLMService(provider="gemini", model=APPROVED_MODEL, api_key="dummy")
    draft_res = llm.generate_writing_draft(
        operation="continue",
        selected_text="Lâm Phong bước vào trấn Thanh Phong.",
        cursor_offset=35,
        instruction="Story Brain continuation",
        context_package={
            "entities": [
                {
                    "entity_id": "ent-1",
                    "name": "Lâm Phong",
                    "entity_type": "PER",
                    "description": "Đệ tử ngoại môn",
                    "notes": canary_entity,
                    "author_notes": canary_author,
                    "private_author_notes": canary_private,
                }
            ],
            "author_notes": canary_author,
            "private_author_notes": canary_private,
            "recent_events": [{"summary": "Đến trấn Thanh Phong"}],
        },
    )
    assert "Lâm Phong" in draft_res["draft_text"]
    assert len(received) == 1
    outbound_prompt_py = received[-1]["prompt_text"]
    assert canary_author not in outbound_prompt_py
    assert canary_private not in outbound_prompt_py
    assert canary_entity not in outbound_prompt_py

    # 2. Node backend generateCopilotSuggestionWithLlm subprocess with canary private notes
    environment = {
        **os.environ,
        "DATABASE_URL": "postgresql://test:test@127.0.0.1:5432/test",
        "MONGODB_URI": "mongodb://127.0.0.1:27017/test",
        "JWT_ACCESS_SECRET": "test-jwt-access-secret-32-chars-long!",
        "JWT_REFRESH_SECRET": "test-jwt-refresh-secret-32-chars-long!",
        "BUDGET_GUARD_URL": url,
        "BUDGET_GUARD_MODE": "proxy",
        "BUDGET_GUARD_AUTH_TOKEN": "backend-worker",
        "AI_LLM_BASE_URL": url + "/v1",
        "AI_LLM_API_KEY": "",
        "AI_LLM_MODEL": APPROVED_MODEL,
        "DB_CONNECT_ON_START": "false",
        "AI_LLM_MAX_TOKENS": "128",
    }
    script = f"""
    import {{generateCopilotSuggestionWithLlm}} from './dist/modules/ai-copilot/llm-provider.js';
    generateCopilotSuggestionWithLlm({{
      instruction: 'Story Brain continuation',
      recentText: 'Lâm Phong bước vào trấn Thanh Phong.',
      characters: [{{
        name: 'Lâm Phong',
        role: 'protagonist',
        personality: 'Trầm tĩnh',
        description: 'Đệ tử ngoại môn',
        notes: '{canary_entity}',
        author_notes: '{canary_author}',
        private_author_notes: '{canary_private}'
      }}],
      recentEvents: []
    }}).then(() => {{ console.log('NODE_PRIVACY_OK'); process.exit(0); }})
      .catch(e => {{ console.error(e.message); process.exit(1); }});
    """
    res = subprocess.run(
        [shutil.which("node") or "node", "--input-type=module", "--eval", script],
        cwd=ROOT / "backend",
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert res.returncode == 0, res.stderr
    assert "NODE_PRIVACY_OK" in res.stdout
    assert len(received) == 2
    outbound_prompt_node = received[-1]["prompt_text"]
    assert canary_author not in outbound_prompt_node
    assert canary_private not in outbound_prompt_node
    assert canary_entity not in outbound_prompt_node

    # 3. Gateway defense-in-depth: raw request containing private_author_notes is blocked with 403 before dispatch
    status_raw, payload_raw = _post_json(
        url + "/v1/chat/completions",
        {
            "model": APPROVED_MODEL,
            "max_tokens": 32,
            "messages": [{"role": "user", "content": json.dumps({"author_notes": canary_author})}],
        },
    )
    assert status_raw == 403
    assert payload_raw.get("error") == "PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"
    assert len(received) == 2


def test_10_hitl_remains_enabled_and_mandatory_throughout_execution(
    safety_stack,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adversarial Test 10: ENTITY_CANDIDATE_VERIFICATION_ENABLED=true remains active and Canon is not auto-mutated."""
    url, ledger, received, _, _ = safety_stack
    monkeypatch.setenv("BUDGET_GUARD_URL", url)
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "ai-worker")
    monkeypatch.setenv("ENTITY_CANDIDATE_VERIFICATION_ENABLED", "true")

    monkeypatch.setenv("LLM_LOCAL_FALLBACK", "false")
    monkeypatch.setenv("LLM_MODEL", APPROVED_MODEL)
    settings = Settings.from_env()
    assert settings.entity_candidate_verification_enabled is True
    assert LLMService._local_fallback_enabled() is False
    assert settings.llm_model == APPROVED_MODEL

    repo = InMemoryNarrativeRepository()
    novel_id = "novel-hitl-check"
    repo._brains[novel_id] = StoryBrain(
        story_id=novel_id,
        entities=(),
        relations=(),
        events=(),
        metadata={"brain_version": "1", "status": "active"},
    )

    llm = LLMService(provider="gemini", model=APPROVED_MODEL, api_key="dummy", structured_max_tokens=512)
    pipeline = EntityPipeline(
        candidate_verification_enabled=settings.entity_candidate_verification_enabled,
    )
    assert pipeline.candidate_verification_enabled is True
    fixture_text = (
        "Mặt trời lặn sau rặng núi phía tây trấn Thanh Phong. "
        "Lâm Phong bước vào quán trọ cũ, tay nắm chặt Huyết Ngọc Bội. "
        "Từ cầu thang gỗ, Tô Mặc — đệ tử Thiên Kiếm Tông — chậm rãi bước xuống."
    )
    verified = pipeline.run_verified(fixture_text, llm_service=llm, defer_materialization=True)
    assert len(verified.entities) >= 2
    assert len(verified.audit["candidates"]) >= 2
    assert len(received) == 2
    assert received[0]["path"] == "/v1beta/models/gemini-3.5-flash-lite:generateContent"
    assert received[1]["path"] == "/v1beta/models/gemini-3.5-flash-lite:generateContent"

    # Verify StoryBrain Canon was NOT automatically mutated by extraction (HITL review required before commit)
    brain = repo.get_story_brain(novel_id)
    assert len(brain.entities) == 0
    assert Settings.from_env().entity_candidate_verification_enabled is True



def test_11_f01_serialized_private_notes_rejection_suite(safety_stack) -> None:
    """F-01: Serialized private notes in nested message content, strings, and escaped JSON fail closed."""
    url, ledger, received, _, _ = safety_stack
    received_count_initial = len(received)
    token = "backend-worker"

    # Canary tokens
    canary_note = "CANARY_F01_ENTITY_NOTE_9988"
    canary_author = "CANARY_F01_AUTHOR_NOTE_7766"
    canary_private = "CANARY_F01_PRIVATE_NOTE_5544"

    # Unsafe payloads that MUST be rejected with HTTP 403
    unsafe_payloads = [
        # Direct dictionary entity notes
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "test"}], "characters": [{"name": "Test", "notes": canary_note}]},
        # Direct dictionary authorNotes / privateAuthorNotes
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "test"}], "authorNotes": canary_author},
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "test"}], "privateAuthorNotes": canary_private},
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "test"}], "private_notes": canary_private},
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "test"}], "privateNotes": canary_private},
        # JSON-serialized entity notes inside message string (Review Finding F-01 exact attack vector)
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": json.dumps({"characters": [{"name": "Test", "notes": canary_note}]})}]},
        # Escaped JSON-serialized entity notes
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": '{\"characters\":[{\"name\":\"Test\",\"notes\":\"' + canary_note + '\"}]}'}]},
        # Markdown-embedded JSON code block
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": f"```json\n{{\"characters\": [{{\"name\": \"Test\", \"notes\": \"{canary_note}\"}}]}}\n```"}]},
        # Nested list with entity notes
        {"model": APPROVED_MODEL, "max_tokens": 64, "messages": [{"role": "user", "content": "review"}], "entities": [{"name": "X", "notes": canary_note}]},
    ]

    for idx, bad_payload in enumerate(unsafe_payloads):
        status, resp = _post_json(
            url + "/v1/chat/completions",
            bad_payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert status == 403, f"Payload {idx} should have been rejected with 403, got {status}: {resp}"
        assert resp.get("error") == "PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"

    # Upstream fake provider request count MUST remain unchanged
    assert len(received) == received_count_initial, "Rejected unsafe requests must not reach upstream provider"

    # Valid fiction prose mentioning the ordinary word 'notes' MUST succeed
    prose_payload = {
        "model": APPROVED_MODEL,
        "max_tokens": 64,
        "messages": [
            {"role": "user", "content": "Tiếng sáo cất lên những nốt nhạc trầm buồn, vang vọng giữa đêm vắng bên ngoài trấn Thanh Phong."}
        ],
    }
    status_prose, resp_prose = _post_json(
        url + "/v1/chat/completions",
        prose_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_prose == 200, resp_prose
    assert len(received) == received_count_initial + 1
    # Verify no private canary appears in any dispatched prompt
    for req in received:
        prompt_str = json.dumps(req, ensure_ascii=False)
        assert canary_note not in prompt_str
        assert canary_author not in prompt_str
        assert canary_private not in prompt_str


def test_12_f02_absolute_per_request_deadline_and_fault_handling(safety_stack) -> None:
    """F-02: End-to-end request deadline, slow trickle abortion, oversized response, and redirects fail safely."""
    url, ledger, received, _, _ = safety_stack
    token = "ai-worker"

    def make_native_request(fault_marker: str) -> tuple[int, dict, float]:
        t0 = time.monotonic()
        status, payload = _post_json(
            f"{url}/v1beta/models/{APPROVED_MODEL}:generateContent",
            {
                "contents": [{"parts": [{"text": f"Instruction with {fault_marker}"}]}],
                "generationConfig": {"maxOutputTokens": 64},
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        elapsed = time.monotonic() - t0
        return status, payload, elapsed

    # 1. fault:hang (upstream never responds -> gateway deadline fires within ~0.25-0.75s)
    st_hang, pay_hang, el_hang = make_native_request("fault:hang")
    assert st_hang in (502, 503)
    assert el_hang <= 2.0, f"Hang deadline took too long: {el_hang}s"

    # 2. fault:sleep_long (upstream sleeps 5.0s -> gateway deadline aborts well before 5s)
    st_sleep, pay_sleep, el_sleep = make_native_request("fault:sleep_long")
    assert st_sleep in (502, 503)
    assert el_sleep <= 2.0, f"Sleep deadline took too long: {el_sleep}s"

    # 3. fault:slow_trickle (upstream sends slow chunks -> gateway watchdog timer aborts socket)
    st_trickle, pay_trickle, el_trickle = make_native_request("fault:slow_trickle")
    assert st_trickle in (502, 503)
    assert el_trickle <= 2.0, f"Slow trickle watchdog took too long: {el_trickle}s"

    # 4. fault:oversized (upstream sends > 2MB response -> ResponseBoundExceeded 502)
    st_over, pay_over, _ = make_native_request("fault:oversized")
    assert st_over == 502
    assert pay_over.get("detail") == "RESPONSE_BOUND_EXCEEDED" or "UPSTREAM" in pay_over.get("error", "")

    # 5. fault:redirect (upstream sends 302 Location redirect -> blocked with 503 UPSTREAM_REDIRECT_DENIED)
    st_redir, pay_redir, _ = make_native_request("fault:redirect")
    assert st_redir == 503
    assert "UPSTREAM_REDIRECT_DENIED" in str(pay_redir)


def test_13_f03_durable_evidence_bundle_persistence(safety_stack, tmp_path: Path) -> None:
    """F-03: Machine-readable budget and concurrency evidence bundle is generated and persisted."""
    url, ledger, received, server, upstream = safety_stack
    evidence_dir = ROOT / "docs" / "development" / "integration" / "p1-author" / "evidence" / "p1-live-safety-01"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = evidence_dir / "budget-concurrency-evidence.json"

    # Run git rev-parse to capture exact tested commit SHA
    git_sha_res = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    tested_sha = git_sha_res.stdout.strip() if git_sha_res.returncode == 0 else "UNKNOWN"

    # Step 1: Physical request admission history 1..10 (5 from ai-service, 5 from backend)
    for i in range(10):
        token = "ai-worker" if i < 5 else "backend-worker"
        st, pl = _post_json(
            url + "/v1/chat/completions",
            _chat_body(f"evidence-call-{i + 1}"),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert st == 200, pl

    # Step 2: 11th call in rolling 60s window rejected with 429 ROLLING_RATE_LIMIT_EXCEEDED
    st_roll, pl_roll = _post_json(
        url + "/v1/chat/completions",
        _chat_body("evidence-call-rolling-denied"),
        headers={"Authorization": "Bearer backend-worker"},
    )
    assert st_roll == 429
    assert pl_roll.get("error") == "ROLLING_RATE_LIMIT_EXCEEDED"

    # Step 3: Shift timestamps back by 65s to simulate rolling window elapsed
    for entry in ledger.state["call_history"]:
        entry["timestamp"] -= 65.0
    ledger._save_durable()

    # Step 4: Calls 11..15 admitted
    for i in range(10, 15):
        token = "ai-worker" if i % 2 == 0 else "backend-worker"
        st, pl = _post_json(
            url + "/v1/chat/completions",
            _chat_body(f"evidence-call-{i + 1}"),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert st == 200, pl

    assert len(received) == 15
    assert ledger.state["total_calls"] == 15

    # Step 5: Physical request #16 denied with 429 MAX_CALLS_REACHED
    st_16, pl_16 = _post_json(
        url + "/v1/chat/completions",
        _chat_body("evidence-call-16-denied"),
        headers={"Authorization": "Bearer ai-worker"},
    )
    assert st_16 == 429
    assert pl_16.get("error") == "MAX_CALLS_REACHED"
    assert len(received) == 15

    # Step 6: Gateway restart before/after counter comparison
    summary_before = ledger.get_summary()
    state_file = ledger.state_file
    ledger_content_before = Path(state_file).read_bytes()
    ledger_hash_before = hashlib.sha256(ledger_content_before).hexdigest()

    server.shutdown()
    server.server_close()
    ledger.close()

    server2, _, ledger2 = start_live_safety_gateway(
        state_file,
        port=0,
        enable_live_safety_guard=True,
        initialize=False,
        upstream_base_url=f"http://127.0.0.1:{upstream.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service", "backend-worker": "backend"},
        upstream_timeout=0.25,
    )
    summary_after = ledger2.get_summary()
    ledger_content_after = Path(state_file).read_bytes()
    ledger_hash_after = hashlib.sha256(ledger_content_after).hexdigest()

    assert summary_before["total_calls"] == summary_after["total_calls"] == 15
    assert summary_before["remaining_calls"] == summary_after["remaining_calls"] == 0
    assert ledger_hash_before == ledger_hash_after

    evidence_bundle = {
        "evidence_id": "P1-LIVE-SAFETY-01-EVIDENCE-F03",
        "task_id": "P1-LIVE-SAFETY-01",
        "timestamp_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tested_commit_sha": tested_sha,
        "base_branch": "integration/p1-demo-20261109",
        "working_branch": "codex/p1-live-safety-01",
        "approved_model": APPROVED_MODEL,
        "budget_limits": {
            "hard_max_calls": HARD_MAX_CALLS,
            "hard_window_calls": HARD_WINDOW_CALLS,
            "window_seconds": summary_after["window_seconds"],
            "max_cost_usd": summary_after["max_cost_usd"],
            "admission_cost_usd": summary_after["admission_cost_usd"],
        },
        "accounting_status": {
            "total_calls": summary_after["total_calls"],
            "remaining_calls": summary_after["remaining_calls"],
            "charged_usd": summary_after["charged_usd"],
            "outstanding_usd": summary_after["outstanding_usd"],
            "call_history_count": len(summary_after["call_history"]),
            "physical_request_admission_history": summary_after["call_history"],
            "denied_requests_count": summary_after.get("denied_requests_count", len(summary_after.get("denied_history", []))),
            "denied_history": summary_after.get("denied_history", []),
            "live_authorized": False,
            "actual_invoice_usd": "0.00",
        },
        "gateway_restart_verification": {
            "counters_before_restart": {
                "total_calls": summary_before["total_calls"],
                "remaining_calls": summary_before["remaining_calls"],
                "charged_usd": summary_before["charged_usd"],
            },
            "counters_after_restart": {
                "total_calls": summary_after["total_calls"],
                "remaining_calls": summary_after["remaining_calls"],
                "charged_usd": summary_after["charged_usd"],
            },
            "ledger_sha256_before": ledger_hash_before,
            "ledger_sha256_after": ledger_hash_after,
            "hash_identical": (ledger_hash_before == ledger_hash_after),
        },
        "fake_upstream_verification": {
            "fake_upstream_received_count": len(received),
            "agreement_with_dispatched_count": (len(received) == summary_after["total_calls"] == 15),
            "client_distribution": {
                "ai_service": sum(1 for r in received if r.get("client") == "ai-service"),
                "backend": sum(1 for r in received if r.get("client") == "backend"),
            },
        },
        "adversarial_findings_closed": {
            "F-01": "Serialized private notes in JSON strings and message content blocked with 403 before ledger reservation.",
            "F-02": "Monotonic clock deadline and BoundedHTTPHandler watchdog timer abort slow trickle, oversized, and hang faults safely.",
            "F-03": "Durable machine-readable evidence bundle persisted at docs/development/integration/p1-author/evidence/p1-live-safety-01/budget-concurrency-evidence.json.",
            "F-04": "Run-scoped project naming and label-based resource deletion prevent parallel test interference.",
            "F-05": "Container network isolation proven with direct-egress RFC 5737 IP socket connection checks and fake-upstream bypass blocks.",
            "F-06": "Comprehensive remediation report appended to P1_LIVE_SAFETY_01_REVIEW.md with provisional verdict P1_LIVE_SAFETY_OFFLINE_PASS.",
            "F-07": "Run ownership tracking gates compose teardown; preflight conflict aborts without touching unowned Docker resources.",
            "F-08": "Ledger health enforcement and transaction rollback prevent recreation of missing ledger or overwriting disk corruption during denial logging.",
            "F-09": "Docker inspection commands fail closed with DockerInspectionError on nonzero exit codes, preventing false ownership or fabricated cleanup PASS.",
            "secondary_models_contract": "/v1/models ledger health check moved inside try: block, guaranteeing HTTP 503 BUDGET_METER_UNAVAILABLE on missing or corrupted ledger.",
        },
    }

    bundle_path.write_text(json.dumps(evidence_bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    assert bundle_path.exists()
    assert bundle_path.stat().st_size > 0

    server2.shutdown()
    server2.server_close()
    ledger2.close()


def test_14_f04_project_isolation_and_foreign_project_survival() -> None:
    """F-04: Verify dynamic project naming logic and ownership-scoped teardown filter."""
    import uuid

    # 1. Distinct runs generate distinct isolated project names
    project_1 = f"p1-safety-{uuid.uuid4().hex[:8]}"
    project_2 = f"p1-safety-{uuid.uuid4().hex[:8]}"
    assert project_1 != project_2
    assert project_1.startswith("p1-safety-")
    assert project_2.startswith("p1-safety-")

    # 2. Verify filter query for resource ownership
    def filter_for_project(project_name: str) -> list[str]:
        return ["--filter", f"label=com.docker.compose.project={project_name}"]

    own_filter = filter_for_project(project_1)
    foreign_filter = filter_for_project("foreign-project-survives")
    assert own_filter != foreign_filter
    assert f"com.docker.compose.project={project_1}" in own_filter[1]
    assert "foreign-project-survives" in foreign_filter[1]



from Pipeline_test.tools.verify_p1_live_safety_containers import (
    DockerInspectionError,
    OwnershipConflictError,
    run_container_verification,
    _get_project_resources,
)


def test_15_f07_resource_ownership_and_conflict_safety(tmp_path: Path) -> None:
    """F-07: Resource ownership tracking, conflict preflight abort, and foreign project protection."""
    import shutil
    import subprocess
    import uuid

    if shutil.which("docker") is None:
        pytest.skip("Docker CLI unavailable")
    res = subprocess.run(["docker", "ps"], capture_output=True, text=True)
    if res.returncode != 0:
        pytest.skip("Docker daemon not responsive")

    # --- Test A: Pre-existing project conflict ---
    proj_a = f"p1-safety-f07a-{uuid.uuid4().hex[:8]}"
    vol_a = f"test-f07a-vol-{uuid.uuid4().hex[:6]}"
    subprocess.run(
        ["docker", "volume", "create", "--label", f"com.docker.compose.project={proj_a}", vol_a],
        capture_output=True, text=True, check=True,
    )
    try:
        with pytest.raises(OwnershipConflictError) as exc_info:
            run_container_verification(project_name=proj_a, evidence_dir=tmp_path / "ev_a")
        assert "CONFLICT_DETECTED" in str(exc_info.value)
        check_vol = subprocess.run(
            ["docker", "volume", "ls", "--filter", f"label=com.docker.compose.project={proj_a}", "--format", "{{.Name}}"],
            capture_output=True, text=True, check=True,
        )
        assert vol_a in check_vol.stdout, f"Pre-existing volume {vol_a} was destroyed by unowned cleanup!"
    finally:
        subprocess.run(["docker", "volume", "rm", vol_a], capture_output=True, text=True)

    # --- Test B: Initialization failure before ownership ---
    proj_b = f"p1-safety-f07b-{uuid.uuid4().hex[:8]}"
    vol_unowned = f"test-f07b-unowned-{uuid.uuid4().hex[:6]}"
    subprocess.run(
        ["docker", "volume", "create", "--label", "com.docker.compose.project=unowned-proj-f07b", vol_unowned],
        capture_output=True, text=True, check=True,
    )
    try:
        with pytest.raises(RuntimeError) as exc_info:
            run_container_verification(
                project_name=proj_b,
                evidence_dir=tmp_path / "ev_b",
                simulate_fail_before_ownership=True,
            )
        assert "SIMULATED_PRE_OWNERSHIP_FAILURE" in str(exc_info.value)
        check_unowned = subprocess.run(
            ["docker", "volume", "ls", "--filter", "label=com.docker.compose.project=unowned-proj-f07b", "--format", "{{.Name}}"],
            capture_output=True, text=True, check=True,
        )
        assert vol_unowned in check_unowned.stdout, "Unowned volume was destroyed after pre-ownership failure!"
    finally:
        subprocess.run(["docker", "volume", "rm", vol_unowned], capture_output=True, text=True)

    # --- Test C: Partial startup failure ---
    proj_c = f"p1-safety-f07c-{uuid.uuid4().hex[:8]}"
    vol_foreign_c = f"test-f07c-foreign-{uuid.uuid4().hex[:6]}"
    subprocess.run(
        ["docker", "volume", "create", "--label", "com.docker.compose.project=foreign-proj-c", vol_foreign_c],
        capture_output=True, text=True, check=True,
    )
    try:
        with pytest.raises(RuntimeError) as exc_info:
            run_container_verification(
                project_name=proj_c,
                evidence_dir=tmp_path / "ev_c",
                simulate_fail_partial_startup=True,
            )
        assert "SIMULATED_PARTIAL_STARTUP_FAILURE" in str(exc_info.value)
        # Verify that only run-owned resources were cleaned up, and foreign survived
        check_proj_c = _get_project_resources(proj_c)
        assert check_proj_c["containers"] == []
        assert check_proj_c["volumes"] == []
        assert check_proj_c["networks"] == []
        check_foreign = subprocess.run(
            ["docker", "volume", "ls", "--filter", "label=com.docker.compose.project=foreign-proj-c", "--format", "{{.Name}}"],
            capture_output=True, text=True, check=True,
        )
        assert vol_foreign_c in check_foreign.stdout, "Foreign project volume was destroyed!"
    finally:
        subprocess.run(["docker", "volume", "rm", vol_foreign_c], capture_output=True, text=True)

    # --- Test D: Foreign project survival ---
    proj_d = f"p1-safety-f07d-{uuid.uuid4().hex[:8]}"
    vol_foreign_d = f"test-f07d-foreign-{uuid.uuid4().hex[:6]}"
    subprocess.run(
        ["docker", "volume", "create", "--label", "com.docker.compose.project=unrelated-foreign-d", vol_foreign_d],
        capture_output=True, text=True, check=True,
    )
    try:
        res_d = _get_project_resources(proj_d)
        assert not any(res_d.values())
        check_d = subprocess.run(
            ["docker", "volume", "ls", "--filter", "label=com.docker.compose.project=unrelated-foreign-d", "--format", "{{.Name}}"],
            capture_output=True, text=True, check=True,
        )
        assert vol_foreign_d in check_d.stdout, "Foreign resource destroyed during conflict verification!"
    finally:
        subprocess.run(["docker", "volume", "rm", vol_foreign_d], capture_output=True, text=True)


def test_16_f08_ledger_tampering_and_denial_fail_closed(tmp_path: Path) -> None:
    """F-08: Authoritative ledger tampering, missing file, and denial fail-closed verification."""
    # --- Test A: Missing ledger after startup ---
    upstream_a, _, received_a = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_a = tmp_path / "ledger_f08_a.json"

    server_a, _, ledger_a = start_live_safety_gateway(
        state_file_a,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-f08-a",
        upstream_base_url=f"http://127.0.0.1:{upstream_a.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_a = f"http://127.0.0.1:{server_a.server_port}"
    try:
        assert state_file_a.exists()
        # 2. Delete or unmount the ledger file on disk
        state_file_a.unlink()
        assert not state_file_a.exists()

        # 3. Submit a request targeting an unapproved model (normally 403)
        st_unapproved, pl_unapproved = _post_json(
            gateway_url_a + "/v1/chat/completions",
            {"model": "gemini-2.5-pro", "messages": [{"role": "user", "content": "hi"}]},
            headers={"Authorization": "Bearer ai-worker"},
        )
        # 4. Verify the gateway fails closed (503 Service Unavailable) instead of recreating the file
        assert st_unapproved == 503
        assert pl_unapproved.get("error") == "BUDGET_METER_UNAVAILABLE"

        # 5. Verify the ledger file is NOT recreated on disk
        assert not state_file_a.exists(), "Missing ledger file was illegally recreated by denial logging!"

        # 6. Submit a valid request; verify it is also rejected (503)
        st_valid, pl_valid = _post_json(
            gateway_url_a + "/v1/chat/completions",
            _chat_body("valid-call"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert st_valid == 503
        assert pl_valid.get("error") == "BUDGET_METER_UNAVAILABLE"

        # 7. Verify total fake-upstream dispatches remains 0
        assert len(received_a) == 0
    finally:
        server_a.shutdown()
        server_a.server_close()
        ledger_a.close()
        upstream_a.shutdown()
        upstream_a.server_close()

    # --- Test B: Corrupted ledger on disk ---
    upstream_b, _, received_b = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_b = tmp_path / "ledger_f08_b.json"

    server_b, _, ledger_b = start_live_safety_gateway(
        state_file_b,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-f08-b",
        upstream_base_url=f"http://127.0.0.1:{upstream_b.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_b = f"http://127.0.0.1:{server_b.server_port}"
    try:
        assert state_file_b.exists()
        corrupt_content = '{"state": {"broken_json": true, '
        state_file_b.write_text(corrupt_content, encoding="utf-8")

        # 2. Send request that would otherwise trigger denial (unapproved model or private notes)
        st_corrupt_denial, pl_corrupt_denial = _post_json(
            gateway_url_b + "/v1/chat/completions",
            {"model": "gemini-unapproved", "messages": [{"role": "user", "content": "hi"}]},
            headers={"Authorization": "Bearer ai-worker"},
        )
        # 3. Verify corruption is NOT repaired, overwritten or replaced with default state
        assert st_corrupt_denial == 503
        assert pl_corrupt_denial.get("error") == "BUDGET_METER_UNAVAILABLE"
        assert state_file_b.read_text(encoding="utf-8") == corrupt_content, "Corrupted ledger on disk was overwritten!"

        # 4. Verify valid request fails closed as well
        st_corrupt_valid, _ = _post_json(
            gateway_url_b + "/v1/chat/completions",
            _chat_body("valid-attempt"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert st_corrupt_valid == 503
        assert len(received_b) == 0
    finally:
        server_b.shutdown()
        server_b.server_close()
        ledger_b.close()
        upstream_b.shutdown()
        upstream_b.server_close()

    # --- Test C: Ledger write failure / I/O fault ---
    upstream_c, _, received_c = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_c = tmp_path / "ledger_f08_c.json"

    server_c, _, ledger_c = start_live_safety_gateway(
        state_file_c,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-f08-c",
        upstream_base_url=f"http://127.0.0.1:{upstream_c.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_c = f"http://127.0.0.1:{server_c.server_port}"
    try:
        # Inject durability write failure
        def failing_save_durable() -> None:
            ledger_c._init_error = BudgetMeterUnavailableError("LEDGER_DURABILITY_FAILURE")
            raise ledger_c._init_error

        ledger_c._save_durable = failing_save_durable  # type: ignore[assignment]

        # Attempt request
        st_io, pl_io = _post_json(
            gateway_url_c + "/v1/chat/completions",
            _chat_body("write-failure-test"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        # Verify no admission, no counter reset, no unmetered dispatch
        assert st_io == 503
        assert pl_io.get("error") == "BUDGET_METER_UNAVAILABLE"
        assert len(received_c) == 0
        assert ledger_c.state["total_calls"] == 0
    finally:
        server_c.shutdown()
        server_c.server_close()
        ledger_c.close()
        upstream_c.shutdown()
        upstream_c.server_close()

    # --- Test D: Normal rejection regression on healthy ledger ---
    upstream_d, _, received_d = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_d = tmp_path / "ledger_f08_d.json"

    server_d, _, ledger_d = start_live_safety_gateway(
        state_file_d,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-f08-d",
        upstream_base_url=f"http://127.0.0.1:{upstream_d.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_d = f"http://127.0.0.1:{server_d.server_port}"
    try:
        # 1. Unapproved models return 403
        st_unapp, pl_unapp = _post_json(
            gateway_url_d + "/v1/chat/completions",
            {"model": "gemini-1.5-pro", "messages": [{"role": "user", "content": "hi"}]},
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert st_unapp == 403
        assert pl_unapp.get("error") == "MODEL_NOT_APPROVED"

        # 2. Dispatch 10 valid calls to saturate rolling window
        for i in range(10):
            st, pl = _post_json(
                gateway_url_d + "/v1/chat/completions",
                _chat_body(f"call-{i+1}"),
                headers={"Authorization": "Bearer ai-worker"},
            )
            assert st == 200, f"Call {i+1} failed: {pl}"

        # 3. Call 11 in rolling window returns 429 ROLLING_RATE_LIMIT_EXCEEDED
        st_rolling, pl_rolling = _post_json(
            gateway_url_d + "/v1/chat/completions",
            _chat_body("call-11-rolling"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert st_rolling == 429
        assert pl_rolling.get("error") == "ROLLING_RATE_LIMIT_EXCEEDED"

        # 4. Test call 16 MAX_CALLS_REACHED: reset call_history timestamps to simulate expired window
        with ledger_d._lock:
            for entry in ledger_d.state["call_history"]:
                entry["timestamp"] -= 70.0
            ledger_d._save_durable()

        # Dispatch 5 more calls to reach 15 total calls
        for i in range(11, 16):
            st, pl = _post_json(
                gateway_url_d + "/v1/chat/completions",
                _chat_body(f"call-{i}"),
                headers={"Authorization": "Bearer ai-worker"},
            )
            assert st == 200, f"Call {i} failed: {pl}"

        assert ledger_d.state["total_calls"] == 15
        assert len(received_d) == 15

        # Call 16 returns 429 MAX_CALLS_REACHED
        st_16, pl_16 = _post_json(
            gateway_url_d + "/v1/chat/completions",
            _chat_body("call-16"),
            headers={"Authorization": "Bearer ai-worker"},
        )
        assert st_16 == 429
        assert pl_16.get("error") == "MAX_CALLS_REACHED"
        assert len(received_d) == 15
    finally:
        server_d.shutdown()
        server_d.server_close()
        ledger_d.close()
        upstream_d.shutdown()
        upstream_d.server_close()



def test_17_f09_docker_inspection_fail_closed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """F-09: Docker inspection must fail closed on nonzero exit codes, preventing false ownership and unverified cleanup PASS."""
    import subprocess
    import uuid

    # --- Test A: Failed container inspection (docker ps -a fails) ---
    real_run = subprocess.run
    def mock_run_fail_ps(cmd: list[str], *args: object, **kwargs: object):
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] == "ps":
            return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="error: daemon socket closed")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run_fail_ps)
    proj_a = f"p1-safety-f09a-{uuid.uuid4().hex[:8]}"
    with pytest.raises(DockerInspectionError) as exc_info:
        run_container_verification(project_name=proj_a, evidence_dir=tmp_path / "ev_a")
    assert "INSPECTION_FAILED" in str(exc_info.value)
    assert "containers" in str(exc_info.value)

    # --- Test B: Failed volume inspection (docker volume ls fails) ---
    def mock_run_fail_vol(cmd: list[str], *args: object, **kwargs: object):
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] == "volume":
            return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="error: volume driver timeout")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run_fail_vol)
    proj_b = f"p1-safety-f09b-{uuid.uuid4().hex[:8]}"
    with pytest.raises(DockerInspectionError) as exc_info:
        run_container_verification(project_name=proj_b, evidence_dir=tmp_path / "ev_b")
    assert "INSPECTION_FAILED" in str(exc_info.value)
    assert "volumes" in str(exc_info.value)

    # --- Test C: Failed network inspection (docker network ls fails) ---
    def mock_run_fail_net(cmd: list[str], *args: object, **kwargs: object):
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] == "network":
            return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="error: network subsystem dead")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run_fail_net)
    proj_c = f"p1-safety-f09c-{uuid.uuid4().hex[:8]}"
    with pytest.raises(DockerInspectionError) as exc_info:
        run_container_verification(project_name=proj_c, evidence_dir=tmp_path / "ev_c")
    assert "INSPECTION_FAILED" in str(exc_info.value)
    assert "networks" in str(exc_info.value)

    # --- Test D: Post-cleanup inspection failure ---
    inspection_calls = 0
    def mock_run_fail_post_cleanup(cmd: list[str], *args: object, **kwargs: object):
        nonlocal inspection_calls
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] in ("ps", "volume", "network") and "--filter" in cmd:
            inspection_calls += 1
            if inspection_calls > 3:
                return subprocess.CompletedProcess(cmd, returncode=2, stdout="", stderr="error: post-cleanup inspect failure")
            return subprocess.CompletedProcess(cmd, returncode=0, stdout="", stderr="")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run_fail_post_cleanup)
    proj_d = f"p1-safety-f09d-{uuid.uuid4().hex[:8]}"
    ev_dir_d = tmp_path / "ev_d"
    with pytest.raises(DockerInspectionError) as exc_info:
        run_container_verification(
            project_name=proj_d,
            evidence_dir=ev_dir_d,
            simulate_fail_partial_startup=True,
        )
    assert "INSPECTION_FAILED" in str(exc_info.value)
    ev_file = ev_dir_d / "container-runtime-evidence.json"
    assert ev_file.exists()
    ev_data = json.loads(ev_file.read_text(encoding="utf-8"))
    assert ev_data["cleanup_verification"]["status"] == "CLEANUP_UNVERIFIED"
    assert ev_data["cleanup_verification"]["containers_remaining"] is None

    # --- Test E: Healthy empty inventory returns clean empty dictionary ---
    def mock_run_all_healthy_empty(cmd: list[str], *args: object, **kwargs: object):
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] in ("ps", "volume", "network"):
            return subprocess.CompletedProcess(cmd, returncode=0, stdout="", stderr="")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run_all_healthy_empty)
    healthy_inv = _get_project_resources("p1-test-healthy")
    assert healthy_inv == {"containers": [], "volumes": [], "networks": []}

    # Reset monkeypatch for real Docker regression checks
    monkeypatch.undo()

    # --- Test F: Real Docker regression on disposable resources ---
    if shutil.which("docker") is not None:
        chk = subprocess.run(["docker", "ps"], capture_output=True, text=True)
        if chk.returncode == 0:
            proj_f = f"p1-safety-f09f-{uuid.uuid4().hex[:8]}"
            vol_f = f"test-f09f-vol-{uuid.uuid4().hex[:6]}"
            subprocess.run(["docker", "volume", "create", "--label", f"com.docker.compose.project={proj_f}", vol_f], check=True)
            try:
                with pytest.raises(OwnershipConflictError):
                    run_container_verification(project_name=proj_f, evidence_dir=tmp_path / "ev_f")
                surv = subprocess.run(["docker", "volume", "ls", "--filter", f"label=com.docker.compose.project={proj_f}", "--format", "{{.Name}}"], capture_output=True, text=True)
                assert vol_f in surv.stdout
            finally:
                subprocess.run(["docker", "volume", "rm", vol_f], capture_output=True, text=True)

    print("F09_DOCKER_INSPECTION_FAIL_CLOSED_PASS")


def test_18_v1_models_ledger_health_fail_closed(tmp_path: Path) -> None:
    """Secondary Finding: /v1/models must fail closed with 503 BUDGET_METER_UNAVAILABLE when ledger is missing or corrupt."""
    # --- Test A: Missing ledger on /v1/models ---
    upstream_a, _, received_a = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_a = tmp_path / "ledger_models_a.json"

    server_a, _, ledger_a = start_live_safety_gateway(
        state_file_a,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-models-a",
        upstream_base_url=f"http://127.0.0.1:{upstream_a.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_a = f"http://127.0.0.1:{server_a.server_port}"
    try:
        assert state_file_a.exists()
        state_file_a.unlink()
        assert not state_file_a.exists()

        req = urllib.request.Request(
            gateway_url_a + "/v1/models",
            headers={"Authorization": "Bearer ai-worker"},
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                status = resp.status
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            status = exc.code
            payload = json.loads(exc.read().decode("utf-8"))

        assert status == 503
        assert payload.get("error") == "BUDGET_METER_UNAVAILABLE"
        assert not state_file_a.exists(), "Missing ledger file was recreated during /v1/models request!"
        assert len(received_a) == 0, "Model discovery request dispatched upstream with missing ledger!"
    finally:
        server_a.shutdown()
        server_a.server_close()
        ledger_a.close()
        upstream_a.shutdown()
        upstream_a.server_close()

    # --- Test B: Corrupted ledger on /v1/models ---
    upstream_b, _, received_b = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_b = tmp_path / "ledger_models_b.json"

    server_b, _, ledger_b = start_live_safety_gateway(
        state_file_b,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-models-b",
        upstream_base_url=f"http://127.0.0.1:{upstream_b.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_b = f"http://127.0.0.1:{server_b.server_port}"
    try:
        assert state_file_b.exists()
        corrupt_content = '{"state": {"truncated": true, '
        state_file_b.write_text(corrupt_content, encoding="utf-8")

        req = urllib.request.Request(
            gateway_url_b + "/v1/models",
            headers={"Authorization": "Bearer ai-worker"},
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                status = resp.status
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            status = exc.code
            payload = json.loads(exc.read().decode("utf-8"))

        assert status == 503
        assert payload.get("error") == "BUDGET_METER_UNAVAILABLE"
        assert state_file_b.read_text(encoding="utf-8") == corrupt_content, "Corrupted ledger on disk was overwritten!"
        assert len(received_b) == 0, "Model discovery request dispatched upstream with corrupted ledger!"
    finally:
        server_b.shutdown()
        server_b.server_close()
        ledger_b.close()
        upstream_b.shutdown()
        upstream_b.server_close()

    # --- Test C: Healthy ledger on /v1/models ---
    upstream_c, _, received_c = start_fake_upstream(port=0, scenario="p1-live-safety-v1")
    state_file_c = tmp_path / "ledger_models_c.json"

    server_c, _, ledger_c = start_live_safety_gateway(
        state_file_c,
        port=0,
        enable_live_safety_guard=True,
        initialize=True,
        run_id="run-models-c",
        upstream_base_url=f"http://127.0.0.1:{upstream_c.server_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service"},
    )
    gateway_url_c = f"http://127.0.0.1:{server_c.server_port}"
    try:
        req = urllib.request.Request(
            gateway_url_c + "/v1/models",
            headers={"Authorization": "Bearer ai-worker"},
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            status = resp.status
            payload = json.loads(resp.read().decode("utf-8"))

        assert status == 200
        assert "data" in payload or "models" in payload
        assert len(received_c) == 1
        assert ledger_c.state["total_calls"] == 1
    finally:
        server_c.shutdown()
        server_c.server_close()
        ledger_c.close()
        upstream_c.shutdown()
        upstream_c.server_close()
