# Closure of Independent Review Findings (REV-P1-01 through REV-P1-09)

**Run ID:** `2026-10-21-gemini-p1-live-01`  
**Branch:** `codex/ai-copilot-pipeline-test`  
**Review Reference:** `Pipeline_test/reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md` (commit `c77167091decf7c103914b0eda2624774db4dee9`)  
**Authorization Reference:** `Pipeline_test/P1_LIVE_RESUME_APPROVED_2026-10-21.md` (Project Owner explicit authorization, 2026-10-21)  
**Date:** 2026-10-21 (Asia/Bangkok)

---

## 1. Summary of Review Findings Closure

| Finding ID | Severity | Description | Resolution & Evidence | Status |
|---|---|---|---|---|
| **REV-P1-01** | BLOCKER | Real provider not configured in committed stack (`LLM_PROVIDER: fake`). | Configured `LLM_ENABLED: "true"`, `LLM_PROVIDER: gemini`, `LLM_MODEL: gemini-3.5-flash-lite`, and backend OpenAI-compatible endpoint with `${GEMINI_API_KEY}` from untracked `.env.demo`. Verified live model `models/gemini-3.5-flash-lite`. Bounded smoke test passed and recorded in `evidence/provider-smoke.json` (HTTP 200, output: "pong", 1.595s). No secrets committed. | **CLOSED** |
| **REV-P1-02** | BLOCKER | No explicit owner budget approval or hard-limit meter. | Owner approved budget in ChatGPT on 2026-10-21: max 200 calls, USD 5.00, 2h. Implemented `budget_guard.py` tracking call counts, estimated spend, and wall-clock time with deterministic test coverage. Hard stop before call 201; admission stop at USD 4.50; 2h deadline enforced. | **CLOSED** |
| **REV-P1-03** | HIGH | Isolation claim exceeded proven boundary (ports on `0.0.0.0:`). | Updated `docker-compose.isolated.yml` to bind all ports strictly to `127.0.0.1:` (`127.0.0.1:18080`, `127.0.0.1:14000`, `127.0.0.1:18000`, `127.0.0.1:25432`, `127.0.0.1:27018`). Verified with `docker ps`. Verified DB `p1_ephurin` and isolated volume ownership. | **CLOSED** |
| **REV-P1-04** | MEDIUM | Backend test count inconsistency (26 PASS vs 60 PASS). | Reconciled in documentation: the initial sub-suite targeted 26 tests, while the full targeted runner executed 60 tests (all 60 passed, 0 failed in `evidence/backend-targeted-tests.txt`). Updated `validation.json` with exact count and reconciliation note. | **CLOSED** |
| **REV-P1-05** | MEDIUM | Coverage overclaimed ("full suite" vs 42 deselected). | Documented exact selection: AI service pytest deselected 42 tests via `-m "not benchmark and not e2e"` markers; backend suite was targeted integration/unit suite, not complete system E2E regression. Clarified in `validation.json` and `REPORT.md`. | **CLOSED** |
| **REV-P1-06** | HIGH | Frozen gold was not materialized in run audit files. | Materialized 35 frozen narrative assertions (G01–G35) into `memory_items.csv` (SHA256: `e9e5bb778841bd4e5eb4a0444268a1acc01512860b8ace3c56332d61d5881d0b`). Created `evidence/gold_manifest.json` with 13 canon entities, 4 negative controls, and explicit alias rules before inspecting live extraction. | **CLOSED** |
| **REV-P1-07** | MEDIUM | Issue ledger missing entries (header only). | Appended `ISSUE-BUDGET-001`, `ISSUE-ENV-LINEEND-001`, and all 9 review findings (`REV-P1-01` through `REV-P1-09`) to `issues.csv` with complete metadata, repro steps, and status. | **CLOSED** |
| **REV-P1-08** | HIGH | Unsafe teardown instruction (`down -v`). | Blanket `docker compose down -v` is strictly prohibited. Added explicit warning and superseded teardown instructions in `NEXT_REVIEW.md`. Resources must be stopped safely (`docker compose stop`), preserving volumes for independent audit verification. | **CLOSED** |
| **REV-P1-09** | INFO | S01–S11 unexecuted preflight. | Maintained honest reporting that preflight stopped at the budget gate. Now progressing into live S01–S11 author workflow under the approved budget and verified stack. | **IN_PROGRESS (RESUMED)** |

---

## 2. Detailed Technical Evidence

### 2.1 Provider Configuration & Smoke Test (`REV-P1-01`)
- **Container Config:** `p1-live-01-ai-service` running `LLM_ENABLED: "true"`, `LLM_PROVIDER: gemini`, `LLM_MODEL: gemini-3.5-flash-lite`.
- **Backend Copilot Provider:** `p1-live-01-backend` reporting `http://127.0.0.1:14000/api/v1/ai/health` -> `ready: true`, model: `gemini-3.5-flash-lite`, provider: `openai-compatible`.
- **Live Call Trace:** Bounded smoke request via `google-genai` SDK:
  - Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`
  - HTTP Status: `200 OK`
  - Output: `pong` (duration: 1.595s)
  - Evidence File: `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/evidence/provider-smoke.json`

### 2.2 Budget Guard Metering (`REV-P1-02`)
- **Tool:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/budget_guard.py`
- **State File:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/budget_state.json`
- **Unit Test:** `python budget_guard.py test` -> `PASS`
- **Enforced Caps:**
  - Max calls: 200 attempts (hard stop before call 201)
  - Max cost: USD 5.00 (admission stop at USD 4.50)
  - Max wall-clock time: 7200 seconds (2 hours) from first provider call (`2026-10-21T03:47:52Z`)
  - Deadline: `2026-10-21T05:47:52Z`

### 2.3 Network Loopback Verification (`REV-P1-03`)
```text
NAMES                   STATUS                    PORTS
p1-live-01-web          Up                        127.0.0.1:18080->80/tcp
p1-live-01-backend      Up                        127.0.0.1:14000->4000/tcp
p1-live-01-ai-service   Up (healthy)              127.0.0.1:18000->8000/tcp
p1-live-01-mongodb      Up (healthy)              127.0.0.1:27018->27017/tcp
p1-live-01-postgres     Up (healthy)              127.0.0.1:25432->5432/tcp
```

### 2.4 Frozen Gold Materialization (`REV-P1-06`)
- `memory_items.csv`: 35 assertions (G01–G35) with hash `e9e5bb778841bd4e5eb4a0444268a1acc01512860b8ace3c56332d61d5881d0b`.
- `evidence/gold_manifest.json`: 13 canon entities, 4 negative controls, and alias rules established before observing model outputs.
