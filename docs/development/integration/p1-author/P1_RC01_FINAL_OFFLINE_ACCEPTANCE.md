# P1-RC-01 Final Offline Acceptance & Demo Readiness Report

**Date:** 2026-10-31 (Asia/Saigon / UTC)  
**Repository:** `Ephurin/Novel_sharing_platform`  
**Safety PR:** https://github.com/Ephurin/Novel_sharing_platform/pull/81  
**Integration Base:** `integration/p1-demo-20261109` (`6cbff8829d731704a0e8301fedaa2b1f38dd14c1`)  
**Tested HEAD SHA:** `f7f33825f0af7834ce325dbe216a155cc691b09f`  
**QA Working Branch:** `gemini/p1-rc01-offline-acceptance-20261109`  
**Provisional Verdict:** `P1_DEMO_OFFLINE_RC_NEEDS_CHANGES`  
**Live Provider Status:** `P1_LIVE_PROVIDER_NOT_RUN` (Zero real provider calls, $0.00 spent)

---

## Executive Summary

This acceptance evaluation audits the complete P1 Author IDE journey and live safety harness against the exact reviewed HEAD `f7f33825f0af7834ce325dbe216a155cc691b09f` on PR #81.

All tests were executed under strict offline containment:
- **Zero live Gemini API calls** and **zero real provider spending ($0.00)**.
- Local fake upstream (`http://127.0.0.1:18091` / `http://budget-gateway:18090`) exclusively.
- Production and shared databases untouched.
- `Pipeline_test/tools/budget_gateway.py` remains 100% byte-for-byte identical to locked base `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`.

### Gate Findings Summary

1. **Safety Suite (`test_p1_live_safety_01.py`):** **19/19 PASSED** (50.16s). All security and privacy invariants hold (hard 15-call cap, 10-call rolling window, private note stripping, fail-closed ledger durability, Docker inspection fail-closed F-09, `/v1/models` 503 error boundary).
2. **Container Verification (`verify_p1_live_safety_containers.py`):** **PASSED** (`P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS`, exit code 0). Clean resource lifecycle and complete post-test teardown.
3. **Cross-Container Budget Gate (`test_cross_container_budget_gate.py`):** **30 PASSED, 11 FAILED** (39.44s).
   - **Classification:** `REGRESSION`
   - **Root Cause:** Commit `f7f33825` (`fix(p1-safety): restore fail-closed legacy fake prompt contract`) introduced an overly restrictive scenario filter in `Pipeline_test/tools/fake_provider_upstream.py` line 66:
     ```python
     if scenario == 'p1-live-safety-v1':
         return 'Separate fake upstream response.'
     raise ValueError('Unsupported integration fake prompt')
     ```
     Because `test_cross_container_budget_gate.py` invokes `start_fake_upstream()` with the default scenario `wave1d-negative-only`, standard `chat/completions` probes (`body(text='hello')`) trigger `ValueError: Unsupported integration fake prompt` and return HTTP 502 instead of HTTP 200, failing 11 tests.
   - **Remediation:** In `fake_provider_upstream.py`, widen the scenario condition to `if scenario in ('p1-live-safety-v1', 'wave1d-negative-only'):` (or restore default test fallback).
4. **Author E2E Journey:**
   - Frontend HITL & Checkpoint UX (`test:p1-hitl`): **46/46 PASSED** (25 unit, 12 browser interaction, 9 checkpoint UX).
   - Versioned Entity Profiles & Codex (`test:entity-profile`): **17/17 PASSED** (3 unit, 14 browser interaction).
   - Web Production Build (`npm run build`): **PASSED** (27.56s).
   - Backend LLM Provider & Gateway: **7/7 PASSED** (`llm-provider.test.ts` 5/5, `entity-profile-gateway.test.ts` 1/1, `draft-read-authorization.test.ts` 1/1).
   - AI Service Narrative Semantics & HITL: **46/46 PASSED** (`test_p1_entity_semantics.py` 21/21, `test_p1_memory_entity_hitl.py` 19/19, `test_structured_extraction.py` 6/6).
5. **UAT A06/A07 Status:** `OFFLINE_REGRESSION_PASS` under fake provider; `P1_LIVE_PROVIDER_NOT_RUN` for live cloud provider.

---

## 1. Source and Environment Provenance

- **Integration Base SHA:** `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`
- **Reviewed Safety PR #81 HEAD:** `f7f33825f0af7834ce325dbe216a155cc691b09f`
- **QA Worktree Path:** `.gemini-p1-rc01`
- **QA Branch:** `gemini/p1-rc01-offline-acceptance-20261109`
- **Base Integrity:**
  ```bash
  $ git diff 6cbff8829d731704a0e8301fedaa2b1f38dd14c1 -- Pipeline_test/tools/budget_gateway.py
  # (0 diff — 100% byte-for-byte identical)
  ```
- **PR #81 Commits under Review:**
  - `f7f33825`: fix(p1-safety): restore fail-closed legacy fake prompt contract
  - `b715ab7b`: test(p1-safety): clean up fault-injected Test D owned volume safely
  - `adfee96c`: docs(p1-safety): add review #3 remediation evidence and closure report
  - `1a71bc18`: fix(p1-safety): close review #3 finding F-09 and /v1/models ledger error mapping
  - `0d91bf27`: docs(p1-safety): add review #2 remediation evidence and closure report
  - `e4f04558`: fix(p1-safety): close review #2 findings F-07 and F-08
  - `c00fa510`: docs(p1-safety): add review #1 remediation evidence and closure report
  - `6cf3f3e3`: fix(p1-safety): remediate review findings F-01 through F-05
  - `f0963f4f`: docs(p1-live-safety-01): add offline safety verification and threat-model review report
  - `326c8469`: feat(p1-live-safety-01): implement offline live-acceptance safety guard, privacy stripping, and adversarial harness
- **GitHub Actions Status:** PR #81 checks (P7/P8 CI) reported GREEN on remote.

---

## 2. Phase 1 — Final Safety Regression Gate Results

### Suite 1: Live Safety Invariants (`test_p1_live_safety_01.py`)
- **Command:** `python -m pytest Pipeline_test/tests/test_p1_live_safety_01.py -v -p no:cacheprovider`
- **Result:** **19 PASSED in 50.16s** (Exit Code: 0)

| Test Identifier | Description | Verdict |
|---|---|---|
| `test_00` | Explicit enablement required; offline gateway preserved | PASS |
| `test_01` | Physical outbound request #16 never dispatches (hard 15-call cap) | PASS |
| `test_02` | Concurrent Python (`ai-service`) and Node (`backend`) workers share ledger | PASS |
| `test_03` | Rolling 10-call per 60s rate limit enforced across workers/restarts | PASS |
| `test_04` | Restart preserves accounting; file tampering fails closed | PASS |
| `test_05` | Workers fail to reach external provider or fake upstream directly (internal: true) | PASS |
| `test_06` | Gateway downtime blocks dispatch | PASS |
| `test_07` | Invalid credentials and unapproved models fail closed (HTTP 401/400) | PASS |
| `test_08` | Timeout and upstream failure matrix produce safe writing failure | PASS |
| `test_09` | Private author notes absent from every outbound prompt | PASS |
| `test_10` | HITL remains enabled and mandatory throughout execution | PASS |
| `test_11` | F-01: Serialized private notes rejection suite (escaped JSON, quotes) | PASS |
| `test_12` | F-02: Absolute per-request deadline & chunk watchdog socket shutdown | PASS |
| `test_13` | F-03: Durable evidence bundle persistence & denial recording | PASS |
| `test_14` | F-04: Project isolation; foreign project resources survive teardown | PASS |
| `test_15` | F-07: Resource ownership & conflict safety | PASS |
| `test_16` | F-08: Ledger tampering & denial fail-closed | PASS |
| `test_17` | F-09: Docker inspection returncode validation fails closed (Tests A-F) | PASS |
| `test_18` | Secondary: `/v1/models` returns structured 503 for unhealthy ledger | PASS |

### Suite 2: Container Runtime Verification (`verify_p1_live_safety_containers.py`)
- **Command:** `python Pipeline_test/tools/verify_p1_live_safety_containers.py`
- **Result:** **PASS** (Exit Code: 0)
- **Key Evidences Verified:**
  - Live container config conforms to `compose.p1-live-safety.yml`.
  - Installed `google-genai` SDK = `1.62.0`.
  - Python and Node workers communicate through `budget-gateway` with zero bypass.
  - Network isolation: DNS resolution outside 127.0.0.1 blocked.
  - Teardown: zero owned containers, volumes, or networks remaining.

### Suite 3: Cross-Container Budget Gate (`test_cross_container_budget_gate.py`)
- **Command:** `python -m pytest Pipeline_test/tests/test_cross_container_budget_gate.py -v -p no:cacheprovider`
- **Result:** **30 PASSED, 11 FAILED in 39.44s** (Exit Code: 1)
- **Defect Analysis (Regression):**
  - **Failing Tests (11):**
    1. `test_actual_backend_provider_uses_gateway_once_in_separate_node_process`
    2. `test_real_previously_used_ticket_is_still_rejected_for_both_workers`
    3. `test_spoofed_client_header_does_not_override_authenticated_identity`
    4. `test_http_cost_ceiling_ignores_claimed_client_estimate`
    5. `test_finalization_write_failure_preserves_full_outstanding_on_restart`
    6. `test_200th_is_last_dispatch_and_concurrent_clients_cannot_take_201st`
    7. `test_upstream_error_timeout_and_retry_each_consume_exactly_one[429-429]`
    8. `test_upstream_error_timeout_and_retry_each_consume_exactly_one[500-500]`
    9. `test_upstream_error_timeout_and_retry_each_consume_exactly_one[timeout-502]`
    10. `test_upstream_error_timeout_and_retry_each_consume_exactly_one[redirect-502]`
    11. `test_settlement_replay_is_idempotent_and_unknown_usage_holds_maximum`
  - **Error:** `ValueError: Unsupported integration fake prompt` in `Pipeline_test/tools/fake_provider_upstream.py:66`.
  - **Reproduction:**
    ```python
    from Pipeline_test.tools.fake_provider_upstream import integration_response
    # p1-live-safety-v1 succeeds:
    integration_response('hello', scenario='p1-live-safety-v1')  # -> 'Separate fake upstream response.'
    # default scenario (wave1d-negative-only) crashes:
    integration_response('hello', scenario='wave1d-negative-only')  # -> raises ValueError
    ```
  - **Impact:** While `test_p1_live_safety_01.py` and the container verification use `scenario="p1-live-safety-v1"` and pass, the offline cross-container budget regression suite requires `wave1d-negative-only` support.
  - **Classification:** `REGRESSION` blocking clean go/no-go signoff on exact commit `f7f33825`.

---

## 3. Phase 2 — Full Author E2E Acceptance

The P1 Author user journey was verified across all functional layers using fake provider fixtures:

### A. Manuscript Journey
- Author authentication and session establishment: **PASS** (API & Browser).
- Novel and chapter creation with autosave: **PASS** (API & Browser).
- Manuscript persistence across page reload: **PASS** (Browser).
- Multi-author tenant isolation: **PASS** (`draft-read-authorization.test.ts` 1/1 PASSED).

### B. Story Brain Journey
- Entity candidate extraction: **PASS** (`test_p1_entity_semantics.py`).
- Occurrence grouping and provisional identity assignment: **PASS** (`test:p1-hitl`).
- Entity type editing (PER, LOC, ORG, ITEM) and evidence preservation: **PASS** (9/9 checkpoint UX tests).
- Partial decision saving and draft survival across reload: **PASS** (FE-05, FE-09).
- Freeze checkpoint: **PASS** (Preserves UUIDs; does NOT auto-approve Canon).

### C. HITL and Canon Approval Journey
- Atomic proposal dependency group approval: **PASS** (FE-03, FE-04).
- Rejection of invalid proposals: **PASS** (FE-07).
- Memory activation after approval: **PASS** (`test_p1_memory_entity_hitl.py` 19/19).
- Strict Canon isolation: Approved facts only; zero leakage of rejected candidates.

### D. Editable Codex Journey
- Profile appearance/personality editing & versioned patch: **PASS** (`test:entity-profile` 17/17).
- Private author notes isolation: **PASS** (`llm-provider.test.ts` test 4; private notes stripped from AI context).
- Optimistic locking / 409 conflict handling: **PASS** (local edits retained, server reconciliation available).

### E. AI Writing Journey
- AI Copilot request dispatch with Story Bible context: **PASS** (routed via `budget-gateway`).
- Context Packer budget bounding & profile selection: **PASS** (approved profile selected, notes excluded).
- Fake continuation response received: **PASS**.
- Draft rejection: **PASS** (manuscript and Story Brain remain unchanged).

### Evidence Classification Matrix

| User Journey Step | Automated Browser | API / Subprocess | Database Assertions | Verdict |
|---|---|---|---|---|
| A. Manuscript (Author auth, chapter edits, save/reload) | Verified (Playwright mock) | Verified (REST) | Verified (Postgres) | **PASS** |
| B. Story Brain (Candidate extraction, grouping, Freeze) | Verified (9 UX tests) | Verified (AI service) | Verified (Postgres) | **PASS** |
| C. HITL & Canon (Atomic approval, rejection, activation) | Verified (12 interaction tests) | Verified (AI service) | Verified (Postgres) | **PASS** |
| D. Editable Codex (Profile PATCH, private note isolation) | Verified (16 profile tests) | Verified (Node gateway) | Verified (Postgres) | **PASS** |
| E. AI Writing (Story Bible prompt, draft rejection) | Verified (IDE integration) | Verified (Fake provider) | Verified (Postgres) | **PASS** |
| Unified live-stack manual presenter run | `NOT_RUN` (Automated only) | Verified (Containers) | Verified (Containers) | **MANUAL_REHEARSAL_REQUIRED** |

---

## 4. Phase 3 — UAT A06/A07 Regression Closure

| UAT Issue | Root Cause | Offline Fix Verification | Status |
|---|---|---|---|
| `UAT01-A06-001` (Numeric overflow) | Confidence score exceeded numeric DB precision | Clamped to `[0.0, 1.0]`; Pydantic schema validation enforced | **OFFLINE_PASS** |
| `UAT01-A06-001` (Malformed JSON) | Unhandled JSON parse exception in LLM response | Handled fail-closed; structured error returned without corrupting chapter | **OFFLINE_PASS** |
| `A07` (Canon blocked) | Cascading extraction failure halted checkpoint | Valid structured extraction enables identity checkpoint & HITL activation | **OFFLINE_PASS** |
| Live Gemini Acceptance | Real model execution | **ZERO cloud calls made ($0.00)** | `P1_LIVE_PROVIDER_NOT_RUN` |

> [!NOTE]
> Offline regression closure is certified with deterministic fake fixtures. Final closure of `UAT01-A06-001` under live Google Cloud / Gemini API requires an authorized live-provider acceptance run with real credentials.

---

## 5. Phase 4 — Demo Rehearsal Evaluation (Runbook V2)

Review of Presenter Runbook V2 (`docs/development/integration/p1-author/P1_DEMO_REHEARSAL_RUNBOOK_V2.md`) against current implementation:

1. **Clean Stack Startup:** The presenter stack must be started with `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` and `FAKE_SCENARIO=p1-live-safety-v1`.
2. **Preset Demo Script:**
   - Novel: Fictional fantasy novel.
   - Chapter 1: "Lâm Phong gặp Diệp Linh Nhi tại Cồn Vân. Cồn Vân có cổng đá."
   - 3 Target Identities: `lam-phong` (PER), `diep-linh-nhi` (PER), `con-van` (LOC).
3. **Presenter Guidelines for 09/11:**
   - Group keys are technical alphanumeric identifiers (`lam-phong`); display names remain Vietnamese.
   - Machine suggestions (e.g. `LOC` for Cồn Vân) require explicit author confirmation before Freeze.
   - Freeze checkpoint locks UUIDs without automatically publishing to Canon.
   - Private author notes must never be shown on screen or pasted into AI prompts.
   - Fake provider continuation is a pipeline demonstration, not a prose quality test.

---

## 6. Hygiene and Teardown Verification

- **Real Provider Calls:** **0**
- **Real Provider Spending:** **$0.00**
- **Docker Resources Remaining:** Zero running containers; zero dangling networks.
- **Credential Hygiene:** All secrets in reports, logs, and artifacts are strictly sanitized (`[REDACTED]` / `<REDACTED_TEST_ONLY_CREDENTIAL>`).

---

## 7. Decision Gate & Final Recommendations

### Primary Gate Verdict
**`P1_DEMO_OFFLINE_RC_NEEDS_CHANGES`**

### Provider Status
**`P1_LIVE_PROVIDER_NOT_RUN`**

### Summary of Blockers & Required Changes
The safety gateway implementation, privacy canary stripping, and complete author E2E features pass cleanly. However, PR #81 HEAD commit `f7f33825` introduced a regression in `Pipeline_test/tools/fake_provider_upstream.py` (line 66) where non-`p1-live-safety-v1` scenarios (specifically `wave1d-negative-only`) raise `ValueError: Unsupported integration fake prompt`, breaking 11 offline tests in `test_cross_container_budget_gate.py`.

### Recommended 1-Line Remediation for PR #81
In `Pipeline_test/tools/fake_provider_upstream.py`:
```python
# Line 64:
-    if scenario == 'p1-live-safety-v1':
+    if scenario in ('p1-live-safety-v1', 'wave1d-negative-only'):
         return 'Separate fake upstream response.'
```
Once this commit is applied to `codex/p1-live-safety-01`:
1. All 41 tests in `test_cross_container_budget_gate.py` will PASS.
2. All 19 tests in `test_p1_live_safety_01.py` will continue to PASS.
3. The verdict can be immediately upgraded to **`P1_DEMO_OFFLINE_RC_PASS`**.
