# F-06: Fail-Closed Teardown Mutation Guard (Red / Green Report)

**Repository:** `Ephurin/Novel_sharing_platform`  
**Branch:** `gemini/p1-ci-isolation`  
**Issue Reference:** F-06 — Teardown mutating database after isolation guard rejection  
**Date:** 2026-10-23  

---

## 1. Problem Statement & Mechanism

### 1.1 The Vulnerability
In Node's built-in test runner (`node:test`), suite teardown hooks registered with `after()` are guaranteed to execute even when setup in `before()` fails or throws an exception.

In the prior implementation (`accept-draft-contract.test.ts` and `p1-production-persistence.postgres.test.ts`):
```typescript
before(async () => {
  await validateTestDatabaseIsolation(pool, mongoDb); // May throw
  // ... fixture insertions ...
});

after(async () => {
  // UNCONDITIONALLY ATTEMPTS MUTATIONS:
  await pool.query('DELETE FROM revision_outbox_events ...');
  await pool.query('UPDATE chapters SET latest_revision_id = NULL ...');
  await pool.query('DELETE FROM chapter_revisions ...');
  // ...
});
```

If `validateTestDatabaseIsolation()` rejected the target database (e.g. running against production, missing `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, or pointing at an unauthorized database name), setup threw an error as expected. However, the subsequent `after()` hook ran immediately and issued `DELETE` and `UPDATE` statements against that rejected database.

### 1.2 Target Invariant
The lifecycle must be strictly fail-closed:
1. When the isolation guard rejects authorization, **zero schema mutations, zero fixture inserts, and zero teardown DELETE/UPDATE/DROP statements** may be executed.
2. Only connection pool / client disposal (`disconnectPostgres()`, `disconnectMongo()`) and non-mutating logging are permitted.
3. The original guard rejection error must remain the primary reported error without being masked by teardown exceptions.
4. Mutation call invariant: `mutation_calls_after_guard_rejection === 0`.

---

## 2. Architectural Solution

### 2.1 Explicit Setup Authorization State
We introduced `TestFixtureLifecycle` (`backend/src/modules/novels/test-fixture-lifecycle.ts`):
- `isAuthorized: boolean = false` (initialized to false; never set to true unless `validateTestDatabaseIsolation()` completes without error).
- `stage: SetupStage = 'UNAUTHORIZED'`.
- `mutationCallsAfterRejection: number = 0`.

```typescript
export class TestFixtureLifecycle {
  public isAuthorized: boolean = false;
  public stage: SetupStage = 'UNAUTHORIZED';

  public async authorize(pool: Pool, mongoDb: Db, options?: { expectedDbName?: string }): Promise<void> {
    await validateTestDatabaseIsolation(pool, mongoDb, options);
    this.isAuthorized = true;
    this.stage = 'AUTHORIZED';
  }

  public async cleanup(pool: Pool, mongoDb: Db): Promise<CleanupResult> {
    const stageAtCleanup = this.stage;

    // F-06: GUARANTEE ZERO MUTATIONS IF AUTHORIZATION FAILED
    if (!this.isAuthorized) {
      return {
        cleaned: false,
        mutationsAttempted: 0,
        stageAtCleanup,
        errors: [],
      };
    }
    // ... scoped teardown of registered fixtures only ...
  }
}
```

### 2.2 Test Adapter Instrumentation
We also provided `GuardedDatabaseAdapter` wrapping the connection handles:
```typescript
export class GuardedDatabaseAdapter {
  public mutationCallsAfterRejection = 0;

  public async query(text: string, params?: any[]): Promise<any> {
    if (GuardedDatabaseAdapter.isMutatingQuery(text)) {
      if (!this.lifecycle.isAuthorized) {
        this.mutationCallsAfterRejection++;
        throw new Error(`Mutation rejected by guard: lifecycle authorization has not passed.`);
      }
    }
    return this.pool.query(text, params);
  }
}
```

---

## 3. Red / Green Regression Matrix

A dedicated deterministic unit regression suite was created:  
[`backend/src/core/database/test-db-guard-lifecycle.test.ts`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/.worktrees/integration_p1_author/backend/src/core/database/test-db-guard-lifecycle.test.ts)

| Test ID | Condition | Prior Behavior (Red) | Fixed Behavior (Green) | Verification |
|---|---|---|---|---|
| **F-06.1** | Missing Opt-In (`EPHURIN_ALLOW_TEST_DB_MUTATIONS` unset) | `after()` executed `DELETE FROM ...` | `cleanup()` aborted immediately; 0 queries sent to DB; `mutation_calls === 0` | **PASS (2.9ms)** |
| **F-06.2** | Forbidden PostgreSQL DB (`postgres`, `ephurin`, `production`) | `DELETE` executed on system DB | Guard rejected; `isAuthorized=false`; 0 mutations attempted; `mutation_calls === 0` | **PASS (0.8ms)** |
| **F-06.3** | Forbidden MongoDB DB (`admin`, `local`, `config`, `production`) | `deleteMany` executed on system DB | Guard rejected; `isAuthorized=false`; 0 mutations attempted; `mutation_calls === 0` | **PASS (0.6ms)** |
| **F-06.4** | Expected DB Name Mismatch (`expected` vs `actual`) | Teardown ran on mismatched DB | Guard rejected; `isAuthorized=false`; 0 mutations attempted; `mutation_calls === 0` | **PASS (0.5ms)** |
| **F-06.5** | Guard Query / Connection Failure (`ECONNREFUSED`) | Teardown triggered connection crash | Guard error preserved; teardown skipped all queries; 0 mutations attempted | **PASS (0.6ms)** |
| **F-06.6** | Valid Approved Test DB (`ephurin_test_integration`) with opt-in | N/A | Guard accepted; `isAuthorized=true`; registration allowed | **PASS (0.3ms)** |

### Execution Proof
```bash
$ npx tsx --test src/core/database/test-db-guard-lifecycle.test.ts
▶ F-06 Regression: Fail-Closed Teardown Mutation Guard
  ✔ F-06.1: Missing opt-in rejects guard and executes ZERO teardown mutations (2.9416ms)
  ✔ F-06.2: Forbidden PostgreSQL database name rejects guard and executes ZERO teardown mutations (0.8207ms)
  ✔ F-06.3: Forbidden MongoDB database name rejects guard and executes ZERO teardown mutations (0.6017ms)
  ✔ F-06.4: Expected DB identity mismatch rejects guard and executes ZERO teardown mutations (0.544ms)
  ✔ F-06.5: Guard query/connection failure rejects guard and executes ZERO teardown mutations (0.5742ms)
  ✔ F-06.6: Positive authorization enables valid lifecycle progression (0.2718ms)
✔ F-06 Regression: Fail-Closed Teardown Mutation Guard (7.6955ms)
ℹ tests 6 | suites 1 | pass 6 | fail 0
```
