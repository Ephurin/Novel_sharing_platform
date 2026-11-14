"""Multi-key free-tier pool: one ledger per project key, least-loaded admission, provider-429 failover.

Offline only (local stub upstream). Keys here are fake strings; real keys never appear in tests.
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "ai-service"), str(ROOT / "Pipeline_test" / "tools")]

from Pipeline_test.tools.p1_live_safety_gateway import start_live_safety_gateway
from Pipeline_test.tools.quota_controller import RPDLimitExceeded, RPMLimitExceeded, create_operator_attestation
from Pipeline_test.tools.quota_key_pool import QuotaKeyPool, read_keys_file, slot_state_file

MODEL = "gemini-3.5-flash-lite"
QUOTAS = {MODEL: {"rpm": 5, "tpm": 250_000, "rpd": 6, "max_concurrency": 4, "headroom": 0.0}}
KEYS = ["fake-key-a", "fake-key-b", "fake-key-c"]
ATTESTATIONS = [create_operator_attestation(f"project-{i}", duration_seconds=3600) for i in range(len(KEYS))]


def open_pool(tmp_path, keys=KEYS, attestations=ATTESTATIONS):
    return QuotaKeyPool.open(tmp_path / "ledger.json", keys, attestations=attestations, run_id="pool",
                             live_free_tier_enabled=True, model_quotas=QUOTAS, initialize=True)


def test_keys_file_parsing(tmp_path):
    f = tmp_path / "keys.txt"
    f.write_text("# Store your API keys here\nk1\n\n k2 \nk1\n", encoding="utf-8")
    assert read_keys_file(f) == ["k1", "k2"]


def test_each_key_has_its_own_ledger_file(tmp_path):
    pool = open_pool(tmp_path)
    assert [slot_state_file(tmp_path / "ledger.json", i).name for i in range(3)] == \
        ["ledger.json", "ledger.k2.json", "ledger.k3.json"]
    assert all(slot_state_file(tmp_path / "ledger.json", i).exists() for i in range(3))
    fps = [k["project_id_fingerprint"] for k in pool.get_summary()["key_pool"]]
    assert len(set(fps)) == 3
    pool.close()


def test_pool_spreads_calls_and_multiplies_rpm(tmp_path):
    pool = open_pool(tmp_path)
    now = time.time()
    slots = []
    for _ in range(15):  # 3 keys x 5 RPM
        t = pool.reserve(model=MODEL, now_override=now)
        slots.append(t["key_slot"])
        pool.finalize(t["ticket_id"], "SUCCESS")
    assert sorted(slots.count(i) for i in (1, 2, 3)) == [5, 5, 5]
    assert slots[:3] == [1, 2, 3]  # least-loaded first
    with pytest.raises(RPMLimitExceeded) as exc:
        pool.reserve(model=MODEL, now_override=now)
    assert exc.value.retry_after == 60
    summary = pool.get_summary()
    assert summary["rpd_call_count"] == 15 and len(summary["key_pool"]) == 3
    assert "fake-key" not in json.dumps(summary)
    pool.close()


def test_daily_limit_reported_only_when_every_key_is_out(tmp_path):
    pool = open_pool(tmp_path)
    base = time.time()
    for n in range(18):  # 3 keys x 6 RPD, spread over windows
        t = pool.reserve(model=MODEL, now_override=base + n * 61)
        pool.finalize(t["ticket_id"], "SUCCESS")
    with pytest.raises(RPDLimitExceeded):
        pool.reserve(model=MODEL, now_override=base + 18 * 61)
    pool.close()


def test_cooled_down_key_is_skipped(tmp_path):
    pool = open_pool(tmp_path)
    t = pool.reserve(model=MODEL)
    pool.finalize(t["ticket_id"], "PROVIDER_RATE_LIMITED")
    pool.cool_down(t, "30")
    for _ in range(4):
        u = pool.reserve(model=MODEL)
        assert u["key_slot"] != t["key_slot"]
        pool.finalize(u["ticket_id"], "SUCCESS")
    assert next(k for k in pool.get_summary()["key_pool"] if k["key_slot"] == t["key_slot"])["cooldown_seconds"] > 0
    pool.close()


def test_enable_disable_applies_to_every_key(tmp_path):
    pool = open_pool(tmp_path)
    pool.set_live_free_tier_enabled(False)
    assert all(not l.state["live_free_tier_enabled"] for l in pool._ledgers)
    pool.set_live_free_tier_enabled(True)
    assert all(l.state["live_free_tier_enabled"] for l in pool._ledgers)
    pool.close()


def test_attestation_count_must_match_keys(tmp_path):
    with pytest.raises(ValueError):
        open_pool(tmp_path, attestations=ATTESTATIONS[:2])


class _Upstream(BaseHTTPRequestHandler):
    limited_keys: set[str] = set()
    seen: list[str] = []

    def do_POST(self):
        key = self.headers.get("x-goog-api-key", "")
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        type(self).seen.append(key)
        if key in self.limited_keys:
            body, status = b'{"error": {"code": 429}}', 429
        else:
            body = json.dumps({"candidates": [{"content": {"parts": [{"text": "ok"}]}, "finishReason": "STOP"}],
                               "usageMetadata": {"promptTokenCount": 3}}).encode()
            status = 200
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if status == 429:
            self.send_header("Retry-After", "40")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _post(url, priority="interactive"):
    body = {"contents": [{"parts": [{"text": "x"}]}], "generationConfig": {"maxOutputTokens": 32}}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer token-ai", "X-Request-Priority": priority})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


@pytest.fixture
def stub_upstream():
    _Upstream.limited_keys = set()
    _Upstream.seen = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Upstream)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()
    server.server_close()


def _gateway(tmp_path, upstream, keys):
    quotas = {MODEL: {"rpm": 3, "tpm": 250_000, "rpd": 100, "max_concurrency": 4, "headroom": 0.0}}
    server, _t, ledger = start_live_safety_gateway(
        tmp_path / "gw.json", host="127.0.0.1", port=0,
        upstream_base_url=f"http://127.0.0.1:{upstream.server_address[1]}",
        client_tokens={"token-ai": "ai-service"}, execution_mode="live_free_tier", enable_live_free_tier=True,
        model_quotas=quotas, operator_attestation=ATTESTATIONS[:len(keys)], initialize=True, run_id="gw-pool",
        upstream_api_keys=keys)
    return server, ledger, f"http://127.0.0.1:{server.server_address[1]}/v1beta/models/{MODEL}:generateContent"


def test_gateway_rotates_keys_and_multiplies_capacity(tmp_path, stub_upstream):
    server, ledger, url = _gateway(tmp_path, stub_upstream, KEYS)
    try:
        assert [_post(url)[0] for _ in range(9)] == [200] * 9  # 3 keys x 3 RPM
        assert sorted(_Upstream.seen.count(k) for k in KEYS) == [3, 3, 3]
        status, data = _post(url)
        assert status == 429 and data["error"] == "RPM_LIMIT_EXCEEDED"
    finally:
        server.shutdown()
        server.server_close()


def test_gateway_fails_over_when_provider_rate_limits_a_key(tmp_path, stub_upstream):
    _Upstream.limited_keys = {"fake-key-a"}
    server, ledger, url = _gateway(tmp_path, stub_upstream, KEYS)
    try:
        status, data = _post(url)
        assert status == 200
        assert _Upstream.seen[0] == "fake-key-a" and _Upstream.seen[1] != "fake-key-a"
        # The limited key is now cooling down and is not tried again.
        _Upstream.seen.clear()
        for _ in range(4):
            assert _post(url)[0] == 200
        assert "fake-key-a" not in _Upstream.seen
    finally:
        server.shutdown()
        server.server_close()


def test_gateway_reports_provider_429_when_every_key_is_limited(tmp_path, stub_upstream):
    _Upstream.limited_keys = set(KEYS)
    server, ledger, url = _gateway(tmp_path, stub_upstream, KEYS)
    try:
        status, data = _post(url)
        assert status == 429 and data["error"] == "PROVIDER_RATE_LIMITED" and data["retry_after"] == "40"
        assert len(_Upstream.seen) == 3
    finally:
        server.shutdown()
        server.server_close()


def test_single_key_list_keeps_single_ledger(tmp_path, stub_upstream):
    server, ledger, url = _gateway(tmp_path, stub_upstream, ["fake-key-a"])
    try:
        assert not isinstance(ledger, QuotaKeyPool)
        assert _post(url)[0] == 200 and _Upstream.seen == ["fake-key-a"]
    finally:
        server.shutdown()
        server.server_close()


def test_cli_initializes_one_ledger_per_key(tmp_path):
    keys = tmp_path / "keys.txt"
    keys.write_text("# comment\nfake-key-a\nfake-key-b\n", encoding="utf-8")
    att = tmp_path / "att.json"
    att.write_text(json.dumps(ATTESTATIONS[:2]), encoding="utf-8")
    quotas = tmp_path / "q.json"
    q = {MODEL: QUOTAS[MODEL], "gemini-embedding-2": {**QUOTAS[MODEL], "tpm": 30_000}}
    quotas.write_text(json.dumps(q), encoding="utf-8")
    state = tmp_path / "cli.json"
    out = subprocess.run(
        [sys.executable, str(ROOT / "Pipeline_test" / "tools" / "p1_live_safety_gateway.py"), "--state", str(state),
         "--initialize", "--execution-mode", "live_free_tier", "--enable-live-free-tier", "--run-id", "cli-pool",
         "--model-quotas-file", str(quotas), "--attestation-file", str(att), "--upstream-api-keys-file", str(keys)],
        capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert state.exists() and (tmp_path / "cli.k2.json").exists()
    assert "fake-key" not in out.stdout + out.stderr
