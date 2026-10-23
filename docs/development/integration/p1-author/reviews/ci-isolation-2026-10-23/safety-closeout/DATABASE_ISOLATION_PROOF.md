# Database Isolation Guard & Compose Separation Proof — PR #58 Safety Closeout

**Branch:** `gemini/p1-ci-isolation`  
**Commit SHA:** `55036fd5314b98ae2d3637e163b276709841893c`  
**Base Branch:** `integration/p1-author`  
**Date:** 2026-10-23  

---

## 1. Fail-Closed Mutation Guard Contract

To prevent tests from accidentally mutating production, staging, development, or shared databases, all database-backed backend test suites (`accept-draft-contract.test.ts` and `p1-production-persistence.postgres.test.ts`) invoke `validateTestDatabaseIsolation(pool, mongoDb)` at the very beginning of their `before()` hook prior to any DDL or DML operations (`CREATE`, `INSERT`, `UPDATE`, `DELETE`).

The guard is defined in [`backend/src/core/database/test-db-guard.ts`](file:///backend/src/core/database/test-db-guard.ts) and enforces the following fail-closed rules:

1. **Explicit External Opt-In Required (`EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`):**
   Ambient flags such as `NODE_ENV=test`, `CI=true`, or npm lifecycle scripts (`npm test`, `tsx --test`) do **NOT** grant mutation authorization. An absent or zero opt-in immediately throws before the first query:
   ```text
   Error: Refusing database mutations: missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1.
   Ambient flags (NODE_ENV=test, CI=true, or npm test) do NOT grant mutation authorization.
   ```
2. **Forbidden Database Names Rejected:**
   Any connection targeting default or shared names (`ephurin`, `postgres`, `template0`, `template1`, `production`, `prod`, `demo`, `ephurin_dev`, `admin`, `config`, `local`) is immediately rejected:
   ```text
   Error: Refusing database mutations: PostgreSQL target "ephurin" is not an approved isolated test database.
   ```
3. **Approved Test Database Name Pattern:**
   Only names matching `/^(ephurin_report_e2e_[a-zA-Z0-9_-]+|ephurin_test_[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+_test|ephurin_int)$/` are accepted.
4. **Expected Database Identity Enforcement:**
   When `EXPECTED_TEST_DB_NAME` is configured, both PostgreSQL `current_database()` and MongoDB `databaseName` must match the expected name exactly.

---

## 2. Test Execution Verification Matrix (Rules 1–5)

| Mandatory Case | Input Configuration | Expected Outcome | Observed Outcome | Exit Code | Verdict |
|---|---|---|---|---|---|
| **Case 1: No Opt-In** | `DATABASE_URL=.../ephurin_test_integration`, `EPHURIN_ALLOW_TEST_DB_MUTATIONS="0"` | Fail closed in `before()` hook before any query | Threw `missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, all 14 tests cancelled | `1` | **PASS** |
| **Case 2: Forbidden PostgreSQL DB** | `DATABASE_URL=.../ephurin`, `EPHURIN_ALLOW_TEST_DB_MUTATIONS="1"` | Fail closed rejecting `"ephurin"` | Threw `PostgreSQL target "ephurin" is not an approved isolated test database` | `1` | **PASS** |
| **Case 3: Forbidden MongoDB DB** | `MONGODB_URI=.../ephurin`, `EPHURIN_ALLOW_TEST_DB_MUTATIONS="1"` | Fail closed rejecting `"ephurin"` | Threw `MongoDB target "ephurin" is not an approved isolated test database` | `1` | **PASS** |
| **Case 4: Mismatched Expected DB** | `EXPECTED_TEST_DB_NAME="ephurin_other_test"` | Fail closed on identity mismatch | Threw `does not match expected isolated test DB` | `1` | **PASS** |
| **Case 5: Approved Isolated DB with Opt-In** | `DATABASE_URL=.../ephurin_test_integration`, `EPHURIN_ALLOW_TEST_DB_MUTATIONS="1"` | Full test execution authorized | Suite initialized, executed 14/14 tests successfully | `0` | **PASS** |

---

## 3. Separation of Root-Compose Smoke from Mutating Tests

### 3.1 Problem Statement
In PR #58's initial cut, `root-compose-cutover-smoke` contained:
```yaml
- name: Run Backend PostgreSQL Production Persistence Integration Suite
  run: docker compose exec -T backend npx tsx --test --test-force-exit src/modules/novels/p1-production-persistence.postgres.test.ts
- name: Run Backend Accept Draft Contract Integration Suite
  run: docker compose exec -T backend npx tsx --test --test-force-exit src/modules/novels/accept-draft-contract.test.ts
```
Inside the containerized Compose environment, `backend`'s default `DATABASE_URL` is `postgresql://postgres:postgres@postgres:5432/ephurin`. Because `ephurin` is the shared runtime database for web, backend, and AI service, running database-mutating test fixtures against it:
1. Directly violates the test database isolation guard (`ephurin` is in `FORBIDDEN_DB_NAMES`).
2. Mutates state required by subsequent cutover smoke scripts (`run_ai_pipe_01a_production_persistence.py`, `run_ai_pipe_02a_idea_bootstrap.py`, `run_ai_pipe_03a_autonomous_controller.py`).

### 3.2 Implemented Resolution
1. Both database-mutating test suites (`accept-draft-contract.test.ts` and `p1-production-persistence.postgres.test.ts`) were moved entirely into the dedicated `backend-integration` CI job.
2. In `backend-integration`:
   - Dedicated service containers for `postgres` (`pgvector/pgvector:pg16`) and `mongodb` (`mongo:7`) are provisioned.
   - The database is initialized with an approved name: `ephurin_test_integration`.
   - `EXPECTED_TEST_DB_NAME: ephurin_test_integration` and `EPHURIN_ALLOW_TEST_DB_MUTATIONS: "1"` are explicitly injected.
   - Both backend migrations (`migrate.ts`) and real AI-service Alembic migrations (`alembic upgrade head`) are applied.
   - Guard rules suite (`test-db-guard.test.ts`) runs and passes (11/11).
   - Both integration suites execute with 100% pass rates (14/14 and 5/5).
3. In `root-compose-cutover-smoke`:
   - Mutating test invocations against `ephurin` were removed.
   - Full end-to-end integration remains thoroughly validated by `run_ai_pipe_01a_production_persistence.py` (which creates, tests, and cleans up its own disposable fixtures via official API gateways without violating database isolation).
