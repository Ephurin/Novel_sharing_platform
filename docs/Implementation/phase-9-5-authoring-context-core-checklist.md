# Phase 9.5 - Authoring Context Core Checklist

Phase 9.5 implements the non-AI authoring context system: characters/entities, character relationships, story timeline events, and plot summaries.

These features are not merely AI context. They are Author-facing story management tools. Writing Copilot may use them later, but Phase 9.5 must work without any LLM/AI service.

## 1. Scope

Implement persistent backend APIs and frontend UI for:

- `character_profiles`
- `character_relationships`
- `story_timeline_events`
- `plot_summaries`

Context proposal and AI-generated updates remain deferred until AI/Copilot phase.

## 2. References

- `docs/SRS/novel-chapter-service.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/enums-and-indexes.md`
- `docs/API/novel-chapter-api.md`
- `docs/Frontend/sitemap.md`
- `docs/Frontend/wireframes-web.md`
- `docs/Frontend/screen-specs.md`
- `docs/Frontend/api-screen-matrix.md`
- `docs/Backend/module-structure.md`

## 3. Business Rules

- Novel & Chapter Service owns official authoring context data.
- Author can manually create/update/delete context records for their own novels.
- Admin can inspect or edit if existing admin rules allow content ownership override.
- Reader/public users cannot access unpublished authoring context.
- AI/Copilot cannot directly mutate official context in this phase.
- Each official context record must preserve source metadata where supported:
  - `AUTHOR_MANUAL`
  - future `AI_COPILOT_APPROVED`
- UI must not expose raw database IDs as normal user-facing labels.

## 4. Backend Deliverables

### 4.1 Database Migration

- [x] Add PostgreSQL migration for `character_profiles` if not already implemented in backend migrations.
- [x] Add PostgreSQL migration for `character_relationships` if not already implemented.
- [x] Add PostgreSQL migration for `story_timeline_events` if not already implemented.
- [x] Add PostgreSQL migration for `plot_summaries` if not already implemented.
- [x] Add enum/type migration for:
  - context source;
  - plot summary scope;
  - optional relationship type/status if required by database docs.
- [x] Add indexes defined or implied by `docs/Database/enums-and-indexes.md`.
- [x] Ensure all tables link to `novels.novel_id`.
- [x] Ensure deleted context records use soft delete where appropriate.

### 4.2 Module Structure

- [x] Add `backend/src/modules/story-context/`.
- [x] Add `story-context.schemas.ts`.
- [x] Add `story-context.repository.ts`.
- [x] Add `story-context.service.ts`.
- [x] Add `story-context.controller.ts`.
- [x] Add `story-context.routes.ts`.
- [x] Register routes in `backend/src/app.ts`.

### 4.3 Character Profiles API

Implement documented API contract from `docs/API/novel-chapter-api.md`.

- [x] `GET /api/v1/novels/:novelId/characters`
- [x] `POST /api/v1/novels/:novelId/characters`
- [x] `PATCH /api/v1/characters/:characterId`
- [x] `DELETE /api/v1/characters/:characterId`

Minimum fields:

- `characterId`
- `novelId`
- `name`
- `role`
- `description`
- `personality`
- `notes`
- `source`
- `createdAt`
- `updatedAt`

Note: `aliases` and `goals` are not present in `docs/Database/postgresql-schema.md` or migration `008_authoring_context.sql`; they are deferred unless the database model is expanded later.

Review checks:

- [x] Author can list own novel characters.
- [x] Author can create a character.
- [x] Author can update character name/details.
- [x] Author can delete/archive a character.
- [x] Non-owner author receives `CONTENT_005`.
- [x] Unauthenticated request receives auth error.

### 4.4 Character Relationships API

If relationship endpoints are not yet documented in detail, implement as part of character profile operations or add explicit endpoints before coding.

Recommended MVP endpoints:

- [x] `GET /api/v1/novels/:novelId/character-relationships`
- [x] `POST /api/v1/novels/:novelId/character-relationships`
- [x] `PATCH /api/v1/character-relationships/:relationshipId`
- [x] `DELETE /api/v1/character-relationships/:relationshipId`

Minimum fields:

- `relationshipId`
- `novelId`
- `sourceCharacterId`
- `targetCharacterId`
- `relationshipType`
- `description`

Note: `status` and `source` are not present on `character_relationships` in the current PostgreSQL schema; MVP relationship records use type + description.

Review checks:

- [x] Relationship requires both characters to belong to the same novel.
- [x] Relationship appears in the selected character detail panel.
- [x] Deleting a character handles or hides related relationships safely.

### 4.5 Timeline Events API

Implement documented API contract from `docs/API/novel-chapter-api.md`.

- [x] `GET /api/v1/novels/:novelId/timeline-events`
- [x] `POST /api/v1/novels/:novelId/timeline-events`
- [x] `PATCH /api/v1/timeline-events/:eventId`
- [x] `DELETE /api/v1/timeline-events/:eventId`

Minimum fields:

- `eventId`
- `novelId`
- `title`
- `eventOrder`
- `chapterId`
- `chapterNumber`
- `chapterTitle`
- `summary`
- `source`
- `createdAt`
- `updatedAt`

Note: timeline `characters` and `arcName` require additional schema support; current MVP follows `story_timeline_events` in PostgreSQL.

Review checks:

- [x] Timeline lists events ordered by `eventOrder`, then chapter number if present.
- [x] Author can link event to a chapter.
- [ ] Author can link event to one or more characters. Deferred until a timeline-character join table is added.
- [ ] Event list can filter by arc/chapter/character if implemented. Deferred; current MVP lists all ordered events.

### 4.6 Plot Summaries API

Implement documented API contract from `docs/API/novel-chapter-api.md`.

Recommended endpoints:

- [x] `GET /api/v1/novels/:novelId/plot-summaries`
- [x] `POST /api/v1/novels/:novelId/plot-summaries`
- [x] `PATCH /api/v1/plot-summaries/:summaryId`
- [x] `DELETE /api/v1/plot-summaries/:summaryId`

Minimum fields:

- `summaryId`
- `novelId`
- `scope`
- `arcName`
- `chapterId`
- `startChapterNumber`
- `endChapterNumber`
- `summary`
- `source`
- `createdAt`
- `updatedAt`

Review checks:

- [x] Novel-level summary can be created/updated.
- [x] Arc-level summary can be created/updated.
- [x] Chapter-level summary can be created/updated.
- [x] Current official summary uniqueness follows `docs/Database/enums-and-indexes.md`.

### 4.7 Authorization and Validation

- [x] All write endpoints require `AUTHOR` or `ADMIN`.
- [x] Read endpoints require novel ownership for draft/private novels.
- [x] Validate UUID route params.
- [x] Validate required body fields with Zod.
- [x] Return API envelope format from `docs/API/conventions.md`.
- [x] Reuse existing error codes where possible:
  - `CONTENT_001`
  - `CONTENT_004`
  - `CONTENT_005`
  - `VALIDATION_001`

## 5. Frontend Deliverables

### 5.1 API Client

- [x] Add `web/src/features/story-context/story-context-api.ts`.
- [x] Add `web/src/features/story-context/story-context-types.ts`.
- [x] Add React Query keys for:
  - characters;
  - relationships;
  - timeline events;
  - plot summaries.

### 5.2 Author Context Page

Update `web/src/features/story-context/AuthorStoryContextPage.tsx`.

- [x] Replace local mock state with API-backed queries/mutations.
- [x] Keep local form state only for editing drafts before save.
- [x] Add loading states.
- [x] Add error states.
- [x] Add empty states.
- [x] Add save/create/delete toasts or notices.
- [x] Keep raw IDs hidden from normal labels.

Tabs:

- [x] Characters & Entities
- [x] Relationships
- [x] Story Timeline
- [x] Plot Summaries

### 5.3 Author IDE Integration

Update `web/src/app/layout/AuthorIdeShell.tsx`.

- [x] Entities activity lists real character/entity data.
- [x] Timeline activity lists real timeline events.
- [x] Knowledge Graph activity can remain simplified, but should use real character/relationship/timeline records if available.
- [x] Right context panel can show loaded context chips from real data.
- [x] AI buttons remain disabled until AI/Copilot phase.

### 5.4 Navigation

- [x] `/author/context/:novelId` remains the main full-page context manager.
- [x] Project metadata page links to context manager.
- [x] Author IDE links to context manager for the current novel.
- [x] Reloading context page keeps data because it is API-backed.

## 6. Postman / Manual API Review

Create `docs/API/postman/phase-9-5-authoring-context.postman_collection.json`.

- [x] Collection created at `docs/API/postman/phase-9-5-authoring-context.postman_collection.json`.

Seed sample context data after migrations:

- [x] Run `backend/src/core/database/seeds/phase-9-5-authoring-context-sample.sql`.
- [x] Verify it seeds context for `Ashenhold - Sample Story`.
- [x] Verify it seeds context for `Thanh Van Sword Path - Sample Story`.
- [x] Confirm the seed is idempotent by running it twice and checking duplicate records are not created.

Minimum cases:

1. [x] Login as `AUTHOR`.
2. [x] Create novel or reuse existing author novel.
3. [x] Create character.
4. [x] List characters.
5. [x] Update character.
6. [x] Create second character.
7. [x] Create relationship.
8. [x] List relationships.
9. [x] Create timeline event linked to chapter.
10. [x] List timeline events ordered correctly.
11. [x] Create novel-level plot summary.
12. [x] Create arc-level plot summary.
13. [x] Create chapter-level plot summary.
14. [x] Verify unauthorized role cannot read target records.
15. [x] Delete/archive created context records.

## 7. Frontend Review

Manual review checklist:

- [ ] Open `/author`.
- [ ] Open a project.
- [ ] Open Context Manager.
- [ ] Create character and reload page; character remains.
- [ ] Create relationship and verify it appears in character detail.
- [ ] Create timeline event and verify order.
- [ ] Create plot summary and verify scope label.
- [ ] Open Author IDE and verify Entities/Timeline activity uses real data.
- [ ] Confirm AI actions remain disabled.
- [ ] Confirm no raw IDs are shown as primary user labels.

Manual frontend review remains for the user because it requires browser interaction.

## 8. Acceptance Criteria

Phase 9.5 is complete when:

- [x] backend migrations create official authoring context tables;
- [ ] backend CRUD APIs pass Postman review;
- [x] frontend context manager persists data through API;
- [x] Author IDE reads real entities/timeline summaries where implemented;
- [x] AI/Copilot remains disabled and does not mutate context;
- [x] `npm.cmd run typecheck` passes in `backend`;
- [x] `npm.cmd run typecheck` passes in `web`;
- [x] documentation is updated if endpoint names or fields differ from this checklist.

## 9. Out of Scope

- LLM-generated suggestions.
- Consistency checking.
- Vector embeddings.
- Context proposal approval workflow.
- Automatic extraction from chapter text.
- Full event sourcing.

These belong to the later AI/Copilot phase.
