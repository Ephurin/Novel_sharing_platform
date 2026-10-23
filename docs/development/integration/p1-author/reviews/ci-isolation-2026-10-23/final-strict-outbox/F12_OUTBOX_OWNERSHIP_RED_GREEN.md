# F-12 Outbox Ownership and Verification Report

**Review Finding:** F-12 — Outbox ownership and independent verification  
**Component:** `backend/src/modules/novels/test-fixture-lifecycle.ts`  
**Test Suite:** `backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts` (Matrix 19, Matrix 20)

---

## 1. Vulnerability Analysis

### Schema and FK Topology
In PostgreSQL schema `backend/src/core/database/migrations/010_analysis_outbox.sql`:
```sql
create table if not exists revision_outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type varchar(50) not null,
  novel_id uuid not null references novels(novel_id) on delete cascade,
  chapter_id uuid not null references chapters(chapter_id) on delete cascade,
  revision_id uuid not null references chapter_revisions(revision_id) on delete cascade,
  ...
);
```

### Vulnerability Details
1. **Unowned registration without validation:** `registerOutbox(novelId, chapterId)` accepted arbitrary IDs without checking whether `novelId` or `chapterId` were owned by the current lifecycle.
2. **Missing authoritative readback:** `verification.pgOutbox` was tracked in the verification registry, but Step 8 never queried PostgreSQL to assert that zero rows remained in `revision_outbox_events`.
3. **Outbox-only fixtures ambiguity:** If an unowned outbox fixture was registered, broad deletion would risk destroying data outside the test boundary.

---

## 2. Safe Contract Implementation

### Explicit Ownership Enforcement
Outbox-only fixtures without an owned parent novel or chapter are unsupported. Any attempt to register an outbox event with unowned parents immediately fails closed:
```typescript
registerOutbox(novelId: string, chapterId: string, eventId?: string): void {
  const ownsNovel = this.owned.pgNovels.has(novelId);
  const ownsChapter = this.owned.pgChapters.has(chapterId);
  if (!ownsNovel && !ownsChapter) {
    throw new Error(
      `Cannot register outbox: outbox-only fixtures without an owned parent novel or chapter are unsupported. ` +
      `Neither novel ${novelId} nor chapter ${chapterId} belongs to this lifecycle's owned fixtures.`
    );
  }
  const key = `${novelId}:${chapterId}`;
  this.owned.pgOutbox.add(key);
  this.pending.pgOutbox.add(key);
  this.verification.pgOutbox.add(key);
  if (eventId) {
    this.owned.pgOutboxEvents.add(eventId);
    this.pending.pgOutboxEvents.add(eventId);
    this.verification.pgOutboxEvents.add(eventId);
  }
}
```

### Exact Event Identity & Readback
- Added `pgOutboxEvents: Set<string>` to `FixtureIdentityTracker`.
- Added `registerOutboxEvent(novelId, chapterId, eventId)` convenience method.
- **Teardown Step 1:**
  - 1a: Exact test-owned event ID deletion (`WHERE event_id = $1`).
  - 1b: Registered scoped novel/chapter pair deletion (`WHERE novel_id = $1 AND chapter_id = $2`).
  - 1c: Owned novel/chapter derived event deletion (`WHERE novel_id = $1`, `WHERE chapter_id = $1`).
- **Teardown Step 8:**
  - Authoritative readback across both `verification.pgOutboxEvents` and `verification.pgOutbox` using `parseStrictRowCount`.
  - If any row persists, logs residual failure, re-queues ID to `pending`, and transitions to `CLEANUP_FAILED`.

---

## 3. RED / GREEN Verification

### RED Phase
- In `reproduce_f11_f12_red.ts`:
  - `registerOutbox(unownedNovelId, unownedChapterId)` was accepted without check.
  - Step 8 performed no readback query on `revision_outbox_events`.

### GREEN Phase
- **Matrix 19 (Ownership Enforcement):**
  - Unowned registration throws fail-closed error matching `/outbox-only fixtures without an owned parent novel or chapter are unsupported/`.
  - Passes once parent is owned.
- **Matrix 20 (Persisted Fixture & Readback):**
  - Real database row inserted into `revision_outbox_events`.
  - Negative proxy intercepts DELETE -> Authoritative readback fails closed with `Authoritative readback failed: residual revision outbox event <eventId> persists in PostgreSQL (count=1)`.
  - Retains event in `pending` registry.
  - Recovery retry with genuine pool deletes outbox row, revision, chapter, novel, user -> verified 0 residuals across all tables.
- Matrix 19 and 20 tests executed: PASS (exit code 0).
