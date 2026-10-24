# P2-A: Safe Double Cleanup with Sentinels (Red / Green Report)

**Repository:** `Ephurin/Novel_sharing_platform`  
**Branch:** `gemini/p1-ci-isolation`  
**Issue Reference:** P2-A — Double cleanup with sentinels rechecks deleted records and fails  
**Source Commit:** `0d4b524ec6f0dc7f22dcf3b0a55e31c9220930aa`  
**Date:** 2026-10-23  

---

## 1. Problem Statement & Root Cause

### 1.1 The Sentinel State Retention Flaw
In `TestFixtureLifecycle`, Step 9 verified that confirmed sentinel records survived fixture operations:
```typescript
for (const sUserId of this.tracked.confirmedSentinelPgUsers) {
  const uRes = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUserId]);
  assert.equal(Number(uRes.rows[0].count), 1, `Sentinel user ${sUserId} was unexpectedly corrupted or deleted`);
}
```
In Step 10, those sentinels were deleted to leave zero residual test records. However:
1. The sentinel IDs were **retained** in `confirmedSentinelPgUsers`, `confirmedSentinelPgNovels`, etc.
2. The lifecycle did not guard against repeated invocation when already in the `CLEANED` state.
3. On a second `cleanup()` call, Step 9 re-executed and queried for sentinels that Step 10 of the previous run had rightfully deleted.
4. The query returned `count = 0`, causing an assertion failure:
   `Sentinel user ... was unexpectedly corrupted or deleted (0 !== 1)`
5. This triggered secondary errors and attempted additional teardown mutations.

### 1.2 Required Invariants
1. A subsequent cleanup invocation after `CLEANED` must be an idempotent, safe no-op.
2. The second cleanup must execute **zero additional database mutations** (`mutationsAttempted: 0`).
3. Repeated cleanup on an instance with PostgreSQL and MongoDB sentinels must succeed cleanly.
4. The first cleanup must still strictly verify sentinel preservation before deleting them.
5. Incomplete cleanup must remain in `CLEANUP_FAILED` and must not be prematurely marked `CLEANED`.
6. A retry after `CLEANUP_FAILED` must safely resume remaining cleanup without masking error provenance.

---

## 2. Red State Reproduction

A targeted test was run against the prior implementation:
```typescript
const lifecycle = new TestFixtureLifecycle();
await lifecycle.authorize(pool, mongoDb);

const sUId = crypto.randomUUID();
lifecycle.registerSentinelUser(sUId);
await pool.query('INSERT INTO users ... VALUES ($1, ...)', [sUId]);
lifecycle.confirmSentinelUser(sUId);

const uId = crypto.randomUUID();
lifecycle.registerUser(uId);
await pool.query('INSERT INTO users ... VALUES ($1, ...)', [uId]);

// First cleanup
const res1 = await lifecycle.cleanup(pool, mongoDb);
assert.equal(res1.cleaned, true);

// Second cleanup on same instance
const res2 = await lifecycle.cleanup(pool, mongoDb);
```

### Red Failure Log
```text
✖ P2-A RED: Double cleanup on lifecycle with sentinels fails or causes extra mutations (54.9127ms)
  Error: Sentinel preservation assertion failed: Sentinel user 2b6448dd-aef3-4345-80e6-768b4a8cf3ca was unexpectedly corrupted or deleted
  
  0 !== 1
  
      at TestFixtureLifecycle.cleanup (src/modules/novels/test-fixture-lifecycle.ts:353:19)
```

---

## 3. Architectural Repair

1. **State Short-Circuit:**
   At the start of `cleanup()`:
   ```typescript
   if (this.stage === 'CLEANED') {
     return {
       cleaned: true,
       mutationsAttempted: 0,
       stageAtCleanup: 'CLEANED',
       errors: [],
     };
   }
   ```
2. **Sentinel Confirmation Eviction on Teardown:**
   In Step 10, when a sentinel is deleted, it is removed from both `sentinelPg...` and `confirmedSentinelPg...` sets:
   ```typescript
   for (const sUserId of Array.from(this.tracked.sentinelPgUsers)) {
     try {
       mutationsAttempted++;
       await pool.query('DELETE FROM users WHERE user_id = $1', [sUserId]);
       this.tracked.sentinelPgUsers.delete(sUserId);
       this.tracked.confirmedSentinelPgUsers.delete(sUserId);
     } catch (err: any) { ... }
   }
   ```
3. **Resumption Guarantee:**
   If cleanup encounters errors, `this.stage` is set to `CLEANUP_FAILED`. Retrying `cleanup()` will safely attempt only the remaining uncleared entities, preserving error history.

---

## 4. Green State Verification

Implemented in [`fixture-lifecycle-resilience.postgres.test.ts`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/.worktrees/integration_p1_author/backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts):
- **Matrix 10:** Full sentinel suite (PG user, PG novel, PG chapter, Mongo draft) + fixture records.
- First cleanup: `res1.cleaned === true`, `res1.mutationsAttempted > 0`. All residuals: 0.
- Second cleanup: `res2.cleaned === true`, `res2.mutationsAttempted === 0`, `res2.errors.length === 0`.
- External sentinel record: intact (`count === 1`).

### Green Execution Proof
```text
  ✔ Matrix 10: Repeated cleanup with sentinels -> Safe, idempotent, zero residual mutations (P2-A) (43.7666ms)
```
Exit Code: `0`
