# AI Core Pipeline System Validation Report — AI-PIPE-01

**Execution Timestamp:** 2026-10-09T06:53:00Z  
**Branch:** `astra/ai-pipe-01-closed-loop-validation`  
**Base Commit SHA:** `528db04dd1121cbb8a34139c3cc7ae12d58ef712`  
**Live Evidence File:** `docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01-closed-loop-evidence.json`  
**Offline Evidence Validator:** `scripts/verify_ai_pipe_01_p1_closed_loop_evidence.py` $\to$ **PASS (0 errors, 7/7 negative self-tests pass)**  
**Gate Verdict:** `P1_STRUCTURAL_CLOSED_LOOP_PASS / P1_PRODUCTION_PERSISTENCE_LOCAL_PASS_CI_PENDING`

---

## 0. Evidence Scope Correction

The first AI-PIPE-01 run is a valuable **structural closed-loop** test, but it is not yet a production-shaped system test.

The preserved raw evidence file reports 15/15 logical checkpoints over:

- `FakeDeterministicLLMService`;
- `InMemoryNarrativeRepository`;
- a mutable in-memory revision provider.

Checkpoints 11-12 do **not** execute the real Node `acceptDraft()` service or write/query PostgreSQL. The harness applies the patch itself and constructs simulated revision/outbox records to verify contract shape. Therefore the raw evidence must not be interpreted as proof that a real `chapter_revisions` row or transactional outbox event was persisted.

Correct acceptance split:

```text
P1 structural/in-memory closed loop                  PASS
AI-service Story Brain feedback loop                 PASS
Node gateway request-shape tests                     PASS (mock fetch)
Real Node acceptDraft execution                      PASS (AI-PIPE-01A)
Real PostgreSQL chapter_revisions persistence        PASS (AI-PIPE-01A)
Real transactional outbox persistence/dispatch       PASS (AI-PIPE-01A)
Production-shaped API -> DB -> memory feedback loop  PASS (AI-PIPE-01A)
Browser/UI end-to-end                                PENDING_UI_REFACTOR (AI-PIPE-01B)
Gate AI-PIPE-01A Production Persistence Verdict     PASS
Gate AI-PIPE-01B Browser UI System E2E Verdict       PENDING_UI_REFACTOR
P1 overall system acceptance                         PENDING_AI_PIPE_01B
```

The raw evidence file (`ai-pipe-01-closed-loop-evidence.json`) is intentionally preserved unchanged as preliminary execution evidence. Production persistence evidence is recorded in `ai-pipe-01a-production-persistence.json`.

---

## 0A. Gate AI-PIPE-01A Production Persistence Execution & Verification

**Execution Timestamp:** 2026-10-09T07:44:00Z  
**Evidence Artifact:** `docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01a-production-persistence.json`  
**Runner:** `scripts/run_ai_pipe_01a_production_persistence.py`  
**Integration Test:** `backend/src/modules/novels/p1-production-persistence.postgres.test.ts`  
**Validator:** `scripts/verify_ai_pipe_01_p1_closed_loop_evidence.py`  
**Local Status:** **LOCAL_PASS_CI_PENDING** — 15/15 checkpoints, 0 failed, 5/5 integration subtests, 14/14 validator invariant tests locally. GitHub CI is the remote reproducibility gate.

### Architecture and Execution Scope
AI-PIPE-01A closed the gap between in-memory contract simulation and live production persistence:
- **Live Boundaries:** Real Node API (`:4000`), real AI Service (`:8000`), and real PostgreSQL 16 + pgvector (`:5432`).
- **No LLM Quota Spend:** AI Service ran in deterministic fake mode (`LLM_PROVIDER=fake`, `FakeDeterministicLLMService`).
- **Production Idempotency Hotfix:** Resolved in `backend/src/modules/novels/chapter-revisions.service.ts`: checked `findRevisionBySourceGenerationId` *prior* to `brain_version` check so retried requests for an accepted draft do not hit false `BRAIN_VERSION_CONFLICT`.

### 15 Checkpoint Results Summary

| Checkpoint | Scope | Verified Invariants / Artifacts | Status |
|---|---|---|---|
| **01** | Manuscript Import | Disposable novel & chapter created in PostgreSQL, raw text bootstrapped | **PASS** |
| **02** | Initial Analysis | AI service creates initial proposal queue (`PROPOSAL_QUEUE_POPULATED`) | **PASS** |
| **03** | Baseline Activation | Proposals resolved, baseline committed, Story Brain reaches version 2 | **PASS** |
| **04** | Writing Context Retrieval | Node GET `/api/v1/ai/novels/:id/context-preview` retrieves active brain entities/state | **PASS** |
| **05** | Assisted Generation | Node POST `/api/v1/ai/novels/:id/generate` generates deterministic patch draft | **PASS** |
| **06** | Deterministic Patch Schema | Patch structure `{start, end, replacement}` valid and matches base content | **PASS** |
| **07** | Author Draft Preview | Patch previewed over base revision without modifying canonical chapter | **PASS** |
| **08** | Canonical Accept Persistence | Node POST `/revisions/accept-draft` inserts `chapter_revisions` (`source_type='AI_DRAFT_ACCEPT'`) in PostgreSQL | **PASS** |
| **09** | Canonical Chapter Update | `chapters.latest_revision_id` points to new revision in PostgreSQL | **PASS** |
| **10** | Transactional Outbox | `revision_outbox_events` row persisted with `event_type='INCREMENTAL_ANALYSIS'` | **PASS** |
| **11** | Outbox Dispatch & Processing | Node Outbox Processor dispatches to AI Service; event reaches `COMPLETED` | **PASS** |
| **12** | Incremental Proposal Ingestion | AI Service creates incremental proposals for accepted patch | **PASS** |
| **13** | Story Brain Advancement | Incremental proposals resolved; Story Brain advances version 2 $\to$ 3 in PostgreSQL | **PASS** |
| **14** | Acceptance Idempotency | Re-accepting same generation returns existing revision without duplicate row | **PASS** |
| **15** | Author-Control Semantics | Unaccepted generation leaves canonical revision and Story Brain untouched | **PASS** |

### Gate AI-PIPE-01B Pending Scope
UI E2E automation remains intentionally deferred until the team completes the ongoing UI refactoring (`OUT_OF_SCOPE_FOR_CURRENT_UI`). Full `P1_OVERALL_SYSTEM_PASS` will be declared upon closure of AI-PIPE-01B.

---

## 1. Executive Summary & Pipeline Traceability Matrix

This audit executes the directive to validate the AI scope through **three core authoring pipelines** rather than disconnected feature sets.

### Pipeline Status Matrix

| Pipeline | Step / Checkpoint | Component Links & Artifacts | Status |
|---|---|---|---|
| **P1** | 1. Manuscript Fixture | 2-chapter disposable fixture with canon entities & rules | `IMPLEMENTED_AND_TESTED` |
| **P1** | 2. Import Manuscript | `web/manuscript-import-api.ts` $\to$ `POST /api/v1/ai/story-brains/bootstrap/from-manuscript` $\to$ `ManuscriptBootstrapService.start` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 3. Immutable Provenance | `narrative.revision_provenance` & `BootstrapRevision` chapter_number records | `IMPLEMENTED_AND_TESTED` |
| **P1** | 4. Extraction Proposals | `EntityPipeline`, `extract_narrative_events`, world rule regex $\to$ `narrative.proposals` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 5. Review & Accept | `review_queue` priority sort $\to$ `accept_proposal_group` materializes entities/rules/events | `IMPLEMENTED_AND_TESTED` |
| **P1** | 6. Story Brain Baseline | `activate_baseline` $\to$ sets `status="active"`, `brain_version >= 1`, `baseline_revision_id` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 7. Context Preview | `WritingService.preview_context` $\to$ chapter cutoff, token budget, context hash | `IMPLEMENTED_AND_TESTED` |
| **P1** | 8. Generation Start | `POST /api/v1/ai/writing/generations` $\to$ `WritingService.start_generation` (brain version pinned) | `IMPLEMENTED_AND_TESTED` |
| **P1** | 9. Generation Completion | `WritingService.process_generation` inline/polled $\to$ `status="completed"` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 10. Validations & Patch | Deterministic validators (`_validate_draft`) attach to job $\to$ `validation_status="passed"`, `patch` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 11. Accept Draft | AI-PIPE-01A executes the real Node accept-draft path against live services/PostgreSQL; CI reproduction pending | `LOCAL_PASS_CI_PENDING` |
| **P1** | 12. Persistence | AI-PIPE-01A verifies real PostgreSQL revision/latest pointer/outbox persistence; CI reproduction pending | `LOCAL_PASS_CI_PENDING` |
| **P1** | 13. Incremental Analysis | Outbox processor $\to$ `POST /v1/revisions/:id/analyses` $\to$ `RevisionAnalysisService.analyze` | `IMPLEMENTED_AND_TESTED` |
| **P1** | 14. Brain Update | Incremental proposals accepted $\to$ `brain_version` advances (e.g. $v_1 \to v_2$) | `IMPLEMENTED_AND_TESTED` |
| **P1** | 15. Memory Feedback | Next context preview/generation observes new brain version ($v_2 > v_1$) and updated context hash | `IMPLEMENTED_AND_TESTED` |
| **P2** | Idea/Outline Bootstrap | `POST /v1/story-brains/bootstrap/from-idea` documented in SRS but missing in route/controller | `MISSING` / `DOC_DRIFT` |
| **P2** | Initial Story Brain | Direct blueprint creation from premise/outline without manuscript import | `MISSING` |
| **P2** | Reuse P1 Writing Loop | Context preview, writing generation, validation, accept, and incremental update | `REUSABLE` (verified by P1) |
| **P3** | High-level Plan / Story Target | Target ending condition and narrative progress milestones | `MISSING` |
| **P3** | Autonomous Decision Loop | Controller replacing Author accept/regenerate loop | `MISSING` |
| **P3** | Progress Evaluator | Narrative completion / story convergence measurement | `MISSING` |
| **P3** | Completion Gate | Termination gate based on goal satisfaction (not merely max iterations) | `MISSING` |

---

## 2. Gate AI-PIPE-01 — P1 Executable Closed-Loop System Validation

### Test Harness & Execution Details

- **Test Suite:** `ai-service/tests/test_ai_pipe_01_p1_closed_loop.py`
- **Standalone Runner:** `scripts/run_ai_pipe_01_p1_closed_loop.py`
- **Offline Validator:** `scripts/verify_ai_pipe_01_p1_closed_loop_evidence.py`
- **Provider:** `FakeDeterministicLLMService` (`fake-p4-model`)
- **Routing Policy:** `legacy-v1`
- **Repository:** `InMemoryNarrativeRepository` (with parity to `PostgresNarrativeRepository`)
- **Total Checkpoints:** 15 / 15
- **Execution Time:** ~5.2 ms

### Checkpoint Verification Matrix

| # | Checkpoint | Logical Action & Contract Verified | Result |
|---|---|---|---|
| 01 | Manuscript Fixture | Disposable 2-chapter fixture initialized (`ch1`: origin/rules, `ch2`: continuation) | `PASS` |
| 02 | Bootstrap Import | `ManuscriptBootstrapService.start` + `process` executed to terminal `waiting_review` | `PASS` |
| 03 | Provenance | `get_revision_provenance` returns canonical chapter numbers (Ch 1 and Ch 2) | `PASS` |
| 04 | Narrative Extraction | Proposals created for `entity` (Tiêu Viêm, Hải Ba Đông), `fact` (Dị Hỏa rule), and `event` | `PASS` |
| 05 | Proposal Review | `review_queue` priorities verified; proposal groups accepted via `accept_proposal_group` | `PASS` |
| 06 | Brain Activation | `activate_baseline` establishes active Story Brain with `brain_version=2`, baseline revision recorded | `PASS` |
| 07 | Context Preview | Chapter 2 context preview packed; baseline context hash recorded: `9ee5101a...` | `PASS` |
| 08 | Generation Start | `WritingService.start_generation` called with pinned expected brain version (2) | `PASS` |
| 09 | Terminal Job Status | Writing generation job completes with `status="completed"` and `stage="completed"` | `PASS` |
| 10 | Validations Attached | Deterministic consistency validation attached; `validation_status="passed"`, valid patch | `PASS` |
| 11 | Author Accept | Canonical patch applied to Chapter 2; new content hash generated | `PASS` |
| 12 | Persistence Invariants | New revision with `source_type="AI_DRAFT_ACCEPT"`, `source_generation_id`, outbox event `INCREMENTAL_ANALYSIS` | `PASS` |
| 13 | Incremental Analysis | Outbox event dispatched; `RevisionAnalysisService.analyze` processes accepted revision | `PASS` |
| 14 | Story Brain Update | Incremental proposals accepted; Story Brain advances from version 2 to version 3 | `PASS` |
| 15 | Feedback Observation | Second preview/generation observes `brain_version=3 > 2` and context hash differs | `PASS` |

### Decisive P1 Acceptance Assertion

```text
IMPORT
 -> STORY BRAIN (v2)
 -> GENERATE (v2)
 -> ACCEPT
 -> PERSIST (AI_DRAFT_ACCEPT)
 -> INCREMENTAL MEMORY UPDATE
 -> NEXT GENERATION/CONTEXT OBSERVES UPDATED STATE (v3, context_hash updated)
```

**Verdict:** `P1_STRUCTURAL_CLOSED_LOOP_PASS`. AI-PIPE-01A is `LOCAL_PASS_CI_PENDING`; browser acceptance remains pending AI-PIPE-01B.

---

## 3. Gate AI-PIPE-02 — Traceability & Architectural Gap Analysis

### Required Traceability Questions

1. **Is there an application-facing endpoint/service that accepts an initial idea, premise or outline?**
   - **Finding:** Documented in `ai-service/docs/API_CONTRACTS.md` (`POST /v1/story-brains/bootstrap/from-idea`) and `USE_CASES.md`, but **MISSING** in `ai-service/api/narrative_routes.py` and `backend/src/modules/ai/ai-gateway.routes.ts`.
   - **Classification:** `DOC_DRIFT` / `MISSING`.

2. **Does it create canonical story structures or only free-form text?**
   - **Finding:** `POST /api/v1/ai/copilot/suggestions` produces free-form text suggestions, not structured canonical entity/rule/state models.

3. **Can it initialize a valid Story Brain without importing a pre-existing manuscript?**
   - **Finding:** No direct bootstrap adapter currently exists to construct an initial Story Brain directly from a prompt/blueprint without a manuscript revision.

4. **Can it create/associate the first canonical chapter/revision?**
   - **Finding:** Backend `chapters.service.ts` can create Chapter 1 (`createChapter`) and author snapshot (`createSnapshot`), but this is currently a manual author action rather than an integrated idea-bootstrap pipeline.

5. **Can the resulting project immediately enter the same context-preview/writing-generation/accept loop proven by P1?**
   - **Finding:** **YES.** Once an initial Story Brain is activated (with at least Chapter 1 baseline), the entire writing loop (`preview_context` $\to$ `start_generation` $\to$ `acceptDraft` $\to$ `INCREMENTAL_ANALYSIS` $\to$ `brain_version` bump) is 100% reusable without modification.

6. **Are author edits preserved before the next generation?**
   - **Finding:** **YES.** Stale revision checks (`baseRevision.contentHash !== generation.content_hash`) and MongoDB draft conditional reconciliation (`syncDraftFromRevisionConditional`) explicitly guard against overwriting author edits.

7. **Does the subsequent Story Brain update use the same revision-analysis pipeline rather than a parallel ad-hoc memory store?**
   - **Finding:** **YES.** Both manual author snapshots and accepted AI drafts emit the identical `INCREMENTAL_ANALYSIS` outbox event to `RevisionAnalysisService.analyze`.

### Smallest Missing P2 Adapter
```text
IDEA/OUTLINE -> CANONICAL STORY BRAIN BOOTSTRAP = MISSING
P1 ASSISTED WRITING LOOP = REUSABLE
```
Do **not** create a second parallel writing architecture for P2.

---

## 4. Gate AI-PIPE-03 — Autonomous Novel Writing Traceability & Gap Analysis

### Component Audit

- **High-level story plan:** `ai-service/docs/PRODUCT.md` references plot/act/chapter/scene planning as a future roadmap capability; no orchestrator exists.
- **Target ending / completion condition:** `MISSING`.
- **Autonomous controller:** `MISSING`. Currently, draft acceptance is strictly gated on author action (`POST /api/v1/chapters/:chapterId/revisions/accept-draft`).
- **Story-progress measurement:** `MISSING`.
- **Next-chapter scheduling:** `MISSING`.
- **Completion gate:** `MISSING`.

### Distinction
```text
LLM Generation Capability (`WritingService`) = IMPLEMENTED & QUALIFIED
!=
Autonomous Novel-Writing Pipeline (`P3 Controller`) = PARTIAL / MISSING ORCHESTRATOR
```

**Verdict:** `P3_ARCHITECTURAL_GAP_IDENTIFIED`. P3 cannot be marked PASS until an intentional progress controller and completion gate are implemented.

---

## 5. UI Policy and Status

- **Frontend API Alignment:** `web/src/features/manuscript-import/manuscript-import-api.ts` and `web/src/features/ai-copilot/ai-copilot-api.ts` strictly conform to the Node API gateway boundary (`P8-02 frontend/API cutover guard: PASS`).
- **Browser Automation:** `OUT_OF_SCOPE_FOR_CURRENT_UI` / `PENDING_LATE_GATE` pending the team UI refactor.
- **Backend/System Readiness:** Qualified through application API tests, unit suites, and offline evidence validator.
