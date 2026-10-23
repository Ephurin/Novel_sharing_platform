# F-07: Partial Setup Cleanup and Sentinel Lifecycle Matrix

**Repository:** `Ephurin/Novel_sharing_platform`  
**Branch:** `gemini/p1-ci-isolation`  
**Issue Reference:** F-07 — Partial fixture setup failure prevents complete cleanup  
**Date:** 2026-10-23  

---

## 1. Problem Statement & Root Cause

### 1.1 The Fragile Teardown Flaw
Prior teardown implementations assumed all fixture records and all sentinel records had been successfully seeded:
```typescript
// Legacy teardown snippet:
const sentinelUserCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sentinelUserId]);
assert.equal(Number(sentinelUserCheck.rows[0].count), 1, 'Sentinel user was unexpectedly deleted');
```

If `before()` failed midway through fixture setup:
1. **False Corruption:** If setup failed before creating the sentinel MongoDB draft, the sentinel check threw an assertion error (`expected 1, got 0`), misclassifying an incomplete setup as database corruption.
2. **Aborted Teardown:** In JavaScript/TypeScript, an unhandled exception inside teardown immediately halts execution of subsequent teardown statements. Consequently, any tables or collections created *before* the failure (such as users or novels) were never deleted, leaving residual records in the test database.

### 1.2 Required Invariants
1. **Resilience to Incomplete Setup:** If setup aborts at any point, whatever resources were actually created must be thoroughly and safely cleaned up.
2. **Accurate Sentinel Preservation:** Sentinels that were actually created must be asserted intact; missing sentinels due to incomplete setup must never be misclassified as corruption.
3. **Independent Cleanup Steps:** Failure in one cleanup step (e.g., an outbox deletion error) must not abort the remaining cleanup steps (revisions, chapters, novels, users, mongo, sentinels).
4. **Transparent Failure Reporting:** Errors during cleanup must be collected and surfaced (via `AggregateError`), never swallowed or hidden.

---

## 2. Architectural Design

### 2.1 Lifecycle Stage Progression
The `TestFixtureLifecycle` tracks setup progress through distinct stages:
- `UNAUTHORIZED`
- `AUTHORIZED`
- `SENTINELS_PARTIAL`
- `SENTINELS_COMPLETE`
- `FIXTURES_PARTIAL`
- `FIXTURES_COMPLETE`
- `TESTS_RUNNING`
- `TESTS_COMPLETE`
- `CLEANUP_IN_PROGRESS`
- `CLEANED` / `CLEANUP_FAILED`

### 2.2 Dual-Set Sentinel Tracking
To prevent false-positive corruption reports on partial setup, the tracker maintains:
- `sentinelPgUsers`, `sentinelPgNovels`, etc.: Identifiers registered for teardown (if created, will be deleted).
- `confirmedSentinelPgUsers`, `confirmedSentinelPgNovels`, etc.: Identifiers confirmed created. Sentinel survival checks in Step 9 are executed **only against confirmed sentinels**.

### 2.3 10-Step Independent Teardown Pipeline
Teardown proceeds in 10 sequential, individually wrapped steps:
- **Step 1:** Delete derived revision outbox events.
- **Step 2:** Nullify `latest_revision_id` foreign key pointers on chapters.
- **Step 3:** Delete chapter revisions.
- **Step 4:** Delete chapters.
- **Step 5:** Delete novels.
- **Step 6:** Delete author users.
- **Step 7:** Delete MongoDB draft chapters.
- **Step 8:** Post-cleanup zero-residual readbacks for tracked entities.
- **Step 9:** Sentinel preservation check on confirmed sentinels.
- **Step 10:** Independent deletion of sentinels across PostgreSQL and MongoDB.

If any step encounters an error, it is appended to `errors: Error[]`, and subsequent steps proceed. If errors exist at the end of cleanup, `AggregateError` is thrown.

---

## 3. The 10-Point Fault Injection Matrix

Implemented and verified in [`backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/.worktrees/integration_p1_author/backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts):

| Scenario ID | Fault Injected | Expected Lifecycle Behavior | Verification Result |
|---|---|---|---|
| **Matrix 1** | Guard fails before setup (mismatched DB name) | `isAuthorized=false`; 0 mutations executed during teardown | **PASS (2.5ms)** |
| **Matrix 2** | Failure after first PostgreSQL fixture INSERT (user created, novel throws) | Owned user deleted during teardown; 0 residual users | **PASS (39.9ms)** |
| **Matrix 3** | Failure during PostgreSQL fixture setup (user + novel created, chapter throws) | Both novel and user deleted; 0 residual records | **PASS (15.0ms)** |
| **Matrix 4** | Failure before Mongo fixture creation (all PG records created, Mongo throws) | All PG records cleaned; 0 residual PG records; Mongo clean | **PASS (56.9ms)** |
| **Matrix 5** | Failure immediately after Mongo insertion | Mongo draft document deleted; 0 residual documents | **PASS (9.0ms)** |
| **Matrix 6** | Failure midway through sentinel creation (sentinel user created, sentinel novel aborted) | Uncreated sentinel novel NOT misclassified as corruption; sentinel user cleaned; suite succeeds | **PASS (12.0ms)** |
| **Matrix 7** | Failure during ordinary test execution (test throws) | Sentinels preserved during test failure; fixtures cleaned; sentinels cleaned at step 10 | **PASS (12.2ms)** |
| **Matrix 8** | First cleanup operation fails (mock lock on `revision_outbox_events`) | Revisions, chapters, novels, users STILL deleted; error surfaced via `AggregateError` | **PASS (18.6ms)** |
| **Matrix 9** | Successful complete run | All sentinels survive tests; 0 residual records across PostgreSQL and MongoDB | **PASS (50.4ms)** |
| **Matrix 10** | Repeated cleanup execution | Idempotent second cleanup call succeeds without error or side-effects | **PASS (6.0ms)** |

### Execution Log Proof
```text
▶ F-07 Fault Injection Matrix: Fixture Lifecycle & Teardown Resilience
  ✔ Matrix 1: Guard fails before setup -> Zero mutations executed (2.4896ms)
  ✔ Matrix 2: Failure after first PostgreSQL fixture INSERT -> Owned user cleaned (39.907ms)
  ✔ Matrix 3: Failure during PostgreSQL fixture setup -> Partial records cleaned (15.0041ms)
  ✔ Matrix 4: Failure before Mongo fixture creation -> Safe cleanup of all PG records (56.9023ms)
  ✔ Matrix 5: Failure immediately after Mongo insertion -> Mongo record cleaned (9.0193ms)
  ✔ Matrix 6: Failure midway through sentinel creation -> Existing sentinels cleaned, no false corruption (11.9547ms)
  ✔ Matrix 7: Failure during ordinary test execution -> Fixture cleanup still attempted and sentinels preserved (12.2231ms)
  ✔ Matrix 8: First cleanup operation fails -> Independent cleanup continues; suite surfaces failure (18.5813ms)
  ✔ Matrix 9: Successful complete run -> Zero residual records across PG and MongoDB (50.3873ms)
  ✔ Matrix 10: Repeated cleanup -> Safe, idempotent, zero residual mutations (5.9658ms)
✔ F-07 Fault Injection Matrix: Fixture Lifecycle & Teardown Resilience (257.2366ms)
ℹ tests 10 | suites 1 | pass 10 | fail 0
```
