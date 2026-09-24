# P8-02 — Frontend/API Canonical Cutover Report

**Status:** ACCEPTED — 2026-09-24  
**Branch:** `astra/p8-02-frontend-api-cutover`  
**Merged PR:** #6  
**Merge commit:** `12a0dc57186472c72c5318d8f3bde5185d33f307`  
**Validated HEAD:** `2a052bdd548aeb219591310d5b7272aba78a7fc6`  
**GitHub Actions:** run `35946930023` — PASS

## Goal

Verify and enforce the canonical client boundary:

```text
Browser / mobile
  -> Platform API (/api/v1)
  -> Node AI Gateway (/api/v1/ai/*)
  -> service-authenticated FastAPI
```

P8-02 does not change Story Brain storage and does not deprecate JSON writes.

## Static architecture audit

- Web AI Copilot and manuscript import use shared Platform `apiClient` with relative `/ai/*` paths.
- Mobile uses only `EXPO_PUBLIC_API_BASE_URL`.
- `web/.env.example` exposes only `VITE_API_BASE_URL`; legacy direct AI-service browser envs were removed.
- nginx proxies `/api/v1` to Node backend.
- Backend alone owns `AI_SERVICE_URL` and `PLATFORM_SERVICE_TOKEN`.

## Enforcement

`scripts/check_p8_frontend_api_cutover.py` fails closed on browser/mobile source or public env examples containing direct FastAPI port 8000 references, direct AI-service public env variables, browser tenant overrides, service tokens, direct canonical Story Brain/writing FastAPI paths, or `/internal/v1/*`.

Executed CI result:

```text
P8-02 frontend/API cutover guard: PASS [p8-02-v1]
58 files scanned
```

## CI evidence

Run: `35946930023`

### frontend-api-cutover — PASS

- source guard: PASS;
- web production build: PASS;
- built asset forbidden-reference scan: PASS;
- backend typecheck: PASS;
- backend deterministic tests: 20/20 PASS;
- mobile typecheck: PASS.

The backend deterministic suite excludes tests explicitly named `*.live.test.ts` and `*.postgres.test.ts`; live integration behavior is covered separately by PostgreSQL and root Compose jobs.

### AI-service regression — PASS

```text
176 passed, 2 skipped, 34 deselected
```

### PostgreSQL integration — PASS

```text
34 passed, 178 deselected
```

PostgreSQL 16 + pgvector remains active; invalid vector dimension rejection is still exercised.

### Root Compose cutover smoke — PASS

Validated:

- PostgreSQL, MongoDB and AI service healthy;
- web served by nginx;
- committed legacy StoryKB dry-run inventory remains 6/6 ready;
- P8-01 dry-run/apply/idempotent reapply remains green;
- nginx `/api/v1/ai/*` unauthenticated request reaches the Node auth boundary and returns 401;
- deployed web assets contain no forbidden direct FastAPI reference;
- pgvector extension exists;
- direct protected FastAPI service-auth boundary remains missing=401 / invalid=403 / valid=200.

## Scope exclusions preserved

No P8-03 JSON read-only/deprecation behavior, P8-04 rollback rehearsal, or P8-05 destructive cleanup is included.

## Review conclusion

All P8-02 implementation and executed evidence gates are satisfied. P8-02 was accepted and squash-merged to `main` on 2026-09-24. P8-03 remains closed until explicitly opened by the owner.
