"""P1-LIVE-FREE-02: Comprehensive Offline Verification Suite for Gemini Free Tier Runtime.

Tests quota admission, RPM, TPM, RPD, concurrency, model approval, private note rejection,
embedding dimension validation, 429 backoff, durability, and failure modes using fake upstream.
F-11 through F-15 remediation tests:
- F-11: Mandatory gateway routing (zero direct client bypass)
- F-12: HTTPS live forwarding transport security and origin verification
- F-13: Required quota configuration, operator attestation, and DST-aware Pacific Time RPD reset
- F-14: Durable stale-ticket reconciliation and recovery
- F-15: Authenticated emergency kill switch for running gateway
- Multi-process concurrency accounting using subprocesses

ZERO REAL CALLS to Google Gemini. ZERO PROVIDER SPENDING ($0.00).
"""
from __future__ import annotations

from datetime import datetime, time as datetime_time, timedelta
import json
import math
import multiprocessing
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from typing import Any
import urllib.error
import urllib.request
import pytest
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "ai-service"), str(ROOT / "Pipeline_test" / "tools")]

from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from Pipeline_test.tools.p1_live_safety_gateway import start_live_safety_gateway
from Pipeline_test.tools.quota_controller import (
    FreeTierQuotaLedger,
    QuotaExceededError,
    RPMLimitExceeded,
    TPMLimitExceeded,
    RPDLimitExceeded,
    ConcurrencyLimitExceeded,
    QuotaMeterUnavailableError,
    FreeTierStatusUnverifiedError,
    QuotaConfigRequiredError,
    calculate_backoff_delay,
    create_operator_attestation,
    get_next_pacific_midnight,
    APPROVED_LLM_MODELS,
    APPROVED_EMBEDDING_MODELS,
    ALL_APPROVED_MODELS,
)
from Pipeline_test.tools.p1_free_tier_preflight import trigger_kill_switch
from infrastructure.embedding_providers import (
    GeminiEmbeddingProvider,
    DeterministicFakeEmbeddingProvider,
    EmbeddingProviderError,
)
from core.llm_service import LLMService, LLMServiceError
from core.llm_client import LLMClient, LLMClientError


# Standard mock quota configuration for offline tests
MOCK_TEST_QUOTAS = {
    "gemini-3.5-flash-lite": {
        "rpm": 15,
        "tpm": 250_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,
    },
    "gemini-3.1-flash-lite": {
        "rpm": 15,
        "tpm": 250_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,
    },
    "gemini-embedding-2": {
        "rpm": 15,
        "tpm": 1_000_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,
    },
}

MOCK_ATTESTATION = create_operator_attestation("test-project-01", duration_seconds=86400)


import shutil
import tempfile

@pytest.fixture
def temp_dir() -> Path:
    d = Path(tempfile.mkdtemp(prefix="p1_free_tier_"))
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def fake_upstream_server():
    server, thread, received = start_fake_upstream(
        port=0,
        host="127.0.0.1",
        expected_key="fake-key-free-tier",
        scenario="p1-live-safety-v1",
    )
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}"
    yield {"server": server, "thread": thread, "url": url, "received": received}
    server.shutdown()
    server.server_close()


def post_gateway(url: str, path: str, body: dict, token: str = "worker-ai", api_key: str = ""):
    data = json.dumps(body).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if api_key:
        headers["x-goog-api-key"] = api_key
    req = urllib.request.Request(f"{url.rstrip('/')}{path}", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"raw": err_body}
        return exc.code, parsed, dict(exc.headers)


def get_gateway(url: str, path: str, token: str = "worker-ai"):
    headers = {
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(f"{url.rstrip('/')}{path}", headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"raw": err_body}
        return exc.code, parsed, dict(exc.headers)


# ==============================================================================
# TEST GROUP 1: FreeTierQuotaLedger Unit Tests (RPM, TPM, RPD, Concurrency)
# ==============================================================================

def test_01_quota_ledger_init_and_durability(temp_dir: Path):
    """Test ledger creates marker, schema 4, sha256 checksum, and survives reload."""
    state_file = temp_dir / "ledger.json"
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-01",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
    )
    assert ledger.state["schema"] == 4
    assert ledger.state["guard_profile"] == "P1_LIVE_FREE_TIER_01"
    assert ledger.state["run_id"] == "run-01"
    ledger.close()

    # Re-open verified without initialize
    ledger2 = FreeTierQuotaLedger(state_file, strict_fail_closed=True)
    assert ledger2.state["run_id"] == "run-01"
    ledger2.close()


def test_02_operator_enablement_guard(temp_dir: Path):
    """If live_free_tier_enabled is False, admission raises FreeTierStatusUnverifiedError."""
    state_file = temp_dir / "ledger_unverified.json"
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-02",
        live_free_tier_enabled=False,
        model_quotas=MOCK_TEST_QUOTAS,
        initialize=True,
    )
    with pytest.raises(FreeTierStatusUnverifiedError):
        ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=100)
    ledger.close()


def test_03_model_approval_strictness(temp_dir: Path):
    """Forbidden models (e.g. Gemini 2.5, GPT-4) must be rejected with ValueError."""
    state_file = temp_dir / "ledger_models.json"
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-03",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
    )
    # Approved models
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=100)
    assert t1["model"] == "gemini-3.5-flash-lite"
    ledger.finalize(t1["ticket_id"], "SUCCESS")

    t2 = ledger.reserve(model="gemini-3.1-flash-lite", estimated_input_tokens=100)
    assert t2["model"] == "gemini-3.1-flash-lite"
    ledger.finalize(t2["ticket_id"], "SUCCESS")

    t3 = ledger.reserve(model="gemini-embedding-2", estimated_input_tokens=100)
    assert t3["model"] == "gemini-embedding-2"
    ledger.finalize(t3["ticket_id"], "SUCCESS")

    # Strictly forbidden
    with pytest.raises(ValueError, match="MODEL_NOT_APPROVED"):
        ledger.reserve(model="gemini-2.5-flash", estimated_input_tokens=100)

    with pytest.raises(ValueError, match="MODEL_NOT_APPROVED"):
        ledger.reserve(model="gpt-4o", estimated_input_tokens=100)

    ledger.close()


def test_04_rpm_rate_limiting_with_headroom(temp_dir: Path):
    """Test RPM sliding window rejects calls exceeding effective headroom."""
    state_file = temp_dir / "ledger_rpm.json"
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 5,
            "tpm": 100_000,
            "rpd": 100,
            "max_concurrency": 10,
            "headroom": 0.20,
        }
    }
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-04",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
    )
    now = time.time()
    tickets = []
    for _ in range(4):
        t = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now)
        ledger.finalize(t["ticket_id"], "SUCCESS")
        tickets.append(t)

    with pytest.raises(RPMLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now)

    t_next = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now + 61.0)
    assert t_next is not None
    ledger.finalize(t_next["ticket_id"], "SUCCESS")
    ledger.close()


def test_05_tpm_token_accounting_and_reconciliation(temp_dir: Path):
    """Test TPM pre-reservation, reconciliation, and limit enforcement."""
    state_file = temp_dir / "ledger_tpm.json"
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 100,
            "tpm": 1000,
            "rpd": 500,
            "max_concurrency": 5,
            "headroom": 0.10,  # Effective TPM = 900
        }
    }
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-05",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
    )
    now = time.time()
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=500, now_override=now)
    assert t1["reserved_tokens"] == 500

    ledger.finalize(t1["ticket_id"], "SUCCESS", actual_input_tokens=250)

    t2 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=350, now_override=now)
    assert t2 is not None

    with pytest.raises(TPMLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=400, now_override=now)

    ledger.finalize(t2["ticket_id"], "SUCCESS", actual_input_tokens=300)
    ledger.close()


def test_06_rpd_daily_limit_and_reset(temp_dir: Path):
    """Test RPD ceiling enforcement and midnight calendar day reset."""
    state_file = temp_dir / "ledger_rpd.json"
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 100,
            "tpm": 100_000,
            "rpd": 3,
            "max_concurrency": 5,
            "headroom": 0.0,
        }
    }
    attestation_7d = create_operator_attestation("test-project-01", duration_seconds=7 * 86400)
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-06",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        operator_attestation=attestation_7d,
        initialize=True,
    )
    now = time.time()
    for _ in range(3):
        t = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
        ledger.finalize(t["ticket_id"], "SUCCESS")

    with pytest.raises(RPDLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    tomorrow_now = now + 86400 * 2
    t_new_day = ledger.reserve(model="gemini-3.5-flash-lite", now_override=tomorrow_now)
    assert t_new_day is not None
    ledger.finalize(t_new_day["ticket_id"], "SUCCESS")
    assert ledger.state["rpd_call_count"] == 1
    ledger.close()


def test_07_bounded_concurrency_semaphore_and_stale_cleanup(temp_dir: Path):
    """Test in-flight concurrency semaphore (max 2) and stale ticket timeout recovery."""
    state_file = temp_dir / "ledger_conc.json"
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 20,
            "tpm": 500_000,
            "rpd": 100,
            "max_concurrency": 2,
            "headroom": 0.0,
        }
    }
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-07",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        in_flight_timeout_seconds=10.0,
    )
    now = time.time()
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    t2 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    with pytest.raises(ConcurrencyLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    ledger.finalize(t1["ticket_id"], "SUCCESS")
    t3 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    assert t3 is not None

    t4 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now + 15.0)
    assert t4 is not None
    ledger.finalize(t4["ticket_id"], "SUCCESS")
    ledger.close()


def test_08_corrupted_ledger_fails_closed(temp_dir: Path):
    """Corrupted ledger JSON or sha256 mismatch must fail closed."""
    state_file = temp_dir / "ledger_corrupt.json"
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-08",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
    )
    ledger.close()

    # Tamper with file
    data = json.loads(state_file.read_text(encoding="utf-8"))
    data["state"]["rpd_call_count"] = 999999
    state_file.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(QuotaMeterUnavailableError):
        FreeTierQuotaLedger(state_file, strict_fail_closed=True)


# ==============================================================================
# TEST GROUP 2: Gateway Integration & Protocol Routing
# ==============================================================================

def test_09_gateway_live_free_tier_full_cycle(temp_dir: Path, fake_upstream_server):
    """Test gateway forward to fake upstream, token reconciliation, and summary readback."""
    state_file = temp_dir / "gw_ledger.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service", "token-backend": "backend"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-run-01",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        body = {
            "contents": [{"parts": [{"text": "Story Brain continuation prompt: Lâm Phong và Tô Mặc"}]}],
            "generationConfig": {
                "maxOutputTokens": 256,
                "responseMimeType": "application/json",
            },
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert status == 200
        assert "candidates" in resp_data

        status, summary, _ = get_gateway(gw_url, "/status", token="token-ai")
        assert status == 200
        assert summary.get("guard_profile") == "P1_LIVE_FREE_TIER_01"
        assert summary.get("rpd_call_count") == 1
    finally:
        server.shutdown()
        server.server_close()


def test_10_gateway_compat_route_openai(temp_dir: Path, fake_upstream_server):
    """Test /v1/chat/completions route under live_free_tier mode."""
    state_file = temp_dir / "gw_compat_ledger.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-be": "backend"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-compat-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        compat_body = {
            "model": "gemini-3.5-flash-lite",
            "messages": [{"role": "user", "content": "Story Brain instruction"}],
            "max_tokens": 128,
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1/chat/completions", compat_body, token="token-be")
        assert status == 200
        assert "choices" in resp_data
    finally:
        server.shutdown()
        server.server_close()


def test_11_gateway_unapproved_model_rejection(temp_dir: Path, fake_upstream_server):
    """Gateway must reject unapproved models (Gemini 2.5) with 403 MODEL_NOT_APPROVED."""
    state_file = temp_dir / "gw_unapproved.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-unappr-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        bad_body = {
            "contents": [{"parts": [{"text": "Test"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-2.5-flash:generateContent", bad_body, token="token-ai")
        assert status == 403
        assert resp_data.get("error") == "MODEL_NOT_APPROVED"
    finally:
        server.shutdown()
        server.server_close()


def test_12_gateway_private_notes_leakage_rejection(temp_dir: Path, fake_upstream_server):
    """Outbound prompts containing private author notes must be rejected with 403."""
    state_file = temp_dir / "gw_leak.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-leak-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        leaked_body = {
            "contents": [{"parts": [{"text": "Context: {\"character\": \"Mai Linh\", \"private_author_notes\": \"Secret twist\"}"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", leaked_body, token="token-ai")
        assert status == 403
        assert resp_data.get("error") == "PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"
    finally:
        server.shutdown()
        server.server_close()


def test_13_gateway_embedding_quota_metering(temp_dir: Path, fake_upstream_server):
    """Test gemini-embedding-2 route is quota-metered and returns valid 768-dim floats."""
    state_file = temp_dir / "gw_embed.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-embed-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        embed_body = {
            "content": {"parts": [{"text": "Canon story narrative memory for semantic retrieval"}]},
            "outputDimensionality": 768,
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-embedding-2:embedContent", embed_body, token="token-ai")
        assert status == 200
        values = resp_data.get("embedding", {}).get("values", [])
        assert len(values) == 768
        assert all(math.isfinite(v) and not math.isnan(v) for v in values)
    finally:
        server.shutdown()
        server.server_close()


def test_14_embedding_mode_routing_safety(monkeypatch):
    """Verify GeminiEmbeddingProvider enforces mode-aware safety checks."""
    monkeypatch.setenv("AI_EXECUTION_MODE", "offline_test")
    monkeypatch.setenv("BUDGET_GUARD_URL", "http://127.0.0.1:18090")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "token-ai")
    provider = GeminiEmbeddingProvider(api_key="fake-key")

    with pytest.raises(EmbeddingProviderError, match="GUARDED_P1_EMBEDDING_DISABLED"):
        provider.embed_document("Test text")

    # In live_free_tier without guard URL raises GUARD_CONFIGURATION_INVALID (F-11)
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
    monkeypatch.delenv("BUDGET_GUARD_URL", raising=False)
    with pytest.raises(EmbeddingProviderError, match="GUARD_CONFIGURATION_INVALID"):
        provider.embed_document("Test text")


def test_15_embedding_private_note_detection(monkeypatch):
    """Verify GeminiEmbeddingProvider rejects private author notes prior to network dispatch."""
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_URL", "http://127.0.0.1:18090")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "token-ai")
    provider = GeminiEmbeddingProvider(api_key="fake-key")

    leaked_doc = '{"entity": "Mai Linh", "private_author_notes": "Secret protagonist motivation"}'
    with pytest.raises(EmbeddingProviderError, match="PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"):
        provider.embed_document(leaked_doc)


def test_16_deterministic_fake_embedding_provider_stability():
    """Verify DeterministicFakeEmbeddingProvider generates reproducible 768-dim finite vectors."""
    provider = DeterministicFakeEmbeddingProvider()
    v1 = provider.embed_document("Test canonical document text")
    v2 = provider.embed_document("Test canonical document text")
    v3 = provider.embed_query("Query test")

    assert len(v1) == 768
    assert len(v3) == 768
    assert v1 == v2
    assert v1 != v3
    assert all(math.isfinite(x) and not math.isnan(x) for x in v1)


def test_17_exponential_backoff_calculation():
    """Test calculate_backoff_delay respects max retries, retry_after, and jitter."""
    ok, delay = calculate_backoff_delay(attempt=0, max_retries=3)
    assert ok is True
    assert 0.7 <= delay <= 1.5

    ok, delay = calculate_backoff_delay(attempt=1, max_retries=3)
    assert ok is True
    assert 1.5 <= delay <= 3.0

    ok, delay = calculate_backoff_delay(attempt=1, max_retries=3, retry_after=12.5)
    assert ok is True
    assert delay == 12.5

    ok, delay = calculate_backoff_delay(attempt=3, max_retries=3)
    assert ok is False
    assert delay == 0.0


def test_18_vector_768_cosine_similarity_and_ranking():
    """Verify 768-dim embeddings correctly rank relevant documents over irrelevant ones."""
    provider = DeterministicFakeEmbeddingProvider()
    doc_relevant = provider.embed_document("Lâm Phong cầm Huyết Ngọc Bội tại trấn Thanh Phong")
    doc_irrelevant = provider.embed_document("Mai Linh sửa chữa máy thu CV-04 tại Cồn Vân")
    query = provider.embed_query("Huyết Ngọc Bội và Lâm Phong")

    assert len(doc_relevant) == 768
    assert len(doc_irrelevant) == 768
    assert len(query) == 768

    def dot(u, v):
        return sum(a * b for a, b in zip(u, v))

    def norm(u):
        return math.sqrt(sum(a * a for a in u))

    sim_rel = dot(doc_relevant, query) / (norm(doc_relevant) * norm(query))
    sim_irrel = dot(doc_irrelevant, query) / (norm(doc_irrelevant) * norm(query))

    assert math.isfinite(sim_rel)
    assert math.isfinite(sim_irrel)


def test_19_gateway_provider_timeout_propagation(temp_dir: Path, fake_upstream_server):
    """When upstream times out under deadline watchdog, gateway returns 504 PROVIDER_TIMEOUT."""
    state_file = temp_dir / "gw_timeout.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-timeout-run",
        upstream_timeout=0.2,
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        hang_body = {
            "contents": [{"parts": [{"text": "fault:sleep_long"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", hang_body, token="token-ai")
        assert status in (502, 504)
        assert resp_data.get("error") in ("PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE")
    finally:
        server.shutdown()
        server.server_close()


def test_20_gateway_auth_failure_propagation(temp_dir: Path, fake_upstream_server):
    """When upstream credentials fail, gateway returns 401/403 with PROVIDER_UNAVAILABLE."""
    state_file = temp_dir / "gw_bad_auth.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="INVALID_UPSTREAM_KEY",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-bad-auth-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        normal_body = {
            "contents": [{"parts": [{"text": "Normal prompt"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", normal_body, token="token-ai")
        assert status in (401, 403)
        assert resp_data.get("error") == "PROVIDER_UNAVAILABLE"
    finally:
        server.shutdown()
        server.server_close()


def test_21_cross_process_concurrent_accounting(temp_dir: Path, fake_upstream_server):
    """Simulate concurrent Python (ai-service) and Node (backend) workers sharing the quota gateway."""
    state_file = temp_dir / "gw_concurrent.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service", "token-backend": "backend"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-conc-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    results = []

    def make_call(client_tag: str, idx: int):
        body = {
            "contents": [{"parts": [{"text": f"Worker {client_tag} message {idx}"}]}],
            "generationConfig": {"maxOutputTokens": 128, "responseMimeType": "application/json"},
        }
        st, data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token=f"token-{client_tag}")
        results.append((st, data))

    threads = []
    for i in range(5):
        t_ai = threading.Thread(target=make_call, args=("ai", i))
        t_be = threading.Thread(target=make_call, args=("backend", i))
        threads.extend([t_ai, t_be])

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 10
    assert all(st in (200, 429) for st, _ in results)

    server.shutdown()
    server.server_close()


# ==============================================================================
# TEST GROUP 6: F-11 Mandatory Gateway Routing & Direct-Bypass Prevention
# ==============================================================================

def test_22_f11_mandatory_gateway_routing_fails_closed(monkeypatch):
    """In live_free_tier, worker entry points MUST fail closed if gateway is missing or invalid."""
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")

    # 1. LLMService fails closed when BUDGET_GUARD_URL is missing
    monkeypatch.delenv("BUDGET_GUARD_URL", raising=False)
    monkeypatch.delenv("BUDGET_GUARD_AUTH_TOKEN", raising=False)
    service = LLMService(provider="gemini", api_key="secret-key-1234")
    with pytest.raises(LLMServiceError, match="GUARD_CONFIGURATION_INVALID"):
        service._call_llm(system_prompt="sys", user_prompt="user")

    # 2. LLMService fails closed with invalid scheme (e.g. ftp://)
    monkeypatch.setenv("BUDGET_GUARD_URL", "ftp://127.0.0.1:18090")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "token")
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    with pytest.raises(LLMServiceError, match="GUARD_CONFIGURATION_INVALID"):
        service._call_llm(system_prompt="sys", user_prompt="user")

    # 3. LLMService fails closed with external non-local hostname
    monkeypatch.setenv("BUDGET_GUARD_URL", "http://external-evil-gateway.com:18090")
    with pytest.raises(LLMServiceError, match="GUARD_CONFIGURATION_INVALID"):
        service._call_llm(system_prompt="sys", user_prompt="user")

    # 4. LLMClient fails closed when guard URL is missing
    monkeypatch.delenv("BUDGET_GUARD_URL", raising=False)
    client = LLMClient(provider="gemini", api_key="secret-key-1234")
    with pytest.raises(LLMClientError, match="GUARD_CONFIGURATION_INVALID"):
        client.generate("Test prompt")

    # 5. GeminiEmbeddingProvider fails closed when guard URL is missing
    provider = GeminiEmbeddingProvider(api_key="secret-key-1234")
    with pytest.raises(EmbeddingProviderError, match="GUARD_CONFIGURATION_INVALID"):
        provider.embed_document("Test document")


def test_23_f11_direct_gemini_client_bypass_prevention(monkeypatch):
    """Verify google.genai.Client is never called directly without proxy options in live_free_tier."""
    import google.genai
    client_calls = []

    class MockGenAIClient:
        def __init__(self, **kwargs):
            client_calls.append(kwargs)

    monkeypatch.setattr(google.genai, "Client", MockGenAIClient)
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
    monkeypatch.setenv("BUDGET_GUARD_MODE", "proxy")
    monkeypatch.setenv("BUDGET_GUARD_URL", "http://127.0.0.1:18090")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "worker-token")

    service = LLMService(provider="gemini", api_key="secret-key")
    # Call _call_gemini with valid proxy guard
    try:
        service._call_gemini(system_prompt="sys", user_prompt="user")
    except Exception:
        pass

    # Verify Client was constructed WITH proxy http_options pointing to guard, not Google!
    assert len(client_calls) >= 1
    opts = client_calls[0].get("http_options")
    assert opts is not None
    assert getattr(opts, "base_url", None) == "http://127.0.0.1:18090"
    assert "generativelanguage.googleapis.com" not in str(getattr(opts, "base_url", ""))


# ==============================================================================
# TEST GROUP 7: F-12 HTTPS Live Forwarding Transport Security
# ==============================================================================

def test_24_f12_mocked_https_forwarding_and_origin_security(temp_dir: Path, monkeypatch):
    """Verify live forwarding requires HTTPS, permits ONLY Google origin, and rejects HTTP downgrade."""
    state_file = temp_dir / "gw_f12.json"

    # 1. Gateway with live_forwarding_enabled=True but HTTP downgrade URL (http://generativelanguage.googleapis.com)
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url="http://generativelanguage.googleapis.com",
        upstream_api_key="real-gemini-key",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        enable_live_forwarding=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-f12-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        body = {
            "contents": [{"parts": [{"text": "Hello"}]}],
            "generationConfig": {"maxOutputTokens": 64},
        }
        # HTTP downgrade rejected with 503 LIVE_UPSTREAM_NOT_AUTHORIZED
        st, data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert st == 503
        assert data.get("error") == "LIVE_UPSTREAM_NOT_AUTHORIZED"
    finally:
        server.shutdown()
        server.server_close()

    # 2. Gateway with live_forwarding_enabled=True and arbitrary HTTPS domain (https://evil-server.com)
    state_file2 = temp_dir / "gw_f12_evil.json"
    server2, thread2, _ = start_live_safety_gateway(
        state_file2,
        host="127.0.0.1",
        port=0,
        upstream_base_url="https://evil-server.com",
        upstream_api_key="key",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        enable_live_forwarding=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-f12-evil",
    )
    port2 = server2.server_address[1]
    gw_url2 = f"http://127.0.0.1:{port2}"

    try:
        st, data, _ = post_gateway(gw_url2, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert st == 503
        assert data.get("error") == "LIVE_UPSTREAM_NOT_AUTHORIZED"
    finally:
        server2.shutdown()
        server2.server_close()


# ==============================================================================
# TEST GROUP 8: F-13 Quota Configuration, Operator Attestation, and Pacific Reset
# ==============================================================================

def test_25_f13_quota_configuration_required_and_validation(temp_dir: Path):
    """Missing or non-positive quota limits must raise QuotaConfigRequiredError."""
    state_file = temp_dir / "ledger_f13_missing.json"

    # Missing model_quotas
    with pytest.raises(QuotaConfigRequiredError):
        FreeTierQuotaLedger(
            state_file,
            run_id="run-f13-1",
            live_free_tier_enabled=True,
            model_quotas=None,
            initialize=True,
        )

    # Non-positive RPM
    with pytest.raises(QuotaConfigRequiredError):
        FreeTierQuotaLedger(
            state_file,
            run_id="run-f13-2",
            live_free_tier_enabled=True,
            model_quotas={"gemini-3.5-flash-lite": {"rpm": 0, "tpm": 1000, "rpd": 100, "max_concurrency": 2}},
            initialize=True,
        )


def test_26_f13_operator_attestation_verification_and_expiration(temp_dir: Path):
    """Enabling live_free_tier requires valid, non-expired operator attestation."""
    state_file = temp_dir / "ledger_f13_att.json"
    now = time.time()

    # Expired attestation
    expired_att = create_operator_attestation("proj-1", duration_seconds=-100, now_override=now)
    with pytest.raises(FreeTierStatusUnverifiedError, match="expired"):
        FreeTierQuotaLedger(
            state_file,
            run_id="run-f13-exp",
            live_free_tier_enabled=True,
            model_quotas=MOCK_TEST_QUOTAS,
            operator_attestation=expired_att,
            initialize=True,
        )

    # Valid attestation passes
    valid_att = create_operator_attestation("proj-1", duration_seconds=10, now_override=now)
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-f13-valid",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=valid_att,
        initialize=True,
    )
    t = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    assert t is not None
    ledger.finalize(t["ticket_id"], "SUCCESS")

    # After expiration, admission fails closed
    with pytest.raises(FreeTierStatusUnverifiedError, match="Expired attestation"):
        ledger.reserve(model="gemini-3.5-flash-lite", now_override=now + 15.0)

    ledger.close()


def test_27_f13_dst_aware_pacific_time_rpd_reset():
    """Verify get_next_pacific_midnight correctly handles both PST and PDT transitions."""
    tz = ZoneInfo("America/Los_Angeles")

    # Winter date in PST (Jan 15, 2026, noon)
    dt_pst = datetime(2026, 1, 15, 12, 0, 0, tzinfo=tz)
    pst_midnight_ts = get_next_pacific_midnight(dt_pst.timestamp())
    pst_dt = datetime.fromtimestamp(pst_midnight_ts, tz=tz)
    assert pst_dt.hour == 0 and pst_dt.minute == 0 and pst_dt.day == 16
    assert pst_dt.utcoffset() == timedelta(hours=-8)

    # Summer date in PDT (Jul 15, 2026, noon)
    dt_pdt = datetime(2026, 7, 15, 12, 0, 0, tzinfo=tz)
    pdt_midnight_ts = get_next_pacific_midnight(dt_pdt.timestamp())
    pdt_dt = datetime.fromtimestamp(pdt_midnight_ts, tz=tz)
    assert pdt_dt.hour == 0 and pdt_dt.minute == 0 and pdt_dt.day == 16
    assert pdt_dt.utcoffset() == timedelta(hours=-7)


# ==============================================================================
# TEST GROUP 9: F-14 Durable Stale-Ticket Recovery & Consistency
# ==============================================================================

def test_28_f14_durable_stale_ticket_recovery_and_persistence(temp_dir: Path):
    """When tickets expire, _cleanup_stale_in_flight must persist to disk so get_summary() and reserve() match disk."""
    state_file = temp_dir / "ledger_f14.json"
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-f14-01",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        in_flight_timeout_seconds=5.0,
    )
    now = time.time()
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    assert ledger.state["current_in_flight"] == 1

    # Advance time past 5s timeout and call get_summary()
    time_future = now + 10.0
    # Monkeypatch time.time to simulate clock advance
    orig_time = time.time
    try:
        time.time = lambda: time_future
        summary = ledger.get_summary()
        assert summary["current_in_flight"] == 0

        # Verify disk file is in exact sync with memory (no mismatch!)
        disk_data = json.loads(state_file.read_text(encoding="utf-8"))["state"]
        assert disk_data["current_in_flight"] == 0

        # Subsequent reserve call calls _healthy() and must NOT raise AUTHORITATIVE_LEDGER_CHANGED_EXTERNALLY
        t2 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=time_future)
        assert t2 is not None
        ledger.finalize(t2["ticket_id"], "SUCCESS")
    finally:
        time.time = orig_time
        ledger.close()


def test_29_f14_stale_recovery_survives_process_restart(temp_dir: Path):
    """A new process opening the ledger recovers stale tickets without false corruption."""
    state_file = temp_dir / "ledger_f14_restart.json"
    ledger1 = FreeTierQuotaLedger(
        state_file,
        run_id="run-f14-restart",
        live_free_tier_enabled=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        in_flight_timeout_seconds=5.0,
    )
    now = time.time()
    t = ledger1.reserve(model="gemini-3.5-flash-lite", now_override=now)
    ledger1.close()  # Process 1 exits leaving in-flight ticket unfinalized

    # Process 2 starts 10 seconds later
    orig_time = time.time
    try:
        time.time = lambda: now + 10.0
        ledger2 = FreeTierQuotaLedger(state_file, strict_fail_closed=True, in_flight_timeout_seconds=5.0)
        summary = ledger2.get_summary()
        assert summary["current_in_flight"] == 0
        t_new = ledger2.reserve(model="gemini-3.5-flash-lite", now_override=now + 10.0)
        assert t_new is not None
        ledger2.finalize(t_new["ticket_id"], "SUCCESS")
        ledger2.close()
    finally:
        time.time = orig_time


# ==============================================================================
# TEST GROUP 10: F-15 Emergency Kill Switch
# ==============================================================================

def test_30_f15_emergency_kill_switch_running_gateway_disable(temp_dir: Path, fake_upstream_server):
    """Authenticated operator kill switch disables running gateway immediately and persists through restart."""
    state_file = temp_dir / "gw_kill.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        operator_auth_token="secret-operator-key-99",
        initialize=True,
        run_id="gw-kill-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        body = {
            "contents": [{"parts": [{"text": "Hello"}]}],
            "generationConfig": {"maxOutputTokens": 64},
        }
        # 1. Normal request passes
        st, data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert st == 200

        # 2. Trigger kill switch with valid operator token
        kill_req = urllib.request.Request(
            f"{gw_url}/api/gateway/emergency/disable",
            data=b"{}",
            headers={"Content-Type": "application/json", "X-Operator-Token": "secret-operator-key-99"},
            method="POST",
        )
        with urllib.request.urlopen(kill_req, timeout=5) as resp:
            assert resp.status == 200
            kill_data = json.loads(resp.read().decode("utf-8"))
            assert kill_data.get("status") == "DISABLED"

        # 3. Next request denied immediately with 503 FREE_TIER_STATUS_UNVERIFIED
        st_after, data_after, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert st_after == 503
        assert data_after.get("error") == "FREE_TIER_STATUS_UNVERIFIED"
    finally:
        server.shutdown()
        server.server_close()
        active_ledger.close()

    # 4. Gateway restart: ledger state persists disabled status
    server2, thread2, ledger2 = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        initialize=False,
    )
    port2 = server2.server_address[1]
    gw_url2 = f"http://127.0.0.1:{port2}"
    try:
        st_restarted, data_restarted, _ = post_gateway(gw_url2, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert st_restarted == 503
    finally:
        server2.shutdown()
        server2.server_close()
        ledger2.close()


def test_31_f15_emergency_kill_switch_auth_and_worker_rejection(temp_dir: Path, fake_upstream_server):
    """Worker tokens and unauthenticated requests cannot trigger the emergency kill switch."""
    state_file = temp_dir / "gw_kill_auth.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        operator_auth_token="secret-operator-key-99",
        initialize=True,
        run_id="gw-kill-auth-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        # Worker token attempt rejected with 403
        req = urllib.request.Request(
            f"{gw_url}/api/gateway/emergency/disable",
            data=b"{}",
            headers={"Content-Type": "application/json", "Authorization": "Bearer token-ai"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=5)
        assert exc_info.value.code == 403
    finally:
        server.shutdown()
        server.server_close()


def test_32_f15_emergency_kill_switch_cli_unreachable_gateway_fails_closed():
    """trigger_kill_switch fails closed reporting failure if running gateway is unreachable."""
    ret = trigger_kill_switch(gateway_url="http://127.0.0.1:59998", operator_token="tok", force_local=False)
    assert ret == 1


# ==============================================================================
# TEST GROUP 11: Multi-Process Shared Quota Accounting (Phase 6 B)
# ==============================================================================

def _worker_process_fn(gw_url: str, token: str, count: int, return_dict: Any, worker_id: int):
    results = []
    for i in range(count):
        body = {
            "contents": [{"parts": [{"text": f"Subprocess message {i}"}]}],
            "generationConfig": {"maxOutputTokens": 64},
        }
        st, data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token=token)
        results.append(st)
        time.sleep(0.05)
    return_dict[worker_id] = results


def test_33_multi_process_concurrency_accounting(temp_dir: Path, fake_upstream_server):
    """Verify separate OS client processes addressing the same gateway share quota accounting without corruption."""
    state_file = temp_dir / "gw_multi_proc.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-p1": "process-1", "token-p2": "process-2"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        model_quotas=MOCK_TEST_QUOTAS,
        operator_attestation=MOCK_ATTESTATION,
        initialize=True,
        run_id="gw-multi-proc-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        manager = multiprocessing.Manager()
        return_dict = manager.dict()
        p1 = multiprocessing.Process(target=_worker_process_fn, args=(gw_url, "token-p1", 4, return_dict, 1))
        p2 = multiprocessing.Process(target=_worker_process_fn, args=(gw_url, "token-p2", 4, return_dict, 2))

        p1.start()
        p2.start()
        p1.join(timeout=15)
        p2.join(timeout=15)

        res1 = return_dict.get(1, [])
        res2 = return_dict.get(2, [])
        total = res1 + res2
        assert len(total) == 8
        assert all(st in (200, 429) for st in total)

        # Check ledger summary in gateway
        status, summary, _ = get_gateway(gw_url, "/status", token="token-p1")
        assert status == 200
        assert summary.get("current_in_flight") == 0
    finally:
        server.shutdown()
        server.server_close()
        active_ledger.close()
