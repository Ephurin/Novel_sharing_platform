import type { Pool } from 'pg';
import type { Db } from 'mongodb';
import assert from 'node:assert/strict';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';

export type SetupStage =
  | 'UNAUTHORIZED'
  | 'AUTHORIZED'
  | 'SENTINELS_PARTIAL'
  | 'SENTINELS_COMPLETE'
  | 'FIXTURES_PARTIAL'
  | 'FIXTURES_COMPLETE'
  | 'TESTS_RUNNING'
  | 'TESTS_COMPLETE'
  | 'CLEANUP_IN_PROGRESS'
  | 'CLEANED'
  | 'CLEANUP_FAILED';

export interface FixtureIdentityTracker {
  // Registered for teardown (intended or partially created)
  pgUsers: Set<string>;
  pgNovels: Set<string>;
  pgChapters: Set<string>;
  pgRevisions: Set<string>;
  pgOutbox: Set<string>; // keyed as "novelId:chapterId"
  pgOutboxEvents: Set<string>; // exact event_id UUIDs (F-12)
  mongoDrafts: Set<string>;

  // Sentinels registered for teardown
  sentinelPgUsers: Set<string>;
  sentinelPgNovels: Set<string>;
  sentinelPgChapters: Set<string>;
  sentinelMongoDrafts: Set<string>;

  // Sentinels confirmed created (for preservation verification before teardown)
  confirmedSentinelPgUsers: Set<string>;
  confirmedSentinelPgNovels: Set<string>;
  confirmedSentinelPgChapters: Set<string>;
  confirmedSentinelMongoDrafts: Set<string>;
}

export interface CleanupResult {
  cleaned: boolean;
  mutationsAttempted: number;
  stageAtCleanup: SetupStage;
  errors: Error[];
}

/**
 * Strict count parser for PostgreSQL SELECT count(*) readbacks (F-11, G-02).
 * Accepts ONLY:
 * - a non-negative safe integer number, or
 * - a canonical non-negative decimal string (the `pg` driver returns bigint count(*) as a decimal string)
 *   whose value is within Number.MAX_SAFE_INTEGER.
 * Rejects (fail closed, never coerces):
 * - query result without a rows array, or rows.length !== 1
 * - row without an own 'count' property, null or undefined count
 * - empty / whitespace / padded strings, exponent, hex, binary, octal, signed or fractional strings
 * - booleans, arrays, objects and any other non-number/non-string type
 * - NaN, Infinity, negative, negative zero, fractional and unsafe integers
 */
const CANONICAL_DECIMAL_COUNT = /^(?:0|[1-9][0-9]*)$/;

export function parseStrictRowCount(queryResult: unknown, entityName: string, entityId: string): number {
  const fail = (reason: string) =>
    new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: ${reason}`);

  if (!queryResult || typeof queryResult !== 'object' || !Array.isArray((queryResult as any).rows)) {
    throw fail('query result missing rows array');
  }
  const rows: unknown[] = (queryResult as any).rows;
  if (rows.length !== 1) {
    throw fail(`expected exactly 1 row, received ${rows.length}`);
  }
  const row = rows[0] as any;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    !Object.prototype.hasOwnProperty.call(row, 'count') ||
    row.count === null ||
    row.count === undefined
  ) {
    throw fail('count column missing or null in result row');
  }

  const rawCount: unknown = row.count;
  if (typeof rawCount === 'number') {
    if (!Number.isSafeInteger(rawCount) || rawCount < 0 || Object.is(rawCount, -0)) {
      throw fail(`invalid numeric count (${String(rawCount)})`);
    }
    return rawCount;
  }
  if (typeof rawCount === 'string') {
    if (!CANONICAL_DECIMAL_COUNT.test(rawCount)) {
      throw fail(`count is not a canonical non-negative decimal string (${JSON.stringify(rawCount)})`);
    }
    const parsed = Number(rawCount);
    if (!Number.isSafeInteger(parsed)) {
      throw fail(`count exceeds safe integer range (${rawCount})`);
    }
    return parsed;
  }
  throw fail(`unsupported count type ${Array.isArray(rawCount) ? 'array' : typeof rawCount}`);
}

/**
 * Lifecycle-aware test fixture and database isolation manager.
 * Guarantees:
 * 1. Zero mutations if isolation authorization fails or has not occurred (F-06).
 * 2. Scoped, idempotent teardown of test-owned records even after partial setup failures (F-07).
 * 3. Safe, idempotent double cleanup causing zero additional mutations once CLEANED (P2-A).
 * 4. Fault-tolerant per-ID independent deletion preserving referential ordering (P2-B).
 * 5. Structured aggregation of cleanup and readback failures via AggregateError.
 * 6. Preserved Mongo cleanup targets across PG chapter teardown (F-09).
 * 7. Three-registry separation with authoritative durable readback (F-10).
 * 8. Strict fail-closed parsing of PostgreSQL count readbacks (F-11, G-02).
 * 9. Fail-closed outbox ownership and independent outbox readback verification (F-12).
 * 10. Outbox ownership isolation: both parents owned, event bound to its pair, correlated before
 *     a triple-scoped DELETE, and sticky ownership violations that never report CLEANED (G-01).
 */
function createEmptyIdentityTracker(): FixtureIdentityTracker {
  return {
    pgUsers: new Set<string>(),
    pgNovels: new Set<string>(),
    pgChapters: new Set<string>(),
    pgRevisions: new Set<string>(),
    pgOutbox: new Set<string>(),
    pgOutboxEvents: new Set<string>(),
    mongoDrafts: new Set<string>(),
    sentinelPgUsers: new Set<string>(),
    sentinelPgNovels: new Set<string>(),
    sentinelPgChapters: new Set<string>(),
    sentinelMongoDrafts: new Set<string>(),
    confirmedSentinelPgUsers: new Set<string>(),
    confirmedSentinelPgNovels: new Set<string>(),
    confirmedSentinelPgChapters: new Set<string>(),
    confirmedSentinelMongoDrafts: new Set<string>(),
  };
}

export class TestFixtureLifecycle {
  public isAuthorized: boolean = false;
  public stage: SetupStage = 'UNAUTHORIZED';
  public mutationCallsAfterRejection: number = 0;

  /**
   * Registry A: Ownership registry (F-10)
   * Permanent, immutable record of every fixture identity registered during the session.
   * Never pruned during cleanup mutations.
   */
  public readonly owned: FixtureIdentityTracker = createEmptyIdentityTracker();

  /**
   * Registry B: Pending deletion registry (F-10)
   * Tracks incomplete cleanup operations. Items are removed only upon successful driver mutation.
   * Enables safe, fault-tolerant retries after transient failures.
   */
  public readonly pending: FixtureIdentityTracker = createEmptyIdentityTracker();

  /**
   * Registry C: Verification registry (F-10)
   * Retains all identities that must authoritatively read back count === 0 after cleanup.
   * Preserved independently of driver DELETE acknowledgements.
   */
  public readonly verification: FixtureIdentityTracker = createEmptyIdentityTracker();

  /**
   * Backward-compatibility accessor pointing to the pending deletion tracker.
   */
  public get tracked(): FixtureIdentityTracker {
    return this.pending;
  }

  /**
   * G-01: Immutable binding of each registered exact outbox event ID to the novel/chapter pair it was
   * registered under. The exact-ID DELETE and readback are always scoped by this pair.
   */
  private readonly outboxEventScopes = new Map<string, { novelId: string; chapterId: string }>();

  /**
   * G-01: Sticky ownership violations detected during cleanup (foreign event IDs, invalid pairs).
   * Once recorded, the offending identity is never mutated and every subsequent cleanup reports the
   * violation, so the lifecycle can never claim CLEANED.
   */
  public readonly ownershipViolations = new Map<string, string>();

  /**
   * Enforces the fail-closed mutation guard.
   * If authorization fails, isAuthorized remains false and stage remains UNAUTHORIZED.
   */
  public async authorize(
    pool: Pool,
    mongoDb: Db,
    options?: { expectedDbName?: string }
  ): Promise<void> {
    await validateTestDatabaseIsolation(pool, mongoDb, options);
    this.isAuthorized = true;
    this.stage = 'AUTHORIZED';
  }

  // Sentinel registration and confirmation methods
  public registerSentinelUser(id: string): void {
    this.assertAuthorized('registerSentinelUser');
    this.owned.sentinelPgUsers.add(id);
    this.pending.sentinelPgUsers.add(id);
    this.verification.sentinelPgUsers.add(id);
    this.stage = 'SENTINELS_PARTIAL';
  }

  public confirmSentinelUser(id: string): void {
    this.owned.confirmedSentinelPgUsers.add(id);
    this.pending.confirmedSentinelPgUsers.add(id);
    this.verification.confirmedSentinelPgUsers.add(id);
  }

  public registerSentinelNovel(id: string): void {
    this.assertAuthorized('registerSentinelNovel');
    this.owned.sentinelPgNovels.add(id);
    this.pending.sentinelPgNovels.add(id);
    this.verification.sentinelPgNovels.add(id);
    this.stage = 'SENTINELS_PARTIAL';
  }

  public confirmSentinelNovel(id: string): void {
    this.owned.confirmedSentinelPgNovels.add(id);
    this.pending.confirmedSentinelPgNovels.add(id);
    this.verification.confirmedSentinelPgNovels.add(id);
  }

  public registerSentinelChapter(id: string): void {
    this.assertAuthorized('registerSentinelChapter');
    this.owned.sentinelPgChapters.add(id);
    this.pending.sentinelPgChapters.add(id);
    this.verification.sentinelPgChapters.add(id);
    this.stage = 'SENTINELS_PARTIAL';
  }

  public confirmSentinelChapter(id: string): void {
    this.owned.confirmedSentinelPgChapters.add(id);
    this.pending.confirmedSentinelPgChapters.add(id);
    this.verification.confirmedSentinelPgChapters.add(id);
  }

  public registerSentinelMongoDraft(id: string): void {
    this.assertAuthorized('registerSentinelMongoDraft');
    this.owned.sentinelMongoDrafts.add(id);
    this.pending.sentinelMongoDrafts.add(id);
    this.verification.sentinelMongoDrafts.add(id);
  }

  public confirmSentinelMongoDraft(id: string): void {
    this.owned.confirmedSentinelMongoDrafts.add(id);
    this.pending.confirmedSentinelMongoDrafts.add(id);
    this.verification.confirmedSentinelMongoDrafts.add(id);
    this.stage = 'SENTINELS_COMPLETE';
  }

  // Fixture registration methods
  public registerUser(id: string): void {
    this.assertAuthorized('registerUser');
    this.owned.pgUsers.add(id);
    this.pending.pgUsers.add(id);
    this.verification.pgUsers.add(id);
    this.stage = 'FIXTURES_PARTIAL';
  }

  public registerNovel(id: string): void {
    this.assertAuthorized('registerNovel');
    this.owned.pgNovels.add(id);
    this.pending.pgNovels.add(id);
    this.verification.pgNovels.add(id);
    this.stage = 'FIXTURES_PARTIAL';
  }

  public registerChapter(id: string): void {
    this.assertAuthorized('registerChapter');
    this.owned.pgChapters.add(id);
    this.pending.pgChapters.add(id);
    this.verification.pgChapters.add(id);
    // F-09: Every owned chapter is also eligible for MongoDB draft cleanup even if
    // registerMongoDraft was not explicitly called.
    this.owned.mongoDrafts.add(id);
    this.pending.mongoDrafts.add(id);
    this.verification.mongoDrafts.add(id);
    this.stage = 'FIXTURES_PARTIAL';
  }

  public registerRevision(id: string): void {
    this.assertAuthorized('registerRevision');
    this.owned.pgRevisions.add(id);
    this.pending.pgRevisions.add(id);
    this.verification.pgRevisions.add(id);
    this.stage = 'FIXTURES_PARTIAL';
  }

  /**
   * Registers outbox events scoped to a novel/chapter pair, optionally with an exact eventId (F-12, G-01).
   * Fail-closed ownership contract:
   * - BOTH the parent novel and the parent chapter must already be owned by this lifecycle.
   * - An exact eventId is bound to exactly one pair; re-binding it to a different pair is rejected.
   * - The pair relationship and the event's real parents are verified against PostgreSQL at cleanup.
   */
  public registerOutbox(novelId: string, chapterId: string, eventId?: string): void {
    this.assertAuthorized('registerOutbox');
    const ownsNovel = this.owned.pgNovels.has(novelId);
    const ownsChapter = this.owned.pgChapters.has(chapterId);
    if (!ownsNovel || !ownsChapter) {
      throw new Error(
        `Cannot register outbox: ownership of BOTH parent novel and chapter is required ` +
          `(novel ${novelId} owned=${ownsNovel}, chapter ${chapterId} owned=${ownsChapter}). ` +
          `Outbox-only or partially owned outbox fixtures are unsupported.`
      );
    }
    if (eventId) {
      const existing = this.outboxEventScopes.get(eventId);
      if (existing && (existing.novelId !== novelId || existing.chapterId !== chapterId)) {
        throw new Error(
          `Cannot register outbox event ${eventId}: already registered under a different novel/chapter pair ` +
            `(${existing.novelId}:${existing.chapterId}), refusing re-binding to ${novelId}:${chapterId}.`
        );
      }
    }
    const key = `${novelId}:${chapterId}`;
    this.owned.pgOutbox.add(key);
    this.pending.pgOutbox.add(key);
    this.verification.pgOutbox.add(key);
    if (eventId) {
      this.outboxEventScopes.set(eventId, { novelId, chapterId });
      this.owned.pgOutboxEvents.add(eventId);
      this.pending.pgOutboxEvents.add(eventId);
      this.verification.pgOutboxEvents.add(eventId);
    }
    this.stage = 'FIXTURES_PARTIAL';
  }

  /**
   * Convenience registration for an exact outbox event ID (F-12, G-01).
   * Argument order: (eventId, novelId, chapterId).
   */
  public registerOutboxEvent(eventId: string, novelId: string, chapterId: string): void {
    this.registerOutbox(novelId, chapterId, eventId);
  }

  public registerMongoDraft(chapterId: string): void {
    this.assertAuthorized('registerMongoDraft');
    this.owned.mongoDrafts.add(chapterId);
    this.pending.mongoDrafts.add(chapterId);
    this.verification.mongoDrafts.add(chapterId);
    this.stage = 'FIXTURES_COMPLETE';
  }

  public markTestsRunning(): void {
    this.stage = 'TESTS_RUNNING';
  }

  public markTestsComplete(): void {
    this.stage = 'TESTS_COMPLETE';
  }

  public assertAuthorized(action: string): void {
    if (!this.isAuthorized) {
      this.mutationCallsAfterRejection++;
      throw new Error(`Cannot perform ${action}: database mutation authorization was rejected or not performed.`);
    }
  }

  /**
   * Safe, lifecycle-aware cleanup.
   * If authorization was rejected, executes ZERO database mutations (F-06).
   * If already CLEANED, executes ZERO mutations as an idempotent no-op (P2-A).
   * If authorized, tears down test-owned identities with per-ID error isolation (P2-B).
   * Preserves MongoDB draft cleanup targets even after PG chapter deletion (F-09).
   * Verifies authoritative absence of all registered identities via durable readback (F-10).
   * Fails closed on malformed PostgreSQL count readbacks (F-11).
   * Verifies outbox ownership and independently reads back outbox events (F-12).
   */
  public async cleanup(
    pool: Pool,
    mongoDb: Db
  ): Promise<CleanupResult> {
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

    // P2-A: IDEMPOTENT NO-OP IF ALREADY SUCCESSFULLY CLEANED
    if (this.stage === 'CLEANED') {
      return {
        cleaned: true,
        mutationsAttempted: 0,
        stageAtCleanup: 'CLEANED',
        errors: [],
      };
    }

    this.stage = 'CLEANUP_IN_PROGRESS';
    const errors: Error[] = [];
    let mutationsAttempted = 0;

    // G-01: Previously recorded ownership violations are sticky and re-reported on every cleanup.
    for (const message of this.ownershipViolations.values()) {
      errors.push(new Error(message));
    }

    // STEP 1: Delete derived revision outbox events with established ownership (F-12, G-01, P2-B per-ID)
    // 1a. Exact test-owned event IDs: correlate the persisted row with the registered pair, then DELETE
    //     scoped by event_id + novel_id + chapter_id. A foreign/mismatched event is never mutated.
    for (const eventId of Array.from(this.pending.pgOutboxEvents)) {
      const violationKey = `event:${eventId}`;
      if (this.ownershipViolations.has(violationKey)) {
        this.pending.pgOutboxEvents.delete(eventId);
        continue;
      }
      const scope = this.outboxEventScopes.get(eventId);
      try {
        if (!scope) {
          throw new Error(`no registered novel/chapter scope for outbox event ${eventId}`);
        }
        const found = await pool.query(
          'SELECT novel_id, chapter_id FROM revision_outbox_events WHERE event_id = $1',
          [eventId]
        );
        if (!found || !Array.isArray(found.rows)) {
          throw new Error(`malformed ownership correlation result for outbox event ${eventId}`);
        }
        if (found.rows.length === 0) {
          // Already absent (e.g. FK cascade or prior run); Step 8 still verifies authoritatively.
          this.pending.pgOutboxEvents.delete(eventId);
          continue;
        }
        const actual = found.rows[0];
        if (found.rows.length !== 1 || actual.novel_id !== scope.novelId || actual.chapter_id !== scope.chapterId) {
          const message =
            `Outbox ownership mismatch: event ${eventId} belongs to novel ${actual?.novel_id} / chapter ${actual?.chapter_id}, ` +
            `not registered pair ${scope.novelId}:${scope.chapterId}; refusing to delete a foreign outbox event`;
          this.ownershipViolations.set(violationKey, message);
          this.pending.pgOutboxEvents.delete(eventId);
          errors.push(new Error(message));
          continue;
        }
        mutationsAttempted++;
        await pool.query(
          'DELETE FROM revision_outbox_events WHERE event_id = $1 AND novel_id = $2 AND chapter_id = $3',
          [eventId, scope.novelId, scope.chapterId]
        );
        this.pending.pgOutboxEvents.delete(eventId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for event ${eventId}: ${err?.message || String(err)}`));
      }
    }
    // 1b. Registered novel/chapter pairs: both IDs are owned (registration contract); additionally verify
    //     the chapter really belongs to the registered novel before the pair-scoped DELETE.
    for (const key of Array.from(this.pending.pgOutbox)) {
      const violationKey = `pair:${key}`;
      if (this.ownershipViolations.has(violationKey)) {
        this.pending.pgOutbox.delete(key);
        continue;
      }
      try {
        const [novelId, chapterId] = key.split(':');
        const rel = await pool.query('SELECT novel_id FROM chapters WHERE chapter_id = $1', [chapterId]);
        if (!rel || !Array.isArray(rel.rows)) {
          throw new Error(`malformed relationship result for chapter ${chapterId}`);
        }
        if (rel.rows.length === 0) {
          // Chapter absent: FK guarantees no outbox rows can reference it. Step 8 still verifies.
          this.pending.pgOutbox.delete(key);
          continue;
        }
        if (rel.rows[0].novel_id !== novelId) {
          const message =
            `Outbox pair relationship mismatch: chapter ${chapterId} belongs to novel ${rel.rows[0].novel_id}, ` +
            `not registered novel ${novelId}; refusing pair-scoped outbox delete`;
          this.ownershipViolations.set(violationKey, message);
          this.pending.pgOutbox.delete(key);
          errors.push(new Error(message));
          continue;
        }
        mutationsAttempted++;
        await pool.query('DELETE FROM revision_outbox_events WHERE novel_id = $1 AND chapter_id = $2', [novelId, chapterId]);
        this.pending.pgOutbox.delete(key);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for pair ${key}: ${err?.message || String(err)}`));
      }
    }
    // 1c. Per owned parent. Blast-radius note (G-01 review): revision_outbox_events.novel_id and
    //     .chapter_id are ON DELETE CASCADE, so these deletes remove exactly the rows that deleting the
    //     owned novel/chapter in Steps 4-5 would cascade-delete anyway. They never reach rows whose
    //     parents are not owned by this lifecycle; they only make FK ordering explicit.
    for (const novelId of Array.from(this.pending.pgNovels)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM revision_outbox_events WHERE novel_id = $1', [novelId]);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for novel ${novelId}: ${err?.message || String(err)}`));
      }
    }
    for (const chapterId of Array.from(this.pending.pgChapters)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM revision_outbox_events WHERE chapter_id = $1', [chapterId]);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 2: Nullify latest_revision_id FK on chapters before deleting revisions (P2-B per-ID)
    for (const chapterId of Array.from(this.pending.pgChapters)) {
      try {
        mutationsAttempted++;
        await pool.query('UPDATE chapters SET latest_revision_id = NULL WHERE chapter_id = $1', [chapterId]);
      } catch (err: any) {
        errors.push(new Error(`Failed to clear chapters latest_revision_id FK for chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 3: Delete chapter revisions per tracked entity (P2-B per-ID)
    for (const novelId of Array.from(this.pending.pgNovels)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM chapter_revisions WHERE novel_id = $1', [novelId]);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete chapter_revisions for novel ${novelId}: ${err?.message || String(err)}`));
      }
    }
    for (const chapterId of Array.from(this.pending.pgChapters)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM chapter_revisions WHERE chapter_id = $1', [chapterId]);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete chapter_revisions for chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }
    for (const revId of Array.from(this.pending.pgRevisions)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM chapter_revisions WHERE revision_id = $1', [revId]);
        this.pending.pgRevisions.delete(revId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete chapter_revisions for revision ${revId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 4: Delete chapters per ID (P2-B per-ID)
    for (const chapterId of Array.from(this.pending.pgChapters)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM chapters WHERE chapter_id = $1', [chapterId]);
        this.pending.pgChapters.delete(chapterId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 5: Delete novels per ID (P2-B per-ID)
    for (const novelId of Array.from(this.pending.pgNovels)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM novels WHERE novel_id = $1', [novelId]);
        this.pending.pgNovels.delete(novelId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete novel ${novelId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 6: Delete author users per ID (P2-B per-ID)
    for (const userId of Array.from(this.pending.pgUsers)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        this.pending.pgUsers.delete(userId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete user ${userId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 7: Delete Mongo draft_chapters per ID (F-09: targets derived from pending Mongo targets and stable ownership)
    // Chapters registered in PG are preserved as Mongo cleanup targets even after Step 4 PG chapter deletion
    const targetChapterIds = Array.from(new Set([...this.pending.mongoDrafts, ...this.owned.pgChapters]));
    for (const chapterId of targetChapterIds) {
      try {
        mutationsAttempted++;
        await mongoDb.collection('draft_chapters').deleteMany({ chapterId });
        this.pending.mongoDrafts.delete(chapterId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete MongoDB draft_chapters for chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 8: Post-cleanup authoritative readback verification across all verification identities (F-10, F-11, F-12)
    // Driver DELETE acknowledgement alone is insufficient: every owned entity must read back count === 0
    // Malformed readbacks must fail closed (F-11)
    for (const chapterId of Array.from(this.verification.pgChapters)) {
      try {
        const cRes = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [chapterId]);
        const count = parseStrictRowCount(cRes, 'chapter', chapterId);
        if (count !== 0) {
          this.pending.pgChapters.add(chapterId);
          errors.push(new Error(`Authoritative readback failed: residual chapter ${chapterId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgChapters.add(chapterId);
        errors.push(new Error(`Post-cleanup readback query failed for chapter ${chapterId}: ${err?.message || String(err)}`));
      }
    }

    for (const novelId of Array.from(this.verification.pgNovels)) {
      try {
        const nRes = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [novelId]);
        const count = parseStrictRowCount(nRes, 'novel', novelId);
        if (count !== 0) {
          this.pending.pgNovels.add(novelId);
          errors.push(new Error(`Authoritative readback failed: residual novel ${novelId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgNovels.add(novelId);
        errors.push(new Error(`Post-cleanup readback query failed for novel ${novelId}: ${err?.message || String(err)}`));
      }
    }

    for (const userId of Array.from(this.verification.pgUsers)) {
      try {
        const uRes = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [userId]);
        const count = parseStrictRowCount(uRes, 'user', userId);
        if (count !== 0) {
          this.pending.pgUsers.add(userId);
          errors.push(new Error(`Authoritative readback failed: residual user ${userId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgUsers.add(userId);
        errors.push(new Error(`Post-cleanup readback query failed for user ${userId}: ${err?.message || String(err)}`));
      }
    }

    for (const revId of Array.from(this.verification.pgRevisions)) {
      try {
        const rRes = await pool.query('SELECT count(*) FROM chapter_revisions WHERE revision_id = $1', [revId]);
        const count = parseStrictRowCount(rRes, 'chapter revision', revId);
        if (count !== 0) {
          this.pending.pgRevisions.add(revId);
          errors.push(new Error(`Authoritative readback failed: residual chapter revision ${revId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgRevisions.add(revId);
        errors.push(new Error(`Post-cleanup readback query failed for revision ${revId}: ${err?.message || String(err)}`));
      }
    }

    // F-12 / G-01: Independent authoritative readback for exact outbox events, scoped to the registered pair
    for (const eventId of Array.from(this.verification.pgOutboxEvents)) {
      try {
        const scope = this.outboxEventScopes.get(eventId);
        if (!scope) {
          throw new Error(`no registered novel/chapter scope for outbox event ${eventId}`);
        }
        const obRes = await pool.query(
          'SELECT count(*) FROM revision_outbox_events WHERE event_id = $1 AND novel_id = $2 AND chapter_id = $3',
          [eventId, scope.novelId, scope.chapterId]
        );
        const count = parseStrictRowCount(obRes, 'revision outbox event', eventId);
        if (count !== 0) {
          this.pending.pgOutboxEvents.add(eventId);
          errors.push(new Error(`Authoritative readback failed: residual revision outbox event ${eventId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        if (!this.ownershipViolations.has(`event:${eventId}`)) {
          this.pending.pgOutboxEvents.add(eventId);
        }
        errors.push(new Error(`Post-cleanup readback query failed for revision outbox event ${eventId}: ${err?.message || String(err)}`));
      }
    }

    for (const key of Array.from(this.verification.pgOutbox)) {
      try {
        const [novelId, chapterId] = key.split(':');
        const obRes = await pool.query('SELECT count(*) FROM revision_outbox_events WHERE novel_id = $1 AND chapter_id = $2', [novelId, chapterId]);
        const count = parseStrictRowCount(obRes, 'revision outbox pair', key);
        if (count !== 0) {
          this.pending.pgOutbox.add(key);
          errors.push(new Error(`Authoritative readback failed: residual revision outbox events persist for pair ${key} in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgOutbox.add(key);
        errors.push(new Error(`Post-cleanup readback query failed for revision outbox pair ${key}: ${err?.message || String(err)}`));
      }
    }

    const allMongoVerificationIds = Array.from(new Set([...this.verification.mongoDrafts, ...this.verification.pgChapters]));
    for (const mongoId of allMongoVerificationIds) {
      try {
        const mCount = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: mongoId });
        if (mCount !== 0) {
          this.pending.mongoDrafts.add(mongoId);
          errors.push(new Error(`Authoritative readback failed: residual MongoDB draft_chapters persists for chapter ${mongoId} (count=${mCount})`));
        }
      } catch (err: any) {
        this.pending.mongoDrafts.add(mongoId);
        errors.push(new Error(`Post-cleanup readback query failed for MongoDB draft ${mongoId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 9: Sentinel preservation check (verify confirmed sentinels that are still tracked survived)
    for (const sUserId of Array.from(this.pending.confirmedSentinelPgUsers)) {
      try {
        const uRes = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUserId]);
        const count = parseStrictRowCount(uRes, 'sentinel user', sUserId);
        assert.equal(count, 1, `Sentinel user ${sUserId} was unexpectedly corrupted or deleted`);
      } catch (err: any) {
        errors.push(new Error(`Sentinel preservation assertion failed: ${err?.message || String(err)}`));
      }
    }
    for (const sNovelId of Array.from(this.pending.confirmedSentinelPgNovels)) {
      try {
        const nRes = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [sNovelId]);
        const count = parseStrictRowCount(nRes, 'sentinel novel', sNovelId);
        assert.equal(count, 1, `Sentinel novel ${sNovelId} was unexpectedly corrupted or deleted`);
      } catch (err: any) {
        errors.push(new Error(`Sentinel preservation assertion failed: ${err?.message || String(err)}`));
      }
    }
    for (const sChapId of Array.from(this.pending.confirmedSentinelPgChapters)) {
      try {
        const cRes = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [sChapId]);
        const count = parseStrictRowCount(cRes, 'sentinel chapter', sChapId);
        assert.equal(count, 1, `Sentinel chapter ${sChapId} was unexpectedly corrupted or deleted`);
      } catch (err: any) {
        errors.push(new Error(`Sentinel preservation assertion failed: ${err?.message || String(err)}`));
      }
    }
    for (const sDraftId of Array.from(this.pending.confirmedSentinelMongoDrafts)) {
      try {
        const mCount = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: sDraftId });
        assert.equal(mCount, 1, `Sentinel MongoDB draft ${sDraftId} was unexpectedly corrupted or deleted`);
      } catch (err: any) {
        errors.push(new Error(`Sentinel preservation assertion failed: ${err?.message || String(err)}`));
      }
    }

    // STEP 10: Teardown sentinels (independent execution per resource ID)
    for (const sChapId of Array.from(this.pending.sentinelPgChapters)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM chapters WHERE chapter_id = $1', [sChapId]);
        this.pending.sentinelPgChapters.delete(sChapId);
        this.pending.confirmedSentinelPgChapters.delete(sChapId);
      } catch (err: any) {
        errors.push(new Error(`Failed to teardown sentinel chapter ${sChapId}: ${err?.message || String(err)}`));
      }
    }
    for (const sNovelId of Array.from(this.pending.sentinelPgNovels)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM novels WHERE novel_id = $1', [sNovelId]);
        this.pending.sentinelPgNovels.delete(sNovelId);
        this.pending.confirmedSentinelPgNovels.delete(sNovelId);
      } catch (err: any) {
        errors.push(new Error(`Failed to teardown sentinel novel ${sNovelId}: ${err?.message || String(err)}`));
      }
    }
    for (const sUserId of Array.from(this.pending.sentinelPgUsers)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM users WHERE user_id = $1', [sUserId]);
        this.pending.sentinelPgUsers.delete(sUserId);
        this.pending.confirmedSentinelPgUsers.delete(sUserId);
      } catch (err: any) {
        errors.push(new Error(`Failed to teardown sentinel user ${sUserId}: ${err?.message || String(err)}`));
      }
    }
    for (const sDraftId of Array.from(this.pending.sentinelMongoDrafts)) {
      try {
        mutationsAttempted++;
        await mongoDb.collection('draft_chapters').deleteMany({ chapterId: sDraftId });
        this.pending.sentinelMongoDrafts.delete(sDraftId);
        this.pending.confirmedSentinelMongoDrafts.delete(sDraftId);
      } catch (err: any) {
        errors.push(new Error(`Failed to teardown sentinel Mongo draft ${sDraftId}: ${err?.message || String(err)}`));
      }
    }

    // STEP 11: Authoritative readback verification for sentinels (F-11 strict count)
    for (const sChapId of Array.from(this.verification.sentinelPgChapters)) {
      try {
        const cRes = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [sChapId]);
        const count = parseStrictRowCount(cRes, 'sentinel chapter', sChapId);
        if (count !== 0) {
          this.pending.sentinelPgChapters.add(sChapId);
          errors.push(new Error(`Authoritative readback failed: residual sentinel chapter ${sChapId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.sentinelPgChapters.add(sChapId);
        errors.push(new Error(`Post-cleanup readback failed for sentinel chapter ${sChapId}: ${err?.message || String(err)}`));
      }
    }
    for (const sNovelId of Array.from(this.verification.sentinelPgNovels)) {
      try {
        const nRes = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [sNovelId]);
        const count = parseStrictRowCount(nRes, 'sentinel novel', sNovelId);
        if (count !== 0) {
          this.pending.sentinelPgNovels.add(sNovelId);
          errors.push(new Error(`Authoritative readback failed: residual sentinel novel ${sNovelId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.sentinelPgNovels.add(sNovelId);
        errors.push(new Error(`Post-cleanup readback failed for sentinel novel ${sNovelId}: ${err?.message || String(err)}`));
      }
    }
    for (const sUserId of Array.from(this.verification.sentinelPgUsers)) {
      try {
        const uRes = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUserId]);
        const count = parseStrictRowCount(uRes, 'sentinel user', sUserId);
        if (count !== 0) {
          this.pending.sentinelPgUsers.add(sUserId);
          errors.push(new Error(`Authoritative readback failed: residual sentinel user ${sUserId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.sentinelPgUsers.add(sUserId);
        errors.push(new Error(`Post-cleanup readback failed for sentinel user ${sUserId}: ${err?.message || String(err)}`));
      }
    }
    for (const sDraftId of Array.from(this.verification.sentinelMongoDrafts)) {
      try {
        const mCount = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: sDraftId });
        if (mCount !== 0) {
          this.pending.sentinelMongoDrafts.add(sDraftId);
          errors.push(new Error(`Authoritative readback failed: residual sentinel Mongo draft ${sDraftId} persists (count=${mCount})`));
        }
      } catch (err: any) {
        this.pending.sentinelMongoDrafts.add(sDraftId);
        errors.push(new Error(`Post-cleanup readback failed for sentinel Mongo draft ${sDraftId}: ${err?.message || String(err)}`));
      }
    }

    const cleaned = errors.length === 0;
    this.stage = cleaned ? 'CLEANED' : 'CLEANUP_FAILED';

    const result: CleanupResult = {
      cleaned,
      mutationsAttempted,
      stageAtCleanup,
      errors,
    };

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      const details = errors.map((e, idx) => `[${idx + 1}] ${e.message}`).join('; ');
      throw new AggregateError(errors, `Fixture cleanup encountered ${errors.length} failures during teardown: ${details}`);
    }

    return result;
  }
}

/**
 * Isolated test adapter wrapping pool and mongoDb to verify that no mutation calls
 * ever reach the database when authorization is rejected.
 */
export class GuardedDatabaseAdapter {
  public mutationCallsAfterRejection: number = 0;
  public totalMutationsAttempted: number = 0;
  public totalQueries: number = 0;

  constructor(
    public readonly lifecycle: TestFixtureLifecycle,
    public readonly pool: Pool,
    public readonly mongoDb: Db
  ) {}

  public static isMutatingQuery(sql: string): boolean {
    return /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(sql);
  }

  public async query(text: string, params?: any[]): Promise<any> {
    this.totalQueries++;
    if (GuardedDatabaseAdapter.isMutatingQuery(text)) {
      if (!this.lifecycle.isAuthorized) {
        this.mutationCallsAfterRejection++;
        throw new Error(
          `Mutation rejected by guard: lifecycle authorization has not passed. Query: ${text.slice(0, 40)}`
        );
      }
      this.totalMutationsAttempted++;
    }
    return this.pool.query(text, params);
  }
}
