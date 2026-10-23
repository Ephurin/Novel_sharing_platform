# F-09: Mongo Cleanup Target Loss — RED / GREEN Evidence

**Finding:** F-09 — Incomplete MongoDB Draft Cleanup Target Derivation
**Target File:** `backend/src/modules/novels/test-fixture-lifecycle.ts`
**Reviewer:** GPT-6
**Priority:** P1 — Database Test Safety & Correctness

---

## 1. Problem Description

Prior to the fix, `TestFixtureLifecycle.cleanup()` purged chapter IDs from `this.tracked.pgChapters` in Step 4 (`DELETE FROM chapters WHERE chapter_id = $1`). Subsequently, in Step 7, MongoDB cleanup targets were derived via:
```typescript
const targetChapterIds = Array.from(new Set([...this.tracked.mongoDrafts, ...this.tracked.pgChapters]));
```
Because `this.tracked.pgChapters` was already mutated and cleared during Step 4, any chapter that was registered via `registerChapter(chapterId)` without explicit `registerMongoDraft(chapterId)` lost its MongoDB draft deletion target. When Core reconciliation or dual-write operations (`acceptDraft`) created a MongoDB document in `draft_chapters`, that document remained orphaned in MongoDB following teardown, violating test isolation.

---

## 2. Controlled RED Reproduction

### Execution Context
- **Script:** `reproduce_f09_f10_red.ts`
- **Methodology:**
  1. Authorize isolated database environment (`validateTestDatabaseIsolation`).
  2. Create test user, novel, and chapter in PostgreSQL.
  3. Register user (`registerUser`), novel (`registerNovel`), chapter (`registerChapter`).
  4. Intentionally do NOT call `registerMongoDraft(chapterId)`.
  5. Insert matching draft document in MongoDB `draft_chapters` for `chapterId`.
  6. Execute `await lifecycle.cleanup(pool, mongoDb)`.
  7. Query MongoDB collection `draft_chapters` for `chapterId`.

### RED Output Log
```text
--- REPRODUCING F-09: Mongo Cleanup Target Loss ---
F-09: MongoDB count before cleanup: 1
F-09: Cleanup returned cleaned: true
F-09: MongoDB count after cleanup: 1
>>> CONFIRMED F-09 BUG: MongoDB draft orphaned! Document count after cleanup is 1
```

### Analysis of RED Result
The previous lifecycle helper reported `cleaned: true` while silently leaving the MongoDB draft chapter document in the database (`count === 1`). This verified GPT-6's review finding F-09.

---

## 3. Architecture & Implementation (GREEN)

### Separation of Ownership vs. Mutation Targets
1. **`owned` Registry:** Every registered chapter (`registerChapter(id)`) is automatically added to `this.owned.mongoDrafts`, guaranteeing that every chapter owned by the test session is permanently recognized as an eligible MongoDB draft target.
2. **`pending` Registry:** Chapters are queued in `this.pending.mongoDrafts`. Even after Step 4 removes the chapter from `pending.pgChapters`, `pending.mongoDrafts` remains populated.
3. **Target Calculation:** Step 7 derives target IDs from:
   ```typescript
   const targetChapterIds = Array.from(new Set([...this.pending.mongoDrafts, ...this.owned.pgChapters]));
   ```
   This ensures that even if earlier stages mutated partial tracking sets, no owned chapter is ever lost from MongoDB teardown.
4. **Authoritative Readback:** Step 8 verifies `countDocuments({ chapterId }) === 0` for all owned chapters in `this.verification.mongoDrafts`.

---

## 4. Controlled GREEN Verification

### Output Log
```text
--- REPRODUCING F-09: Mongo Cleanup Target Loss ---
F-09: MongoDB count before cleanup: 1
F-09: Cleanup returned cleaned: true
F-09: MongoDB count after cleanup: 0
F-09 not reproduced: draft was cleaned
```

### Regression Suite Coverage
- **Matrix 14 (`fixture-lifecycle-resilience.postgres.test.ts`):**
  Registers PostgreSQL chapter only, inserts MongoDB reconciliation draft, executes cleanup, confirms MongoDB document count reads back exactly 0.
- **Matrix 15 (`fixture-lifecycle-resilience.postgres.test.ts`):**
  Registers MongoDB draft independently without PostgreSQL chapter registration, confirms targeted deletion and 0 residual documents.

Both Matrix 14 and Matrix 15 PASS cleanly in local testing and CI.
