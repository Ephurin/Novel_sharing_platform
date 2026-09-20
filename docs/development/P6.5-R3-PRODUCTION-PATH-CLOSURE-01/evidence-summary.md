# Evidence Summary: P6.5-R3-PRODUCTION-PATH-CLOSURE-01

This directory contains concrete production-path verification logs and integration evidence for the four P1 blockers and final closure of Phase 6.5.

## 1. Evidence Artifact Index

| Artifact File | Description | Execution Status |
| :--- | :--- | :--- |
| `postgres-integration.log` | Real PostgreSQL 18 integration tests covering Alembic clean DB $\to$ head, `RevisionProvenanceRecord` CRUD, multi-tenant isolation, row locking, and Chapter 25 event/state isolation from Chapter 5. | **10 passed in 1.54s** |
| `backend-integration.log` | Node Gateway test suite, outbox lease concurrency, crashed-worker stale processing recovery, MongoDB draft reconciliation, and TypeScript typecheck. | **20 passed, typecheck clean** |
| `service-auth.log` | Service-token authentication boundary enforcement on `/v1/enhanced/*` (`/kb/*`, `/relation/override`, `/process-interactions`), `/v1/story-brains/*`, `/v1/ai/*`, and `/suggest-next`. | **Passed (401/403/200)** |
| `compose-smoke.log` | Live service smoke test on PostgreSQL (v18.4), MongoDB (27017), AI Service public `/health`, unauthenticated rejection, authenticated Gateway access, and outbox invariants. | **All smoke tests passed** |
| `frontend-build.log` | Production build (`vite build`) and typecheck (`tsc -b`) of `web/` application. | **Built in 11.26s, typecheck 0 errors** |

---

## 2. Blocker Root Causes and Resolutions

### Blocker 1: PostgreSQL `RevisionProvenanceRecord` Broken at ORM/Schema Level
- **Production Root Cause**:
  `RevisionProvenanceRecord` in `ai-service/infrastructure/orm_models.py` lacked the `revision_id` column and unique constraint `uq_rev_provenance_revision`. When inserting, `story_brain_id` (a `nullable=False` foreign key) was omitted. Migration `0005` created the table from the incomplete model.
- **Resolution**:
  - Added `revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)` and `UniqueConstraint("tenant_id", "novel_id", "revision_id", name="uq_rev_provenance_revision")` to `RevisionProvenanceRecord`.
  - Added migration `0006_fix_revision_provenance.py` adding `revision_id` and unique constraint `uq_rev_provenance_revision`.
  - Updated `create_bootstrap_job` and `record_revision_provenance` in `postgres_narrative_repository.py` to always resolve and pass `story_brain_id=brain.id`.
  - Added repository method `get_revision_provenance`.
  - Executed clean Alembic migration to head: `0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006_fix_revision_provenance`.
- **Evidence**: `docs/development/P6.5-R3-PRODUCTION-PATH-CLOSURE-01/postgres-integration.log`

---

### Blocker 2: Canonical Event & State Temporal Provenance Leakage
- **Production Root Cause**:
  `RevisionAnalysisService` called `extract_narrative_events` without passing canonical `revision.chapter_number`, causing event extraction to default to `chapter_num = 1`. During proposal acceptance, `EventRecord` was created with `int(payload.get("chapter", 1))` rather than deriving chapter from trusted revision provenance. Consequently, incremental chapter 25 events were materialized as chapter 1 events, causing future events and resulting state transitions to leak into past-chapter projections.
- **Resolution**:
  - `RevisionAnalysisService.analyze_revision` now passes `chapter_num=chapter_number` to `extract_narrative_events`.
  - Event proposal payload and evidence carry canonical `chapter_number` and `chapter_id`.
  - In `accept_proposal_group` (both PostgreSQL and in-memory repositories), event chapter is derived from trusted `RevisionProvenanceRecord` matching `evidence.revision_id`, falling back to `evidence["chapter_number"]` or payload, never blindly trusting LLM payload alone.
  - State projection queries strictly filter active events by `EventRecord.chapter_number <= requested_chapter` and transitions by `event_id.in_(active_event_uuids)`.
- **Evidence**: `docs/development/P6.5-R3-PRODUCTION-PATH-CLOSURE-01/postgres-integration.log` (`test_chapter_25_event_and_state_isolation_from_chapter_5`)

---

### Blocker 3: Service-Auth Boundary Missing on `/v1/enhanced`
- **Production Root Cause**:
  `api/interactions.py` router `APIRouter(prefix="/v1/enhanced")` was mounted without `dependencies=[Depends(require_service_token)]`, allowing direct unauthenticated bypass to `/v1/enhanced/kb/{story_id}` and `/v1/enhanced/relation/override`.
- **Resolution**:
  - Mounted `dependencies=[Depends(require_service_token)]` on `APIRouter(prefix="/v1/enhanced")`.
  - Any request without `PLATFORM_SERVICE_TOKEN` returns HTTP 401 `SERVICE_AUTH_REQUIRED`.
  - Any request with invalid token returns HTTP 403 `SERVICE_AUTH_INVALID`.
  - Only requests with valid service token pass the boundary. Public `/health` endpoint remains accessible.
- **Evidence**: `docs/development/P6.5-R3-PRODUCTION-PATH-CLOSURE-01/service-auth.log`

---

### Blocker 4: Outbox Claim Double-Processing Concurrency
- **Production Root Cause**:
  `claimPendingOutboxEvents` queried `status in ('PENDING', 'PROCESSING') FOR UPDATE SKIP LOCKED` and immediately committed the transaction. Once committed, row locks were released, allowing a second worker to claim the active `PROCESSING` event and cause double-processing.
- **Resolution**:
  - Refactored `claimPendingOutboxEvents` and `fetchPendingOutboxEvents` to implement true DB lease semantics:
    - Select rows where:
      `(status = 'PENDING' AND next_retry_at <= now()) OR (status = 'PROCESSING' AND updated_at <= now() - interval '300 seconds')`.
      `LIMIT $1 FOR UPDATE SKIP LOCKED`.
    - Atomically update claimed rows: `SET status = 'PROCESSING', updated_at = now()`.
  - Invariant maintained: One active lease per event. Two concurrent workers never process the same active event. Crashed worker events are safely reclaimed after 300s lease timeout.
- **Evidence**: `docs/development/P6.5-R3-PRODUCTION-PATH-CLOSURE-01/backend-integration.log`

---

### Consistency & Freshness Semantics Declaration
- **Semantics**: `fail-closed availability + best-effort freshness`.
  - When Story Brain is unreachable during accept, the Platform fails closed with HTTP 503 (`AI_SERVICE_UNAVAILABLE`).
  - If Story Brain version has bumped since generation creation, the Platform fails closed with HTTP 409 (`BRAIN_VERSION_CONFLICT`).
  - Cross-service atomic distributed transactions (e.g. 2PC across PostgreSQL and AI storage) are explicitly acknowledged as out of scope for MVP.
