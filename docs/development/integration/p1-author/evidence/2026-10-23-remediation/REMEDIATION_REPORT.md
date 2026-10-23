# Remediation Report & Acceptance Verification — PR #57 (2026-10-23)

**Branch:** `integration/p1-author`  
**Base Gate Document:** `docs/development/integration/p1-author/GPT6_NEXT_GATE_2026-10-23.md`  
**Tested Source Commit SHA:** `13eb5017bb13074cf958f4ff9ed6aa12c3bebc66`  
**Provider Egress Mode:** Strictly Offline (`LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=none`, external egress = 0)  

---

## 1. Executive Summary

In response to the acceptance gate review by GPT-6 on 2026-10-23:
1. **Workstream 1 (P0/P1 Generation Contract & P8 Root-Compose Execution):**
   - **Internal Revision DTO Alignment:** Updated `ai-service/api/narrative_routes.py` `get_internal_writing_generation` (route `GET /internal/v1/writing/generations/{generation_id}`) to expose `idempotency_key`, `tenant_id`, and `actor_id` sourced directly from `WritingGenerationJob`.
   - **Backend URL & Fail-Closed Authentication:** Corrected backend `chapter-revisions.service.ts` from invalid `/v1/writing-generations/...` to registered private route `/internal/v1/writing/generations/{generationId}` with service token headers (`X-Service-Token`, `X-Internal-Service`, `X-Actor-Id`, `X-Tenant-Id`).
   - **Contract Validations:** Implemented fail-closed assertions ensuring returned `job_id === input.generationId`, chapter ownership (`novel_id === chapter.novelId`, `chapter_id === chapter.id`), tenant/actor scope (`SYSTEM_TENANT_ID` or `auth.userId`), `status === 'completed'`, `validation_status === 'passed'`, and usable patch bounds.
   - **Story Brain Freshness Route:** Corrected conditional check to `/v1/story-brains/by-novel/{novelId}`.
   - **P3 Controller Durable Intent Key:** Aligned `autonomous-controller.service.ts` to generate durable intent key pattern `auto-${runId}-obj-${objectiveId}-intent-${intentVersion}-plan-${planVersion}-iter-${iteration}-try-${retry}` and patch execution pointers (`last_generation_id`, `current_objective_id`, `current_chapter_id`) before draft acceptance.
   - **Root-Compose Validation (`AI-PIPE-01A`):** Executed exact workflow script `python scripts/run_ai_pipe_01a_production_persistence.py` against live Docker Compose stack $\rightarrow$ **15/15 Checkpoints PASSED (0 FAILED)**, resolving the Checkpoint 07 failure.
   - **All Pipeline Runners Verified:** `AI-PIPE-01A` (15/15 PASS), `AI-PIPE-02A` (13/13 PASS), `AI-PIPE-02B` (16/16 PASS), `AI-PIPE-03A` (18/18 PASS + crash/resume probe).

2. **Workstream 2 (Truthful S09–S11 & G4 Smoke Partitioning):**
   - **Real `AuthorWritingIde` Full-Editor Browser Suite (`web/tests/author-ide.browser.test.mjs`):**
     - Added rapid Undo **B→A→B** before debounce with 0 unintended PATCH requests (<1200ms).
     - Added in-flight A→B serialization verification.
     - Added real browser reload (`page.reload()`) and separate route remount (`window.remount()`).
     - Added two-tab 409 conflict recovery with local buffer retention in `localStorage`.
     - Added server-authoritative readback confirming latest snapshot and outbox hashes.
     - Executed via Playwright on Microsoft Edge $\rightarrow$ **1/1 Suite PASS (16.96s)**.
   - **S10 Mocked UI vs Gateway Separation:**
     - Labeled browser fixture mock as `MOCKED_UI_PASS`.
     - Added dedicated offline Gateway→AI Service author operation consistency route (`POST /story-brains/{brain_id}/author-operation`) and test (`backend/src/modules/ai/p1-closed-loop-gateway.test.ts` & `ai-service/tests/test_author_operation_consistency.py`) $\rightarrow$ **OFFLINE_GATEWAY_PASS**.
   - **G4 Smoke Partitioning:**
     - Separated visited browser paths (`BROWSER_PASS`) from backend domain integration tests (`BACKEND_INTEGRATION_PASS`).

---

## 2. Workstream 1: Exact Test Results & Assertions

### A. Accept Draft Server-to-Server Contract (`accept-draft-contract.test.ts`)
Total: 14 test cases, **14/14 PASS**:
1. Verified call to authenticated `/internal/v1/writing/generations/{id}` with service token and headers.
2. 400 `NOVEL_MISMATCH` when generation novel does not match chapter novel.
3. 400 `CHAPTER_MISMATCH` when generation chapter does not match target chapter.
4. 403 `FORBIDDEN` when generation belongs to foreign tenant or actor.
5. 409 `GENERATION_NOT_COMPLETED` when status is not completed.
6. 422 `GENERATION_VALIDATION_FAILED` when validation_status is not passed.
7. 422 `INVALID_PATCH` when patch structure is missing or malformed.
8. 409 `BRAIN_VERSION_CONFLICT` when Story Brain has advanced beyond generation brain_version_used.
9. 404 `STORY_BRAIN_NOT_FOUND` when Story Brain route returns 404 and brain is required.
10. 409 `OBJECTIVE_INTENT_REQUIRED` when P3 controller key is malformed or legacy.
11. 409 `OBJECTIVE_INTENT_SUPERSEDED` when P3 controller intent changed or plan missing.
12. 404 `BASE_REVISION_NOT_FOUND` when base revision does not belong to chapter.
13. 409 `STALE_BASE_REVISION` when base revision is no longer current latest revision.
14. 409 `CONTENT_HASH_MISMATCH` when base revision content hash does not match generation.

### B. Gate AI-PIPE-01A Production Persistence Validation
Executed command: `python scripts/run_ai_pipe_01a_production_persistence.py`
- Checkpoint 01: Manuscript Fixture Persistence $\rightarrow$ **PASS**
- Checkpoint 02: Manuscript Bootstrap Processing $\rightarrow$ **PASS**
- Checkpoint 03: Proposal Review Resolution $\rightarrow$ **PASS**
- Checkpoint 04: Story Brain Activation & Persistence $\rightarrow$ **PASS**
- Checkpoint 05: Context Preview Retrieval $\rightarrow$ **PASS**
- Checkpoint 06: AI Writing Generation Completion $\rightarrow$ **PASS**
- Checkpoint 07: Draft Acceptance Gateway Call $\rightarrow$ **PASS** (Returned revisionId)
- Checkpoint 08: PostgreSQL chapter_revisions Persistence $\rightarrow$ **PASS**
- Checkpoint 09: PostgreSQL chapters Pointer Update $\rightarrow$ **PASS**
- Checkpoint 10: PostgreSQL Transactional Outbox Event $\rightarrow$ **PASS**
- Checkpoint 11: Outbox Processor Dispatch & Completion $\rightarrow$ **PASS**
- Checkpoint 12: Incremental Proposals & Story Brain Update $\rightarrow$ **PASS**
- Checkpoint 13: Second Generation Feedback Observation $\rightarrow$ **PASS**
- Checkpoint 14: Accept-Draft Idempotency Invariant $\rightarrow$ **PASS**
- Checkpoint 15: Author-Control Semantics $\rightarrow$ **PASS**
**Verdict: 15/15 Checkpoints PASSED, 0 FAILED.**

### C. Gate AI-PIPE-03A Autonomous Controller Validation
Executed command: `python scripts/run_ai_pipe_03a_autonomous_controller.py`
- Checkpoints 01 to 18 + Crash/Resume Probe $\rightarrow$ **18/18 CHECKPOINTS PASSED**.
- Negative Fail-Closed Mutant Verification $\rightarrow$ **13/13 mutants rejected cleanly**.

---

## 3. Workstream 2: Truthful S09–S11 Matrix & G4 Partitioning

### A. S09 Full-Editor Acceptance (Real `AuthorWritingIde`)
| Test Checkpoint | Invariant Verified | Result |
|---|---|---|
| **Rapid Undo B→A→B** | Revert within <1200ms dispatches 0 HTTP PATCH requests; editor settles at `B`; server draft readback = `B` | **PASS** |
| **In-Flight Serialization** | Prose `A` held in flight; prose `B` queued; `B` wins authoritatively | **PASS** |
| **Two-Tab 409 Conflict** | Remote tab commits version 2; local edit receives 409; localStorage retains local copy; server draft preserved | **PASS** |
| **Authoritative Readback** | Snapshot content hash strictly matches latest `chapter_revisions` and `revision_outbox_events` | **PASS** |

### B. S10 Consistency Check Partitioning
- **UI Interaction:** Labeled `MOCKED_UI_PASS` in `author-ide.browser.test.mjs`. Verified Mantine Drawer, "Sự kiện" tab, finding alert, and remediation workflow.
- **Backend/AI Service Consistency Flow:** Labeled `OFFLINE_GATEWAY_PASS`. Tested unintercepted `POST /story-brains/{brain_id}/author-operation` route with contradictory character status ("Trần Vân" marked alive in Story Brain vs prose stating dead) $\rightarrow$ Returns contradiction finding with quoted evidence.

### C. S11 Reload & Memory Continuity
- **Real Browser Reload (`page.reload()`):** Verified browser reload restores draft text without loss.
- **Route Remount (`window.remount()`):** Verified component unmount/remount preserves editor text and autosave sync.
- **Story Bible Modal:** Verified modal navigation through Characters, Relationships, Timeline, and Summaries tabs with zero console errors.

---

## 4. Evidence Files & Provenance

All remediation evidence has been saved under `docs/development/integration/p1-author/evidence/2026-10-23-remediation/`:
- `commands-and-exits.json`: Exact commands, exit codes, and commit SHA.
- `test-summary.json`: Aggregated metrics and status.
- `REMEDIATION_REPORT.md`: This comprehensive report.

No older traces or screenshots in `docs/development/PR-54-55-REVIEW/` or `evidence/` have been overwritten.

---

## 5. Stop Gate & Handoff

- **Target Working Branch:** `integration/p1-author` (PR #57).
- **PR Status:** Kept as Draft. No merge, deploy, or writes to `main`, `feat/author-workspace`, or `codex/ai-copilot-pipeline-test`.
- **Tested Commit SHA:** `13eb5017bb13074cf958f4ff9ed6aa12c3bebc66`.
- **Handoff:** Ready for independent review by GPT-6.
