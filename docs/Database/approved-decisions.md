# Approved Database Decisions

This document freezes the previously open database questions for MVP implementation.

## Decision 1: Approved Chapter Content Storage

**Decision:** Store latest approved/published chapter content in PostgreSQL `chapters.content`. Store draft/autosave content in MongoDB `draft_chapters`.

**Rationale:**

- Keeps public read API simple for MVP.
- Keeps draft/autosave flexible in MongoDB.
- Avoids cross-database join for normal published chapter reads.

**Implementation Impact:**

- `ChapterContentRepository` reads published content from PostgreSQL.
- `DraftRepository` reads/writes editable draft content in MongoDB.
- On publish approval, copy approved draft content into `chapters.content`.

## Decision 2: Draft Version History

**Decision:** MVP keeps only the latest draft document with a numeric `version`. Full draft history is deferred.

**Rationale:**

- Simpler editor implementation.
- Enough for autosave demo.
- Full version history can be added later without changing public API heavily.

**Implementation Impact:**

- `draft_chapters` has one active document per `chapterId`.
- Every save increments `version`.
- No `draft_chapter_versions` collection in MVP.

## Decision 3: Comment ID Strategy

**Decision:** Each MongoDB comment document must include a UUID `commentId` in addition to Mongo `_id`.

**Rationale:**

- API can expose stable string UUIDs.
- PostgreSQL `moderation_reviews.target_id` can reference `commentId`.
- Reduces friction in Content Control/Admin moderation.

**Implementation Impact:**

- `comments.commentId` is unique.
- API paths use `commentId`.
- Mongo `_id` remains internal.

## Decision 4: Character Relationships in MVP

**Decision:** Keep `character_relationships` as an MVP table, but UI/API may start with simple relationship type + description.

**Rationale:**

- Writing Copilot benefits from structured character relationships.
- The table is small and low-risk.
- Better than forcing AI to parse free-form notes.

**Implementation Impact:**

- Implement basic CRUD later in Novel context module.
- Relationship graph visualization is not required for MVP.

## Decision 5: Moderation Evidence and Copilot Log Retention

**Decision:** Retain rule/filter/report moderation evidence and Copilot generation logs for 90 days in MVP.

**Rationale:**

- Enough for demo/debug/audit.
- Avoids indefinite storage of potentially sensitive prose.

**Implementation Impact:**

- Add `moderation-evidence-retention` and `ai-log-retention` jobs.
- Delete or archive logs older than 90 days.
- Store truncated previews for temporary Copilot context.

## Decision 6: Copilot Draft Suggestion Storage

**Decision:** Store `draftSuggestion` in `copilot_generation_logs` for 90 days, but truncate `additionalContextTextPreview`.

**Rationale:**

- Useful for debugging generated output.
- Avoids storing large temporary context that the Author only meant for one request.

**Implementation Impact:**

- Keep generated suggestion text.
- Store only preview/first segment of temporary context.
- Never store raw access tokens, refresh tokens, or passwords in logs.

## Decision 7: Rejected Context Proposal Retention

**Decision:** Keep rejected context proposals for 180 days, then archive/delete.

**Rationale:**

- Useful for audit and explaining why Copilot suggestions were rejected.
- Avoids permanent growth.

**Implementation Impact:**

- `context_change_proposals` keeps `REJECTED` rows during retention.
- Retention job can archive/delete rejected proposals older than 180 days.
