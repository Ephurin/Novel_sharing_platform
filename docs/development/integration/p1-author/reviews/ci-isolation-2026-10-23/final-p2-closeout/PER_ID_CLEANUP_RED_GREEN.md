# P2-B: Individual-ID Cleanup Fault Tolerance (Red / Green Report)

**Repository:** `Ephurin/Novel_sharing_platform`  
**Branch:** `gemini/p1-ci-isolation`  
**Issue Reference:** P2-B — Failure deleting first ID in a group prevented cleanup of subsequent IDs  
**Source Commit:** `0d4b524ec6f0dc7f22dcf3b0a55e31c9220930aa`  
**Date:** 2026-10-23  

---

## 1. Problem Statement & Root Cause

### 1.1 The Coarse-Grained Loop Exception Flaw
In the prior implementation of `TestFixtureLifecycle.cleanup()`, resource cleanup operations wrapped entire collections of IDs inside a single `try/catch` block:
```typescript
// Fragile group-level exception handling:
if (this.tracked.pgUsers.size > 0) {
  try {
    mutationsAttempted++;
    for (const userId of this.tracked.pgUsers) {
      await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    }
  } catch (err: any) {
    errors.push(new Error(`Failed to delete users: ...`));
  }
}
```

If an error occurred when deleting the first user (`userId1`):
1. The `for` loop terminated immediately upon throwing.
2. `userId2` and `userId3` were **never attempted**.
3. Those records remained orphaned in the database.
4. The error message did not identify which specific user ID caused the failure.

### 1.2 Required Invariants
1. **Per-ID Fault Isolation:** Deletion failure for ID A must never prevent an attempt to delete ID B or ID C in the same group.
2. **Inter-Group Continuation:** Failure in one resource group (e.g. users or chapters) must not abort attempts in other groups (e.g. MongoDB drafts or sentinels).
3. **Explicit ID Traceability:** Error messages must identify the exact failed resource ID.
4. **Referential Integrity Ordering:** Teardown must strictly maintain dependency order:
   `outbox → chapter FK clearing → revisions → chapters → novels → users → mongo`
5. **No Scope Broadening:** Never resort to bulk `DELETE FROM table` or prefix-wide cleanups.
6. **Transparent Failure Surface:** Cleanup must fail when any ID deletion fails; it must never falsely report `cleaned=true` if records remain.

---

## 2. Red State Reproduction

A targeted fault-injection test was executed against the prior code:
```typescript
const uId1 = crypto.randomUUID();
const uId2 = crypto.randomUUID();
const uId3 = crypto.randomUUID();
lifecycle.registerUser(uId1);
lifecycle.registerUser(uId2);
lifecycle.registerUser(uId3);

// Injected failure specifically for uId1
const spiedPool = {
  query: async (text: string, params?: any[]) => {
    if (text.includes('DELETE FROM users WHERE user_id = $1') && params?.[0] === uId1) {
      throw new Error(`Injected failure deleting user ${uId1}`);
    }
    return pool.query(text, params);
  },
} as unknown as Pool;

await lifecycle.cleanup(spiedPool, mongoDb);
```

### Red Failure Log
```text
✖ P2-B RED: Per-ID cleanup fault tolerance ensures non-failing IDs are still cleaned (27.3983ms)
  AssertionError [ERR_ASSERTION]: uId2 should have been deleted even though uId1 failed
  
  1 !== 0
  
      at TestContext.<anonymous> (src/modules/novels/p2-repro.test.ts:107:12)
```

As demonstrated, `uId2` remained in the database (`count = 1`) because `uId1`'s failure aborted the entire loop.

---

## 3. Architectural Repair

1. **Per-ID `try/catch` Blocks:**
   Every deletion loop now wraps each individual ID independently:
   ```typescript
   for (const userId of Array.from(this.tracked.pgUsers)) {
     try {
       mutationsAttempted++;
       await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
       this.tracked.pgUsers.delete(userId);
     } catch (err: any) {
       errors.push(new Error(`Failed to delete user ${userId}: ${err?.message || String(err)}`));
     }
   }
   ```
2. **Individual State Eviction:**
   When an ID is successfully deleted, it is removed from `this.tracked`. Any failed IDs remain in `this.tracked` for subsequent retries.
3. **Per-ID Readback Error Collection:**
   Post-cleanup readback assertions are also evaluated individually per ID, gathering all residual states into `errors`.
4. **Enhanced Error Transparency:**
   `AggregateError` now formats an itemized summary containing every failed ID and underlying error reason:
   ```typescript
   const details = errors.map((e, idx) => `[${idx + 1}] ${e.message}`).join('; ');
   throw new AggregateError(errors, `Fixture cleanup encountered ${errors.length} failures during teardown: ${details}`);
   ```

---

## 4. Green State Verification

Implemented in [`fixture-lifecycle-resilience.postgres.test.ts`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/.worktrees/integration_p1_author/backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts):
- **Matrix 11 (Fixture Group Fault Tolerance):**
  - 3 users registered (`uId1`, `uId2`, `uId3`).
  - Failure injected on `uId1`.
  - `uId2` and `uId3` were successfully deleted (`count === 0`).
  - `uId1` remained residual (`count === 1`).
  - Error was reported and identified `uId1`.
- **Matrix 12 (Sentinel Group Fault Tolerance):**
  - 2 sentinel users registered (`sU1`, `sU2`).
  - Failure injected on `sU1`.
  - `sU2` was successfully deleted (`count === 0`).
  - Error was reported and identified `sU1`.
- **Matrix 13 (Recoverable Retry):**
  - Transient failure on user deletion forced `CLEANUP_FAILED`.
  - Second cleanup call on the same lifecycle recovered and cleaned the remaining record (`CLEANED`).

### Green Execution Proof
```text
  ✔ Matrix 11: Per-ID cleanup fault tolerance across multiple IDs in the same group (P2-B) (17.7919ms)
  ✔ Matrix 12: Sentinel-group per-ID deletion fault tolerance (P2-B) (11.134ms)
  ✔ Matrix 13: Recoverable retry following CLEANUP_FAILED restores clean state (6.7246ms)
```
Exit Code: `0`
