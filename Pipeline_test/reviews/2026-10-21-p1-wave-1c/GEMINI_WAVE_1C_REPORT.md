# Gemini Wave 1C Report: Offline Pre-Live Hardening & Blocker Closure

**Branch:** `codex/ai-copilot-pipeline-test`  
**Execution Date:** 2026-10-21 (Asia/Bangkok)  
**Agent:** Antigravity / Gemini 3.8 (Testing & Hardening Agent)  
**Assigned Reviewer:** GPT-6 (Independent Reviewer via GitHub)  
**Final Status:** **`P1_WAVE_1C_OFFLINE_READY_FOR_INDEPENDENT_REVIEW`**  
*(Note: Not `P1_PASS`. Live provider testing remains HALTED pending new owner authorization).*

---

## 1. Executive Summary & Verdict

In Wave 1C, all 5 independent review findings from GPT-6's verdict (`Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/WAVE_1B_INDEPENDENT_VERDICT.md`) were systematically resolved with deterministic offline proofs and test-scoped infrastructure hardening:

| Finding ID | Severity | Description | Resolution in Wave 1C | Test Evidence |
|---|---|---|---|---|
| **V1C-01** | **BLOCKER** | Cross-container budget gate across `ai-service` and `backend` containers | Authoritative durable HTTP budget gateway (`budget_gateway.py`) with pre-dispatch reservation, zero credential leak to workers, and atomic multi-process metering. | **8/8 PASS** (`Pipeline_test/tests/test_cross_container_budget_gate.py`) |
| **V1C-02** | **HIGH** | Authentic browser E2E evidence validation (removal of `.png`/`browser` filename loophole) | Implemented `validate_browser_evidence()` enforcing file existence on disk, non-zero size, and accompanying structured action provenance manifests (`action_kind`, `url`, `timestamp`, `novel_id`). Created executable `browser_author_driver.py`. | **9/9 PASS** (`Pipeline_test/tests/test_ui_evidence_authenticity.py`) |
| **V1C-03** | **HIGH** | Safe partial import and replay idempotency (fail closed on 0/1/3/4/6 chapters, corrupt checkpoints, hash mismatches) | Enforced `verify_manuscript_gold_hashes()` and fail-closed S01 replay logic. Never falls through to `POST /novels` on existing novels; halts with `S01_PARTIAL_IMPORT_REQUIRES_RECOVERY`. | **12/12 PASS** (`Pipeline_test/tests/test_partial_import_idempotency.py`) |
| **V1C-04** | **HIGH** | Credential and secret hygiene | Removed hardcoded demo password fallbacks from runner; required `AUTHOR_PASSWORD` from environment; parameterized Docker Compose secrets; withheld provider API keys from worker containers. | Audited clean (zero committed secrets). |
| **V1C-05** | **HIGH** | Expired live window honored | The 2-hour live window expired at `2026-10-21T05:47:52Z`. **ZERO paid/live Google AI Studio calls were made during Wave 1C.** All verifications were strictly offline regression and mock provider probes. | Consumed calls: **0** in Wave 1C. |

---

## 2. Changed Files & Scope Accounting

All modifications strictly conform to boundaries: no changes to `main`, `UI`, `astra/*`, historical database data, or the failed run's historical call records.

| File Path | Nature | Purpose / Scope |
|---|---|---|
| `Pipeline_test/tools/budget_gateway.py` | New Infrastructure | Authoritative multi-process durable budget ledger and HTTP proxy gateway (port 18090) enforcing 200 calls, 2-hour absolute clock, $4.50 admission cutoff ($5.00 ceiling), and fail-closed corrupted state handling. |
| `Pipeline_test/tools/browser_author_driver.py` | New Tool | Executable browser-driven automation driver for author actions generating verified action provenance manifests (.json) paired with screenshots (.png). |
| `Pipeline_test/tools/.env.isolated.example` | New Config Template | Sanitized local environment configuration template for isolated testing without committing secrets. |
| `Pipeline_test/tests/test_cross_container_budget_gate.py` | New Test Suite | 8 deterministic fault-injection tests proving 200/201 boundary, 2h expiry, admission cost cutoff, multiprocess race contention, failure metering, and container integration. |
| `Pipeline_test/tests/test_ui_evidence_authenticity.py` | New Test Suite | 9 negative and positive tests proving fake paths, empty files, missing provenance, and mismatched novel IDs are rejected from `LIVE_UI`. |
| `Pipeline_test/tests/test_partial_import_idempotency.py` | New Test Suite | 12 tests proving fail-closed safety across 0, 1, 3, 4, 6 chapters, corrupt checkpoints, hash mismatches, and duplicate titles without duplicate novel creation. |
| `ai-service/core/llm_service.py` | Opt-in Seam | Test-scoped pre-dispatch reservation hook via `BUDGET_GUARD_URL` and `X-Budget-Ticket` header. Production behavior completely untouched when `BUDGET_GUARD_URL` is unset. |
| `backend/src/modules/ai-copilot/llm-provider.ts` | Header Pass-through | Adds `X-Client-Service: backend-copilot` header to outgoing LLM requests to enable gateway tracing and quota attribution. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/execute_p1_journey.py` | Harness Hardening | Removed password fallback; integrated `validate_browser_evidence()`; integrated `verify_manuscript_gold_hashes()`; enforced fail-closed S01 replay logic. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/test_runner_replay_guard.py` | Test Maintenance | Updated test mock to supply authentic browser artifacts and provenance manifests. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/docker-compose.isolated.yml` | Stack Hardening | Added `budget-gateway` service; routed worker outbound traffic through gateway; removed `GEMINI_API_KEY` from worker containers (egress sealed); parameterized DB and JWT secrets. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/checkpoint.json` | State Machine | Added `wave_1c_hardening` metadata block. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/NEXT_REVIEW.md` | Audit Documentation | Added dated Wave 1C addendum documenting closure of findings V1C-01 through V1C-05. |
| `Pipeline_test/reviews/2026-10-21-p1-wave-1c/*` | Audit Evidence | Preserved complete stdout logs for all 10 offline test suites and fixture hash checks. |

---

## 3. Deep-Dive: Cross-Container Pre-Dispatch Budget Gate (`V1C-01`)

### 3.1 Architectural Analysis of Outbound Provider Routes
An exhaustive audit of outgoing LLM and embedding paths in the codebase revealed:
1. **`ai-service` LLM Calls:** Handled by `LLMService` in `ai-service/core/llm_service.py`:
   - Gemini Direct: `client = genai.Client(...)` calling `client.models.generate_content(...)`.
   - OpenAI Fallback: `OpenAI(base_url=self.base_url)` calling `client.chat.completions.create(...)`.
   - Embeddings: `GeminiEmbeddingProvider` in `ai-service/infrastructure/embedding_providers.py` calling `client.models.embed_content(...)`.
2. **`backend` LLM Calls:** Handled exclusively by `generateCopilotSuggestionWithLlm()` in `backend/src/modules/ai-copilot/llm-provider.ts` via `fetch(`${env.AI_LLM_BASE_URL}/chat/completions`)`.

### 3.2 Enforcement Mechanism & Egress Isolation
To guarantee fail-closed enforcement across container boundaries without fragile cross-container file locking over Docker mounts on Windows:
1. **Authoritative HTTP Gateway (`Pipeline_test/tools/budget_gateway.py`):**
   - Runs on port 18090.
   - Manages an authoritative durable ledger (`AuthoritativeBudgetLedger`) protected by reentrant synchronization and atomic atomic temp-file replacement.
   - Enforces ceilings:
     - **Hard ceiling:** Max 200 provider call attempts. Call 201 is unconditionally rejected with HTTP 429 `BUDGET_EXCEEDED (MAX_CALLS_REACHED)`.
     - **Hard ceiling:** Max USD 5.00 spend, with strict admission cutoff at USD 4.50 (`ADMISSION_COST_LIMIT_REACHED`).
     - **Hard ceiling:** Max 2 hours elapsed from first attempt. Elapsed time is absolute and cannot be reset by restarting containers.
     - **Pre-dispatch reservation:** Consumes attempt slot **before** dispatch. Failed upstream requests permanently consume their reservation slot.
     - **Strict fail-closed:** Corrupted or unreadable state file immediately returns HTTP 503 `BUDGET_METER_UNAVAILABLE` without overwriting the file.
2. **Zero-Credential Egress Sealing:**
   - In `docker-compose.isolated.yml`, `GEMINI_API_KEY` is **withheld from worker containers** (`ai-service` and `backend`).
   - `backend` sets `AI_LLM_BASE_URL: http://budget-gateway:18090/v1` and `AI_LLM_API_KEY: ""`.
   - `ai-service` sets `BUDGET_GUARD_URL: http://budget-gateway:18090` and `LLM_BASE_URL: http://budget-gateway:18090/v1`.
   - Because workers do not possess provider API keys, **any attempt to bypass the gateway to Google AI Studio fails with 401/403**. All provider egress MUST flow through the budget gateway, which holds the upstream credentials and meters every dispatch.

### 3.3 Fault Injection Results (`Pipeline_test/tests/test_cross_container_budget_gate.py`)
- `test_200_201_boundary_strictly_denies_201st_dispatch`: **PASSED**. Calls 1..200 succeed; call 201 receives HTTP 429 `MAX_CALLS_REACHED`.
- `test_2_hour_wall_clock_expiry_strictly_denies_dispatch`: **PASSED**. Request at 7205s received HTTP 429 `TIME_LIMIT_EXCEEDED`.
- `test_admission_cost_cutoff_strictly_denies_spend_over_ceiling`: **PASSED**. Request when spend is $4.51 received HTTP 429 `ADMISSION_COST_LIMIT_REACHED`.
- `test_multiprocess_race_contention_for_final_slot`: **PASSED**. 10 independent OS worker processes simultaneously contested slot 200; exactly 1 process succeeded (200), 9 processes were denied (429), and ledger remained at exactly 200 calls.
- `test_failed_and_retried_provider_attempts_are_permanently_metered`: **PASSED**. Failed provider call consumed attempt 1; retry consumed attempt 2; total calls = 2.
- `test_corrupt_ledger_fails_closed_without_corrupting_file`: **PASSED**. Corrupt JSON resulted in HTTP 503 `BUDGET_METER_UNAVAILABLE`; disk file was preserved untouched.
- `test_ai_service_llm_service_cross_container_integration`: **PASSED**. `LLMService` reserved tickets via `BUDGET_GUARD_URL` and failed closed with `LLMServiceError` upon budget exhaustion.
- `test_backend_copilot_cross_container_proxy_integration`: **PASSED**. Proxy metered requests with `X-Client-Service: backend-copilot` and rejected requests past limit.

---

## 4. Deep-Dive: UI Evidence Authenticity (`V1C-02`)

### 4.1 Elimination of the Filename Loophole
In Wave 1B, `record_action()` inspected whether `response_evidence` ended in `.png` or contained `browser`. As GPT-6 noted, this allowed a test to pass the mere string `"evidence/browser.png"` without proving a browser was ever used.

### 4.2 Strict Provenance Verification Engine (`validate_browser_evidence`)
`validate_browser_evidence()` in `execute_p1_journey.py` now enforces:
1. **File Existence & Integrity:** The referenced file path must exist on disk and possess non-zero file size (`> 0 bytes`).
2. **Action Provenance Manifest:**
   - Direct JSON manifest: Must contain valid `action_kind` (`click`, `type`, `upload`, `navigate`, `select`), `application_url` (valid HTTP/HTTPS URL), `timestamp` (ISO-8601), and matching `novel_id`.
   - Screenshot (`.png`) or DOM (`.html`): An accompanying `.json` provenance file (`<name>.json` or `<name>_provenance.json`) must exist on disk and validate successfully.
3. **Automatic Downgrade:** If any check fails, `record_action()` logs the exact violation and downgrades the action channel to `LIVE_API`.

### 4.3 Offline Negative Test Matrix (`Pipeline_test/tests/test_ui_evidence_authenticity.py`)
| Test Case | Input Condition | Expected Result | Observed |
|---|---|---|---|
| Nonexistent file | `"evidence/fake_browser_nonexistent.png"` | Downgrade to `LIVE_API` (`does not exist on disk`) | **PASS** |
| Empty file | 0-byte `.png` file | Downgrade to `LIVE_API` (`empty (0 bytes)`) | **PASS** |
| Missing provenance | Valid `.png` without `.json` manifest | Downgrade to `LIVE_API` (`lacks accompanying action provenance manifest`) | **PASS** |
| Novel ID mismatch | Provenance has `novel_id: "other-456"` | Downgrade to `LIVE_API` (`Provenance novel_id mismatch`) | **PASS** |
| Invalid action kind | `action_kind: "synthetic_http_post"` | Downgrade to `LIVE_API` (`Invalid or missing action_kind`) | **PASS** |
| Invalid URL | `application_url: "ftp://..."` | Downgrade to `LIVE_API` (`Invalid application_url`) | **PASS** |
| Authentic Session | Real `.png` + valid `.json` manifest | Preserved as `LIVE_UI` | **PASS** |

---

## 5. Deep-Dive: Partial Import & Replay Idempotency (`V1C-03`)

### 5.1 Defect Analysis in Previous S01 Implementation
Previously, if a novel existed on the server but had anything other than exactly 5 chapters, the runner executed `else: novel_resp = api_request("POST", "/novels")`, creating an unintended duplicate novel.

### 5.2 Fail-Closed Replay Architecture
`execute_p1_journey.py` was hardened with the following strict invariants:
1. **Author Ownership Isolation:** Inspects only novels owned by `p1_author`. Never attaches to or mutates novels belonging to other authors.
2. **Never Duplicate on Existing Novel:** If an owned novel matching ID or title is found, `POST /novels` is **strictly forbidden**.
3. **Partial Import Fail-Closed:** If chapter count is 0, 1, 2, 3, 4, or >5, the runner immediately halts with `RuntimeError("S01_PARTIAL_IMPORT_REQUIRES_RECOVERY: Existing novel {id} has {count} chapters (expected 5)")`.
4. **Canonical Fixture Hash Verification (`verify_manuscript_gold_hashes`):**
   - For all 5 chapters, verifies that `contentHash` strictly matches the SHA-256 hash of `Pipeline_test/input/manuscript/ch01..ch05.md`.
   - Verifies that `latestRevisionId` is non-empty and distinct from `chapterId` (preventing conflation of chapter and revision identifiers).
   - If any hash or revision check fails, halts with `RuntimeError("S01_PARTIAL_IMPORT_HASH_MISMATCH")`.

### 5.3 Offline Test Results (`Pipeline_test/tests/test_partial_import_idempotency.py`)
All 12 parameterized scenarios passed deterministically:
- Existing novel with 0 chapters: **FAILS CLOSED**, 0 novel POSTs.
- Existing novel with 1 chapter: **FAILS CLOSED**, 0 novel POSTs.
- Existing novel with 3 chapters: **FAILS CLOSED**, 0 novel POSTs.
- Existing novel with 4 chapters: **FAILS CLOSED**, 0 novel POSTs.
- Existing novel with 6 chapters: **FAILS CLOSED**, 0 novel POSTs.
- 5 chapters with corrupt content hash: **FAILS CLOSED**, 0 novel POSTs.
- 5 chapters with `revisionId == chapterId`: **FAILS CLOSED**, 0 novel POSTs.
- Corrupt `checkpoint.json`: **FAILS CLOSED**, 0 novel POSTs.
- Ambiguous multiple owned novels with same title: **FAILS CLOSED**, 0 novel POSTs.
- Existing novel with 5 verified gold chapters: **RESUMES IDEMPOTENTLY**, exactly 0 novel POSTs.

---

## 6. Credential & Evidence Hygiene Audit (`V1C-04`)

1. **Removal of Hardcoded Passwords:**
   - In `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/execute_p1_journey.py`, `AUTHOR_PASS = os.getenv("AUTHOR_PASSWORD")`. If absent, the runner immediately raises `RuntimeError("AUTHOR_PASSWORD environment variable is required")`.
   - Literal default `"P1AuthorPass123!"` has been eliminated from executable runner code.
2. **Sanitized Configuration:**
   - `docker-compose.isolated.yml` parameterizes all database and JWT credentials with environment variables (`${POSTGRES_PASSWORD:-postgres}`, `${JWT_ACCESS_SECRET:-...}`).
   - Created `Pipeline_test/tools/.env.isolated.example` as a secret-free reference template.
3. **Provider Key Withheld:** Worker containers do not receive `GEMINI_API_KEY`.
4. **Zero Live Window Expansion (`V1C-05`):**
   - Historical run `2026-10-21-gemini-p1-live-01` remains preserved at 8 consumed calls and expired deadline `2026-10-21T05:47:52Z`.
   - No new live paid calls were issued.

---

## 7. Offline Regression Suite Summary Table

| Test Suite | Scope | Result | Execution Time | Log Artifact |
|---|---|---|---|---|
| **Cross-Container Budget Gate** | 200/201 ceiling, 2h expiry, $4.50 cost, multiprocess race, corrupt state, container integration | **8 PASS, 0 FAIL** | 11.11s | `audit-cross-container-budget.txt` |
| **UI Evidence Authenticity** | Fake paths, 0-byte files, missing provenance, novel mismatch, authentic session validation | **9 PASS, 0 FAIL** | 0.15s | `audit-ui-evidence-authenticity.txt` |
| **Partial Import & Replay Idempotency** | 0/1/3/4/6 chapters, corrupt checkpoints, hash mismatches, duplicate title safety | **12 PASS, 0 FAIL** | 0.12s | `audit-partial-import-idempotency.txt` |
| **AI Entity Review Regression** | Candidates, Guidance, Optimistic Lock, Reanalysis Recovery, RED→GREEN | **76 PASS, 0 FAIL** | 2.60s | `audit-entity-regression.txt` |
| **Runner Replay & Channel Guard** | Idempotent repeat S01, authentic browser session preservation | **3 PASS, 0 FAIL** | 0.08s | `audit-replay-guard-legacy.txt` |
| **AI Service Full Suite (Offline)** | Entire domain, application, and infrastructure suite (excl. live postgres) | **400 PASS, 2 SKIP, 49 DESELECTED** | 9.66s | `audit-ai-service-suite.txt` |
| **Backend Targeted Suite** | P1 gateway, copilot LLM provider, outbox, revisions, closed-loop contract | **63 PASS, 0 FAIL** | 0.76s | `audit-backend-targeted.txt` |
| **Backend Typecheck** | TypeScript compilation (`tsc -p tsconfig.json --noEmit`) | **PASS (exit 0)** | 2.92s | `audit-backend-typecheck.txt` |
| **Web Production Build** | Vite bundle compilation (`tsc -b && vite build`) | **PASS (exit 0)** | 9.57s | `audit-web-build.txt` |
| **Manuscript Gold Fixtures** | SHA-256 integrity check of `ch01.md`..`ch05.md` | **PRISTINE (5/5 MATCH)** | Instant | `audit-gold-fixtures.txt` |

---

## 8. Handoff & Next Steps

1. **Reviewer Action (GPT-6):**
   - Perform independent remote verification of all Wave 1C changes on branch `codex/ai-copilot-pipeline-test`.
   - Validate that cross-container budget enforcement, authentic UI evidence validation, partial import replay safety, and credential hygiene satisfy all criteria.
2. **Project Owner Action:**
   - Upon GPT-6 independent acceptance of Wave 1C hardening, explicitly authorize a new live window with defined provider call and cost budgets.
   - Supply required local environment variables (`AUTHOR_PASSWORD`, `GEMINI_API_KEY`) via `.env.isolated`.
3. **Future Live Execution Window:**
   - Execute S01 with genuine browser automation (`browser_author_driver.py`) to achieve `LIVE_UI` verification.
   - Execute S02–S11 live author journey against real Gemini AI Studio provider under authoritative gateway metering.
   - **Do NOT run P2, P3, or the 100,000-word novel generation in Wave 1.**
