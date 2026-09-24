# Phase 8 — Gemini Local Docker Full Verification Report

**Status:** PASS  
**Execution Role:** Gemini (local execution / verification worker)  
**Supervisor / Decision Maker:** User  
**Architect / Reviewer:** ChatGPT / Astra  
**Commit SHA:** `9a49acb9990f82195f3185f9b05a7ed258bcba61`  
**Branch:** `main`  
**Date:** 2026-09-24  

---

## 1. Environment & Preflight

- **Operating System:** Windows (win32 x64)
- **Docker:** `29.7.2, build a7dcaa6`
- **Docker Compose:** `v5.5.1`
- **Python:** `3.11.9`
- **Node.js:** `v24.19.0`
- **npm:** `11.17.0`
- **Secrets / Credentials Check:** Confirmed no secrets, keys, or credentials staged or tracked.
- **Reference Contracts:** Verified against `.github/workflows/p8-cutover.yml`, `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md`, and `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER-report.md`.

Evidence: [`docs/development/P8-LOCAL-FULL-VERIFICATION/environment.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/environment.txt)

---

## 2. Gate-by-Gate Verification Summary

| Verification Gate | Command | Exit Code | Result | Evidence File |
| :--- | :--- | :---: | :--- | :--- |
| **4.2 Static Cutover Guard** | `python scripts/check_p8_frontend_api_cutover.py` | 0 | **PASS** (58 files scanned, 0 violations) | [`static-cutover.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/static-cutover.txt) |
| **4.3 Web Build & Asset Scan** | `npm ci && npm run build` (web) + scan `web/dist` | 0 | **PASS** (build in 11.86s, 0 forbidden references) | [`web-build.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/web-build.txt) |
| **4.3 Backend Typecheck & Tests** | `npm ci && npm run typecheck` + `npx tsx --test <deterministic>` | 0 | **PASS** (20/20 tests passed, 0 failed) | [`backend-tests.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/backend-tests.txt) |
| **4.3 Mobile Typecheck** | `npm ci && npm run typecheck` (mobile) | 0 | **PASS** (0 errors) | [`mobile-typecheck.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/mobile-typecheck.txt) |
| **4.4 AI-Service Unit Regression** | `pytest -q` (ai-service) | 0 | **PASS** (176 passed, 2 skipped, 34 deselected) | [`ai-service-regression.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/ai-service-regression.txt) |
| **4.5 Live PostgreSQL + pgvector** | `pytest -o addopts= -q -m postgres_integration` | 0 | **PASS** (34 passed, 178 deselected, pgvector 0.8.6) | [`postgres-integration.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/postgres-integration.txt) |
| **4.6 Root Docker Compose Smoke** | `docker compose up -d --build` + health probes | 0 | **PASS** (5/5 services healthy, Nginx proxy OK) | [`compose-smoke.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/compose-smoke.txt) |
| **4.7 P8-01 Migration / Parity Replay** | `migrate_json_to_postgres` (inventory & synthetic) | 0 | **PASS** (6/6 inventory ready, parity verified, idempotent) | [`p8-01-migration-parity.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/p8-01-migration-parity.txt) |
| **4.8 P8-02 Gateway Cutover Replay** | End-to-end Nginx -> Node -> FastAPI traversal | 0 | **PASS** (Auth boundary, ownership, cross-author 403) | [`p8-02-gateway-cutover.txt`](file:///docs/development/P8-LOCAL-FULL-VERIFICATION/p8-02-gateway-cutover.txt) |

---

## 3. Detailed Verification Details

### 3.1 Static & Client Boundary Verification
- `scripts/check_p8_frontend_api_cutover.py` confirmed that neither `web` nor `mobile` contains direct references to FastAPI (:8000), `VITE_AI_SERVICE_BASE_URL`, `VITE_AI_TENANT_ID`, public service tokens, direct `/v1/story-brains`, `/v1/writing/generations`, or `/internal/v1/*`.
- `web/dist` production build assets were scanned with regex; zero forbidden direct AI references detected.

### 3.2 Deterministic Suites & Tooling
- **Backend:** 20/20 deterministic subtests passed across `ai-gateway.test.ts`, `chapter-revisions.test.ts`, and `outbox.test.ts`. Integration suites (`*.live.test.ts` and `*.postgres.test.ts`) were cleanly segregated.
- **Mobile:** React Native / Expo application typecheck passed cleanly with 0 TypeScript diagnostics.
- **AI-Service:** 176 unit tests passed, 2 skipped, 34 postgres integration tests deselected.

### 3.3 Live PostgreSQL & pgvector Integration
- Executed against PostgreSQL 16 container with `pgvector` extension enabled (`extversion 0.8.6`).
- All 34 postgres integration tests passed, confirming `VECTOR(768)` dimension enforcement, cosine distance ranking, temporal/version cutoff isolation, and cutover snapshot parity.

### 3.4 Root Docker Compose Smoke
- Production path services (`postgres`, `mongodb`, `ai-service`, `backend`, `web`) started up healthy under an isolated compose project name (`p8_verification`), ensuring existing user volume data was never modified or dropped.
- Health endpoints responded HTTP 200:
  - `http://localhost:8000/health`: `{"status":"ok"}`
  - `http://localhost:4000/api/v1/health`: `{"status":"OK","service":"ephurin-backend"}`
  - `http://localhost:8080/`: Nginx serving web client
- Container asset scan of `/usr/share/nginx/html` in `web` container verified clean of direct AI-service paths.
- Service-to-service auth on protected FastAPI endpoint verified:
  - Missing token: HTTP 401 (`SERVICE_AUTH_REQUIRED`)
  - Invalid token: HTTP 403 (`SERVICE_AUTH_INVALID`)
  - Valid token (`Bearer test-token`): HTTP 200 OK

### 3.5 P8-01 Migration & Parity Local Replay
- Evaluated committed legacy StoryKB inventory (6 files: `writing_session_550`, `writing_session_599`, `writing_session_968`, `writing_session_492`, `test2`, `test_narrative_v2`) in the container runtime: all 6 evaluated as `action=ready`, `safe_to_apply=True`, and 0 unsupported canonical rows.
- Replayed synthetic scoped JSON migration:
  - Dry-run: `action=ready`, `safe_to_apply=True`
  - Explicit apply: `applied=True`, `parity=True`, `source_unchanged=True`
  - Idempotent reapply: `applied=False`, `idempotent=True`
  - SHA-256 before, after apply, and after reapply strictly identical.
- Replayed conflicting non-empty target rejection:
  - Divergent entity state detected as `action=blocked_conflict`, `safe_to_apply=False`.
  - Apply safely rejected with non-zero exit code (exit code 2).
- Verified schema integrity: all 18 tables in `narrative` schema and 29 tables in `public` schema preserved without dropping or truncating.
- Source JSON files in `ai-service/data/` verified completely unmodified in working directory.

### 3.6 P8-02 Gateway Cutover Replay
- Traversal verified end-to-end:
  `Client -> Nginx (:8080) -> Node Backend (:4000) -> FastAPI AI Service (:8000)`
- Unauthenticated client call to `/api/v1/ai/...` returned HTTP 401 (`AUTH_002: Missing access token`).
- Authenticated novel author call (`reader03`) to `/api/v1/ai/story-brains/:novelId/context-preview` returned HTTP 200 OK with packed context and budget calculation.
- Cross-author call (`reader04`, role `READER`) attempting to read private Story Brain context preview returned HTTP 403 Forbidden.
- Confirmed that client environment and client calls remain completely free of FastAPI URLs, service tokens, or tenant header requirements.

---

## 4. Preservation of Invariants

- [x] No user or production volumes were dropped, truncated, or modified.
- [x] No source JSON files were modified or deleted.
- [x] No secrets or credentials were committed or staged.
- [x] P8-03 scope was NOT opened.
- [x] All evidence files created under `docs/development/P8-LOCAL-FULL-VERIFICATION/`.

---

## 5. Conclusion & Handoff

Local verification on `main` is **COMPLETE** and **PASS**. All contracts established in P8-01 and P8-02 were successfully replayed and confirmed on local Docker and native runtimes.
Next actions are reserved for the Supervisor.
