# P8-03 — Legacy Deprecation + JSON Read-Only Production Mode

**Status:** IMPLEMENTED — local verification pending  
**Branch:** `astra/p8-03-legacy-json-readonly`

## Goal

Close remaining production JSON write paths without deleting legacy data or adapters.

```text
production canonical writes -> PostgreSQL
legacy JSON -> readable archive / migration source only
legacy compatibility writers -> deprecated
direct JSON writer -> fail closed
```

## Implementation

- `Settings` now exposes `APP_ENV` and `JSON_REPOSITORY_MODE`.
- production requires `NARRATIVE_REPOSITORY=postgres` and defaults `JSON_REPOSITORY_MODE=read-only`.
- production explicitly rejects `JSON_REPOSITORY_MODE=read-write`.
- `StoryKBManager` supports `read_only=True` and rejects both normal and atomic saves before touching disk.
- production composition creates the legacy StoryKB manager in read-only mode.
- `/v1/ai/kb/confirm` is deprecated and returns HTTP 409 `LEGACY_JSON_READ_ONLY` in read-only runtime with a successor link to revision analysis.
- `/v1/ai/sync-story` is marked deprecated with bootstrap successor metadata.
- `/v1/ai/suggest-next` keeps/strengthens its writing-generation successor contract.
- `/v1/enhanced/process-interactions` remains fail-closed and is now explicitly deprecated with successor metadata.
- `ai-service/.env.example` now recommends PostgreSQL and read-only JSON.

## Safety

P8-03 does **not**:

- delete JSON files;
- delete `JsonNarrativeRepository`;
- delete legacy routes;
- truncate/drop PostgreSQL tables or volumes;
- perform rollback rehearsal;
- perform P8-05 destructive cleanup.

Dev/test JSON fixtures remain writable by default so repository contract tests and migration fixtures can run.

## Verification contract

Gemini local Docker verification must prove:

1. new P8-03 unit/settings tests pass;
2. full AI-service regression remains green;
3. production settings require PostgreSQL and reject JSON read-write mode;
4. a read-only JSON manager can read an existing snapshot but cannot change its SHA-256;
5. `/v1/ai/kb/confirm` returns 409 + `LEGACY_JSON_READ_ONLY` + deprecation/successor headers in production-style read-only runtime;
6. production Compose still uses `NARRATIVE_REPOSITORY=postgres`;
7. P8-01 migration dry-run still reads legacy JSON;
8. P8-01 explicit migration fixture apply still works because migration tooling uses its own non-production writable fixture manager;
9. P8-02 frontend/API gateway boundary remains green;
10. no user/prod JSON data is modified.

Evidence belongs under:

```text
docs/development/P8-03-LEGACY-JSON-READONLY/
```

Do not mark accepted until local Docker evidence is committed/reviewed by Supervisor.
