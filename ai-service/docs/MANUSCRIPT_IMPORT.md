# Manuscript Import — Phase 5

## Scope

Phase 5 imports an existing manuscript from immutable Platform revisions into a Story Brain. The AI service verifies every content hash before accepting the job and never stores an uploaded document as its source of truth.

## Flow

1. The client sends ordered `chapter_id`, `revision_id`, and `content_hash` values to `POST /v1/story-brains/bootstrap/from-manuscript`.
2. The service preflights the revision list through `RevisionContentProvider`. The default limits are 100 chapters and 2,000,000 Unicode characters.
3. A deterministic job ID makes an identical request idempotent. PostgreSQL stores its revision list, stage, progress, result, and error.
4. The worker analyzes one chapter at a time. It saves a completed checkpoint after each chapter, so `POST /v1/jobs/{job_id}/resume` skips completed work after a worker restart.
5. Blank lines and scene markers split chapter content into deterministic scene units for progress metadata. Each immutable revision remains the analysis and evidence boundary.
6. Explicit lines beginning with `Luật:`, `Quy tắc:`, `Rule:`, or `World rule:` become `world_rule` facts with source spans. Entity, event, and state proposals use the existing revision analysis pipeline.
7. `GET /v1/story-brains/{brain_id}/review-queue` orders duplicate or ambiguous entities first, then world rules/facts, state changes, low-confidence items, and normal review items.
8. Baseline activation returns `409 BASELINE_REVIEW_REQUIRED` while any required proposal remains pending. After review, `POST /v1/story-brains/{brain_id}/baseline/activate` stores the final revision and changes the Story Brain from `importing` to `active`.

## Entity resolution and merge

Repeated normalized names materialize as one canonical entity across chapter proposal groups. Accent-insensitive resolution keys expose likely duplicates in the review summary. Authors can merge confirmed duplicates through `POST /v1/story-brains/{brain_id}/entities/merge` with `expected_brain_version`.

The merge runs in one transaction. It transfers aliases, mentions, event participants, transitions, facts, relationship names, and projected state to the target entity. Existing aliases and mentions are deduplicated. A stale brain version returns `409 BRAIN_VERSION_CONFLICT`.

## Recovery

- A failed job keeps completed chapter checkpoints and its error payload.
- Resume changes a failed job back to `queued` and continues at the first incomplete revision.
- Revision analysis uses a job-and-revision idempotency key, so a retry returns the existing analysis run and proposal IDs.
- Alias IDs are deterministic by entity plus normalized alias, preventing retry growth.
- A completed or review-stage job can be queried safely without reprocessing.

## Frontend

The author projects screen links to `/author/import/:novelId`. The import page accepts the immutable revision manifest, polls job progress, groups review items by dependency group, supports group acceptance and individual rejection, and enables baseline activation only after the queue is empty.

Configure the browser client with:

```env
VITE_AI_SERVICE_BASE_URL=http://127.0.0.1:8000/v1
VITE_AI_TENANT_ID=00000000-0000-0000-0000-000000000001
```

## Verification

```powershell
cd ai-service
python -m pytest -q
docker-compose --profile test run --build --rm integration-test

cd ..\web
npm.cmd ci
npm.cmd run build
```

The Phase 5 verification on 2026-09-17 passed 104 local Python tests, 8 PostgreSQL integration tests, the production frontend build, and a live two-chapter HTTP smoke flow against Docker Compose.
