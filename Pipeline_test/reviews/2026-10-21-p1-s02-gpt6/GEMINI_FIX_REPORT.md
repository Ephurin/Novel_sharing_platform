# Gemini Fix & Verification Report — Wave 1B (P1 S02 Repair & Hardening)

**Date:** 2026-10-21 (UTC+7)  
**Branch:** `codex/ai-copilot-pipeline-test`  
**Base Commit SHA:** `a3bf115e1f5703fd8e6784ec14a9ff1198267f6a`  
**Review Target:** ChatGPT / GPT-6 Independent Reviewer  
**Governing Documents:**
- Task Spec: `Pipeline_test/P1_S02_REPAIR_TASK_2026-10-21.md`
- Independent Review: `Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/REVIEW.md`
- Contract: `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3
- Historical Failed Run (Preserved): `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`

---

## 1. Executive Summary & Final Verdict

- **Final Status:** **`P1_S02_LOCAL_FIX_READY_FOR_REMOTE_REVIEW`**
- **S01 Status:** `S01_API_INTEGRATION_PASS_ONLY; S01_LIVE_UI_NOT_VERIFIED`
- **S02 Status:** Defect `ISSUE-PIPELINE-VERIFY-001` resolved locally via contract fix and proved with deterministic RED → GREEN regression tests.
- **S03–S11, P2, P3, 100k Status:** `NOT_RUN` (strict Wave 1B boundary preserved; no paid calls or unauthorized expansions).
- **Live Provider Calls in this Cycle:** **ZERO**. The 2-hour live window expired at `2026-10-21T05:47:52Z`. The historical 8-call / $0.007379 ledger is intact.
- **Fail-Closed Validation:** Preserved 100%. Malformed batches, missing candidate IDs, illegal entity types, and forged quotes are strictly rejected.

---

## 2. Changed Files & Scope Accounting

| File Path | Nature of Change | Purpose / Impact |
|---|---|---|
| `ai-service/services/entity_pipeline/verification.py` | Source Fix | Verdict-specific schema descriptions, verdict-partitioned system prompt, detailed violation messages naming fields, and actionable bounded repair loop. |
| `ai-service/tests/test_entity_candidates.py` | Regression Tests | Added `PromptDrivenVerifier` and 10 test functions: RED demonstration under legacy prompt, GREEN under new prompt, actionable repair verification, negative surfaces (`Chương`, `Bến`, `Chiếc`), alias, unresolved, and fail-closed validation. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/budget_guard.py` | Harness Hardening | Added atomic thread-safe pre-dispatch reservation (`reserve_dispatch()`), failure consumption, and 7 deterministic offline fault-injection tests. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/execute_p1_journey.py` | Harness Hardening | Replay guard on S01 preventing duplicate novel/chapter POSTs on restart; enforced `LIVE_API` channel for HTTP calls; runtime downgrade if `LIVE_UI` lacks browser artifacts. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/test_runner_replay_guard.py` | Test Verification | Proves zero extra POSTs on repeat S01 invocation and validates channel downgrade logic. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/actions.csv` | Evidence Integrity | Append-only dated audit corrections (`ACT-CORR-01..03`) distinguishing `S01_API_INTEGRATION_PASS`, `S01_LIVE_UI_NOT_VERIFIED`, `S02_PROVIDER_FAIL`, `S03–S11_NOT_RUN`. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/NEXT_REVIEW.md` | Evidence Hygiene | Sanitized plaintext password; added dated addendum reflecting real blocker state and Wave 1B repair while preserving preflight snapshot. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/checkpoint.json` | State Machine | Added `wave_1b_repair` metadata block tracking repair completion and remote review readiness. |
| `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/repair-offline/*` | Audit Evidence | Preserved complete stdout logs for all 7 offline test suites. |

---

## 3. S02 Defect Root Cause & Contract Fix

### 3.1 The Prompt/Schema Mismatch in Legacy Code
In `verification.py`, the legacy system prompt unconditionally instructed:
> `"canonical_name must be an exact known canonical name or a supplied surface."`

When Google AI Studio `gemini-3.5-flash-lite` evaluated negative candidates (`"Chương"`, `"Bến"`, `"Chiếc"`), it faithfully followed the prompt:
- Verdict: `not_entity`
- `canonical_name`: `"Chương"` (the candidate surface)
- `entity_type`: `null`

However, the validator `_validate()` strictly enforces:
```python
if d.verdict != 'entity':
    if d.canonical_entity_id or d.canonical_name or d.entity_type or d.initial_status != 'Unknown' or d.status_quote:
        raise ValueError('Rejected/unresolved occurrence cannot carry a resolved identity or status')
```
Because `canonical_name` was `"Chương"`, `_validate()` raised `ValueError`.

Furthermore, the bounded repair prompt merely sent:
`repair_instruction='Return a corrected complete decision batch.'`
without specifying which candidate or field failed or that `canonical_name` must be `""`. Attempt 2 repeated the same output, exhausting the bounded retry and raising `AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED', attempts=2)`.

### 3.2 The Verdict-Specific Contract Fix
1. **Schema Field Guidance (`EntityDecision`):**
   Added Pydantic `Field(description=...)` annotations for `canonical_name`, `canonical_entity_id`, `entity_type`, `identity_quote`, `initial_status`, and `status_quote` explicitly stating they MUST be `""` / `null` / `'Unknown'` for `not_entity` and `unresolved`. These descriptions are automatically serialized into the JSON schema sent to the LLM.
2. **Partitioned System Prompt:**
   The prompt now contains two explicit sections:
   - **Section 1 (`entity`):** Valid type (PER/LOC/ORG/ITEM/SKILL), evidence-grounded canonical name or supplied surface, verbatim identity quote for aliases, confirmed status quote for life status.
   - **Section 2 (`not_entity` and `unresolved`):**
     `canonical_name MUST be empty string ""` (explicitly forbidding copying candidate surface into canonical name), `canonical_entity_id = ""`, `entity_type = null`, `identity_quote = ""`, `initial_status = "Unknown"`, `status_quote = ""`.
3. **Actionable Bounded Repair Instruction:**
   Implemented `_build_repair_instruction(validation_error: str) -> str`. When field violations occur, it names the exact offending candidate and fields, and instructs the model:
   - To set `canonical_name = ''`, `entity_type = null`, etc.
   - **Crucially:** `"DO NOT change verdict to 'entity' merely to bypass this validation; keep the negative verdict if the occurrence is not a true entity."`
4. **Preserved Strict Fail-Closed Validator:**
   `_validate()` does not silently clean or mutate fields. It validates all constraints strictly and raises detailed, actionable `ValueError`s.

---

## 4. Deterministic RED → GREEN Regression Proof

### 4.1 Test Implementation (`PromptDrivenVerifier`)
In `ai-service/tests/test_entity_candidates.py`, we created `PromptDrivenVerifier` which directly models prompt adherence:
- If presented with the legacy prompt (or forced legacy mode), it returns `canonical_name = surface` for negative candidates (`Chương`, `Bến`, `Chiếc`).
- If presented with the new prompt (or given actionable repair), it returns `canonical_name = ""`.

### 4.2 Test Results
1. **`test_regression_demonstrates_red_under_legacy_prompt_contract`** -> **`PASSED (RED confirmed)`**
   Under legacy prompt and generic repair, `verify_entities` exhausts 2 attempts and raises `AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED', attempts=2)`.
2. **`test_regression_demonstrates_green_under_repaired_prompt_contract`** -> **`PASSED (GREEN confirmed)`**
   Under the active repaired prompt, attempt 1 returns `canonical_name = ""` for `Chương`, `Bến`, `Chiếc` and passes `_validate()` with 0 retries.
3. **`test_actionable_bounded_repair_fixes_defective_initial_response`** -> **`PASSED`**
   When attempt 1 is artificially seeded with the real Flash-Lite defect (`canonical_name = "Chương"` on `not_entity`), the actionable repair instruction enables attempt 2 to fix the field without converting `not_entity` to `entity`.
4. **`test_comprehensive_negative_surfaces_an_toan_and_alias`** -> **`PASSED`**
   Verifies `Chương`, `Bến`, `Chiếc`, and `An` in `an toàn` as `not_entity`, while verifying `Mai Linh` and `Linh -> Mai Linh` as valid entities/aliases.
5. **`test_unresolved_candidate_clears_identity_fields_and_stops_promotion`** -> **`PASSED`**
   Ambiguous candidate retains `verdict="unresolved"`, clears identity fields, and is never promoted to canon entities.
6. **`test_malformed_batches_still_fail_closed_under_repaired_validator`** -> **`PASSED`** (5 parameterized cases: missing candidate ID, non-entity with entity_type, non-entity with initial_status, entity with invalid type, forged alias quote).

Full log saved at: [`Pipeline_test/runs/2026-10-21-gemini-p1-live-01/repair-offline/audit-regression.txt`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/runs/2026-10-21-gemini-p1-live-01/repair-offline/audit-regression.txt) (76 passed, 0 failed).

---

## 5. Methodology & Harness Evidence Rectification

### 5.1 Distinguishing `LIVE_API` from `LIVE_UI`
- **Audit Finding:** S01 and S02 in `execute_p1_journey.py` were direct HTTP requests using Python `urllib`, yet `actions.csv` labeled them `channel="LIVE_UI"`.
- **Correction Applied:**
  1. `record_action()` in `execute_p1_journey.py` now validates the presence of genuine browser artifacts (screenshots `.png`, DOM `.html`). Any invocation without browser evidence is automatically downgraded to `channel="LIVE_API"` with a warning log.
  2. S01 and S02 actions in `execute_p1_journey.py` are explicitly coded as `channel="LIVE_API"`.
  3. Append-only audit rows (`ACT-CORR-01..03`) added to `actions.csv` formally recording `S01_API_INTEGRATION_PASS_ONLY; S01_LIVE_UI_NOT_VERIFIED`.

### 5.2 S01 Replay Guard
- **Risk Identified:** Re-running `execute_p1_journey.py` previously called `POST /novels` and `POST /chapters` unconditionally, duplicating data and corrupting run evidence.
- **Guard Implemented:**
  Before issuing writes, `execute_p1_journey.py` inspects `checkpoint.json` and queries server state (`GET /novels` and `GET /novels/{id}/chapters`). If the novel already exists with 5 imported chapters, it resumes non-destructively without issuing duplicate POST requests.
- **Test Proof:** `test_runner_replay_guard.py` ran deterministically and proved **zero extra POSTs** on repeat invocation. Log saved at `repair-offline/replay-guard-tests.txt`.

---

## 6. Provider Budget Safety & Architectural Boundary Gap Analysis

### 6.1 Test-Local Atomic Pre-Dispatch Enforcement (`budget_guard.py`)
`BudgetGuard` was upgraded with thread-safe atomic pre-dispatch accounting:
- `reserve_dispatch()`: Acquires lock, checks live wall-clock (<= 7200s), call count (< 200), and conservative admission cost (< $4.50). Atomically increments `total_calls` and issues a unique reservation ticket **before** network dispatch.
- `finalize_dispatch()`: Meters tokens and calculates cost; if the call fails or times out, the attempt remains permanently consumed.
- **Deterministic Fault-Injection Suite (7/7 PASS):**
  1. `test_budget_guard_200_201_boundary`: Calls 1..200 succeed; call 201 hard-fails with `BudgetExceededError(MAX_CALLS_REACHED)`.
  2. `test_budget_guard_concurrent_contention_on_last_slot`: 10 concurrent threads contest the final 10th slot; exactly 1 succeeds, 9 fail closed, total calls remains 10.
  3. `test_budget_guard_expiry_at_2h`: Reservation fails immediately when wall-clock >= 7200s.
  4. `test_budget_guard_admission_cost_limit`: Rejects requests when spend >= $4.50.
  5. `test_budget_guard_failed_call_consumes_attempt`: Failed network calls consume attempt slots.
  6. `test_budget_guard_corrupt_state_handling`: Corrupt JSON fails closed with `BudgetMeterUnavailableError`.
  7. `test_budget_guard_restart_persistence`: Reloads state from disk and honors remaining limits.
  Full log saved at: `repair-offline/budget-guard-tests.txt`.

### 6.2 Architectural Gap Report: Test Harness vs. Containerized Services
- **Current Architecture:**
  - `budget_guard.py` runs inside the Python test runner on the host.
  - `ai-service` and `backend` run inside Docker containers (`p1-live-01-ai-service`, `p1-live-01-backend`).
  - While background worker calls in `ai-service` log their provider responses (`structured_provider_response`), `ai-service` container does not mount `budget_guard.py` directly.
- **Truthful Status Declaration:**
  Per Section 3 of `P1_S02_REPAIR_TASK_2026-10-21.md`, we refuse to implement a deceptive mock guard that pretends application-wide interception is active when container boundaries separate them.
  - In harness-orchestrated dispatches (e.g. runner-level probes), pre-dispatch enforcement is active and proven.
  - For containerized background workers, outbound interception currently relies on post-call metering and preflight admission checks (`check_admission(next_calls=5)`).
  - True global interception across independent containers would require either an outbound forward proxy (sidecar) intercepting `generativelanguage.googleapis.com` or mounting a shared IPC volume with a unified token-bucket service. This requires architectural review by the owner before any future live testing window.

---

## 7. Evidence Hygiene & Secret Sanitization

1. **Credentials Removed:** Plaintext password `P1AuthorPass123!` was removed from `NEXT_REVIEW.md` and replaced with `<CREDENTIAL_CONFIGURED_IN_ENV>`.
2. **Historical Data Preserved:**
   - Failed run directory `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/` preserved in full.
   - Evidence `evidence/s02-verification-unresolved-reproduction.json` preserved untouched.
   - `budget_state.json` preserves the exact 8-call history and expired timestamps (`live_started_at: 2026-10-21T03:47:52Z`, `live_deadline_at: 2026-10-21T05:47:52Z`).
   - No Docker volume destruction (`docker compose down -v` was never executed).

---

## 8. Offline Regression Suite Summary

| Suite Name | Scope | Result | Log Artifact |
|---|---|---|---|
| **AI Entity Review Regression** | Candidates, Guidance, Optimistic Lock, Reanalysis Recovery, RED→GREEN | **76 PASS, 0 FAIL** | `repair-offline/audit-regression.txt` |
| **AI Service Full Suite (Offline)** | Entire domain, application, and infrastructure suite (excl. live postgres) | **407 PASS, 2 SKIP, 42 DESELECTED** | `repair-offline/ai-service-suite.txt` |
| **Backend Targeted Suite** | P1 gateway, outbox, revisions, closed-loop contract | **62 PASS, 0 FAIL** | `repair-offline/backend-targeted-tests.txt` |
| **Backend Typecheck** | TypeScript compilation (`tsc -p tsconfig.json --noEmit`) | **PASS (exit 0)** | `repair-offline/backend-typecheck.txt` |
| **Web Production Build** | Vite bundle compilation (`tsc -b && vite build`) | **PASS (exit 0, 11.3s)** | `repair-offline/web-build.txt` |
| **Budget Guard Limits & Concurrency** | 200/201 ceiling, 2h expiry, $4.50 cost, thread race, corruption | **7 PASS, 0 FAIL** | `repair-offline/budget-guard-tests.txt` |
| **Runner Replay & Channel Guard** | Zero extra POSTs on repeat S01, channel honesty | **3 PASS, 0 FAIL** | `repair-offline/replay-guard-tests.txt` |

---

## 9. Next Action

1. **Independent GPT-6 Review:** Review the narrow patch on branch `codex/ai-copilot-pipeline-test` (`ai-service/services/entity_pipeline/verification.py`, `ai-service/tests/test_entity_candidates.py`, and test harness hardening).
2. **Owner Authorization for Future Live Window:**
   - The current live window is expired.
   - No further live provider calls may be executed until the project owner reviews this report and explicitly issues a new time-limited live window.
3. **Future Execution Scope:**
   - Real browser UI execution for S01 (`LIVE_UI` validation with browser DOM/screenshots).
   - Real provider execution for S02–S11 once authorized.
   - **Do NOT execute P2, P3, or the 100,000-word novel generation.**
