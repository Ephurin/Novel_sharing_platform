# AX-02 Editable Codex UI

The existing AuthorMemoryPanel gains a lazy private “Hồ sơ Codex” tab. Approved-memory entities supply name/type/UUID selection only. A selected UUID loads its private profile; no private response enters React Query, persistent client storage, URLs or logs.

## Gateway contract

Production apiClient supplies the existing `/api/v1` base and authentication. GET/PATCH use `/ai/story-brains/:novelId/entities/:entityId/profile`, never direct FastAPI. GET validates scope, versions and field types. EntityProfile contains entity_id, novel_id, version, brain_version, profile {description, appearance, personality, background}, effective_from_chapter and author_notes. MemoryEntity.approved_profile contains optional canonical fields/cutoff only.

PATCH sends expected_version, expected_brain_version, Idempotency-Key, and changed fields. Canon changes require an integer effective_from_chapter (1..1,000,000); note-only changes exclude it. Four Canon strings are bounded at 4,000 Unicode code points each; author_notes at 8,000. Empty strings clear fields. Unknown fields, null, undefined, invalid controls/versions and empty mutations fail before transport. TypeScript distinguishes Canon mutations from note-only mutations; runtime validation remains authoritative.

## Author intent and privacy

Each new save creates a UUID idempotency key. Explicit transport retry reuses the frozen body/key/preconditions; edits discard that intent. 409 never auto-retries: retain the draft, explicitly GET a current server comparison, then choose server values or save reconciled input using fresh versions/new key. Failed comparison reads retain the conflict and draft.

PATCH acknowledgment invalidates the existing public memory/brain queries without passing private data. Only successful GET readback displays save success. Failed readback offers GET-only retry. Selection/session/novel changes unmount private state; pending responses are ignored. Requests already accepted for an old target may complete there, but cannot retarget the new selection. 401/403 erase private content. Upstream error bodies are never rendered. Form autocomplete is disabled for profile text.

Baseline profile is author-confirmed background knowledge. Cutoff covers the whole current snapshot, including unchanged fields; it is not historical reconstruction. In-story changes use existing Event Correction/Canon review. Future Plans remain in Story Plan. No identity/lock/provenance or HITL behavior changes.

## Review boundary

`npm run test:entity-profile` runs pure/API-client tests and mounted AuthorMemoryPanel tests against mocked HTTP. These are component evidence only, not integrated persistence/browser acceptance. Real browser → Gateway → AI service → PostgreSQL reload, authorization and writing-context acceptance remain NOT_RUN until the approved integrated environment is available. No database or live provider is started by this work.
