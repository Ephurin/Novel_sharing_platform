# G-01 Outbox Ownership Isolation Report

**Review Finding:** G-01 (P1) — Outbox ownership isolation  
**Component:** `backend/src/modules/novels/test-fixture-lifecycle.ts`  
**Test Suite:** `backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts` (Matrices 19, 21, 22, 23)

---

## 1. Vulnerability Analysis

### Root Cause
Prior to G-01:
1. `registerOutbox(novelId, chapterId, eventId?)` accepted ownership if either `novelId` OR `chapterId` was owned.
2. An exact `eventId` could be registered without proving it was scoped to the registered `novelId:chapterId` pair.
3. Teardown Step 1 executed:
   ```sql
   DELETE FROM revision_outbox_events WHERE event_id = $1
   ```
   without correlating whether the event in PostgreSQL actually belonged to the test's owned `novel_id` and `chapter_id`.
4. As a result, if a test misconfigured or maliciously supplied an event ID belonging to an unrelated fixture (Fixture B), the teardown would delete B's outbox event, destroying unrelated test state while falsely reporting `CLEANED`.
5. Fallback pair deletes `DELETE FROM revision_outbox_events WHERE novel_id = $1 AND chapter_id = $2` did not verify that the chapter actually belonged to the novel before deletion.

---

## 2. Hardened Architecture & Implementation

### A. Both-Parent Ownership Requirement
```typescript
const ownsNovel = this.owned.pgNovels.has(novelId);
const ownsChapter = this.owned.pgChapters.has(chapterId);
if (!ownsNovel || !ownsChapter) {
  throw new Error(
    `Cannot register outbox: ownership of BOTH parent novel and chapter is required ` +
      `(novel ${novelId} owned=${ownsNovel}, chapter ${chapterId} owned=${ownsChapter}). ` +
      `Outbox-only or partially owned outbox fixtures are unsupported.`
  );
}
```

### B. Event-to-Scope Immutable Binding
- Maintained in `this.outboxEventScopes = new Map<string, { novelId: string; chapterId: string }>()`.
- Attempting to re-register an event ID under a different pair is rejected immediately with an explicit error.

### C. Database Correlation & Scoped DELETE
In Step 1a:
1. Correlate with database before mutation:
   ```sql
   SELECT novel_id, chapter_id FROM revision_outbox_events WHERE event_id = $1
   ```
2. If the row's `novel_id` or `chapter_id` does not match the registered scope:
   - Refuse mutation: the foreign row is NEVER touched.
   - Record a sticky ownership violation:
     ```typescript
     this.ownershipViolations.set(violationKey, message);
     ```
   - Aggregate error and fail closed (`CLEANUP_FAILED`).
   - Sticky violations are re-reported on every subsequent cleanup call, preventing the lifecycle from ever claiming `CLEANED`.
3. If ownership is confirmed, execute triple-scoped DELETE:
   ```sql
   DELETE FROM revision_outbox_events WHERE event_id = $1 AND novel_id = $2 AND chapter_id = $3
   ```

### D. Pair Relationship Verification
In Step 1b:
- Checks `SELECT novel_id FROM chapters WHERE chapter_id = $1`.
- If `novel_id` does not match the registered `novelId`, records a sticky relationship violation, refuses pair delete, and fails closed into `CLEANUP_FAILED`.

### E. Triple-Scoped Authoritative Readback
In Step 8:
- Reads back exact outbox event scoped by all three keys:
  ```sql
  SELECT count(*) FROM revision_outbox_events WHERE event_id = $1 AND novel_id = $2 AND chapter_id = $3
  ```

---

## 3. RED / GREEN Evidence

### RED Phase
- In Matrix 21: Mismatched foreign event B registered under fixture A.
- Prior code: executed `DELETE WHERE event_id = $B_ID`, deleting B's event. Assertion `Foreign outbox event B must survive A cleanup` failed (CONFIRMED RED).
- In Matrix 22: Owned novel/chapter pair with relationship mismatch. Prior code: did not verify relationship and executed pair delete (CONFIRMED RED).
- In Matrix 23: Exact DELETE was only `WHERE event_id = $1`, failing triple-scope assertion (CONFIRMED RED).

### GREEN Phase
- With G-01 repairs:
  - Matrix 19: Requires ownership of BOTH parents; passes when both owned.
  - Matrix 21: Fixture A cleanup rejects foreign event B, B's row and `content_hash` survive intact in PostgreSQL, A's legitimate records are cleaned, A's retry remains fail-closed (`CLEANUP_FAILED`), and independent cleanup of B succeeds to `CLEANED`.
  - Matrix 22: Pair relationship mismatch fails closed with `Outbox pair relationship mismatch`, refusing pair delete.
  - Matrix 23: All exact-ID DELETE queries verified triple-scoped (`event_id = $1 AND novel_id = $2 AND chapter_id = $3`). Transient failure retains pending identity; retry recovers to `CLEANED`.
