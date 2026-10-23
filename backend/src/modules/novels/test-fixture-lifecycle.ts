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
 * Strict count parser for PostgreSQL SELECT count(*) readbacks (F-11).
 * Rejects:
 * - query result not having rows array
 * - rows.length !== 1 (must be exactly 1 row)
 * - row without 'count' property
 * - count is null or undefined
 * - count is not a valid integer or < 0
 * - NaN, Infinity
 */
function parseStrictRowCount(queryResult: any, entityName: string, entityId: string): number {
  if (!queryResult || typeof queryResult !== 'object' || !Array.isArray(queryResult.rows)) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: query result missing rows array`);
  }
  if (queryResult.rows.length !== 1) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: expected exactly 1 row, received ${queryResult.rows.length}`);
  }
  const row = queryResult.rows[0];
  if (!row || typeof row !== 'object' || !('count' in row) || row.count === null || row.count === undefined) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: count column missing or null in result row`);
  }
  const rawCount = row.count;
  const parsed = typeof rawCount === 'number' ? rawCount : Number(rawCount);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: invalid count value (${String(rawCount)})`);
  }
  return parsed;
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
 * 8. Strict fail-closed parsing of PostgreSQL count readbacks (F-11).
 * 9. Fail-closed outbox ownership and independent outbox readback verification (F-12).
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
   * Registers outbox events scoped to novel and chapter, optionally with exact eventId (F-12).
   * Enforces fail-closed ownership: outbox-only fixtures without an owned novel or chapter are unsupported.
   */
  public registerOutbox(novelId: string, chapterId: string, eventId?: string): void {
    this.assertAuthorized('registerOutbox');
    // F-12: Enforce established ownership. Outbox-only fixtures without owned parent novel or chapter fail closed.
    if (!this.owned.pgNovels.has(novelId) && !this.owned.pgChapters.has(chapterId)) {
      throw new Error(
        `Cannot register outbox: outbox-only fixtures without an owned parent novel or chapter are unsupported. Neither novel ${novelId} nor chapter ${chapterId} belongs to this lifecycle's owned fixtures.`
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
    this.stage = 'FIXTURES_PARTIAL';
  }

  /**
   * Convenience registration for an exact outbox event ID (F-12).
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

    // STEP 1: Delete derived revision outbox events with established ownership (F-12, P2-B per-ID)
    // 1a. Delete by exact test-owned event ID if registered
    for (const eventId of Array.from(this.pending.pgOutboxEvents)) {
      try {
        mutationsAttempted++;
        await pool.query('DELETE FROM revision_outbox_events WHERE event_id = $1', [eventId]);
        this.pending.pgOutboxEvents.delete(eventId);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for event ${eventId}: ${err?.message || String(err)}`));
      }
    }
    // 1b. Delete by registered scoped novelId:chapterId pair
    for (const key of Array.from(this.pending.pgOutbox)) {
      try {
        mutationsAttempted++;
        const [novelId, chapterId] = key.split(':');
        await pool.query('DELETE FROM revision_outbox_events WHERE novel_id = $1 AND chapter_id = $2', [novelId, chapterId]);
        this.pending.pgOutbox.delete(key);
      } catch (err: any) {
        errors.push(new Error(`Failed to delete revision_outbox_events for pair ${key}: ${err?.message || String(err)}`));
      }
    }
    // 1c. Delete per owned novel and chapter
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

    // F-12: Independent authoritative readback for revision outbox events
    for (const eventId of Array.from(this.verification.pgOutboxEvents)) {
      try {
        const obRes = await pool.query('SELECT count(*) FROM revision_outbox_events WHERE event_id = $1', [eventId]);
        const count = parseStrictRowCount(obRes, 'revision outbox event', eventId);
        if (count !== 0) {
          this.pending.pgOutboxEvents.add(eventId);
          errors.push(new Error(`Authoritative readback failed: residual revision outbox event ${eventId} persists in PostgreSQL (count=${count})`));
        }
      } catch (err: any) {
        this.pending.pgOutboxEvents.add(eventId);
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
