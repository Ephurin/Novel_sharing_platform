# P8-02 — Frontend/API Canonical Cutover Report

**Status:** IMPLEMENTED — awaiting executed CI / Compose evidence  
**Branch:** `astra/p8-02-frontend-api-cutover`  
**Draft PR:** #6  
**Current reviewed HEAD:** `f33565b659d4f8322d8f6adccb43e9951b3c8272`

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

Reviewed on the P8-02 branch:

- `web/src/features/ai-copilot/ai-copilot-api.ts` uses shared `apiClient` and relative `/ai/*` gateway paths.
- `web/src/features/manuscript-import/manuscript-import-api.ts` uses shared `apiClient` and relative `/ai/*` gateway paths.
- `mobile/src/api/api-client.ts` uses only `EXPO_PUBLIC_API_BASE_URL` with the Platform API default.
- `web/.env.example` exposes only `VITE_API_BASE_URL`; legacy `VITE_AI_SERVICE_BASE_URL` and `VITE_AI_TENANT_ID` were removed.
- `web/nginx.conf` proxies `/api/v1` to `backend:4000`.
- root Compose builds web with `VITE_API_BASE_URL=/api/v1`; backend alone owns `AI_SERVICE_URL` and `PLATFORM_SERVICE_TOKEN`.

## Enforcement added

`scripts/check_p8_frontend_api_cutover.py` now scans browser/mobile application source plus public env examples and fails closed on:

- direct localhost/loopback FastAPI port 8000 URLs;
- `VITE_AI_SERVICE_BASE_URL`;
- `VITE_AI_TENANT_ID`;
- mobile/public AI service base or service-token variables;
- `PLATFORM_SERVICE_TOKEN` in browser/mobile source;
- direct `/v1/story-brains`;
- direct `/v1/writing/generations`;
- direct `/internal/v1/*`.

Backend/server-to-server source is intentionally excluded from this source guard.

## CI verification added

The P8 workflow now includes the P8-02 branch and web/backend/mobile changes. The `frontend-api-cutover` job is configured to run:

1. deterministic source boundary guard;
2. web `npm ci && npm run build`;
3. built-asset scan for direct FastAPI references;
4. backend `npm ci && npm run typecheck && npm test`;
5. mobile `npm ci && npm run typecheck`.

The root Compose job additionally verifies:

- nginx `/api/v1/ai/*` reaches an authentication boundary and returns 401 without user credentials;
- deployed web assets do not contain direct FastAPI host/port/public env/direct canonical routes;
- existing P8-01/P7 production health, pgvector and direct service-auth probes remain in place.

## Evidence state

No executed workflow result is claimed in this report yet. GitHub connector had not returned a PR workflow run for the reviewed HEAD at the time of this update.

Required before Astra acceptance:

- P8 workflow run ID + successful job results;
- web build/typecheck evidence;
- backend gateway regression evidence;
- mobile typecheck evidence;
- static guard executed PASS;
- root Compose nginx gateway probe PASS;
- deployed asset scan PASS;
- existing P8-01/P7 production path PASS.

## Scope exclusions preserved

No P8-03 JSON read-only/deprecation behavior, P8-04 rollback rehearsal, or P8-05 destructive cleanup is included.
