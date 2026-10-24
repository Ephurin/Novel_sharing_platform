# F-10: False Successful Durable Readback — RED / GREEN Evidence

**Finding:** F-10 — Post-Cleanup Readback Evaded Due to Tracking Set Pruning
**Target File:** `backend/src/modules/novels/test-fixture-lifecycle.ts`
**Reviewer:** GPT-6
**Priority:** P1 — Database Test Safety & Correctness

---

## 1. Problem Description

Prior to the fix, `TestFixtureLifecycle.cleanup()` deleted entity IDs from `this.tracked` sets immediately upon receiving driver execution completion:
```typescript
await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
this.tracked.pgUsers.delete(userId);
```
Subsequently, in Step 8, post-cleanup zero-residual verification iterated over `this.tracked`:
```typescript
for (const userId of Array.from(this.tracked.pgUsers)) {
  const uRes = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [userId]);
  assert.equal(Number(uRes.rows[0].count), 0);
}
```
Because successful driver calls had already emptied `this.tracked.pgUsers`, `this.tracked.pgChapters`, `this.tracked.pgNovels`, and `this.tracked.mongoDrafts`, the verification loops were completely bypassed for all supposedly deleted entities.

If a DELETE operation acknowledged completion but affected zero rows, or if a database trigger/rule/view prevented actual row deletion, the helper falsely returned `{ cleaned: true }` and marked stage as `CLEANED` without ever verifying the durable state.

---

## 2. Controlled RED Reproduction

### Execution Context
- **Script:** `reproduce_f09_f10_red.ts`
- **Methodology:**
  1. Authorize isolated database environment.
  2. Create test user `uId` in PostgreSQL.
  3. Register user via `lifecycle.registerUser(uId)`.
  4. Instrument pool query handler to intercept `DELETE FROM users WHERE user_id = $1` and return `{ rowCount: 1, rows: [] }` without executing the actual deletion.
  5. Call `await lifecycle.cleanup(fakeDeletePool, mongoDb)`.
  6. Inspect real durable row count in PostgreSQL via unmocked pool.

### RED Output Log
```text
--- REPRODUCING F-10: False Successful Durable Readback ---
F-10: Intercepted DELETE query, acknowledging success without executing mutation
F-10: Real PostgreSQL row count for user: 1
F-10: Cleanup result: {
  cleaned: true,
  mutationsAttempted: 1,
  stageAtCleanup: 'FIXTURES_PARTIAL',
  errors: []
}
F-10: Cleanup error: undefined
>>> CONFIRMED F-10 BUG: Cleanup reported cleaned=true even though record still exists in database!
```

### Analysis of RED Result
The lifecycle helper reported `cleaned: true` and stage `CLEANED` even though the user record remained in the PostgreSQL database with `count === 1`. Step 8 did not catch the error because `uId` had been deleted from `tracked.pgUsers`. This verified GPT-6's review finding F-10.

---

## 3. Architecture & Implementation (GREEN)

### Three-Registry Separation of Concerns
1. **Registry A: `owned` (Ownership Registry)**
   - Permanent, immutable record of every fixture identity registered during the session.
   - Never mutated or pruned during teardown operations.
2. **Registry B: `pending` (Pending Deletion Registry)**
   - Tracks identities awaiting teardown. Items are removed only upon successful driver mutation.
   - Retains identities across recoverable failures to support safe retries.
3. **Registry C: `verification` (Verification Registry)**
   - Retains all registered identities specifically for authoritative readback.
   - Step 8 iterates over `this.verification` across all entity types (`pgChapters`, `pgNovels`, `pgUsers`, `pgRevisions`, `mongoDrafts`, `sentinel*`).

### Invariant Enforcement
- A successful mutation acknowledgement is NOT sufficient evidence of zero residual data.
- Authoritative SQL `SELECT count(*)` and MongoDB `countDocuments()` are executed against real storage.
- If `count !== 0`:
  - An error naming the specific persisting ID is pushed to `errors`.
  - The ID is re-added to `this.pending` so subsequent retries will re-attempt deletion.
  - `cleaned` is set to `false`, and `this.stage` transitions to `CLEANUP_FAILED`.
  - The error is thrown (or aggregated in `AggregateError`).
- Only when all readbacks return count 0 with 0 errors is `this.stage` allowed to become `CLEANED`.

---

## 4. Controlled GREEN Verification

### Output Log
```text
--- REPRODUCING F-10: False Successful Durable Readback ---
F-10: Intercepted DELETE query, acknowledging success without executing mutation
F-10: Real PostgreSQL row count for user: 1
F-10: Cleanup result: null
F-10: Cleanup error: Authoritative readback failed: residual user dbb4ade1-5a41-456e-bdfb-a1cdd796b316 persists in PostgreSQL (count=1)
F-10 not reproduced: cleanup failed or row deleted
```

### Regression Suite Coverage
- **Matrix 16 (`fixture-lifecycle-resilience.postgres.test.ts`):**
  PostgreSQL DELETE acknowledged but row persists. Confirms `cleanup()` fails closed, throws descriptive error identifying residual user ID, marks stage `CLEANUP_FAILED`, retains ID in `pending`, and successfully recovers to `CLEANED` on retry with real pool.
- **Matrix 17 (`fixture-lifecycle-resilience.postgres.test.ts`):**
  MongoDB delete acknowledged but document persists. Confirms `cleanup()` fails closed, throws descriptive error identifying residual chapter ID, marks stage `CLEANUP_FAILED`, and recovers to `CLEANED` on retry with real MongoDB.

Both Matrix 16 and Matrix 17 PASS cleanly in local testing and CI.
