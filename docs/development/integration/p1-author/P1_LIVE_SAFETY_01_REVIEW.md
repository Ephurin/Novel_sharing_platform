# P1-LIVE-SAFETY-01 — Controlled Live-Acceptance Safety Harness Implementation & Offline Verification Report

**Task ID:** `ARGON TASK — P1-LIVE-SAFETY-01`  
**Role:** Local Implementation & Runtime Verification (Argon)  
**Independent Final Reviewer:** GPT-6  
**Repository:** `Ephurin/Novel_sharing_platform`  
**Base Branch:** `integration/p1-demo-20261109`  
**Locked Base SHA:** `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`  
**Implementation Commit SHA:** `326c8469c8791b5dcc51970c09a57441c7528c07`  
**Preflight Reference Commit:** `a68d32039f11304ee7d46f57f58830967c1ba209` (`docs/development/integration/p1-author/P1_LIVE_AI_PREFLIGHT_01.md`)  
**Working Branch:** `codex/p1-live-safety-01`  
**Real Provider Calls Dispatched:** `0`  
**Real Provider Spending:** `$0.00`  
**Provisional Verdict:** `P1_LIVE_SAFETY_OFFLINE_PASS`

---

## 1. Source Lock & Scope Integrity

| Item | Value | Verification |
|---|---|---|
| Base Branch | `integration/p1-demo-20261109` | Verified against `origin/integration/p1-demo-20261109` |
| Locked Base SHA | `6cbff8829d731704a0e8301fedaa2b1f38dd14c1` | Verified via `git rev-parse` before branching |
| Preflight Spec SHA | `a68d32039f11304ee7d46f57f58830967c1ba209` | Read and cross-checked (`P1_LIVE_AI_PREFLIGHT_01.md`) |
| Working Branch | `codex/p1-live-safety-01` | Isolated branch created from `6cbff8829d731704a0e8301fedaa2b1f38dd14c1` |
| Offline Budget Gateway | `Pipeline_test/tools/budget_gateway.py` | Preserved unchanged (`BUDGET_COST_HARD_CAP_UNPROVEN` intact) |
| Live Google Forwarding | `DISABLED` (`live_forwarding_enabled=False`) | Enforced in code, ledger schema, and network topology |

---

## 2. Architecture & Threat Model

### 2.1 Safety Harness Architecture

```
+---------------------------+       +---------------------------+
|  ai-service (Python)      |       |  backend (Node.js)        |
|  network: workers (int.)  |       |  network: workers (int.)  |
|  google-genai SDK         |       |  fetch -> /v1/chat/...    |
|  _strip_private_notes()   |       |  sanitizeCopilotChars()   |
+-------------+-------------+       +-------------+-------------+
              |                                   |
              | Bearer <AI_WORKER_TOKEN>          | Bearer <BACKEND_WORKER_TOKEN>
              +-----------------+-----------------+
                                |
                                v
              +-----------------------------------+
              |  budget-gateway                   |
              |  p1_live_safety_gateway.py        |
              |  networks: workers, upstream      |
              |  - Explicit enablement check      |
              |  - OS file lock + SHA-256 ledger  |
              |  - 15 total physical calls cap    |
              |  - 10 calls / rolling 60s window  |
              |  - Model lock: gemini-3.5-flash-lite
              |  - Private notes payload filter   |
              |  - Output token cap (1..8192)     |
              |  - Fake-upstream host allowlist   |
              +-----------------+-----------------+
                                |
                                | X-Gateway-Dispatch-Id + OFFLINE_UPSTREAM_KEY
                                v
              +-----------------------------------+
              |  fake-upstream                    |
              |  fake_provider_upstream.py        |
              |  network: upstream (internal)     |
              +-----------------------------------+
```

### 2.2 Threat Model & Mitigations

| Threat / Failure Mode | Control Implemented | Enforcement Point | Fail-Closed Behavior |
|---|---|---|---|
| **T-01: Unbounded physical requests (>15)** | Authoritative durable counter `total_calls < max_calls` (`max_calls = 15` hard ceiling) reserved inside `RLock` + OS file lock before HTTP dispatch | `LiveSafetyBudgetLedger.reserve` (`Pipeline_test/tools/p1_live_safety_gateway.py`) | Request #16 denied before upstream dispatch with `429 MAX_CALLS_REACHED` |
| **T-02: Burst rate-limit violation (>10/60s)** | Sliding-window check over all `call_history` timestamps within `window_seconds = 60.0` (`max_window_calls = 10`); clock rollback check (`now < ts - 0.001`) | `LiveSafetyBudgetLedger.reserve` | 11th request within 60s denied before dispatch with `429 ROLLING_RATE_LIMIT_EXCEEDED`; clock rollback latches `503 CLOCK_ROLLBACK_DETECTED` |
| **T-03: Split-brain budget between Python and Node** | Both `ai-service` (`/v1beta/models/...:generateContent`) and `backend` (`/v1/chat/completions`, `/v1/models`) route through the single `budget-gateway` instance backed by a single OS-locked ledger file | `ai-service/core/llm_service.py`, `backend/src/modules/ai-copilot/llm-provider.ts`, `p1_live_safety_gateway.py` | Concurrent requests across workers serialize on the gateway lock and share the 15-call / 10-per-60s ceiling |
| **T-04: Unmetered SDK retries, quote repairs, or model discovery** | `google-genai` `HttpRetryOptions(attempts=1)` disables hidden SDK retries; `_call_gemini` application retries and `source_grounding.py` repair loops pass through `budget-gateway` and abort immediately on `BUDGET_GUARD_DENIED`; `GET /v1/models` reserves a ledger slot | `ai-service/core/llm_service.py`, `ai-service/services/source_grounding.py`, `p1_live_safety_gateway.py` | Every physical request consumes a ledger slot; budget denial halts retry/repair loops immediately |
| **T-05: Unapproved or silent model fallback** | `_gemini_model_candidates()` restricted to `[self.model]`; `_can_fallback_to_openai()` and `_local_fallback_enabled()` forced `False` under guard; gateway enforces `normalized_model == "gemini-3.5-flash-lite"` | `ai-service/core/llm_service.py`, `p1_live_safety_gateway.py` | Unapproved models (including `gemini-3.1-flash-lite`) rejected with `403 MODEL_NOT_APPROVED` before reservation |
| **T-06: Ledger reset on worker or gateway restart** | `.initialized` marker file + `os.replace` atomic write + `os.fsync` + SHA-256 state verification | `LiveSafetyBudgetLedger` (`p1_live_safety_gateway.py`) | Gateway restart reloads existing `call_history`; missing or corrupted ledger latches `503 BUDGET_METER_UNAVAILABLE` |
| **T-07: Direct application egress bypassing gateway** | `workers` and `upstream` Docker networks configured with `internal: true`; application workers only join `workers`; `fake-upstream` only joins `upstream` and requires `X-Gateway-Dispatch-Id` | `Pipeline_test/tools/compose.p1-live-safety.yml`, `fake_provider_upstream.py` | Direct outbound calls to `generativelanguage.googleapis.com` or `fake-upstream` fail at DNS/socket and HTTP auth layers |
| **T-08: Private author notes leakage into prompts** | Client-side allowlist/stripping in both `backend` (`sanitizeCopilotCharactersForPrompt`) and `ai-service` (`_strip_private_notes`) plus gateway payload inspection (`_payload_contains_private_notes`) | `backend/src/modules/ai-copilot/llm-provider.ts`, `ai-service/core/llm_service.py`, `p1_live_safety_gateway.py` | Private note fields stripped before serialization; raw payloads containing private note keys rejected at gateway with `403 PRIVATE_NOTES_FORBIDDEN_IN_PROMPT` |

---

## 3. File-by-File Diff Summary

| File Path | Change Summary |
|---|---|
| `Pipeline_test/tools/p1_live_safety_gateway.py` | **New.** Dedicated live-acceptance safety guard (`LiveSafetyBudgetLedger`, `LiveSafetyGatewayHandler`, `start_live_safety_gateway`). Requires explicit `--enable-live-safety-guard` / `LIVE_SAFETY_GUARD_ENABLED=true`. Enforces 15-call cap, 10/60s sliding-window rate limit, single approved model (`gemini-3.5-flash-lite`), official Paid Standard tariff liability reservation (`$0.30/1M` input, `$2.50/1M` output, `$0.05` ceiling), private-notes payload rejection, and fake-upstream-only routing. |
| `Pipeline_test/tools/compose.p1-live-safety.yml` | **New.** Isolated disposable runtime Compose stack with `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`, `LLM_LOCAL_FALLBACK=false`, `LLM_MODEL=gemini-3.5-flash-lite`, `EMBEDDING_PROVIDER=none`, `SEMANTIC_RETRIEVAL_ENABLED=false`, `internal: true` networks (`workers`, `upstream`), and disposable volumes. |
| `Pipeline_test/tools/verify_p1_live_safety_containers.py` | **New.** Automated container runtime verification and evidence collection script for `compose.p1-live-safety.yml` with guaranteed teardown/cleanup verification. |
| `Pipeline_test/tests/test_p1_live_safety_01.py` | **New.** 11-test adversarial verification suite covering all 10 mandatory P1-LIVE-SAFETY-01 adversarial scenarios, SDK timeout inspection, 8-mode failure matrix, and privacy canaries. |
| `Pipeline_test/tests/test_cross_container_budget_gate.py` | **Restored from offline gate.** 41-test offline budget gateway regression suite verifying `Pipeline_test/tools/budget_gateway.py` remains unbroken. |
| `Pipeline_test/tools/fake_provider_upstream.py` | **Updated.** Added backward-compatible `p1-live-safety-v1` deterministic responses and fault injections (`fault:401`, `fault:404`, `fault:503`, `fault:empty`, `fault:timeout_long`). |
| `Pipeline_test/tools/headless_http_ingress.py` | **Updated.** Added read-only `/budget-status` and `/ai-health` forwarding for host-side container verification without exposing worker ports. |
| `ai-service/core/llm_service.py` | **Updated.** Added `_strip_private_notes()` recursive sanitizer before prompt serialization; wired `types.HttpOptions(timeout=round(self.timeout_seconds * 1000), retry_options=types.HttpRetryOptions(attempts=1))` into `genai.Client`; enforced `_guard_proxy_config()`, immediate stop on `BUDGET_GUARD_DENIED`, and disabled local/OpenAI fallback under guard. |
| `ai-service/core/llm_client.py` | **Updated.** Enforced `_guard_proxy_config()` and `ProxyHandler({})` on `LLMClient` so legacy extraction calls cannot bypass the budget gateway. |
| `ai-service/infrastructure/embedding_providers.py` | **Updated.** Blocked `GeminiEmbeddingProvider._embed_many` (`GUARDED_P1_EMBEDDING_DISABLED`) when `BUDGET_GUARD_URL` or `BUDGET_GUARD_MODE=proxy` is active. |
| `ai-service/services/source_grounding.py` | **Updated.** Halted quote-repair retry loop immediately on `budget_guard_denied`. |
| `backend/src/modules/ai-copilot/llm-provider.ts` | **Updated.** Added `sanitizeCopilotCharactersForPrompt()` allowlisting `{ name, role, personality, description }` (excluding `notes`, `author_notes`, `private_author_notes`) and enforced `BUDGET_GUARD_MODE=proxy` / `BUDGET_GUARD_URL` validation. |
| `backend/src/modules/ai-copilot/ai-copilot.service.ts` | **Updated.** Applied `sanitizeCopilotCharactersForPrompt()` before passing character context to `generateCopilotSuggestionWithLlm()`. |
| `backend/src/modules/ai-copilot/llm-provider.test.ts` | **Updated.** Added deterministic privacy canary test and proxy guard fail-closed test. |

---

## 4. Commands Executed & Exit Codes

| Command | Scope | Result | Exit Code |
|---|---|---|---|
| `Push-Location backend; npm run build; npx tsx --test src/modules/ai-copilot/llm-provider.test.ts; Pop-Location` | Backend TypeScript build + unit/canary tests (5 tests) | `5 passed, 0 failed` | `0` |
| `pytest Pipeline_test/tests/test_cross_container_budget_gate.py -v` | Offline `budget_gateway.py` regression suite (41 tests) | `41 passed in 50.70s` | `0` |
| `pytest Pipeline_test/tests/test_p1_live_safety_01.py -v` | Mandatory P1-LIVE-SAFETY-01 adversarial suite (11 tests) | `11 passed in 22.80s` | `0` |
| `python Pipeline_test/tools/verify_p1_live_safety_containers.py` | Disposable Docker Compose runtime verification, network isolation probes, container restart persistence, and cleanup | `P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS` | `0` |
| `pytest ai-service/tests/test_entity_pipeline.py ai-service/tests/test_entity_profiles.py ai-service/tests/test_entity_profile_remediation.py ai-service/tests/test_p1_memory_entity_hitl.py ai-service/tests/test_llm_services.py ai-service/tests/test_settings.py -v` | `ai-service` HITL, entity profile privacy, and LLM settings regressions | `61 passed, 24 skipped` | `0` |
| `pytest ai-service/tests/test_revision_analysis_workflow.py ai-service/tests/test_writing_validation_golden.py -v` | Revision analysis & writing validation regressions | `15 passed` | `0` |
| `Push-Location web; npm run build; Pop-Location` | Frontend TypeScript & Vite production build | `built in 15.8s` | `0` |

---

## 5. Budget Ledger, Rate Limit & Concurrency Evidence

1. **Hard 15-Call Cap (`test_01_physical_outbound_request_16_never_dispatches`):**
   - Calls 1..10 succeed in window 1; calls 11..15 succeed after window rollover.
   - Call #16 is denied with `HTTP 429 {"error": "MAX_CALLS_REACHED"}` before transport.
   - `fake-upstream` received count: `15` (`ledger.state["total_calls"] == 15`).
2. **Cross-Worker Concurrency (`test_02_concurrent_python_and_node_workers_never_exceed_shared_budget`):**
   - Concurrent Python (`LLMService` via `google-genai` SDK) and Node (`generateCopilotSuggestionWithLlm` subprocess) dispatches record `client_service: "ai-service"` and `client_service: "backend"` in the same ledger.
   - 20-thread concurrent burst across `ai-worker` and `backend-worker` admits exactly `10` calls in the 60s window (`10` denied with `429 ROLLING_RATE_LIMIT_EXCEEDED`), and a subsequent 10-thread burst admits `3` calls before capping at `15` total (`7` denied with `429 MAX_CALLS_REACHED`).
3. **Sliding-Window Rate Limit & Restart Persistence (`test_03` & `test_04` & Container Verification):**
   - 10 calls within 60s succeed; call #11 returns `429 ROLLING_RATE_LIMIT_EXCEEDED`.
   - Gateway restart (`server.shutdown()` + reopen on host, and `docker compose restart budget-gateway` in container verification) preserves `call_history`, `total_calls`, `charged_usd`, `outstanding_usd`, and `deadline`.
   - Deleting `.json` while `.initialized` exists fails closed with `503 MISSING_AUTHORITATIVE_LEDGER`.

---

## 6. SDK Version & Timeout Behavior

| Environment | `google-genai` Version | Configured `LLM_TIMEOUT_SECONDS` | `types.HttpOptions.timeout` | `get_timeout_in_seconds()` | `HttpRetryOptions.attempts` |
|---|---|---|---|---|---|
| Host Python (`3.11.9`) | `2.24.0` | `1.5s` (test probe) | `1500` (ms) | `1.5` (s) | `1` |
| `ai-service` Container (`python:3.11-slim`) | `2.33.0` | `15s` (Compose runtime) | `15000` (ms) | `15.0` (s) | `1` |

- **Verification Finding:** In `google-genai` (`2.24.0` and `2.33.0`), `google.genai.types.HttpOptions.timeout` is typed as `Optional[int]` and documented as **milliseconds**. Internally, `google.genai._api_client.get_timeout_in_seconds(timeout)` divides `timeout / 1000.0` before passing it to `httpx.Client` and setting `X-Server-Timeout`.
- **Implementation Fix:** `ai-service/core/llm_service.py` now computes `timeout_ms = max(1, round(float(self.timeout_seconds) * 1000))` and passes `types.HttpOptions(timeout=timeout_ms, retry_options=types.HttpRetryOptions(attempts=1))` to `genai.Client` in both guarded and unguarded modes.

---

## 7. Error-Injection & Failure Matrix Results

Verified in `test_08_sdk_timeout_and_failure_matrix_safe_writing_failure` through `WritingService.start_generation`:

| # | Injected Failure Scenario | Upstream / Gateway Behavior | `WritingGenerationJob.status` | `job.patch` | Fallback Prose Generated? | Canon / Manuscript Mutated? |
|---|---|---|---|---|---|---|
| 1 | `429` Quota / Rate-limit failure (`fault:429`) | HTTP 429 returned; retries metered & halted on cap | `failed` | `None` | `No` (`LLM_LOCAL_FALLBACK=false`) | `No` (`brain_after == brain_before`) |
| 2 | `503` Provider unavailable (`fault:503`) | HTTP 503 returned; full liability retained | `failed` | `None` | `No` | `No` |
| 3 | Request timeout (`fault:timeout`, `timeout_s=0.2`) | Gateway/SDK times out; full liability retained (`status="UNKNOWN"`) | `failed` | `None` | `No` | `No` |
| 4 | Invalid credentials (`fault:401`) | HTTP 401 returned | `failed` | `None` | `No` | `No` |
| 5 | Unsupported / unapproved model (`gemini-3.1-flash-lite`) | Gateway rejects before reservation (`403 MODEL_NOT_APPROVED`) | `failed` (`BUDGET_GUARD_DENIED`) | `None` | `No` | `No` |
| 6 | Empty response (`fault:empty`) | HTTP 200 with `""` text; `LLMService` raises empty response error | `failed` | `None` | `No` | `No` |
| 7 | Budget exhausted (`total_calls == 15`) | Gateway rejects before dispatch (`429 MAX_CALLS_REACHED`) | `failed` (`BUDGET_GUARD_DENIED`) | `None` | `No` | `No` |
| 8 | Gateway unavailable (gateway stopped) | Connection refused; no direct SDK fallback | `failed` | `None` | `No` | `No` |

---

## 8. Privacy & Secrets Hygiene Verification

1. **Node Backend (`backend/src/modules/ai-copilot/llm-provider.ts` & `ai-copilot.service.ts`):**
   - `ai-copilot.repository.ts` loads `notes` from `character_profiles` for Author IDE display, but `sanitizeCopilotCharactersForPrompt()` strips `notes`, `author_notes`, `private_author_notes`, `authorNotes`, and `privateAuthorNotes` before building the LLM prompt payload.
2. **Python AI Service (`ai-service/core/llm_service.py`):**
   - `_strip_private_notes()` recursively removes `author_notes`, `private_author_notes`, `authorNotes`, `privateAuthorNotes`, and entity `notes` from both `generate_suggestion` (`_normalize_graph_context`) and `generate_writing_draft` (`context_package`) prior to `json.dumps`.
3. **Gateway Defense-in-Depth (`Pipeline_test/tools/p1_live_safety_gateway.py`):**
   - `_payload_contains_private_notes()` inspects every inbound request body and rejects any payload containing forbidden private note keys with `403 PRIVATE_NOTES_FORBIDDEN_IN_PROMPT` before reservation or upstream dispatch.
4. **Canary Evidence:**
   - Verified in `backend/src/modules/ai-copilot/llm-provider.test.ts`, `Pipeline_test/tests/test_p1_live_safety_01.py::test_09`, and container runtime verification (`docs/development/integration/p1-author/evidence/p1-live-safety-01/container-runtime-evidence.json`: `"privacy_canaries_absent_in_upstream": true`).

---

## 9. Runtime Compose & Network Isolation Evidence

Evidence files saved under `docs/development/integration/p1-author/evidence/p1-live-safety-01/`:
- `compose-config.sanitized.yml`: Sanitized `docker compose -f Pipeline_test/tools/compose.p1-live-safety.yml config` output.
- `container-runtime-evidence.json`: Live container readback, network isolation probes, restart persistence, and cleanup verification.

### Summary of Container Readback & Isolation Probes (`container-runtime-evidence.json`)

- **`ai-service` Container Effective Env & Parsed Settings:**
  - `ENTITY_CANDIDATE_VERIFICATION_ENABLED="true"` -> `settings.entity_candidate_verification_enabled == True`
  - `LLM_LOCAL_FALLBACK="false"` -> `LLMService._local_fallback_enabled() == False`
  - `LLM_PROVIDER="gemini"`, `LLM_MODEL="gemini-3.5-flash-lite"`, `LLM_FALLBACK_PROVIDER="disabled"`
  - `EMBEDDING_PROVIDER="none"`, `SEMANTIC_RETRIEVAL_ENABLED="false"`
  - `BUDGET_GUARD_MODE="proxy"`, `BUDGET_GUARD_URL="http://budget-gateway:18090"`
  - `GEMINI_API_KEY_EMPTY=True`, `GOOGLE_API_KEY_EMPTY=True`
- **Container Network Isolation Probes:**
  - `ai-service` -> `https://generativelanguage.googleapis.com`: `blocked: true` (`URLError: Temporary failure in name resolution`)
  - `ai-service` -> `http://fake-upstream:18091/received`: `blocked: true` (`URLError: Temporary failure in name resolution`)
  - `backend` -> `https://generativelanguage.googleapis.com`: `blocked: true` (`getaddrinfo EAI_AGAIN generativelanguage.googleapis.com`)
  - `backend` -> `http://fake-upstream:18091/received`: `blocked: true` (`getaddrinfo EAI_AGAIN fake-upstream`)

---

## 10. Known Blockers & Limitations Before Any Future Live Run

1. **Live Provider Forwarding Intentionally Disabled:** `LiveSafetyGatewayHandler.live_forwarding_enabled` is hardcoded to `False` and `LiveSafetyBudgetLedger` rejects any state with `live_forwarding_enabled != False`. Any non-local upstream URL returns `503 LIVE_UPSTREAM_NOT_AUTHORIZED`.
2. **Project Access & Live Quota Unverified:** As documented in `P1_LIVE_AI_PREFLIGHT_01.md`, `PROJECT_ACCESS_UNVERIFIED` remains in effect until GPT-6 and the operator explicitly authorize a live preflight probe with a real `GEMINI_API_KEY`.
3. **Host vs. Container `google-genai` Minor Version Drift:** `ai-service/requirements.txt` specifies `google-genai>=0.3.0` (resolving to `2.24.0` on host and `2.33.0` in fresh container builds). Both versions use milliseconds for `HttpOptions.timeout`, which is now explicitly wired.

---

## 11. Container & Resource Cleanup Verification

From `docs/development/integration/p1-author/evidence/p1-live-safety-01/container-runtime-evidence.json`:
- `containers_remaining`: `[]` (`0` containers)
- `volumes_remaining`: `[]` (`0` volumes)
- `networks_remaining`: `[]` (`0` networks)

---

## 12. Provisional Verdict

**`P1_LIVE_SAFETY_OFFLINE_PASS`** — Ready for GPT-6 independent architecture, threat-model, and evidence review.


---

## 13. GPT-6 REVIEW #1 — F01 REMEDIATION

**Remediation Target:** Close all 6 findings from GPT-6 Independent Review #1  
**Working Branch:** `codex/p1-live-safety-01`  
**Base Branch:** `integration/p1-demo-20261109` (`6cbff8829d731704a0e8301fedaa2b1f38dd14c1`)  
**Remediation Commit SHA:** `6cf3f3e3e59b7b32daf43d9bade5c1e4d4d607df`
**Authorization Adherence:** ZERO generative provider calls, ZERO cloud spending ($0.00)  
**Target Verdict:** `P1_LIVE_SAFETY_OFFLINE_PASS` (Subject to GPT-6 Independent Review #2)

---

### 13.1 Findings Closure Matrix

| Finding ID | Finding Description | Severity | Remediation Implementation | Verification Evidence & Test Target | Status |
|---|---|---|---|---|---|
| **F-01** | Serialized private notes in nested message content / strings bypassed dictionary inspection | P1 (Privacy) | Enhanced `_payload_contains_private_notes()` with recursive `_extract_json_candidates()` to parse embedded JSON strings, escaped JSON, and markdown blocks; added regex matching for serialized entity notes (`notes_pattern` and `entity_pattern`); added positive exemption for legitimate fiction prose mentioning the ordinary word "notes". | `Pipeline_test/tests/test_p1_live_safety_01.py::test_11_f01_serialized_private_notes_rejection_suite` (9 negative attacks blocked with 403, zero request slot leak, positive fiction prose passes with 200). | **CLOSED** |
| **F-02** | Gateway transport lacked an absolute wall-clock request deadline; slow chunk trickling could extend indefinitely | P1 (Runtime Safety) | Replaced raw `urllib.request.urlopen` with monotonic-deadline-enforcing `_execute_bounded_request()`. Integrated custom `BoundedHTTPConnection`, proactive watchdog socket shutdown (`threading.Timer`), chunked read loop with per-chunk remaining deadline recalculation, and `ResponseBoundExceeded` for responses exceeding 2MB. | `Pipeline_test/tests/test_p1_live_safety_01.py::test_12_f02_absolute_per_request_deadline_and_fault_handling` (`fault:hang`, `fault:sleep_long`, `fault:slow_trickle`, `fault:oversized`, and `fault:redirect` all fail safely within 2.0s tolerance without fallback text). | **CLOSED** |
| **F-03** | Lack of durable machine-readable evidence bundle capturing 1-15 admission history and denials | P1 (Audit Evidence) | Implemented `record_denial()` on `LiveSafetyBudgetLedger` recording denied requests with timestamps, reasons, and client attributions without consuming request slots. Persisted full machine-readable artifact `budget-concurrency-evidence.json`. | `docs/development/integration/p1-author/evidence/p1-live-safety-01/budget-concurrency-evidence.json` (Captures tested SHA, 15 admissions, request 16 denial, rolling-window denial, before/after restart counter equality, identical SHA-256 state hashes, and fake-upstream 15-request match). | **CLOSED** |
| **F-04** | Disposable container verification used static project name and blind `down -v` before checking ownership | P1 (Isolation) | Assigned run-scoped dynamic project naming `p1-safety-<uuid>`. Replaced initial blind `down -v` with pre-flight conflict check failing closed if existing resources exist. Enforced label-scoped deletion `label=com.docker.compose.project={PROJECT_NAME}` in `finally:`. Demonstrated foreign labeled volume survival. | `Pipeline_test/tools/verify_p1_live_safety_containers.py` (`cleanup_verification.foreign_project_resource_survived == true`, 0 remaining containers/volumes/networks) and `test_p1_live_safety_01.py::test_14_f04_project_isolation_and_foreign_project_survival`. | **CLOSED** |
| **F-05** | Network isolation relied on DNS resolution failure; direct non-DNS IP socket egress and routing unverified | P1 (Network Isolation) | Added non-DNS direct IP socket connection probes to RFC 5737 test addresses (`192.0.2.1:443`, `198.51.100.1:443`) from inside both `ai-service` (Python socket) and `backend` (Node net). Added direct fake-upstream bypass probe. Inspected `/proc/net/route` confirming isolated bridge routing without external default gateway. | `docs/development/integration/p1-author/evidence/p1-live-safety-01/container-runtime-evidence.json` (`ai_service` blocked with `[Errno 101] Network is unreachable`, `backend` blocked with `ENETUNREACH`, fake-upstream bypass blocked). | **CLOSED** |
| **F-06** | Closure report required summarizing findings, command transcripts, exit codes, and provisional verdict | P1 (Reporting) | Authored Section 13 in `P1_LIVE_SAFETY_01_REVIEW.md` detailing finding-by-finding remediation, test suite logs, SHA links, zero-call verification, and explicit provisional verdict. | This document section (`P1_LIVE_SAFETY_01_REVIEW.md`). | **CLOSED** |

---

### 13.2 Detailed Technical Remediation

#### 13.2.1 Remediation of F-01: Serialized Private Notes
- **Vulnerability:** Attackers or prompt construction components could embed JSON-serialized strings inside OpenAI-compatible `messages[].content`, e.g. `{"messages": [{"role": "user", "content": "{"characters":[{"name":"Test","notes":"CANARY"}]}"}]}`. Dictionary-key checks alone did not traverse into string-encoded JSON.
- **Fix:**
  - `_extract_json_candidates()` extracts and parses candidates from top-level trimmed strings, markdown code fences (````json ... ````), and bracket-delimited substrings.
  - `_payload_contains_private_notes()` recursively checks each candidate structure.
  - Added targeted string regex for serialized entity key/value pairs (`notes_pattern` and `entity_pattern`) without falsely rejecting natural language prose mentioning the ordinary word "notes" (e.g. musical notes, general remarks).
  - Unsafe requests are rejected with `403 PRIVATE_NOTES_FORBIDDEN_IN_PROMPT` before ticket reservation or ledger commitment, ensuring 0 quota consumption.

#### 13.2.2 Remediation of F-02: Absolute Per-Request Deadline & Socket Abort
- **Vulnerability:** Standard `urllib.request.urlopen(..., timeout=...)` only enforces idle socket timeouts. Malicious or malfunctioning upstreams continuously sending trickle bytes below the idle timeout could hold connections open indefinitely.
- **Fix:**
  - `_execute_bounded_request(request, timeout_seconds, max_response_bytes)` measures `time.monotonic()` against an absolute deadline.
  - A background `threading.Timer` watchdog fires at `timeout_seconds`, executing `socket.shutdown(socket.SHUT_RDWR)` and `socket.close()` on the active connection.
  - The chunk-reading loop recalculates `deadline_mono - time.monotonic()` per read chunk, raising `RequestDeadlineExceeded` immediately if exceeded.
  - Cumulative bytes are capped at `max_response_bytes = 2_000_000`, raising `ResponseBoundExceeded` if exceeded.
  - Upstream redirect attempts trigger `NoRedirect` and fail closed with `503 UPSTREAM_REDIRECT_DENIED`.
  - In all deadline and transport failures, the ticket is finalized with status `"UNKNOWN"`, holding conservative liability in the ledger and preventing synthetic fallback text generation.

#### 13.2.3 Remediation of F-03: Machine-Readable Evidence Bundle
- **Artifact:** `docs/development/integration/p1-author/evidence/p1-live-safety-01/budget-concurrency-evidence.json`
- **Key Evidence Captured:**
  - Exact tested commit SHA and base branch reference.
  - Physical admission history for calls 1 through 15 with timestamps, tickets, and client attribution (8 `ai-service`, 7 `backend`).
  - Recorded rejection of rolling-window burst call #11 (`ROLLING_RATE_LIMIT_EXCEEDED`).
  - Recorded rejection of physical call #16 (`MAX_CALLS_REACHED`).
  - Restart verification: counters identical before and after restart (15 total, 0 remaining, $0.0213468 charged).
  - SHA-256 state hashes: identical before and after restart (`1416b84e9f12db29b11c4209ac3338329a37a36bc8e3981e222c59466971bae9`).
  - Agreement between fake upstream request log and gateway admissions: exactly 15 requests received upstream.

#### 13.2.4 Remediation of F-04: Isolated Container Lifecycle
- **Fix:**
  - `verify_p1_live_safety_containers.py` allocates a unique `PROJECT_NAME = f"p1-safety-{uuid.uuid4().hex[:8]}"` per run.
  - Pre-flight check inspects `label=com.docker.compose.project={PROJECT_NAME}` before creating resources; if any resource pre-exists, the script fails closed.
  - Teardown in `finally:` passes `-p {PROJECT_NAME}` and checks post-teardown resource inventory strictly by project label.
  - Verified foreign project resource survival by injecting a volume labeled `com.docker.compose.project=foreign-project-survives` and confirming it survives teardown.

#### 13.2.5 Remediation of F-05: Non-DNS IP Socket Egress & Routing Verification
- **Fix:**
  - Direct socket connection from `ai-service` to RFC 5737 documentation IP addresses `192.0.2.1:443` and `198.51.100.1:443`: blocked with `[Errno 101] Network is unreachable`.
  - Direct socket connection from `backend` to RFC 5737 IP addresses: blocked with `connect ENETUNREACH 192.0.2.1:443`.
  - Direct worker container route to `http://fake-upstream:18091/received`: blocked at container network boundary.
  - Inspecting `/proc/net/route` inside containers confirms zero external default gateways on `workers` network (`internal: true`).

---

### 13.3 Test Execution & Audit Logs

| Test Suite / Script | Command Executed | Tests | Exit Code | Result |
|---|---|---|---|---|
| Mandatory Offline Adversarial Suite | `python -m pytest Pipeline_test/tests/test_p1_live_safety_01.py -v --basetemp=pytest_tmp -p no:cacheprovider` | 15 / 15 | `0` | **ALL PASSED** (27.07s) |
| Offline Budget Gateway Regression | `python -m pytest Pipeline_test/tests/test_cross_container_budget_gate.py -v --basetemp=pytest_tmp -p no:cacheprovider` | 41 / 41 | `0` | **ALL PASSED** (53.20s) |
| Live Safety Container Runtime Verification | `python Pipeline_test/tools/verify_p1_live_safety_containers.py` | 11 verification checkpoints | `0` | **P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS** |
| Backend AI Copilot Unit Tests | `npx tsx --test backend/src/modules/ai-copilot/llm-provider.test.ts` | 5 / 5 | `0` | **ALL PASSED** (0.30s) |
| Backend TypeScript Build | `npm --prefix backend run build` (`tsc -p tsconfig.json`) | TypeScript compilation | `0` | **CLEAN BUILD** |

---

### 13.4 Zero-Call & Zero-Spend Audit Confirmation

```
Real Generative Provider API Calls Dispatched:  0
Real Provider Quota Consumed:                  0 tokens
Real Provider Invoice / Financial Spending:    $0.00
Unverified Live Models Dispatched:             0
Upstream Provider Used Exclusively:            FakeProviderServer (fake_provider_upstream.py)
```

---

### 13.5 Updated Provisional Verdict

**`P1_LIVE_SAFETY_OFFLINE_PASS`**

All six findings (F-01 through F-06) identified in GPT-6 Independent Review #1 have been fully addressed, verified offline, backed by durable machine-readable evidence, and demonstrated to operate with fail-closed safety. The codebase is ready for **GPT-6 Independent Review #2**.
