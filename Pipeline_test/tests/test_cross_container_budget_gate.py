"""
Cross-Container Authoritative Budget Gateway & Fault-Injection Tests (Wave 1C).
Verifies:
1. Hard ceiling 200/201 boundary: Call 200 succeeds, call 201 is strictly denied.
2. 2-hour wall-clock absolute expiry: Dispatches rejected after elapsed deadline.
3. Cost admission cap ($4.50 admission cutoff, $5.00 spend ceiling).
4. Multi-process race contention on the final remaining slot (atomic reservation).
5. Failed & retried provider calls consume slots permanently.
6. Corrupted state ledger fails closed without destroying state.
7. AI-Service LLMService cross-container integration via BUDGET_GUARD_URL.
8. Backend Copilot proxy integration via /v1/chat/completions.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
import time
import urllib.request
import urllib.error
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "Pipeline_test" / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "Pipeline_test" / "tools"))
if str(REPO_ROOT / "ai-service") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "ai-service"))

from budget_gateway import (
    AuthoritativeBudgetLedger,
    BudgetExceededError,
    BudgetMeterUnavailableError,
    start_budget_gateway,
)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http_post_json(url: str, body: dict, headers: dict | None = None) -> tuple[int, dict]:
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except Exception:
            return exc.code, {"raw_error": raw}


def http_get_json(url: str) -> tuple[int, dict]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except Exception:
            return exc.code, {"raw_error": raw}


def test_200_201_boundary_strictly_denies_201st_dispatch(tmp_path):
    """Proves that exactly 200 calls are admitted and the 201st is rejected with 429."""
    state_file = tmp_path / "budget_state.json"
    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
        max_calls=200,
        max_cost_usd=5.00,
        admission_cost_usd=4.50,
    )
    base_url = f"http://127.0.0.1:{port}"

    try:
        # Fast-fill 200 calls
        for i in range(1, 201):
            status, res = http_post_json(
                f"{base_url}/api/budget/reserve",
                {"operation": f"call_{i}", "client_service": "test_runner"},
            )
            assert status == 200, f"Call {i} should be allowed: {res}"
            assert res["allowed"] is True
            assert res["call_index"] == i
            # Finalize immediately
            f_status, f_res = http_post_json(
                f"{base_url}/api/budget/finalize",
                {"ticket_id": res["ticket_id"], "status": "SUCCESS", "prompt_tokens": 10, "candidate_tokens": 5},
            )
            assert f_status == 200

        # Attempt call 201: MUST BE STRICTLY DENIED
        status_201, res_201 = http_post_json(
            f"{base_url}/api/budget/reserve",
            {"operation": "call_201_forbidden", "client_service": "test_runner"},
        )
        assert status_201 == 429, f"Call 201 must receive HTTP 429, got {status_201}: {res_201}"
        assert res_201.get("error") == "BUDGET_EXCEEDED"
        assert "MAX_CALLS_REACHED" in res_201.get("message", "")

        # Also verify /v1/chat/completions proxy endpoint strictly rejects call 201
        proxy_status, proxy_res = http_post_json(
            f"{base_url}/v1/chat/completions",
            {"model": "gemini-3.5-flash-lite", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert proxy_status == 429
        assert proxy_res["error"]["code"] == "BUDGET_LIMIT_REACHED"

        # Verify summary reflects exactly 200 total calls
        summary_status, summary = http_get_json(f"{base_url}/api/budget/status")
        assert summary_status == 200
        assert summary["total_calls"] == 200
        assert summary["remaining_calls"] == 0
        assert summary["status"] == "EXHAUSTED"

    finally:
        server.shutdown()
        server.server_close()


def test_2_hour_wall_clock_expiry_strictly_denies_dispatch(tmp_path):
    """Proves that any dispatch after the 2-hour window is rejected."""
    state_file = tmp_path / "budget_state.json"
    past_started = datetime.fromtimestamp(time.time() - 7205, tz=timezone.utc).isoformat()
    state_file.write_text(
        json.dumps({
            "max_calls": 200,
            "max_cost_usd": 5.00,
            "admission_cost_usd": 4.50,
            "max_wall_clock_seconds": 7200,
            "approval_reference": "Wave 1C Test",
            "approved_by": "project owner",
            "live_started_at": past_started,
            "live_deadline_at": past_started,
            "total_calls": 10,
            "successful_calls": 10,
            "failed_calls": 0,
            "total_prompt_tokens": 1000,
            "total_candidate_tokens": 500,
            "estimated_cost_usd": 0.005,
            "status": "ACTIVE",
            "stop_reason": None,
            "call_history": [],
        }),
        encoding="utf-8",
    )

    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
        max_wall_clock_seconds=7200,
    )
    base_url = f"http://127.0.0.1:{port}"

    try:
        status, res = http_post_json(
            f"{base_url}/api/budget/reserve",
            {"operation": "post_deadline_call", "client_service": "test_runner"},
        )
        assert status == 429
        assert res.get("error") == "BUDGET_EXCEEDED"
        assert "TIME_LIMIT_EXCEEDED" in res.get("message", "")

        # Summary check
        s_status, summary = http_get_json(f"{base_url}/api/budget/status")
        assert s_status == 200
        assert summary["status"] == "EXHAUSTED"
        assert "TIME_LIMIT_EXCEEDED" in summary["stop_reason"]

    finally:
        server.shutdown()
        server.server_close()


def test_admission_cost_cutoff_strictly_denies_spend_over_ceiling(tmp_path):
    """Proves that dispatch is refused when cost hits $4.50 cutoff, preventing spend > $5.00."""
    state_file = tmp_path / "budget_state.json"
    state_file.write_text(
        json.dumps({
            "max_calls": 200,
            "max_cost_usd": 5.00,
            "admission_cost_usd": 4.50,
            "max_wall_clock_seconds": 7200,
            "approval_reference": "Wave 1C Test",
            "approved_by": "project owner",
            "live_started_at": datetime.now(timezone.utc).isoformat(),
            "live_deadline_at": None,
            "total_calls": 50,
            "successful_calls": 50,
            "failed_calls": 0,
            "total_prompt_tokens": 40000000,
            "total_candidate_tokens": 1000000,
            "estimated_cost_usd": 4.51,  # Above 4.50 admission cutoff
            "status": "ACTIVE",
            "stop_reason": None,
            "call_history": [],
        }),
        encoding="utf-8",
    )

    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
    )
    base_url = f"http://127.0.0.1:{port}"

    try:
        status, res = http_post_json(
            f"{base_url}/api/budget/reserve",
            {"operation": "costly_call", "client_service": "test_runner"},
        )
        assert status == 429
        assert res.get("error") == "BUDGET_EXCEEDED"
        assert "ADMISSION_COST_LIMIT_REACHED" in res.get("message", "")
    finally:
        server.shutdown()
        server.server_close()


def _worker_reserve_slot(base_url: str, worker_id: int) -> tuple[int, dict]:
    """Helper for multiprocess race test."""
    return http_post_json(
        f"{base_url}/api/budget/reserve",
        {"operation": f"worker_race_{worker_id}", "client_service": f"worker_{worker_id}"},
    )


def test_multiprocess_race_contention_for_final_slot(tmp_path):
    """
    Spawns concurrent independent workers to race for the final 1 slot (call 200).
    Proves atomic reservation: exactly 1 worker succeeds (200), all others denied (429).
    Ledger total_calls remains exactly 200.
    """
    state_file = tmp_path / "budget_state.json"
    state_file.write_text(
        json.dumps({
            "max_calls": 200,
            "max_cost_usd": 5.00,
            "admission_cost_usd": 4.50,
            "max_wall_clock_seconds": 7200,
            "approval_reference": "Wave 1C Multiprocess Test",
            "approved_by": "project owner",
            "live_started_at": datetime.now(timezone.utc).isoformat(),
            "live_deadline_at": None,
            "total_calls": 199,  # Only 1 slot remaining!
            "successful_calls": 199,
            "failed_calls": 0,
            "total_prompt_tokens": 10000,
            "total_candidate_tokens": 5000,
            "estimated_cost_usd": 0.05,
            "status": "ACTIVE",
            "stop_reason": None,
            "call_history": [],
        }),
        encoding="utf-8",
    )

    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
        max_calls=200,
    )
    base_url = f"http://127.0.0.1:{port}"

    num_workers = 10
    results = []
    try:
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = [
                executor.submit(_worker_reserve_slot, base_url, i)
                for i in range(num_workers)
            ]
            for f in as_completed(futures):
                results.append(f.result())

        successes = [r for r in results if r[0] == 200 and r[1].get("allowed") is True]
        denials = [r for r in results if r[0] == 429]

        assert len(successes) == 1, f"Exactly 1 worker must win the final slot, got {len(successes)}"
        assert len(denials) == num_workers - 1, f"All {num_workers - 1} other workers must be denied"

        # Finalize the winning ticket
        winning_ticket = successes[0][1]["ticket_id"]
        http_post_json(f"{base_url}/api/budget/finalize", {"ticket_id": winning_ticket, "status": "SUCCESS"})

        # Verify durable ledger
        s_status, summary = http_get_json(f"{base_url}/api/budget/status")
        assert summary["total_calls"] == 200
        assert summary["remaining_calls"] == 0

    finally:
        server.shutdown()
        server.server_close()


def test_failed_and_retried_provider_attempts_are_permanently_metered(tmp_path):
    """Proves that a failed network call consumes a slot and retrying takes a 2nd slot."""
    state_file = tmp_path / "budget_state.json"
    port = find_free_port()
    server, thread, ledger = start_budget_gateway(state_file=state_file, port=port, max_calls=200)
    base_url = f"http://127.0.0.1:{port}"

    try:
        # Attempt 1: reserve then fail
        st1, res1 = http_post_json(f"{base_url}/api/budget/reserve", {"operation": "attempt_1"})
        assert st1 == 200
        ticket_1 = res1["ticket_id"]

        # Finalize as FAILED
        f_st1, f_res1 = http_post_json(
            f"{base_url}/api/budget/finalize",
            {"ticket_id": ticket_1, "status": "FAILED", "error": "HTTP 500 Provider Outage"},
        )
        assert f_st1 == 200

        # Attempt 2 (retry): consumes slot 2
        st2, res2 = http_post_json(f"{base_url}/api/budget/reserve", {"operation": "attempt_2_retry"})
        assert st2 == 200
        ticket_2 = res2["ticket_id"]
        assert ticket_1 != ticket_2
        assert res2["call_index"] == 2

        # Finalize attempt 2 as SUCCESS
        http_post_json(f"{base_url}/api/budget/finalize", {"ticket_id": ticket_2, "status": "SUCCESS"})

        s_status, summary = http_get_json(f"{base_url}/api/budget/status")
        assert summary["total_calls"] == 2
        assert summary["successful_calls"] == 1
        assert summary["failed_calls"] == 1
        assert summary["remaining_calls"] == 198

    finally:
        server.shutdown()
        server.server_close()


def test_corrupt_ledger_fails_closed_without_corrupting_file(tmp_path):
    """Proves that corrupted or unreadable ledger strictly fails closed (503) without overwriting file."""
    state_file = tmp_path / "budget_state.json"
    corrupt_content = "{ this is invalid json and corrupt data content }}}"
    state_file.write_text(corrupt_content, encoding="utf-8")

    port = find_free_port()
    server, thread, ledger = start_budget_gateway(state_file=state_file, port=port)
    base_url = f"http://127.0.0.1:{port}"

    try:
        status, res = http_post_json(
            f"{base_url}/api/budget/reserve",
            {"operation": "should_fail_closed"},
        )
        assert status == 503
        assert res.get("error") == "BUDGET_METER_UNAVAILABLE"

        # State file on disk must NOT have been overwritten
        assert state_file.read_text(encoding="utf-8") == corrupt_content

    finally:
        server.shutdown()
        server.server_close()


def test_ai_service_llm_service_cross_container_integration(tmp_path, monkeypatch):
    """
    Integrates AI-service LLMService with the budget gateway via BUDGET_GUARD_URL.
    Proves that LLMService reserves slots before dispatch and fails closed when budget is exhausted.
    """
    from core.llm_service import LLMService, LLMServiceError

    state_file = tmp_path / "budget_state.json"
    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
        max_calls=2,  # Set small limit to test exhaustion
    )
    base_url = f"http://127.0.0.1:{port}"
    monkeypatch.setenv("BUDGET_GUARD_URL", base_url)
    monkeypatch.setenv("LLM_BASE_URL", f"{base_url}/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-mock")

    try:
        service = LLMService(provider="openai", api_key="test-key-mock", base_url=f"{base_url}/v1")

        # Call 1: succeed through proxy stub
        out1 = service.generate_suggestion(current_text="Mai Linh buoc vao quan cu.", graph_context=None)
        assert "suggestions" in out1
        assert len(out1["suggestions"]) == 3

        # Call 2: succeed through proxy stub
        out2 = service.generate_suggestion(current_text="Trang gap lai nguoi ban cu.", graph_context=None)
        assert "suggestions" in out2

        # Check ledger: exactly 2 calls consumed
        assert ledger.state["total_calls"] == 2

        # Call 3: gateway is now exhausted (2/2) -> LLMService MUST fail closed with LLMServiceError
        # (Disable local suggestion fallback to verify fail-closed exception)
        monkeypatch.setenv("LLM_LOCAL_FALLBACK", "false")
        with pytest.raises(LLMServiceError) as exc_info:
            service.generate_suggestion(current_text="Doan van thu ba sau khi kiet ngan sach.", graph_context=None)

        assert "BUDGET_GUARD_DENIED" in str(exc_info.value) or "BUDGET_EXCEEDED" in str(exc_info.value)

    finally:
        server.shutdown()
        server.server_close()


def test_backend_copilot_cross_container_proxy_integration(tmp_path):
    """
    Tests backend /v1/chat/completions proxy dispatch.
    Verifies header X-Client-Service: backend-copilot is recorded and metering is enforced.
    """
    state_file = tmp_path / "budget_state.json"
    port = find_free_port()
    server, thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=port,
        max_calls=1,
    )
    base_url = f"http://127.0.0.1:{port}"

    try:
        # Request 1 from backend copilot
        status1, res1 = http_post_json(
            f"{base_url}/v1/chat/completions",
            {
                "model": "gemini-3.5-flash-lite",
                "messages": [{"role": "user", "content": "Viet tiep chuong 1"}],
            },
            headers={"X-Client-Service": "backend-copilot"},
        )
        assert status1 == 200
        assert "choices" in res1
        assert res1["choices"][0]["message"]["content"] == "Offline stub suggestion."

        # Verify entry in ledger
        assert ledger.state["total_calls"] == 1
        history_entry = ledger.state["call_history"][0]
        assert history_entry["client_service"] == "backend-copilot"

        # Request 2 from backend copilot: MUST BE 429 BUDGET_EXCEEDED
        status2, res2 = http_post_json(
            f"{base_url}/v1/chat/completions",
            {
                "model": "gemini-3.5-flash-lite",
                "messages": [{"role": "user", "content": "Viet tiep chuong 2"}],
            },
            headers={"X-Client-Service": "backend-copilot"},
        )
        assert status2 == 429
        assert res2["error"]["code"] == "BUDGET_LIMIT_REACHED"

    finally:
        server.shutdown()
        server.server_close()
