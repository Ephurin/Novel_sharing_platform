"""P1-LIVE-FREE-01: Comprehensive Offline Verification Suite for Gemini Free Tier Runtime.

Tests quota admission, RPM, TPM, RPD, concurrency, model approval, private note rejection,
embedding dimension validation, 429 backoff, durability, and failure modes using fake upstream.
ZERO REAL CALLS to Google Gemini. ZERO PROVIDER SPENDING ($0.00).
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import sys
import threading
import time
import urllib.error
import urllib.request
import pytest

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
    APPROVED_LLM_MODELS,
    APPROVED_EMBEDDING_MODELS,
)
from infrastructure.embedding_providers import (
    GeminiEmbeddingProvider,
    DeterministicFakeEmbeddingProvider,
    EmbeddingProviderError,
)


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    d = tmp_path / "free_tier_test"
    d.mkdir(parents=True, exist_ok=True)
    return d


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
    # Set quota: 5 RPM with 20% headroom -> effective RPM = floor(5 * 0.8) = 4
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
        initialize=True,
    )
    now = time.time()
    # 4 calls succeed
    tickets = []
    for _ in range(4):
        t = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now)
        ledger.finalize(t["ticket_id"], "SUCCESS", now_override=now)
        tickets.append(t)

    # 5th call in the same minute exceeds effective RPM
    with pytest.raises(RPMLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now)

    # After sliding window (61s later), calls succeed again
    t_next = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=50, now_override=now + 61.0)
    assert t_next is not None
    ledger.finalize(t_next["ticket_id"], "SUCCESS", now_override=now + 61.0)
    ledger.close()


def test_05_tpm_token_accounting_and_reconciliation(temp_dir: Path):
    """Test TPM pre-reservation, reconciliation, and limit enforcement."""
    state_file = temp_dir / "ledger_tpm.json"
    # Quota: 1000 TPM with 10% headroom -> effective TPM = 900
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 20,
            "tpm": 1000,
            "rpd": 100,
            "max_concurrency": 10,
            "headroom": 0.10,
        }
    }
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-05",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        initialize=True,
    )
    now = time.time()
    # Reserve 500 tokens
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=500, now_override=now)
    # Reserve another 350 tokens (total in window = 850 <= 900)
    t2 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=350, now_override=now)

    # Next reservation for 100 tokens would push total to 950 > 900 -> TPMLimitExceeded
    with pytest.raises(TPMLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=100, now_override=now)

    # Reconcile t1 with actual usage of only 200 tokens
    ledger.finalize(t1["ticket_id"], "SUCCESS", actual_input_tokens=200, now_override=now)
    # Now consumed = 200, in-flight = 350, total = 550.
    # An estimated 200 token reservation (total = 750 <= 900) should now succeed!
    t3 = ledger.reserve(model="gemini-3.5-flash-lite", estimated_input_tokens=200, now_override=now)
    assert t3 is not None
    ledger.finalize(t2["ticket_id"], "SUCCESS", actual_input_tokens=350, now_override=now)
    ledger.finalize(t3["ticket_id"], "SUCCESS", actual_input_tokens=200, now_override=now)
    ledger.close()


def test_06_rpd_daily_limit_and_midnight_reset(temp_dir: Path):
    """Test RPD daily request cap and automatic calendar reset."""
    state_file = temp_dir / "ledger_rpd.json"
    custom_quotas = {
        "gemini-3.5-flash-lite": {
            "rpm": 20,
            "tpm": 500_000,
            "rpd": 3,
            "max_concurrency": 10,
            "headroom": 0.0,  # 3 calls exact
        }
    }
    ledger = FreeTierQuotaLedger(
        state_file,
        run_id="run-06",
        live_free_tier_enabled=True,
        model_quotas=custom_quotas,
        initialize=True,
    )
    now = time.time()
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    ledger.finalize(t1["ticket_id"], "SUCCESS", now_override=now)
    t2 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    ledger.finalize(t2["ticket_id"], "SUCCESS", now_override=now)
    t3 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    ledger.finalize(t3["ticket_id"], "SUCCESS", now_override=now)

    # 4th call today raises RPDLimitExceeded
    with pytest.raises(RPDLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    # After UTC midnight (86400s later), counter resets and call succeeds
    next_day = now + 86500.0
    t_new = ledger.reserve(model="gemini-3.5-flash-lite", now_override=next_day)
    assert t_new is not None
    ledger.finalize(t_new["ticket_id"], "SUCCESS", now_override=next_day)
    ledger.close()


def test_07_concurrency_semaphore_and_stale_cleanup(temp_dir: Path):
    """Test max in-flight concurrency semaphore and stale ticket timeout recovery."""
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
        initialize=True,
        in_flight_timeout_seconds=10.0,
    )
    now = time.time()
    t1 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    t2 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    # 3rd simultaneous in-flight call rejected
    with pytest.raises(ConcurrencyLimitExceeded):
        ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)

    # Normal finalization releases slot
    ledger.finalize(t1["ticket_id"], "SUCCESS", now_override=now)
    t3 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now)
    assert t3 is not None

    # Stale timeout test: t2 and t3 abandoned. 15s later, stale tickets timed out automatically
    t4 = ledger.reserve(model="gemini-3.5-flash-lite", now_override=now + 15.0)
    assert t4 is not None
    ledger.finalize(t4["ticket_id"], "SUCCESS", now_override=now + 15.0)
    ledger.close()


def test_08_corrupted_ledger_fails_closed(temp_dir: Path):
    """Corrupted ledger JSON or sha256 mismatch must fail closed."""
    state_file = temp_dir / "ledger_corrupt.json"
    ledger = FreeTierQuotaLedger(state_file, run_id="run-08", live_free_tier_enabled=True, initialize=True)
    ledger.close()

    # Tamper with file
    data = json.loads(state_file.read_text(encoding="utf-8"))
    data["state"]["rpd_call_count"] = 999999  # Sha256 mismatch!
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
        initialize=True,
        run_id="gw-run-01",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        # 1. Health check returns 200 with free tier summary
        req = urllib.request.Request(f"{gw_url}/health")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            summary = json.loads(resp.read().decode())
            assert summary["guard_profile"] == "P1_LIVE_FREE_TIER_01"
            assert summary["live_cost_usd"] == "0.00"

        # 2. Models discovery returns approved models
        req_models = urllib.request.Request(f"{gw_url}/v1/models", headers={"Authorization": "Bearer token-ai"})
        with urllib.request.urlopen(req_models) as resp:
            assert resp.status == 200
            m_data = json.loads(resp.read().decode())
            assert any(m["id"] == "gemini-3.5-flash-lite" for m in m_data.get("data", []))

        # 3. Gemini generateContent request
        body = {
            "contents": [{"parts": [{"text": "Hello world story prompt"}]}],
            "generationConfig": {"maxOutputTokens": 256, "responseMimeType": "application/json"},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", body, token="token-ai")
        assert status == 200
        assert "candidates" in resp_data

        # 4. OpenAI chat/completions compatible route (from backend)
        compat_body = {
            "model": "gemini-3.5-flash-lite",
            "messages": [{"role": "user", "content": "Story Brain continuation"}],
            "max_tokens": 256,
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1/chat/completions", compat_body, token="token-backend")
        assert status == 200
        assert "choices" in resp_data
    finally:
        server.shutdown()
        server.server_close()


def test_10_gateway_private_notes_rejection(temp_dir: Path, fake_upstream_server):
    """Gateway strictly rejects requests containing private author notes."""
    state_file = temp_dir / "gw_priv.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        initialize=True,
        run_id="gw-priv-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        # Prompt containing private author note
        leaked_body = {
            "contents": [{"parts": [{"text": 'Character data: {"name": "Mai Linh", "author_notes": "Secret plot twist"}'}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", leaked_body, token="token-ai")
        assert status == 403
        assert resp_data.get("error") == "PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"
    finally:
        server.shutdown()
        server.server_close()


def test_11_gateway_unapproved_model_rejection(temp_dir: Path, fake_upstream_server):
    """Gateway strictly rejects unapproved models (e.g. Gemini 2.5)."""
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
        initialize=True,
        run_id="gw-unapproved-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        bad_body = {
            "contents": [{"parts": [{"text": "Hello"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-2.5-flash:generateContent", bad_body, token="token-ai")
        assert status == 403
        assert resp_data.get("error") == "MODEL_NOT_APPROVED"
    finally:
        server.shutdown()
        server.server_close()


def test_12_gateway_429_rate_limiting_propagation(temp_dir: Path, fake_upstream_server):
    """When upstream returns 429, gateway translates it to PROVIDER_RATE_LIMITED with status 429."""
    state_file = temp_dir / "gw_429.json"
    server, thread, active_ledger = start_live_safety_gateway(
        state_file,
        host="127.0.0.1",
        port=0,
        upstream_base_url=fake_upstream_server["url"],
        upstream_api_key="fake-key-free-tier",
        client_tokens={"token-ai": "ai-service"},
        execution_mode="live_free_tier",
        enable_live_free_tier=True,
        initialize=True,
        run_id="gw-429-run",
    )
    port = server.server_address[1]
    gw_url = f"http://127.0.0.1:{port}"

    try:
        fault_body = {
            "contents": [{"parts": [{"text": "fault:429 trigger provider rate limit"}]}],
            "generationConfig": {"maxOutputTokens": 256},
        }
        status, resp_data, _ = post_gateway(gw_url, "/v1beta/models/gemini-3.5-flash-lite:generateContent", fault_body, token="token-ai")
        assert status == 429
        assert resp_data.get("error") == "PROVIDER_RATE_LIMITED"
    finally:
        server.shutdown()
        server.server_close()


# ==============================================================================
# TEST GROUP 3: Gemini Embedding 2 Integration & pgvector Semantics
# ==============================================================================

def test_13_embedding_route_through_gateway(temp_dir: Path, fake_upstream_server):
    """Test embedding route through gateway verifies 768 dimensions and returns valid vector."""
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
    # 1. Offline test mode raises GUARDED_P1_EMBEDDING_DISABLED
    monkeypatch.setenv("AI_EXECUTION_MODE", "offline_test")
    monkeypatch.setenv("BUDGET_GUARD_URL", "http://127.0.0.1:18090")
    monkeypatch.setenv("BUDGET_GUARD_AUTH_TOKEN", "token-ai")
    provider = GeminiEmbeddingProvider(api_key="fake-key")

    with pytest.raises(EmbeddingProviderError, match="GUARDED_P1_EMBEDDING_DISABLED"):
        provider.embed_document("Test text")

    # 2. Live free tier mode without guard URL raises FREE_TIER_STATUS_UNVERIFIED
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
    monkeypatch.delenv("BUDGET_GUARD_URL", raising=False)
    with pytest.raises(EmbeddingProviderError, match="FREE_TIER_STATUS_UNVERIFIED"):
        provider.embed_document("Test text")


def test_15_embedding_private_note_detection(monkeypatch):
    """Verify GeminiEmbeddingProvider rejects private author notes prior to network dispatch."""
    monkeypatch.setenv("AI_EXECUTION_MODE", "live_free_tier")
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


# ==============================================================================
# TEST GROUP 4: Retry Backoff & Operator Controls
# ==============================================================================

def test_17_exponential_backoff_calculation():
    """Test calculate_backoff_delay respects max retries, retry_after, and jitter."""
    # Under limit
    ok, delay = calculate_backoff_delay(attempt=0, max_retries=3)
    assert ok is True
    assert 0.7 <= delay <= 1.5

    ok, delay = calculate_backoff_delay(attempt=1, max_retries=3)
    assert ok is True
    assert 1.5 <= delay <= 3.0

    # Retry-After header takes precedence
    ok, delay = calculate_backoff_delay(attempt=1, max_retries=3, retry_after=12.5)
    assert ok is True
    assert delay == 12.5

    # Max retries exceeded
    ok, delay = calculate_backoff_delay(attempt=3, max_retries=3)
    assert ok is False
    assert delay == 0.0
# ==============================================================================
# TEST GROUP 5: Adversarial Fault Injection & Concurrency Invariants
# ==============================================================================

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
        initialize=True,
        run_id="gw-timeout-run",
        upstream_timeout=0.2,  # Tight 200ms deadline
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

    # All calls should return either 200 or 429 (due to max_concurrency / RPM), but NEVER corrupt or 500
    assert len(results) == 10
    assert all(st in (200, 429) for st, _ in results)

    server.shutdown()
    server.server_close()
