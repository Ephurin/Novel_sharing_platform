# Source Matrix — P1 AI Writing Pipeline + Author Workspace Integration

**Target Branch:** `integration/p1-author`
**Bootstrap Commit:** `1a17211c21c1f43e3b0b44e0c99762b5680c903f`
**Author Workspace Base (PR #54 + #55 merged):** `3100c46f46cd071467d762dff4ffa1fc4efe07f2`
**Pipeline Source (codex/ai-copilot-pipeline-test):** `2279b41d2dcd90fb47a2c4886379510c6564fee5`
**Main Baseline:** `390b09fd043ec29db84519a9d195b59b76eec003`
**Date:** 2026-10-23 (Asia/Bangkok)
**Executor:** Gemini (Local Integration & Verification)
**Reviewer:** GPT-6

---

## 1. Source Inventory and Reconciliation Plan

| Surface / File Path | Pipeline Source (`2279b41d`) | Author Workspace (`3100c46f`) | Resolution Decision | Invariants & Rationales |
|---|---|---|---|---|
| `backend/src/modules/novels/chapter-writer.ts` | Advisory-lock writer lease (`withChapterWriter`), dedicated pool (max: 4) | Missing (replaced with PG row lock in service) | **PORT_FROM_PIPELINE** | Essential for serialized admission, cross-process writer lease, latest-revision guard. |
| `backend/src/modules/novels/controller-intent.ts` | Verifies intent epoch, run, actor, and idempotency key | Missing | **PORT_FROM_PIPELINE** | Preserves P3 intent fences and controller validation on draft acceptance. |
| `backend/src/modules/novels/controller-intent.test.ts` | Intent fence unit test suite | Missing | **PORT_FROM_PIPELINE** | Preserves test coverage for controller intent. |
| `backend/src/modules/novels/draft-read-authorization.test.ts` | Verifies anonymous (401), non-owner (403), owner (200) draft read | Missing | **PORT_FROM_PIPELINE** | Validates C01 security guard across route layers. |
| `backend/src/modules/novels/draft-chapters.repository.ts` | Mongo CAS with `version: expectedVersion`, retry-same-body idempotency, conditional revision sync | Stale CAS throws immediate 409, missing idempotent retry for same body/title | **COMPOSITE_MERGE** | Retain CAS and expectedVersion 0 bootstrap. Propose and apply D2 fix in `syncDraftUnderLease` (no-op on identical content/revision) to prevent spurious draft version bumping during auto-snapshot. Retain same-body lost response retry for semantic fields. |
| `backend/src/modules/novels/chapter-revisions.service.ts` | Automatic `snapshotSavedChapter` on active baseline, writer lease, deduplication guard, `assertControllerIntent` | Stripped auto-snapshot and writer lease; manual `createSnapshot` only | **COMPOSITE_MERGE** | Restore `snapshotSavedChapter`, `withChapterWriter` lease, revision deduplication on contentHash, and `assertControllerIntent`. |
| `backend/src/modules/novels/chapters.service.ts` | `withChapterWriter`, automatic snapshot, unversioned/optional schema | Required version (428 DRAFT_VERSION_REQUIRED), schedule cancellation, active account assertion, public reading filtering | **COMPOSITE_MERGE** | Combine `withChapterWriter` admission lease and `snapshotSavedChapter` with Author Workspace's required expectedVersion 428 check, schedule cancellation on draft change, and active account guard. Return authoritative draft and `draftVersion` after auto-snapshot. |
| `backend/src/modules/novels/chapters.routes.ts` | Basic auth/role guard | `requireActiveAccount` guard, schedule/lifecycle routes | **PRESERVE_AUTHOR** | Author routes already enforce C01/C02 (401 anonymous, 403 inactive/non-owner). |
| `backend/src/modules/novels/chapters.controller.ts` | Owner assertion in controller | Owner + active account assertions | **PRESERVE_AUTHOR** | Preserves schedule metadata in response. |
| `backend/src/modules/ai/ai-gateway.routes.ts` | Story Brain endpoints (memory, entity-guidance, author-entities, entity-reviews, author-proposals, reanalyse, extraction-status, author-operation, event corrections), job resume | Basic AI gateway routes only | **COMPOSITE_MERGE** | Restore Story Brain and job resume endpoints while preserving active account authorization. |
| `backend/src/modules/ai/ai-gateway.controller.ts` | Trusted UUID scope job authorization (`getAuthorizedJob`), job resume, entity review/continue controllers | Simpler job status check without UUID regex fence | **COMPOSITE_MERGE** | Port trusted UUID scope check (`getAuthorizedJob`), `resumeJobController`, and Story Brain controllers. |
| `ai-service/migrations/versions/0010_...` to `0013_objective_intent.py` | 4 Alembic migrations (0010-0013) for fact supersession, candidate audit, entity guidance, objective intent | Stops at `0009_autonomous_runs.py` | **PORT_FROM_PIPELINE** | Essential for AI Alembic schema parity and intent fence support. |
| `backend/src/core/database/migrations/001_...017` | Has 001-011 and 012_reports_unique_open.sql | Has 001-011, 012_novel_engagement.sql, 013-017 | **PRESERVE_AND_UNION** | Union contains both 012 files and all 013-017 migrations. Already present on `integration/p1-author`. |
| `web/src/features/author-ide/useDraftPersistence.ts` | Inline editor persistence on pipeline (defective ABA revert) | Robust hook with 1200ms debounce, per-account scoping, serial in-flight, 409 conflict buffer, local backup | **PRESERVE_AUTHOR** | Preserves modern hook that already clears debounce timer on rapid B->A->B revert. |
| `web/src/features/author-ide/AuthorWritingIde.tsx` | Old pipeline writing editor | Modern Author IDE with docked AI Assistant, Story Bible, format toolbar, schedule modal, revision modal | **PRESERVE_AUTHOR** | Fully integrated with `useDraftPersistence`. |
| `web/src/features/ai-copilot/EntityExtractionReview.tsx` | Full human review component for entity extraction | Missing | **PORT_FROM_PIPELINE** | Restores P1 HITL entity review interface. |
| `web/src/features/ai-copilot/AuthorMemoryPanel.tsx` | Author memory panel and P2 setup | Missing | **PORT_FROM_PIPELINE** | Restores P2 setup and official memory review. |
| `web/src/features/ai-copilot/AuthorMemoryRepair.tsx` | Memory repair UI | Missing | **PORT_FROM_PIPELINE** | Restores memory inspection and correction UI. |
| `web/src/features/ai-copilot/author-memory-api.ts` | Memory API client | Missing | **PORT_FROM_PIPELINE** | API client for memory panel and repair. |
