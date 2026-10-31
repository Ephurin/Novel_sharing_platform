# P1-RC-01 / P1-RC-02 Final Offline Acceptance & Demo Readiness Report

**Date:** 2026-10-31 (Asia/Saigon / UTC)  
**Repository:** `Ephurin/Novel_sharing_platform`  
**Safety PR:** https://github.com/Ephurin/Novel_sharing_platform/pull/81  
**QA PR:** https://github.com/Ephurin/Novel_sharing_platform/pull/82  
**Integration Base:** `integration/p1-demo-20261109` (`6cbff8829d731704a0e8301fedaa2b1f38dd14c1`)  
**Implementation Branch:** `codex/p1-live-safety-01`  
**Initial Reviewed Implementation HEAD:** `f7f33825f0af7834ce325dbe216a155cc691b09f`  
**Final Implementation HEAD SHA:** `9ced899e3ca1e7fcae834612d1b0682ba75bb3b0` (Code fix: `cdd1597f7bb8f1ee749503c58f0df28a7e4b9bb6`)  
**QA Branch:** `gemini/p1-rc01-offline-acceptance-20261109`  
**Initial Provisional Verdict (P1-RC-01):** `P1_DEMO_OFFLINE_RC_NEEDS_CHANGES` (Historical RED evidence preserved)  
**Final Provisional Verdict (P1-RC-02):** **`P1_DEMO_OFFLINE_RC_PASS`**  
**Live Provider Status:** **`P1_LIVE_PROVIDER_NOT_RUN`** (Zero real provider calls, $0.00 spent)

---

## Executive Summary

This acceptance evaluation audits the complete P1 Author IDE journey and live safety harness against implementation branch `codex/p1-live-safety-01` (PR #81) and records QA evidence on branch `gemini/p1-rc01-offline-acceptance-20261109` (PR #82).

All tests were executed under strict offline containment:
- **Zero live Gemini API calls** and **zero real provider spending ($0.00)**.
- Local fake upstream (`http://127.0.0.1:18091` / `http://budget-gateway:18090`) exclusively.
- Production and shared databases untouched.
- `Pipeline_test/tools/budget_gateway.py` remains 100% byte-for-byte identical to locked base `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`.

### Gate Findings & Evolution Summary

1. **P1-RC-01 Initial Audit (Commit `f7f33825`):**
   - Live safety suite: 19/19 PASSED.
   - Container verification: PASSED.
   - Cross-container budget gate: **30 PASSED, 11 FAILED** (`REGRESSION`). Overly restrictive scenario filter in `fake_provider_upstream.py` broke standard chat completion test probes.
   - Provisional Verdict: `P1_DEMO_OFFLINE_RC_NEEDS_CHANGES`.
2. **P1-RC-02 Remediation (Commits `cdd1597f` & `9ced899e`):**
   - Remediation F-10 applied to `Pipeline_test/tools/fake_provider_upstream.py` line 64: widened approved scripted scenarios to `('p1-live-safety-v1', 'wave1d-negative-only')` while preserving fail-closed behavior for unsupported legacy prompts.
   - Added focused contract suite `test_19_f10_fake_prompt_contracts` to `Pipeline_test/tests/test_p1_live_safety_01.py`.
   - **Cross-Container Budget Gate:** **41/41 PASSED** (54.86s).
   - **P1 Live Safety Suite:** **20/20 PASSED** (40.35s).
   - **FE-19 Final Contracts (`test_p1_fe_final_contracts.py`):** **14/14 PASSED** (3.63s).
   - **Container Verification:** **PASSED** (`P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS`, exit 0).
   - **GitHub Actions CI on `9ced899e`:** **100% GREEN** (P7 Semantic Memory & P8 Cutover both succeeded).
   - **Final Verdict:** **`P1_DEMO_OFFLINE_RC_PASS`** (Provisional offline acceptance pass).

---

## 1. Source and Environment Provenance

- **Integration Base SHA:** `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`
- **Initial Reviewed HEAD:** `f7f33825f0af7834ce325dbe216a155cc691b09f`
- **F-10 Implementation Commit:** `cdd1597f7bb8f1ee749503c58f0df28a7e4b9bb6`
- **Container Evidence Commit:** `9ced899e3ca1e7fcae834612d1b0682ba75bb3b0`
- **Base Budget Gateway Invariant:**
  ```bash
  $ git diff 6cbff8829d731704a0e8301fedaa2b1f38dd14c1 -- Pipeline_test/tools/budget_gateway.py
  # (0 diff — 100% byte-for-byte identical to locked base)
  ```
- **SDK Version Verification:**
  - Prior QA report mistakenly noted `1.62.0`.
  - Fresh verified container runtime readback (`importlib.metadata.version("google-genai")` inside `ai-service`) confirms **`google-genai 2.33.0`**.
  - Host Python environment has `1.69.0`.
  - Certified readback inside production-path container: **`2.33.0`**.

---

## 2. Historical RED Evidence (P1-RC-01 on HEAD `f7f33825`)

During P1-RC-01 evaluation against commit `f7f33825`, the cross-container budget test suite produced 11 failures out of 41 tests:
- **Command:** `python -m pytest Pipeline_test/tests/test_cross_container_budget_gate.py -v -p no:cacheprovider`
- **Result:** 30 passed, 11 failed in 39.44s (Exit Code: 1)
- **Failing Tests:**
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
- **Root Cause:** Commit `f7f33825` changed `Pipeline_test/tools/fake_provider_upstream.py` line 64 to fail closed unless `scenario == 'p1-live-safety-v1'`. Since `test_cross_container_budget_gate.py` uses `start_fake_upstream()` with the default scenario `wave1d-negative-only`, generic test prompts (`body(text='hello')`) raised `ValueError: Unsupported integration fake prompt` and returned HTTP 502 Bad Gateway.

---

## 3. F-10 Remediation & Contract Verification (P1-RC-02)

### Code Fix Applied (`cdd1597f`)
In `Pipeline_test/tools/fake_provider_upstream.py`:
```python
# Line 64:
-    if scenario == 'p1-live-safety-v1':
+    if scenario in ('p1-live-safety-v1', 'wave1d-negative-only'):
         return 'Separate fake upstream response.'
     raise ValueError('Unsupported integration fake prompt')
```

### Five-Contract Verification Matrix
All five required contract assertions simultaneously hold:

| Contract | Description | Execution | Verdict |
|---|---|---|---|
| **Contract A** | Legacy unsupported prompt without approved scenario | `integration_response("ordinary prose contains transitions", None)` raises `ValueError` | **PASS** |
| **Contract B** | Malformed structured request | `integration_response("Verify EVERY supplied candidate OCCURRENCE", {"messages": [{"content": "invalid json"}]})` raises `ValueError` (JSON parse error) | **PASS** |
| **Contract C** | Wave 1D HTTP fixture | `integration_response("hello", scenario="wave1d-negative-only") == "Separate fake upstream response."` | **PASS** |
| **Contract D** | P1 live safety fixture | `integration_response("hello", scenario="p1-live-safety-v1") == "Separate fake upstream response."` | **PASS** |
| **Contract E** | Actual HTTP integration | Default scenario `start_fake_upstream()` serves budget gateway `/v1/chat/completions` returning HTTP 200 with deterministic response | **PASS** |

Tested in `Pipeline_test/tests/test_p1_live_safety_01.py::test_19_f10_fake_prompt_contracts` (1.29s, exit 0).

---

## 4. Mandatory Regression Verification Results (GREEN)

### 1. Cross-Container Budget Gate (`test_cross_container_budget_gate.py`)
- **Command:** `python -m pytest Pipeline_test/tests/test_cross_container_budget_gate.py -v -p no:cacheprovider`
- **Result:** **41/41 PASSED in 54.86s** (Exit Code: 0)
- All 11 previous failures are completely resolved.

### 2. P1 Live Safety Adversarial Suite (`test_p1_live_safety_01.py`)
- **Command:** `python -m pytest Pipeline_test/tests/test_p1_live_safety_01.py -v -p no:cacheprovider`
- **Result:** **20/20 PASSED in 40.35s** (Exit Code: 0)

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
| `test_17` | F-09: Docker inspection returncode validation fails closed (Tests A–F) | PASS |
| `test_18` | Secondary: `/v1/models` returns structured 503 for unhealthy ledger | PASS |
| `test_19` | F-10: 5-contract fake provider prompt isolation & scenario compatibility | PASS |

### 3. FE-19 Final Contracts (`test_p1_fe_final_contracts.py`)
- **Command:** `python -m pytest ai-service/tests/test_p1_fe_final_contracts.py -v -p no:cacheprovider`
- **Result:** **14/14 PASSED in 3.63s** (Exit Code: 0)
- All legacy fail-closed prompt and ingress CORS checks pass cleanly.

### 4. Container Runtime Verification (`verify_p1_live_safety_containers.py`)
- **Command:** `python Pipeline_test/tools/verify_p1_live_safety_containers.py`
- **Result:** **PASS** (`P1_LIVE_SAFETY_01_CONTAINER_VERIFICATION_PASS`, Exit Code: 0)
- Teardown: zero owned containers, volumes, or networks leaked.

---

## 5. GitHub Actions CI Verification

Push of implementation HEAD `9ced899e` triggered GitHub Actions workflows:

| Workflow | Run ID | Status | Conclusion | URL |
|---|---|---|---|---|
| **P8 Cutover and Migration** | `41159282448` | completed | **success** (7/7 jobs) | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41159282448 |
| **P7 Semantic Memory Foundation** | `41159282192` | completed | **success** (3/3 jobs) | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41159282192 |

Detailed job breakdown:
- **P8 Cutover:** `postgres-integration` (success), `rollback-rehearsal` (success), `root-compose-cutover-smoke` (success), `backend-integration` (success), `final-cleanup-gate` (success), `frontend-api-cutover` (success), `unit` (success).
- **P7 Semantic Memory:** `pgvector-integration` (success), `root-compose-smoke` (success), `unit` (success).

---

## 6. Author E2E Acceptance Results & Evidence Classification

### A. Manuscript Journey
- Author authentication and session establishment: **PASS** (API & Browser).
- Novel and chapter creation with autosave: **PASS** (API & Browser).
- Manuscript persistence across page reload: **PASS** (Browser).
- Multi-author tenant isolation: **PASS** (`draft-read-authorization.test.ts` 1/1 PASSED).

### B. Story Brain Journey
- Entity candidate extraction: **PASS** (`test_p1_entity_semantics.py` 21/21).
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
| **Manuscript** (Auth, chapter edits, save/reload) | Verified (Playwright mock) | Verified (REST) | Verified (Postgres) | **PASS** |
| **Story Brain** (Candidate extraction, grouping, Freeze) | Verified (9 UX tests) | Verified (AI service) | Verified (Postgres) | **PASS** |
| **HITL & Canon** (Atomic approval, rejection, activation) | Verified (12 interaction tests) | Verified (AI service) | Verified (Postgres) | **PASS** |
| **Editable Codex** (Profile PATCH, private note isolation) | Verified (16 profile tests) | Verified (Node gateway) | Verified (Postgres) | **PASS** |
| **AI Writing** (Story Bible prompt, draft rejection) | Verified (IDE integration) | Verified (Fake provider) | Verified (Postgres) | **PASS** |
| **Manual Presenter Run** (Live deployed unified stack) | `NOT_RUN` (Automated only) | Verified (Containers) | Verified (Containers) | **MANUAL_REHEARSAL_REQUIRED** |

> [!IMPORTANT]
> The unified live-stack manual presenter run remains classified as **`MANUAL_REHEARSAL_REQUIRED`**. While all headless browser interaction suites pass 100%, the human presenter must rehearse the continuous journey on the deployed production-path URL prior to the 09/11 presentation.

---

## 7. UAT A06/A07 Regression Closure

| UAT Issue | Root Cause | Offline Fix Verification | Status |
|---|---|---|---|
| `UAT01-A06-001` (Numeric overflow) | Confidence score exceeded numeric DB precision | Clamped to `[0.0, 1.0]`; Pydantic schema validation enforced | **OFFLINE_PASS** |
| `UAT01-A06-001` (Malformed JSON) | Unhandled JSON parse exception in LLM response | Handled fail-closed; structured error returned without corrupting chapter | **OFFLINE_PASS** |
| `A07` (Canon blocked) | Cascading extraction failure halted checkpoint | Valid structured extraction enables identity checkpoint & HITL activation | **OFFLINE_PASS** |
| Live Gemini Acceptance | Real model execution | **ZERO cloud calls made ($0.00)** | `P1_LIVE_PROVIDER_NOT_RUN` |

---

## 8. Final Acceptance Matrix & Deliverables

| Gate | Result | Evidence |
|---|---|---|
| **F-10 regression** | **PASS** | `fake_provider_upstream.py:64` supports `wave1d-negative-only` |
| **Legacy prompt fail-closed** | **PASS** | Contract A raises `ValueError`; Contract B raises parse error |
| **Cross-container budget** | **PASS** | 41/41 passed in 54.86s (`test_cross_container_budget_gate.py`) |
| **P1 safety adversarial** | **PASS** | 20/20 passed in 40.35s (`test_p1_live_safety_01.py`) |
| **FE-19 final contracts** | **PASS** | 14/14 passed in 3.63s (`test_p1_fe_final_contracts.py`) |
| **Container verification** | **PASS** | `verify_p1_live_safety_containers.py` exit 0 |
| **P7/P8 CI** | **PASS** | Runs `41159282448` & `41159282192` both SUCCESS |
| **UAT A06/A07 offline** | **PASS** | Bounded confidence, safe JSON fail-closed, unblocked Canon |
| **Unified Author E2E** | **PASS** | Automated browser + API + DB verified across all 5 journey stages |
| **Manual presenter rehearsal** | **MANUAL_REHEARSAL_REQUIRED** | Required for human presenter on deployed URL before 09/11 |
| **Real Gemini acceptance** | `P1_LIVE_PROVIDER_NOT_RUN` | Zero real calls, $0.00 spent |

### Key Deliverables
- **Implementation Commit SHA:** `9ced899e3ca1e7fcae834612d1b0682ba75bb3b0` (Code fix: `cdd1597f7bb8f1ee749503c58f0df28a7e4b9bb6`)
- **Safety PR #81 URL:** https://github.com/Ephurin/Novel_sharing_platform/pull/81
- **Draft QA PR #82 URL:** https://github.com/Ephurin/Novel_sharing_platform/pull/82
- **Remaining P0/P1 Blockers:** **ZERO**.
- **Final Provisional Offline Verdict:** **`P1_DEMO_OFFLINE_RC_PASS`**
- **Separate Provider Status:** **`P1_LIVE_PROVIDER_NOT_RUN`**
- **Merge Readiness Recommendation:** PR #81 is verified clean and recommended for merge pending GPT-6 Independent Review. Neither PR #81 nor #82 has been merged.
