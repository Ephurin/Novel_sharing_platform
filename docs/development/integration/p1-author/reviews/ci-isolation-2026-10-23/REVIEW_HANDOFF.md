# Review Handoff — P8 CI Isolation & Evidence Repair

**Author:** Gemini Flash 3.8  
**Working Branch:** `gemini/p1-ci-isolation`  
**Target PR Base:** `integration/p1-author` (PR #57)  
**Observed Integration HEAD:** `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`  
**Failed CI Run Investigated:** Run `39902374069` (Job: `frontend-api-cutover`, Step: `Backend typecheck and deterministic tests`)  
**Status:** Completed & Verified  
**Final Verdict:** `P8_CI_ISOLATION_READY_FOR_GPT6_REVIEW`  

---

## 1. Remediation Summary

In run `39902374069`, the deterministic CI step `Backend typecheck and deterministic tests` inadvertently discovered `backend/src/modules/novels/accept-draft-contract.test.ts` because it lacked a `.postgres.` infix. Since the job runs without a live PostgreSQL instance, `getPostgresPool().query()` in the test's `before()` hook failed with `ECONNREFUSED 127.0.0.1:5432`, cancelling all 14 child tests and failing the build.

This remediation implements the mandated test isolation strategy without weakening any trust-contract assertions:

1. **Deterministic Test Discovery Isolation (`.github/workflows/p8-cutover.yml`):**
   - Excluded `accept-draft-contract.test.ts` from `frontend-api-cutover`:
     `find src -name '*.test.ts' ! -name '*.live.test.ts' ! -name '*.postgres.test.ts' ! -name 'accept-draft-contract.test.ts'`
   - Pure deterministic tests (91 tests across 18 files) pass in 1.5s with zero database connectivity (verified under unreachable port 54321: 88 PASS, 0 FAIL, 0 CANCELLED, 3 intentional workflow stubs skipped).

2. **Dedicated Database Integration Job (`backend-integration` in `.github/workflows/p8-cutover.yml`):**
   - Provisions isolated `pgvector/pgvector:pg16` and `mongo:7` services.
   - Waits for PostgreSQL and MongoDB socket readiness.
   - Applies backend migrations (`npx tsx src/core/database/migrate.ts`).
   - Runs `accept-draft-contract.test.ts` (14/14 PASS).
   - Runs `p1-production-persistence.postgres.test.ts` (5/5 PASS).

3. **End-to-End Compose Smoke Gate (`root-compose-cutover-smoke`):**
   - Added containerized execution of `accept-draft-contract.test.ts` via `docker compose exec -T backend`.
   - Verified 14/14 PASS inside running container against live Compose stack.

4. **Fixture Isolation Hardening (`accept-draft-contract.test.ts`):**
   - In `before()`: Adds `CREATE SCHEMA IF NOT EXISTS narrative` and minimal mock tables (`autonomous_runs`, `story_plans`, `story_plan_objectives`) so controller intent checks operate self-sufficiently on fresh databases without requiring Python Alembic migrations.
   - In `after()`: Added explicit `DELETE` cleanup for generated test UUID fixtures (`chapter_revisions`, `chapters`, `novels`, `users`).

---

## 2. Evidence Artifacts

The following documents have been prepared under `docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/`:

1. [`CI_FAILURE_ROOT_CAUSE.md`](file:///docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/CI_FAILURE_ROOT_CAUSE.md): Detailed root cause analysis, reproduction transcript, and architectural explanation.
2. [`TEST_PARTITION_MATRIX.md`](file:///docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/TEST_PARTITION_MATRIX.md): Exhaustive partitioning matrix separating `UNIT_PASS`, `DATABASE_INTEGRATION_PASS`, `REAL_COMPONENT_BROWSER_PASS`, `MOCKED_UI_PASS`, `OFFLINE_GATEWAY_PASS`, `FULL_APPLICATION_ROUTE_NOT_TESTED`, and `LIVE_PROVIDER_NOT_RUN`. Includes Author IDE fixture and S10 phrase-matching notes.
3. [`CI_RED_GREEN_REPORT.md`](file:///docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/CI_RED_GREEN_REPORT.md): Side-by-side comparison of the Red baseline (`39902374069`) vs. Green state on `gemini/p1-ci-isolation`.
4. [`commands-and-exits.json`](file:///docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/commands-and-exits.json): Machine-readable execution logs, exit codes, and test counts.
5. [`REVIEW_HANDOFF.md`](file:///docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/REVIEW_HANDOFF.md): This handoff document.

---

## 3. Strict Boundary Compliance

| Constraint | Compliance Status |
|---|---|
| No production Core code modified | **CONFIRMED** (`chapters.service.ts`, `draft-chapters.repository.ts`, `chapter-revisions.service.ts`, `autonomous-controller.service.ts` unchanged) |
| No AI service production routes modified | **CONFIRMED** |
| No Author IDE production components modified | **CONFIRMED** |
| No writes to `main` or `codex/*` | **CONFIRMED** |
| No direct push to `integration/p1-author` | **CONFIRMED** (Work performed on branch `gemini/p1-ci-isolation`) |
| No assertion weakening or test deletion | **CONFIRMED** (All 14 accept-draft test cases preserved and passing) |
| No live provider calls | **CONFIRMED** (`LLM_PROVIDER=fake`, 0 egress API calls) |
| Do not merge PR | **CONFIRMED** |

---

## 4. Final Verdict

```
P8_CI_ISOLATION_READY_FOR_GPT6_REVIEW
```
