# Gemini Independent Runtime Reproduction Report

**Date:** 2026-10-22 (Asia/Bangkok)  
**Executor:** GEMINI_EXECUTOR  
**Host Environment:** Windows 11, Python 3.11.9, Node v24.19.0, Docker version 29.7.2  
**Source SHA Tested:** `3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99` (Git clean at start: yes)  
**Evidence Target:** `Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/`  

---

## 1. Isolation & Network Allocation

Per the contract, historical Docker volumes, databases, ledgers, and networks were completely preserved. No historical resources were reset or deleted.
Because Docker network allocation on Windows had exhausted the default `10.241.*` pool (198 used subnets), Gemini employed `Pipeline_test/reviews/2026-10-22-p123-headless/post-accept/prepare_additional.py` to identify verified-unused subnet triples in `10.242.*`:

- **Project 1 (`p123-core-409292495f`):**
  - Edge Subnet: `10.242.16.0/24`
  - Upstream Subnet: `10.242.17.0/24`
  - Worker Subnet: `10.242.18.0/24`
  - Manifest: [`test-pre_progress-skip-env.json`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/test-pre_progress-skip-env.json)
- **Project 2 (`p123-core-d9e6589593`):**
  - Edge Subnet: `10.242.19.0/24`
  - Upstream Subnet: `10.242.20.0/24`
  - Worker Subnet: `10.242.21.0/24`
  - Manifest: [`test-pre_approval-stop-env.json`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/test-pre_approval-stop-env.json)

Both projects ran completely isolated from each other and from Codex's earlier stopped projects.

---

## 2. Independent Scenarios Executed

### Scenario A — `repro-pre_progress-skip`
- **Seam:** `pre_progress` (paused immediately after chapter draft accept is committed, before marking objective completed)
- **Action:** Author `skip` objective (`PATCH /ai/story-plans/:plan/objectives/:objective` with `status: 'skipped'`)
- **Key Invariants Verified:**
  1. `accepted_history_already_committed`: Accepted `AI_DRAFT_ACCEPT` revision is committed to PG and retained in history.
  2. `post_cancel_no_canon_or_completed_overwrite`: Autonomous loop resume receives `409 OBJECTIVE_INTENT_SUPERSEDED` and cannot mark the objective completed or overwrite the author's decision.
  3. `single_analysis_outbox`: Outbox events remain bounded and idempotent.
  4. `restart_retains_memory`: Memory state survives restart.
- **Results:** 7 checks evaluated, **7 PASS**, 0 FAIL, 0 external provider calls.
- **Artifacts:** Recorded in [`repro-pre_progress-skip/validation.json`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/repro-pre_progress-skip/validation.json).

### Scenario B — `repro-pre_approval-stop`
- **Seam:** `pre_approval` (paused after generation is ready for proposal group review, before controller approval)
- **Action:** Author `stop` autonomous run (`POST /ai/autonomous/runs/:id/stop` with simulated author reason)
- **Key Invariants Verified:**
  1. `entity_review_not_canon`: Proposals remain un-materialized in canon.
  2. `post_cancel_no_canon_or_completed_overwrite`: Controller's attempt to auto-advance proposals fails closed with `409 OBJECTIVE_INTENT_SUPERSEDED`.
  3. `restart_retains_memory`: Authoritative run status reflects `stopped`.
- **Results:** 7 checks evaluated, **7 PASS**, 0 FAIL, 0 external provider calls.
- **Artifacts:** Recorded in [`repro-pre_approval-stop/validation.json`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/repro-pre_approval-stop/validation.json).

### Scenario C — Offline Regression Suites (`focused-regressions`)
- **Runner:** `Pipeline_test/tools/run_p123_regressions.py`
- **AI Service Pytest:**
  - 13 test modules: context budget, routing, scope, bootstrap, entity review, revision analysis, cutoff provenance, repository contract, canon reconciliation, state projection, autonomous routes, generation contract, controller intent context.
  - Results: **166 passed, 2 skipped** (SQL tenant boundary live-PG skip), exit code 0.
  - Egress guard active: all non-loopback DNS resolutions denied.
- **Backend Typecheck:**
  - `npm.cmd run typecheck` (`tsc -p tsconfig.json --noEmit`)
  - Results: **0 type errors**, exit code 0.
- **Backend Focused Unit Suite:**
  - 5 test suites, 44 unit tests: `controller-intent.test.ts`, `chapter-revisions.test.ts`, `outbox.test.ts`, `ai-gateway.test.ts`, `p1-closed-loop-gateway.test.ts`, `autonomous-controller.test.ts`, `autonomous-memory.test.ts`.
  - Results: **44 passed, 0 failed**, exit code 0.
- **Artifacts:** Recorded in [`focused-regressions/validation.json`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/focused-regressions/validation.json).

---

## 3. Summary of Reproduction Results

| Test Target | Runner / Project | Exit Code | Verified Verdict | External Provider Egress |
|---|---|---|---|---|
| `pre_progress-skip` | `run_p3_post_accept.py` / `p123-core-409292495f` | 0 | **PASS (7/7)** | 0 calls |
| `pre_approval-stop` | `run_p3_post_accept.py` / `p123-core-d9e6589593` | 0 | **PASS (7/7)** | 0 calls |
| AI Service Unit Tests | `pytest` (13 suites, DNS guard) | 0 | **PASS (166 pass, 2 skip)** | 0 calls |
| Backend Typecheck | `tsc --noEmit` | 0 | **PASS (0 errors)** | 0 calls |
| Backend Focused Unit | `node --test` (7 modules) | 0 | **PASS (44 pass)** | 0 calls |

All executed scenarios cleanly passed against fresh, isolated resources. Zero defects or regressions were discovered.
