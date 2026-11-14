"""#149: background analysis must not starve interactive writing under free-tier RPM limits.

Offline only: the quota ledger, the gateway with a fake upstream, and LLMService with a stubbed
Gemini client. ZERO real provider calls.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "ai-service"), str(ROOT / "Pipeline_test" / "tools")]

from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from Pipeline_test.tools.p1_live_safety_gateway import start_live_safety_gateway
from Pipeline_test.tools.quota_controller import (
    ConcurrencyLimitExceeded,
    FreeTierQuotaLedger,
    RPMLimitExceeded,
    create_operator_attestation,
)

MODEL = "gemini-3.5-flash-lite"
QUOTAS = {MODEL: {"rpm": 15, "tpm": 250_000, "rpd": 500, "max_concurrency": 2, "headroom": 0.10}}
ATTESTATION = create_operator_attestation("test-project-149", duration_seconds=86400)


def make_ledger(tmp_path: Path, quotas=QUOTAS) -> FreeTierQuotaLedger:
    return FreeTierQuotaLedger(tmp_path / "ledger.json", run_id="run-149", live_free_tier_enabled=True,
                               model_quotas=quotas, operator_attestation=ATTESTATION, initialize=True)


def fill(ledger, count, *, now, priority):
    for _ in range(count):
        t = ledger.reserve(model=MODEL, estimated_input_tokens=50, now_override=now, priority=priority)
        ledger.finalize(t["ticket_id"], "SUCCESS")


def test_background_leaves_rpm_reserve_for_interactive(tmp_path):
    ledger = make_ledger(tmp_path)  # effective 13 RPM, 2 kept for interactive
    now = time.time()
    fill(ledger, 11, now=now, priority="background")
    with pytest.raises(RPMLimitExceeded) as exc:
        ledger.reserve(model=MODEL, now_override=now + 5, priority="background")
    assert exc.value.retry_after == 55
    fill(ledger, 2, now=now + 5, priority="interactive")
    with pytest.raises(RPMLimitExceeded):
        ledger.reserve(model=MODEL, now_override=now + 5, priority="interactive")
    ledger.close()


def test_unmarked_callers_keep_full_limits(tmp_path):
    ledger = make_ledger(tmp_path)
    now = time.time()
    for _ in range(13):
        t = ledger.reserve(model=MODEL, estimated_input_tokens=50, now_override=now)
        ledger.finalize(t["ticket_id"], "SUCCESS")
    with pytest.raises(RPMLimitExceeded):
        ledger.reserve(model=MODEL, now_override=now)
    ledger.close()


def test_background_cannot_take_last_concurrency_slot(tmp_path):
    ledger = make_ledger(tmp_path)
    now = time.time()
    first = ledger.reserve(model=MODEL, now_override=now, priority="background")
    with pytest.raises(ConcurrencyLimitExceeded):
        ledger.reserve(model=MODEL, now_override=now, priority="background")
    second = ledger.reserve(model=MODEL, now_override=now, priority="interactive")
    for t in (first, second):
        ledger.finalize(t["ticket_id"], "SUCCESS")
    ledger.close()


def _post(url, body, priority=None):
    headers = {"Content-Type": "application/json", "Authorization": "Bearer token-ai"}
    if priority:
        headers["X-Request-Priority"] = priority
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read()), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read()), dict(exc.headers)


def test_gateway_routes_priority_header_and_reports_retry_after(tmp_path):
    upstream, _thread, _received = start_fake_upstream(port=0, host="127.0.0.1", expected_key="fake-key",
                                                       scenario="p1-live-safety-v1")
    quotas = {MODEL: {"rpm": 5, "tpm": 250_000, "rpd": 500, "max_concurrency": 4, "headroom": 0.0}}
    server, _t, _ledger = start_live_safety_gateway(
        tmp_path / "gw.json", host="127.0.0.1", port=0,
        upstream_base_url=f"http://127.0.0.1:{upstream.server_address[1]}", upstream_api_key="fake-key",
        client_tokens={"token-ai": "ai-service"}, execution_mode="live_free_tier", enable_live_free_tier=True,
        model_quotas=quotas, operator_attestation=ATTESTATION, initialize=True, run_id="gw-149")
    url = f"http://127.0.0.1:{server.server_address[1]}/v1beta/models/{MODEL}:generateContent"
    body = {"contents": [{"parts": [{"text": "x"}]}], "generationConfig": {"maxOutputTokens": 64}}
    try:
        # rpm 5 with 1 kept for interactive: 4 background calls fit, the 5th is refused.
        for _ in range(4):
            assert _post(url, body, "background")[0] == 200
        status, data, headers = _post(url, body, "background")
        assert status == 429 and data["error"] == "RPM_LIMIT_EXCEEDED"
        assert 1 <= data["retry_after"] <= 60 and headers.get("Retry-After") == str(data["retry_after"])
        assert _post(url, body, "interactive")[0] == 200
    finally:
        server.shutdown()
        server.server_close()
        upstream.shutdown()
        upstream.server_close()


class _Denied(Exception):
    pass


class _FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def generate_content(self, **_kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return type("R", (), {"text": outcome, "candidates": [], "usage_metadata": None})()


def _service(monkeypatch, outcomes):
    from core import llm_service as mod

    models = _FakeModels(outcomes)
    headers_seen = []

    class FakeClient:
        def __init__(self, *, api_key, http_options):
            headers_seen.append(dict(http_options.headers or {}))
            self.models = models

    import google.genai as genai

    monkeypatch.setattr(genai, "Client", FakeClient)
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
    monkeypatch.setattr(mod.LLMService, "_guard_proxy_config", staticmethod(lambda: ("http://gw", "tok")))
    monkeypatch.setattr(mod.LLMService, "_budget_guard_reserve", lambda self, **kw: None)
    sleeps = []
    monkeypatch.setattr(mod.time, "sleep", lambda s: sleeps.append(s))
    svc = mod.LLMService.__new__(mod.LLMService)
    svc.provider, svc.model, svc.api_key = "gemini", MODEL, "k"
    svc.temperature, svc.max_tokens, svc.timeout_seconds = 0.2, 256, 30
    return svc, models, headers_seen, sleeps


DENIAL = _Denied("429 None. {'error': 'RPM_LIMIT_EXCEEDED', 'retry_after': 7}")


def test_interactive_call_waits_briefly_then_succeeds(monkeypatch):
    pytest.importorskip("google.genai")
    from core.structured_call import priority_scope

    svc, models, headers_seen, sleeps = _service(monkeypatch, [DENIAL, "draft"])
    with priority_scope("interactive"):
        assert svc._call_gemini("sys", "user") == "draft"
    assert sleeps == [7] and models.calls == 2
    assert headers_seen[0]["X-Request-Priority"] == "interactive"


def test_background_call_fails_fast_with_code(monkeypatch):
    pytest.importorskip("google.genai")
    from core.llm_service import LLMServiceError

    svc, models, headers_seen, sleeps = _service(monkeypatch, [DENIAL])
    with pytest.raises(LLMServiceError, match=r"BUDGET_GUARD_DENIED RPM_LIMIT_EXCEEDED retry_after=7"):
        svc._call_gemini("sys", "user")
    assert sleeps == [] and models.calls == 1
    assert headers_seen[0]["X-Request-Priority"] == "background"


def test_interactive_wait_is_bounded(monkeypatch):
    pytest.importorskip("google.genai")
    from core.llm_service import LLMServiceError
    from core.structured_call import priority_scope

    monkeypatch.setenv("INTERACTIVE_RATE_LIMIT_MAX_WAIT_SECONDS", "10")
    svc, models, _h, sleeps = _service(monkeypatch, [DENIAL, DENIAL, "never"])
    with priority_scope("interactive"), pytest.raises(LLMServiceError, match="RPM_LIMIT_EXCEEDED"):
        svc._call_gemini("sys", "user")
    assert sleeps == [7] and models.calls == 2


def test_writing_job_error_is_author_facing_for_rate_limits():
    from application.writing_service import writing_failure_error

    err = writing_failure_error(RuntimeError("BUDGET_GUARD_DENIED RPM_LIMIT_EXCEEDED retry_after=42"))
    assert err["code"] == "AI_RATE_LIMITED" and err["retry_after"] == 42
    assert "42 giây" in err["message"]
    assert writing_failure_error(RuntimeError("BUDGET_GUARD_DENIED")) == {"message": "BUDGET_GUARD_DENIED"}


def test_transient_provider_503_is_retried_with_backoff(monkeypatch):
    pytest.importorskip("google.genai")
    upstream_503 = _Denied("503 None. {'error': 'PROVIDER_UNAVAILABLE', 'upstream_status': 503}")
    svc, models, _h, sleeps = _service(monkeypatch, [upstream_503, "ok"])
    assert svc._call_gemini("sys", "user") == "ok"
    assert sleeps == [4] and models.calls == 2


def test_provider_auth_error_is_not_retried(monkeypatch):
    pytest.importorskip("google.genai")
    from core.llm_service import LLMServiceError

    auth = _Denied("403 None. {'error': 'PROVIDER_UNAVAILABLE', 'upstream_status': 403}")
    svc, models, _h, sleeps = _service(monkeypatch, [auth])
    with pytest.raises(LLMServiceError):
        svc._call_gemini("sys", "user")
    assert sleeps == [] and models.calls == 1
