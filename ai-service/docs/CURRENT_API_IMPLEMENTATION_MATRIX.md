# Current API Implementation Matrix — Platform Gateway ↔ AI Service

**Source-inspected:** 2026-10-21 at `c01c83d3b3db234da17beeb91841bbcadae4f72b` on `codex/ai-copilot-pipeline-test`.  
**Classification:** `SOURCE_CODE` only. Presence in the router does not imply deployed environment, exact response compatibility, live UI flow, or successful E2E. Recheck when HEAD changes.  
**Behavioral authority:** [WORKFLOW_CONTRACT.md v1.4](../../Pipeline_test/WORKFLOW_CONTRACT.md).  
**Target design API:** [API_CONTRACTS.md](API_CONTRACTS.md) describes accepted API intentions and legacy compatibility, **not** an automatically verified endpoint list.

## 1. Route prefix and caller security

| Boundary | Prefix in source | Role |
|---|---|---|
| Node/Express Platform API | `${env.API_PREFIX}/ai` (runtime prefix comes from configuration; normally /api/v1) | Author-facing AI gateway; routes require authenticated `AUTHOR` or `ADMIN`, with novel ownership checks inside controllers/services |
| Node chapters | `${env.API_PREFIX}/chapters` | Author chapter, snapshot and revision operations |
| Node internal source read | `/internal/v1/revisions/:revisionId` | Server-to-server canonical revision provider, not a public write adapter |
| FastAPI narrative | `/v1` | AI service, service-token dependency for Narrative routes |
| FastAPI internal writing | `/internal/v1` | Internal model and job adapter, service-token dependency |

These prefix values are **not interchangeable**. Node gateway controllers may translate novel/brain IDs, revision payloads, errors and state before reaching FastAPI. Always trace route → controller → service → schema, not just compare names.

**Source:** `backend/src/app.ts`, `backend/src/modules/ai/ai-gateway.routes.ts`, `backend/src/modules/novels/chapters.routes.ts`, `ai-service/api/narrative_routes.py` lines around routers 83–84.

## 2. Grounded endpoint groups (route-level existence only)

| Workflow | Platform gateway route (relative to `/ai`) | AI service route (relative to `/v1`) | Notes |
|---|---|---|---|
| P1 bootstrap | `POST /story-brains/bootstrap/from-manuscript` | `POST /story-brains/bootstrap/from-manuscript` | Requires immutable revision manifest/hash; asynchronous job |
| P2 setup | `POST /story-brains/bootstrap/from-idea` | `POST /story-brains/bootstrap/from-idea` | `mode=extract` for supplied explicit setup is distinct from `mode=blueprint` |
| Review queue | `GET /story-brains/:novelId/review-queue` | `GET /story-brains/{brain_id}/review-queue` | Scope/ID mapping differs; requires verified ownership |
| Human review: guidance | `GET/POST /story-brains/:novelId/entity-guidance` | `GET/POST /story-brains/{brain_id}/entity-guidance` | Hints are not canonical |
| Human review: candidates | `GET /story-brains/:novelId/entity-reviews` | `GET /story-brains/{brain_id}/entity-reviews` | Machine decisions/candidate stage |
| Human review: decision | `POST /story-brains/:novelId/entity-reviews/:runId/review` | `POST /story-brains/{brain_id}/entity-reviews/{run_id}/review` | Records author decision; does not materialize event/fact canon |
| Human review: continue | `POST /story-brains/:novelId/entity-reviews/:runId/continue` | `POST /story-brains/{brain_id}/entity-reviews/{run_id}/continue` | Freeze `entities_reviewed`, then downstream event/fact |
| Author declaration | `POST /story-brains/:novelId/author-entities` | `POST /story-brains/{brain_id}/author-entities` | No fabricated occurrence/quote |
| Canon review | `POST /proposal-groups/:groupId/accept`, `POST /proposals/:proposalId/reject`, `POST /proposals/:proposalId/edit-and-accept` | `POST /proposal-groups/{group_id}/accept`, `POST /proposals/{proposal_id}/reject`, `POST /proposals/{proposal_id}/edit-and-accept` | Separate from entity review |
| Baseline activation | `POST /story-brains/:novelId/baseline/activate` | `POST /story-brains/{brain_id}/baseline/activate` | Must verify approved proposals/source |
| Job status/resume | `GET /jobs/:jobId`, `POST /jobs/:jobId/resume` | `GET /jobs/{job_id}`, `POST /jobs/{job_id}/resume` | Entity checkpoint and retry must be treated explicitly |
| Approved memory/context | `GET /story-brains/:novelId/memory`; `GET /story-brains/:storyBrainId/context-preview` | `GET /story-brains/{novel_id}/memory`; `GET /story-brains/{brain_id}/context-preview` | Preview != actual packed generation prompt |
| Writing generation | `POST /writing/generations` | `POST /writing/generations` | Generation draft is not a persisted chapter revision |
| Story plan | `POST /story-plans`, `GET /story-plans/by-novel/:novelId/active`, `POST /story-plans/:planId/activate`, `PATCH /story-plans/:planId/objectives/:objectiveId` | Analogous FastAPI plan endpoints under `/v1/story-plans` | Future plan ≠ occurred event |
| P3 controller | `POST /autonomous/runs`, `GET /autonomous/runs/:runId`, `POST /autonomous/runs/:runId/step`, `POST /autonomous/runs/:runId/run`, `POST /autonomous/runs/:runId/stop` | FastAPI job/plan/autonomous-run routes exist, but Node controller orchestrates workflow | Long-run 100k acceptance **not** inferred from endpoint existence |
| Chapter write | `PATCH /chapters/:chapterId`, `POST /chapters/:chapterId/revisions/snapshot`, `POST /chapters/:chapterId/revisions/accept-draft` | Canonical revision comes via internal provider | **P1 LIVE_UI must trigger author writes via browser, not direct calls in test harness** |

The table intentionally avoids asserting response schemas and status codes beyond source-inspected high-level route behavior. A working E2E must compare actual request/response bodies and job readback at the tested SHA.

## 3. Status, review and idempotency semantics

| Context | Token at source/contract | Interpretation |
|---|---|---|
| Revision analysis checkpoint | `waiting_entity_review` | Human must resolve occurrences; no event/fact materialization before freeze |
| Entity checkpoint state | `entities_reviewed` | Inventory frozen; still **not official canon** |
| P3 controller suspension | `waiting_for_entity_review` | Controller must retain objective and wait for author; no infinite generation retry/auto-approval |
| Async job delivery | `completed` / outbox `COMPLETED` | Only corresponding processing/delivery outcome; separately check downstream proposals/canon |
| Brain activated/versioned | `active`, `brain_version` | Readback/version guarantee, **not** proof that all facts are semantically correct |

**Source:** `ai-service/application/revision_analysis_service.py`, `ai-service/application/entity_review_service.py`, `ai-service/application/bootstrap_service.py`, `backend/src/modules/ai/autonomous-controller.service.ts`, `backend/src/jobs/outbox-processor.ts`. At runtime additionally check `Idempotency-Key`, tenant/novel ownership, revision/hash, stale-version rejection and migration compatibility.

## 4. What is not established by these route mappings

- Presence of the Human Entity Review routes does not prove the UI can finish S01–S11: historical S01 used writable APIs, S02 failed with live Gemini before offline prompt repair.
- Provider protection in `Pipeline_test/tools/budget_gateway.py` is a **test harness** until Wave 1D verifies all active model/embedding routes through a mandatory guarded path.
- `ai-service/docs/API_CONTRACTS.md` and `docs/API/ai-copilot-api.md` are useful design/subset references but must not be substituted for `Node app.ts → gateway.routes.ts → FastAPI narrative_routes.py` route trace.
- This table is **not** a generated OpenAPI diff or observed HTTP trace. API compatibility, UI wiring and payload-level conformance remain separate tests.

## 5. How to update

On each major pipeline code change, inspect route declarations, controllers, service schema, migration head and runtime config. Attach evidence SHA and explicit `SOURCE_CODE`/`AUTOMATED_TEST`/`LIVE_API`/`LIVE_UI` status to changed rows. Preserve older tested matrices as source-specific snapshots; never silently rewrite historical evidence.
