# CI Red/Green Verification Report — PR #57 / P8

**Branch:** `gemini/p1-ci-isolation`  
**Base Branch:** `integration/p1-author`  
**Failed Workflow Run:** `39902374069`  
**Investigator:** Gemini Flash 3.8  
**Date:** 2026-10-23  

---

## 1. Red Failure Baseline

| Metric | Recorded Value |
|---|---|
| Workflow | P8 Cutover and Migration |
| Run ID | `39902374069` |
| Job | `frontend-api-cutover` |
| Step | `Backend typecheck and deterministic tests` |
| Working Directory | `backend` |
| Command | `npx tsx --test "${tests[@]}"` |
| Discovery Pattern | `find src -name '*.test.ts' ! -name '*.live.test.ts' ! -name '*.postgres.test.ts'` |
| Offending File | `src/modules/novels/accept-draft-contract.test.ts` |
| Environment | `DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ephurin_ci_placeholder` (No container) |
| Root Cause | `ECONNREFUSED 127.0.0.1:5432` in `before()` hook |
| Test Results | 0 passed, 1 suite failed, 14 child tests cancelled |
| Exit Code | `1` |

```text
✖ Accept Draft Server-to-Server Trust Contract (P0/P1 Hardening) (506.666ms)
  Error: connect ECONNREFUSED 127.0.0.1:5432
      at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1634:16)
✖ calls authenticated /internal/v1/writing/generations/{id} route with service token and headers (cancelled)
... (13 more cancelled)
ℹ tests 14
ℹ suites 1
ℹ pass 0
ℹ fail 1
ℹ cancelled 14
```

---

## 2. Remediation Overview

| Area | Changes Made | Rationale |
|---|---|---|
| `.github/workflows/p8-cutover.yml` (`frontend-api-cutover`) | Added `! -name 'accept-draft-contract.test.ts'` to `find` query | Pure unit tests must run deterministically in environments without database services. |
| `.github/workflows/p8-cutover.yml` (`backend-integration`) | Added dedicated CI job with `postgres` (`pgvector:pg16`) & `mongodb` (`mongo:7`) services, migration step, and test execution | Executes database-dependent accept-draft trust contract (14 tests) and production persistence suite (5 tests) in an isolated, fully provisioned service environment. |
| `.github/workflows/p8-cutover.yml` (`root-compose-cutover-smoke`) | Added step `Run Backend Accept Draft Contract Integration Suite` | Verifies trust contract inside containerized production runtime alongside AI-PIPE-01A and AI-PIPE-03A. |
| `backend/src/modules/novels/accept-draft-contract.test.ts` | Added `CREATE SCHEMA IF NOT EXISTS narrative` and mock tables in `before()`; added fixture `DELETE` cleanup in `after()` | Guarantees test is self-sufficient on freshly migrated backend databases where narrative Alembic migrations have not run; ensures zero leftover test rows. |

---

## 3. Green Verification Results

### 3.1 Deterministic Backend Tests (`frontend-api-cutover` Simulation)
- **Environment:** `DATABASE_URL=postgresql://postgres:postgres@localhost:54321/ephurin_ci_placeholder` (unreachable)
- **Files Discovered:** 18 test files
- **Results:**
  - Total tests: 91
  - Passed: 88
  - Skipped: 3 (intentional author workspace checklist/workflow/comments stubs)
  - Failed: 0
  - Cancelled: 0
- **Exit Code:** `0`

### 3.2 Database-Enabled Integration Suite (`backend-integration` Simulation)
- **Environment:** Dedicated PostgreSQL 16 container with backend migrations 001–017 applied.
- **Suite 1:** `accept-draft-contract.test.ts`
  - Passed: 14/14
  - Failed: 0
  - Cancelled: 0
  - Duration: ~985ms
  - Exit Code: `0`
- **Suite 2:** `p1-production-persistence.postgres.test.ts`
  - Passed: 5/5
  - Failed: 0
  - Cancelled: 0
  - Duration: ~950ms
  - Exit Code: `0`
- **Total Integration Tests:** 19/19 PASS, 0 FAIL, 0 CANCELLED.

### 3.3 Root Compose Cutover Smoke Gate (`root-compose-cutover-smoke` Simulation)
- **Environment:** Multi-container Docker Compose mesh (postgres, mongodb, ai-service, backend, web)
- **Results:**
  - `docker compose config`: PASS (exit code 0)
  - Preflight boundary check (`check_p8_frontend_api_cutover.py`): PASS (exit code 0)
  - Cleanup readiness check (`check_p8_cleanup_readiness.py`): PASS (exit code 0)
  - Final cleanup gate (`check_p8_final_cleanup_gate.py --expect-blocked`): PASS (exit code 0)
  - Web build & asset leak check: PASS (0 direct AI-service references, exit code 0)
  - Mobile typecheck (`npm run typecheck`): PASS (exit code 0)
  - In-Container Accept Draft Contract: 14/14 PASS (exit code 0)
  - In-Container Production Persistence: 5/5 PASS (exit code 0)
  - Gate AI-PIPE-01A Runner: 15/15 PASS (exit code 0)
  - Gate AI-PIPE-01A Evidence Schema Verification: PASS (exit code 0)
  - Gate AI-PIPE-03A Runner: 18/18 PASS (exit code 0)
  - Gate AI-PIPE-03A Mutants Verification: 13/13 mutants rejected (exit code 0)

---

## 4. Invariant Compliance Checklist

- [x] No production Core code modified (`chapters.service.ts`, `draft-chapters.repository.ts`, `chapter-revisions.service.ts`, `autonomous-controller.service.ts` untouched).
- [x] No AI service production routes modified.
- [x] No Author IDE production components modified.
- [x] All 14 accept-draft trust contract tests preserved without skipping or weakening assertions.
- [x] Genuine database-backed integration coverage maintained in dedicated CI job and compose smoke.
- [x] Deterministic unit suite runs cleanly with zero database connectivity.
- [x] Offline mode respected: 0 live LLM provider network requests.
