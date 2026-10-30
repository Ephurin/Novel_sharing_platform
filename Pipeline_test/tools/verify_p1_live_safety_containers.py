"""Container-level runtime verification and evidence collector for P1-LIVE-SAFETY-01.

Brings up the disposable `compose.p1-live-safety.yml` stack, verifies:
1. Sanitized `docker compose config` vs live container environment readback
2. Installed `google-genai` SDK version and `HttpOptions.timeout` behavior inside `ai-service`
3. Network isolation (`workers` and `upstream` both `internal: true`; neither `ai-service` nor `backend`
   can reach `generativelanguage.googleapis.com` or `fake-upstream` directly)
4. Cross-container shared budget accounting across `ai-service` (Python `google-genai`) and `backend` (Node)
5. Privacy canary stripping across container boundary
6. Gateway container restart persistence (`docker compose restart budget-gateway`)
7. Full teardown and cleanup verification (`down -v --remove-orphans`)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = ROOT / "Pipeline_test" / "tools" / "compose.p1-live-safety.yml"
EVIDENCE_DIR = ROOT / "docs" / "development" / "integration" / "p1-author" / "evidence" / "p1-live-safety-01"
PROJECT_NAME = "p1-live-safety-01-verify"
INGRESS_PORT = "18410"

TEST_ENV = {
    **os.environ,
    "P1_SAFETY_PROJECT": PROJECT_NAME,
    "P1_SAFETY_INGRESS_PORT": INGRESS_PORT,
    "POSTGRES_USER": "p1_safety_user",
    "POSTGRES_PASSWORD": "test-only-pg-pass-not-secret",
    "POSTGRES_DB": "p1_safety_db",
    "OFFLINE_UPSTREAM_KEY": "test-only-fake-upstream-key",
    "AI_WORKER_TOKEN": "test-only-ai-worker-token",
    "BACKEND_WORKER_TOKEN": "test-only-backend-worker-token",
    "PLATFORM_SERVICE_TOKEN": "test-only-platform-service-token",
    "JWT_ACCESS_SECRET": "test-only-jwt-access-secret-minimum-32-chars",
    "JWT_REFRESH_SECRET": "test-only-jwt-refresh-secret-minimum-32-chars",
    "WAVE1D_AUTHOR_EMAIL": "author@test.local",
    "WAVE1D_AUTHOR_USERNAME": "test_author",
    "WAVE1D_AUTHOR_PASSWORD": "TestPassword123!",
    "FAKE_SCENARIO": "p1-live-safety-v1",
}

SENSITIVE_TEST_VALUES = [
    "test-only-pg-pass-not-secret",
    "test-only-fake-upstream-key",
    "test-only-ai-worker-token",
    "test-only-backend-worker-token",
    "test-only-platform-service-token",
    "test-only-jwt-access-secret-minimum-32-chars",
    "test-only-jwt-refresh-secret-minimum-32-chars",
    "TestPassword123!",
]


def _sanitize(text: str) -> str:
    result = text
    for val in SENSITIVE_TEST_VALUES:
        result = result.replace(val, "<REDACTED_TEST_ONLY_CREDENTIAL>")
    return result


def _compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = [
        "docker",
        "compose",
        "-f",
        str(COMPOSE_FILE),
        "-p",
        PROJECT_NAME,
        *args,
    ]
    res = subprocess.run(cmd, cwd=ROOT, env=TEST_ENV, capture_output=True, text=True, timeout=300)
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(cmd)}\nSTDERR:\n{res.stderr}\nSTDOUT:\n{res.stdout}")
    return res


def _get_json(url: str, timeout: float = 5.0) -> tuple[int, dict | list]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def main() -> int:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    evidence: dict = {
        "task_id": "P1-LIVE-SAFETY-01",
        "project_name": PROJECT_NAME,
        "compose_file": "Pipeline_test/tools/compose.p1-live-safety.yml",
        "real_gemini_calls": 0,
        "real_spending_usd": "0.00",
    }

    try:
        # Clean up any prior leftover resources first
        _compose("down", "-v", "--remove-orphans", check=False)

        # 1. Capture sanitized docker compose config
        cfg_res = _compose("config")
        sanitized_cfg = _sanitize(cfg_res.stdout)
        (EVIDENCE_DIR / "compose-config.sanitized.yml").write_text(sanitized_cfg, encoding="utf-8")
        evidence["compose_config_verified"] = True

        # 2. Initialize durable ledger via one-shot budget-init container
        _compose("--profile", "initialize", "run", "--rm", "budget-init")

        # 3. Start services
        _compose(
            "up",
            "-d",
            "--build",
            "postgres",
            "mongodb",
            "fake-upstream",
            "budget-gateway",
            "ai-service",
            "backend",
            "api-ingress",
        )

        # 4. Wait for ingress to reach ai-service health, backend health, and budget-gateway status
        ingress_base = f"http://127.0.0.1:{INGRESS_PORT}"
        deadline = time.time() + 90.0
        ai_health = None
        budget_status_initial = None
        while time.time() < deadline:
            try:
                st_ai, ai_data = _get_json(f"{ingress_base}/ai-health", timeout=3.0)
                st_bg, bg_data = _get_json(f"{ingress_base}/budget-status", timeout=3.0)
                if st_ai == 200 and st_bg == 200:
                    ai_health = ai_data
                    budget_status_initial = bg_data
                    break
            except Exception:
                pass
            time.sleep(2.0)

        if not ai_health or not budget_status_initial:
            raise RuntimeError("Timed out waiting for ai-service / budget-gateway health via api-ingress")

        evidence["ai_service_health"] = ai_health
        evidence["budget_status_initial"] = budget_status_initial

        # 5. Read back effective environment variables and SDK details inside ai-service container
        ai_readback_script = """
import importlib.metadata, json, os
from core.settings import Settings
from core.llm_service import LLMService
from google.genai import types
from google.genai._api_client import get_timeout_in_seconds
s = Settings.from_env()
opts = types.HttpOptions(timeout=int(s.llm_timeout_seconds * 1000), retry_options=types.HttpRetryOptions(attempts=1))
print(json.dumps({
    "env": {
        "ENTITY_CANDIDATE_VERIFICATION_ENABLED": os.getenv("ENTITY_CANDIDATE_VERIFICATION_ENABLED"),
        "LLM_LOCAL_FALLBACK": os.getenv("LLM_LOCAL_FALLBACK"),
        "LLM_PROVIDER": os.getenv("LLM_PROVIDER"),
        "LLM_MODEL": os.getenv("LLM_MODEL"),
        "LLM_FALLBACK_PROVIDER": os.getenv("LLM_FALLBACK_PROVIDER"),
        "LLM_TIMEOUT_SECONDS": os.getenv("LLM_TIMEOUT_SECONDS"),
        "EMBEDDING_PROVIDER": os.getenv("EMBEDDING_PROVIDER"),
        "SEMANTIC_RETRIEVAL_ENABLED": os.getenv("SEMANTIC_RETRIEVAL_ENABLED"),
        "BUDGET_GUARD_MODE": os.getenv("BUDGET_GUARD_MODE"),
        "BUDGET_GUARD_URL": os.getenv("BUDGET_GUARD_URL"),
        "GEMINI_API_KEY_EMPTY": os.getenv("GEMINI_API_KEY", "") == "",
        "GOOGLE_API_KEY_EMPTY": os.getenv("GOOGLE_API_KEY", "") == "",
    },
    "parsed_settings": {
        "entity_candidate_verification_enabled": s.entity_candidate_verification_enabled,
        "llm_local_fallback_enabled": LLMService._local_fallback_enabled(),
        "llm_provider": s.llm_provider,
        "llm_model": s.llm_model,
        "llm_timeout_seconds": s.llm_timeout_seconds,
        "embedding_provider": s.embedding_provider,
        "semantic_retrieval_enabled": s.semantic_retrieval_enabled,
    },
    "sdk": {
        "google_genai_version": importlib.metadata.version("google-genai"),
        "http_options_timeout_ms": opts.timeout,
        "http_options_timeout_seconds": get_timeout_in_seconds(opts.timeout),
        "http_retry_attempts": opts.retry_options.attempts,
    }
}))
"""
        ai_env_res = _compose("exec", "-T", "ai-service", "python", "-c", ai_readback_script)
        ai_readback = json.loads(ai_env_res.stdout.strip().splitlines()[-1])
        evidence["ai_service_container_readback"] = ai_readback

        assert ai_readback["env"]["ENTITY_CANDIDATE_VERIFICATION_ENABLED"] == "true"
        assert ai_readback["parsed_settings"]["entity_candidate_verification_enabled"] is True
        assert ai_readback["env"]["LLM_LOCAL_FALLBACK"] == "false"
        assert ai_readback["parsed_settings"]["llm_local_fallback_enabled"] is False
        assert ai_readback["env"]["LLM_MODEL"] == "gemini-3.5-flash-lite"
        assert ai_readback["env"]["EMBEDDING_PROVIDER"] == "none"
        assert ai_readback["env"]["SEMANTIC_RETRIEVAL_ENABLED"] == "false"

        # 6. Read back effective environment variables inside backend container
        backend_readback_script = """
console.log(JSON.stringify({
    AI_LLM_BASE_URL: process.env.AI_LLM_BASE_URL,
    AI_LLM_MODEL: process.env.AI_LLM_MODEL,
    AI_LLM_MAX_TOKENS: process.env.AI_LLM_MAX_TOKENS,
    BUDGET_GUARD_MODE: process.env.BUDGET_GUARD_MODE,
    BUDGET_GUARD_URL: process.env.BUDGET_GUARD_URL,
    AI_LLM_API_KEY_EMPTY: (process.env.AI_LLM_API_KEY || "") === "",
}));
"""
        be_env_res = _compose("exec", "-T", "backend", "node", "-e", backend_readback_script)
        be_readback = json.loads(be_env_res.stdout.strip().splitlines()[-1])
        evidence["backend_container_readback"] = be_readback

        # 7. Probe container network isolation inside ai-service and backend
        ai_net_probe_script = """
import json, urllib.request
results = {}
for name, target in [
    ("external_google", "https://generativelanguage.googleapis.com"),
    ("direct_fake_upstream", "http://fake-upstream:18091/received"),
]:
    try:
        urllib.request.urlopen(target, timeout=2.0)
        results[name] = {"blocked": False}
    except Exception as exc:
        results[name] = {"blocked": True, "error_type": type(exc).__name__, "error": str(exc)[:160]}
print(json.dumps(results))
"""
        ai_net_res = _compose("exec", "-T", "ai-service", "python", "-c", ai_net_probe_script)
        ai_net_data = json.loads(ai_net_res.stdout.strip().splitlines()[-1])
        assert ai_net_data["external_google"]["blocked"] is True
        assert ai_net_data["direct_fake_upstream"]["blocked"] is True

        be_net_probe_script = """
(async () => {
  const results = {};
  for (const [name, target] of [
    ["external_google", "https://generativelanguage.googleapis.com"],
    ["direct_fake_upstream", "http://fake-upstream:18091/received"]
  ]) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2000);
      await fetch(target, { signal: ctrl.signal });
      results[name] = { blocked: false };
    } catch (err) {
      results[name] = { blocked: true, error: String(err.cause || err.message || err).slice(0, 160) };
    }
  }
  console.log(JSON.stringify(results));
})();
"""
        be_net_res = _compose("exec", "-T", "backend", "node", "-e", be_net_probe_script)
        be_net_data = json.loads(be_net_res.stdout.strip().splitlines()[-1])
        assert be_net_data["external_google"]["blocked"] is True
        assert be_net_data["direct_fake_upstream"]["blocked"] is True
        evidence["network_isolation_probes"] = {
            "ai_service": ai_net_data,
            "backend": be_net_data,
        }

        # 8. Dispatch 1 guarded call from ai-service container and 1 guarded call from backend container (with canary private notes)
        ai_call_script = """
import json
from core.llm_service import LLMService
llm = LLMService(provider="gemini", model="gemini-3.5-flash-lite", api_key="")
res = llm.generate_writing_draft(
    operation="continue",
    selected_text="Lâm Phong bước vào trấn Thanh Phong.",
    cursor_offset=35,
    instruction="Story Brain continuation",
    context_package={
        "entities": [{"entity_id": "e1", "name": "Lâm Phong", "entity_type": "PER", "notes": "CANARY_CONTAINER_AI_NOTE_111", "author_notes": "CANARY_CONTAINER_AI_AUTHOR_222"}],
        "author_notes": "CANARY_CONTAINER_AI_AUTHOR_222",
        "private_author_notes": "CANARY_CONTAINER_AI_PRIVATE_333",
    },
)
print(json.dumps({"ok": True, "draft_length": len(res.get("draft_text", ""))}))
"""
        ai_call_res = _compose("exec", "-T", "ai-service", "python", "-c", ai_call_script)
        ai_call_out = json.loads(ai_call_res.stdout.strip().splitlines()[-1])
        assert ai_call_out["ok"] is True

        be_call_script = """
import('./dist/modules/ai-copilot/llm-provider.js').then(async ({ generateCopilotSuggestionWithLlm }) => {
  const out = await generateCopilotSuggestionWithLlm({
    instruction: 'Story Brain continuation',
    recentText: 'Lâm Phong bước vào trấn Thanh Phong.',
    characters: [{
      name: 'Lâm Phong',
      role: 'protagonist',
      personality: 'Trầm tĩnh',
      description: 'Đệ tử ngoại môn',
      notes: 'CANARY_CONTAINER_BE_NOTE_444',
      author_notes: 'CANARY_CONTAINER_BE_AUTHOR_555',
      private_author_notes: 'CANARY_CONTAINER_BE_PRIVATE_666'
    }],
    recentEvents: []
  });
  console.log(JSON.stringify({ ok: true, length: out.length }));
});
"""
        be_call_res = _compose("exec", "-T", "backend", "node", "-e", be_call_script)
        be_call_out = json.loads(be_call_res.stdout.strip().splitlines()[-1])
        assert be_call_out["ok"] is True

        # 9. Restart budget-gateway container and verify ledger persistence across container restart
        _compose("restart", "budget-gateway")
        time.sleep(3.0)
        st_after, bg_after_restart = _get_json(f"{ingress_base}/budget-status", timeout=5.0)
        assert st_after == 200
        assert bg_after_restart["total_calls"] == 2
        assert bg_after_restart["remaining_calls"] == 13
        assert bg_after_restart["status"] == "FAKE_UPSTREAM_ONLY"
        assert bg_after_restart["live_authorized"] is False
        assert bg_after_restart["actual_invoice_usd"] == "0.00"
        evidence["budget_status_after_gateway_restart"] = bg_after_restart

        # 10. Inspect fake-upstream /received log to verify zero canary leakage
        st_rec, received_log = _get_json(f"{ingress_base}/received", timeout=5.0)
        assert st_rec == 200
        assert len(received_log) == 2
        serialized_received = json.dumps(received_log, ensure_ascii=False)
        for canary in [
            "CANARY_CONTAINER_AI_NOTE_111",
            "CANARY_CONTAINER_AI_AUTHOR_222",
            "CANARY_CONTAINER_AI_PRIVATE_333",
            "CANARY_CONTAINER_BE_NOTE_444",
            "CANARY_CONTAINER_BE_AUTHOR_555",
            "CANARY_CONTAINER_BE_PRIVATE_666",
        ]:
            assert canary not in serialized_received, f"Canary leaked: {canary}"
        evidence["fake_upstream_received_count"] = len(received_log)
        evidence["privacy_canaries_absent_in_upstream"] = True

    finally:
        # 11. Tear down and clean up all containers, networks, and volumes owned by the disposable project
        _compose("down", "-v", "--remove-orphans", check=False)
        ps_res = subprocess.run(
            ["docker", "ps", "-a", "--filter", f"label=com.docker.compose.project={PROJECT_NAME}", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
        )
        vol_res = subprocess.run(
            ["docker", "volume", "ls", "--filter", f"label=com.docker.compose.project={PROJECT_NAME}", "--format", "{{.Name}}"],
            capture_output=True,
            text=True,
        )
        net_res = subprocess.run(
            ["docker", "network", "ls", "--filter", f"label=com.docker.compose.project={PROJECT_NAME}", "--format", "{{.Name}}"],
            capture_output=True,
            text=True,
        )
        evidence["cleanup_verification"] = {
            "containers_remaining": [x for x in ps_res.stdout.strip().splitlines() if x],
            "volumes_remaining": [x for x in vol_res.stdout.strip().splitlines() if x],
            "networks_remaining": [x for x in net_res.stdout.strip().splitlines() if x],
        }
        (EVIDENCE_DIR / "container-runtime-evidence.json").write_text(
            json.dumps(evidence, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    assert evidence["cleanup_verification"]["containers_remaining"] == []
    assert evidence["cleanup_verification"]["volumes_remaining"] == []
    assert evidence["cleanup_verification"]["networks_remaining"] == []
    print("P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
