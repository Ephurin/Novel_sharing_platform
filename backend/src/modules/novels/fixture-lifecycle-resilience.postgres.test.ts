import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from './chapter-writer.js';
import { TestFixtureLifecycle, parseStrictRowCount } from './test-fixture-lifecycle.js';

describe('F-07 Fault Injection Matrix: Fixture Lifecycle & Teardown Resilience', () => {
  const pool = getPostgresPool();
  const mongoDb = getMongoDatabase();

  before(async () => {
    // Ensure test database isolation is valid before running suite
    const guardCheck = new TestFixtureLifecycle();
    await guardCheck.authorize(pool, mongoDb);
  });

  after(async () => {
    await disconnectPostgres();
    await disconnectMongo();
    await disconnectChapterWriter();
  });

  test('Matrix 1: Guard fails before setup -> Zero mutations executed', async () => {
    const lifecycle = new TestFixtureLifecycle();
    let guardError: Error | null = null;
    try {
      await lifecycle.authorize(pool, mongoDb, { expectedDbName: 'ephurin_nonexistent_target_db' });
    } catch (err: any) {
      guardError = err;
    }
    assert.ok(guardError, 'Expected guard rejection on mismatched DB name');
    assert.equal(lifecycle.isAuthorized, false);

    // Call teardown
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, false);
    assert.equal(result.mutationsAttempted, 0);
    assert.equal(result.errors.length, 0);
  });

  test('Matrix 2: Failure after first PostgreSQL fixture INSERT -> Owned user cleaned', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix2_${Date.now()}`, `m2_${Date.now()}@ephurin.com`]
    );

    // Verify insertion
    const beforeCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(beforeCheck.rows[0].count), 1);

    // Simulate failure immediately after first insert
    const setupError = new Error('Simulated failure after first PG fixture INSERT');
    assert.ok(setupError);

    // Teardown executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    // Readback verification: user is completely cleaned
    const afterCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(afterCheck.rows[0].count), 0);
  });

  test('Matrix 3: Failure during PostgreSQL fixture setup -> Partial records cleaned', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix3_${Date.now()}`, `m3_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Matrix 3 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `m3-slug-${Date.now()}`, uId]
    );

    // Simulate failure before chapter setup
    const setupError = new Error('Simulated failure before chapter creation');
    assert.ok(setupError);

    // Teardown executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    // Readback verification
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    const nCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    assert.equal(Number(uCheck.rows[0].count), 0);
    assert.equal(Number(nCheck.rows[0].count), 0);
  });

  test('Matrix 4: Failure before Mongo fixture creation -> Safe cleanup of all PG records', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();
    const cId = crypto.randomUUID();
    const rId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix4_${Date.now()}`, `m4_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Matrix 4 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `m4-slug-${Date.now()}`, uId]
    );

    lifecycle.registerChapter(cId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Matrix 4 Chapter', 1, 'DRAFT')`,
      [cId, nId]
    );

    lifecycle.registerRevision(rId);
    await pool.query(
      `INSERT INTO chapter_revisions (revision_id, chapter_id, novel_id, content, content_hash, source_type)
       VALUES ($1, $2, $3, 'Prose', 'hash', 'AUTHOR_MANUAL')`,
      [rId, cId, nId]
    );

    await pool.query('UPDATE chapters SET latest_revision_id = $1 WHERE chapter_id = $2', [rId, cId]);

    // Simulate failure right before MongoDB insertion
    const setupError = new Error('Simulated failure before Mongo draft creation');
    assert.ok(setupError);

    // Teardown executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    // Verify all PG records are cleaned
    const rCheck = await pool.query('SELECT count(*) FROM chapter_revisions WHERE revision_id = $1', [rId]);
    const cCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [cId]);
    const nCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(rCheck.rows[0].count), 0);
    assert.equal(Number(cCheck.rows[0].count), 0);
    assert.equal(Number(nCheck.rows[0].count), 0);
    assert.equal(Number(uCheck.rows[0].count), 0);
  });

  test('Matrix 5: Failure immediately after Mongo insertion -> Mongo record cleaned', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const cId = crypto.randomUUID();
    lifecycle.registerMongoDraft(cId);

    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: cId,
      novelId: crypto.randomUUID(),
      title: 'Matrix 5 Draft',
      content: 'Draft content',
      createdAt: new Date(),
    });

    const mBefore = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mBefore, 1);

    // Simulate failure immediately after Mongo insert
    const setupError = new Error('Simulated failure after Mongo insertion');
    assert.ok(setupError);

    // Teardown executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    const mAfter = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mAfter, 0);
  });

  test('Matrix 6: Failure midway through sentinel creation -> Existing sentinels cleaned, no false corruption', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const sUId = crypto.randomUUID();
    lifecycle.registerSentinelUser(sUId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sUId, `sentinel_m6_${Date.now()}`, `sm6_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sUId);

    // Register intended sentinel novel but fail BEFORE creating it
    const sNId = crypto.randomUUID();
    lifecycle.registerSentinelNovel(sNId);
    // Intentionally NOT confirming sNId because insertion was not performed!

    // Teardown executes: should NOT fail with corruption for sNId
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    // Sentinel user was removed during sentinel cleanup
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUId]);
    assert.equal(Number(uCheck.rows[0].count), 0);
  });

  test('Matrix 7: Failure during ordinary test execution -> Fixture cleanup still attempted and sentinels preserved', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    // Create sentinel
    const sUId = crypto.randomUUID();
    lifecycle.registerSentinelUser(sUId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sUId, `sentinel_m7_${Date.now()}`, `sm7_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sUId);

    // Create fixture
    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `fixture_m7_${Date.now()}`, `fm7_${Date.now()}@ephurin.com`]
    );

    lifecycle.markTestsRunning();

    // Simulate test failure
    const testFailure = new Error('Simulated test execution assertion failure');
    assert.ok(testFailure);

    // Teardown executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);

    // Verify fixture user is gone
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(uCheck.rows[0].count), 0);

    // Verify sentinel user was also cleaned up at step 10
    const sCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUId]);
    assert.equal(Number(sCheck.rows[0].count), 0);
  });

  test('Matrix 8: First cleanup operation fails -> Independent cleanup continues; suite surfaces failure', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();
    const cId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix8_${Date.now()}`, `m8_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Matrix 8 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `m8-slug-${Date.now()}`, uId]
    );

    lifecycle.registerChapter(cId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Matrix 8 Chapter', 1, 'DRAFT')`,
      [cId, nId]
    );

    lifecycle.registerOutbox(nId, cId);

    // Create a proxy pool that fails on revision_outbox_events delete
    const failingPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM revision_outbox_events')) {
          throw new Error('Simulated locked revision_outbox_events table');
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    // Cleanup must throw AggregateError or Error, reporting the failure
    let cleanupError: Error | null = null;
    try {
      await lifecycle.cleanup(failingPool, mongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    assert.ok(cleanupError, 'Cleanup should have surfaced the failure');
    assert.match(cleanupError.message, /revision_outbox_events/i);

    // BUT chapters, novels, users MUST still have been deleted independently!
    const cCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [cId]);
    const nCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(cCheck.rows[0].count), 0, 'Chapters should still be cleaned');
    assert.equal(Number(nCheck.rows[0].count), 0, 'Novels should still be cleaned');
    assert.equal(Number(uCheck.rows[0].count), 0, 'Users should still be cleaned');
  });

  test('Matrix 9: Successful complete run -> Zero residual records across PG and MongoDB', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    // Sentinels
    const sUId = crypto.randomUUID();
    const sNId = crypto.randomUUID();
    const sCId = crypto.randomUUID();
    const sMId = crypto.randomUUID();

    lifecycle.registerSentinelUser(sUId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sUId, `sentinel_m9_${Date.now()}`, `sm9_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sUId);

    lifecycle.registerSentinelNovel(sNId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Sentinel 9', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [sNId, `s9-slug-${Date.now()}`, sUId]
    );
    lifecycle.confirmSentinelNovel(sNId);

    lifecycle.registerSentinelChapter(sCId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Sentinel 9 Chapter', 999, 'DRAFT')`,
      [sCId, sNId]
    );
    lifecycle.confirmSentinelChapter(sCId);

    lifecycle.registerSentinelMongoDraft(sMId);
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: sMId,
      novelId: sNId,
      title: 'Sentinel 9 Mongo',
      content: 'Prose',
    });
    lifecycle.confirmSentinelMongoDraft(sMId);

    // Fixtures
    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();
    const cId = crypto.randomUUID();
    const rId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `fixture_m9_${Date.now()}`, `fm9_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Fixture 9 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `f9-slug-${Date.now()}`, uId]
    );

    lifecycle.registerChapter(cId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Fixture 9 Chapter', 1, 'DRAFT')`,
      [cId, nId]
    );

    lifecycle.registerRevision(rId);
    await pool.query(
      `INSERT INTO chapter_revisions (revision_id, chapter_id, novel_id, content, content_hash, source_type)
       VALUES ($1, $2, $3, 'Fixture Prose', 'hash', 'AUTHOR_MANUAL')`,
      [rId, cId, nId]
    );

    await pool.query('UPDATE chapters SET latest_revision_id = $1 WHERE chapter_id = $2', [rId, cId]);

    lifecycle.registerMongoDraft(cId);
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: cId,
      novelId: nId,
      title: 'Fixture 9 Mongo',
      content: 'Prose',
    });

    lifecycle.markTestsRunning();
    lifecycle.markTestsComplete();

    const cleanupResult = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(cleanupResult.cleaned, true);

    // Verify all fixtures cleaned
    const fRev = await pool.query('SELECT count(*) FROM chapter_revisions WHERE revision_id = $1', [rId]);
    const fChap = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [cId]);
    const fNovel = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    const fUser = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    const fMongo = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });

    assert.equal(Number(fRev.rows[0].count), 0);
    assert.equal(Number(fChap.rows[0].count), 0);
    assert.equal(Number(fNovel.rows[0].count), 0);
    assert.equal(Number(fUser.rows[0].count), 0);
    assert.equal(fMongo, 0);

    // Verify all sentinels cleaned
    const sChap = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [sCId]);
    const sNovel = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [sNId]);
    const sUser = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUId]);
    const sMongo = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: sMId });

    assert.equal(Number(sChap.rows[0].count), 0);
    assert.equal(Number(sNovel.rows[0].count), 0);
    assert.equal(Number(sUser.rows[0].count), 0);
    assert.equal(sMongo, 0);
  });

  test('Matrix 10: Repeated cleanup with sentinels -> Safe, idempotent, zero residual mutations (P2-A)', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    // Unrelated sentinel in background to verify it remains untouched
    const externalSentinelId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [externalSentinelId, `ext_sentinel_${Date.now()}`, `ext_${Date.now()}@ephurin.com`]
    );

    // Sentinel fixtures owned by this lifecycle
    const sUId = crypto.randomUUID();
    const sNId = crypto.randomUUID();
    const sCId = crypto.randomUUID();
    const sMId = crypto.randomUUID();

    lifecycle.registerSentinelUser(sUId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sUId, `sentinel_m10_${Date.now()}`, `sm10_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sUId);

    lifecycle.registerSentinelNovel(sNId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status) VALUES ($1, 'Sentinel 10', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [sNId, `s10-slug-${Date.now()}`, sUId]
    );
    lifecycle.confirmSentinelNovel(sNId);

    lifecycle.registerSentinelChapter(sCId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status) VALUES ($1, $2, 'Sentinel 10 Chapter', 999, 'DRAFT')`,
      [sCId, sNId]
    );
    lifecycle.confirmSentinelChapter(sCId);

    lifecycle.registerSentinelMongoDraft(sMId);
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: sMId,
      novelId: sNId,
      title: 'Sentinel 10 Mongo',
      content: 'Prose',
    });
    lifecycle.confirmSentinelMongoDraft(sMId);

    // Regular test fixtures
    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix10_${Date.now()}`, `m10_${Date.now()}@ephurin.com`]
    );

    // First cleanup
    const res1 = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res1.cleaned, true);
    assert.ok(res1.mutationsAttempted > 0, 'First cleanup must execute teardown mutations');

    // Verify zero residual records
    const uCheck1 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    const suCheck1 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sUId]);
    const snCheck1 = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [sNId]);
    const scCheck1 = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [sCId]);
    const smCheck1 = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: sMId });

    assert.equal(Number(uCheck1.rows[0].count), 0);
    assert.equal(Number(suCheck1.rows[0].count), 0);
    assert.equal(Number(snCheck1.rows[0].count), 0);
    assert.equal(Number(scCheck1.rows[0].count), 0);
    assert.equal(smCheck1, 0);

    // Second repeated cleanup on same lifecycle instance (P2-A invariant)
    const res2 = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res2.cleaned, true);
    assert.equal(res2.mutationsAttempted, 0, 'Second cleanup must cause ZERO additional database mutations');
    assert.equal(res2.errors.length, 0);
    assert.equal(res2.stageAtCleanup, 'CLEANED');

    // External sentinel was untouched
    const extCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [externalSentinelId]);
    assert.equal(Number(extCheck.rows[0].count), 1, 'External sentinel must remain untouched');
    await pool.query('DELETE FROM users WHERE user_id = $1', [externalSentinelId]);
  });

  test('Matrix 11: Per-ID cleanup fault tolerance across multiple IDs in the same group (P2-B)', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId1 = crypto.randomUUID();
    const uId2 = crypto.randomUUID();
    const uId3 = crypto.randomUUID();

    lifecycle.registerUser(uId1);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId1, `m11_u1_${Date.now()}`, `m11_u1_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerUser(uId2);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId2, `m11_u2_${Date.now()}`, `m11_u2_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerUser(uId3);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId3, `m11_u3_${Date.now()}`, `m11_u3_${Date.now()}@ephurin.com`]
    );

    // Proxy pool that specifically fails when deleting uId1, but allows uId2 and uId3
    const spiedPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM users WHERE user_id = $1') && params?.[0] === uId1) {
          throw new Error(`Injected failure deleting user ${uId1}`);
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    let cleanupError: any = null;
    try {
      await lifecycle.cleanup(spiedPool, mongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    assert.ok(cleanupError, 'Cleanup must fail and report the failure');
    assert.match(cleanupError.message, new RegExp(uId1), 'Error message must identify failed user ID');
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');

    // uId2 and uId3 MUST still have been deleted
    const check2 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId2]);
    const check3 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId3]);
    assert.equal(Number(check2.rows[0].count), 0, 'uId2 must be deleted despite uId1 failure');
    assert.equal(Number(check3.rows[0].count), 0, 'uId3 must be deleted despite uId1 failure');

    // uId1 remains residual in DB
    const check1 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId1]);
    assert.equal(Number(check1.rows[0].count), 1, 'uId1 should remain in DB pending recovery');

    // Manual cleanup of uId1
    await pool.query('DELETE FROM users WHERE user_id = $1', [uId1]);
  });

  test('Matrix 12: Sentinel-group per-ID deletion fault tolerance (P2-B)', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const sU1 = crypto.randomUUID();
    const sU2 = crypto.randomUUID();

    lifecycle.registerSentinelUser(sU1);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sU1, `sentinel_m12_1_${Date.now()}`, `sm12_1_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sU1);

    lifecycle.registerSentinelUser(sU2);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [sU2, `sentinel_m12_2_${Date.now()}`, `sm12_2_${Date.now()}@ephurin.com`]
    );
    lifecycle.confirmSentinelUser(sU2);

    // Fail deletion specifically on sentinel sU1
    const spiedPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM users WHERE user_id = $1') && params?.[0] === sU1) {
          throw new Error(`Injected failure deleting sentinel user ${sU1}`);
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    let cleanupError: any = null;
    try {
      await lifecycle.cleanup(spiedPool, mongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    assert.ok(cleanupError, 'Cleanup must report failure when sentinel deletion fails');
    assert.match(cleanupError.message, new RegExp(sU1));

    // Sentinel sU2 must still have been deleted
    const check2 = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sU2]);
    assert.equal(Number(check2.rows[0].count), 0, 'sU2 must be deleted despite sU1 failure');

    // Manual cleanup of sU1
    await pool.query('DELETE FROM users WHERE user_id = $1', [sU1]);
  });

  test('Matrix 13: Recoverable retry following CLEANUP_FAILED restores clean state', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `m13_u_${Date.now()}`, `m13_${Date.now()}@ephurin.com`]
    );

    let failOnce = true;
    const transientPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM users') && failOnce) {
          failOnce = false;
          throw new Error('Transient database lock failure');
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    // First cleanup fails due to transient error
    let err1: any = null;
    try {
      await lifecycle.cleanup(transientPool, mongoDb);
    } catch (err: any) {
      err1 = err;
    }
    assert.ok(err1, 'First cleanup must fail and report error');
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');

    // Retry cleanup on same lifecycle: recovers and deletes remaining user
    const res2 = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res2.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(uCheck.rows[0].count), 0);
  });

  test('Matrix 14: F-09 Mongo draft cleaned when only PostgreSQL chapter registered', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();
    const cId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `m14_u_${Date.now()}`, `m14_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Matrix 14 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `m14-slug-${Date.now()}`, uId]
    );

    // Register chapter ONLY (intentionally NOT calling registerMongoDraft)
    lifecycle.registerChapter(cId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Matrix 14 Chapter', 1, 'DRAFT')`,
      [cId, nId]
    );

    // Insert draft document in MongoDB simulating Core reconciliation / dual-write
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: cId,
      novelId: nId,
      title: 'Matrix 14 Reconciliation Draft',
      content: 'Auto-reconciled prose',
      createdAt: new Date(),
    });

    const mBefore = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mBefore, 1);

    // Cleanup executes
    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    // Authoritative readback across both stores
    const cCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [cId]);
    const nCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    const mCheck = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });

    assert.equal(Number(cCheck.rows[0].count), 0, 'PG chapter must be deleted');
    assert.equal(Number(nCheck.rows[0].count), 0, 'PG novel must be deleted');
    assert.equal(Number(uCheck.rows[0].count), 0, 'PG user must be deleted');
    assert.equal(mCheck, 0, 'MongoDB draft document must NOT be orphaned even without registerMongoDraft');
  });

  test('Matrix 15: F-09 Mongo draft registered independently of PostgreSQL chapter', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const independentChapterId = crypto.randomUUID();
    const mockNovelId = crypto.randomUUID();

    // Register Mongo draft independently (no PG chapter registration)
    lifecycle.registerMongoDraft(independentChapterId);
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: independentChapterId,
      novelId: mockNovelId,
      title: 'Matrix 15 Independent Draft',
      content: 'Independent draft content',
      createdAt: new Date(),
    });

    const mBefore = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: independentChapterId });
    assert.equal(mBefore, 1);

    const result = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(result.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    const mAfter = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: independentChapterId });
    assert.equal(mAfter, 0, 'Independently registered Mongo draft must be cleanly deleted');
  });

  test('Matrix 16: F-10 PostgreSQL DELETE acknowledged but matching row remains -> Durable readback fails closed', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `m16_u_${Date.now()}`, `m16_${Date.now()}@ephurin.com`]
    );

    // Mock pool where DELETE acknowledged by driver (rowCount=1) but leaves row intact in database
    const fakeAcknowledgedPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM users WHERE user_id = $1') && params?.[0] === uId) {
          // Acknowledge driver success without actually deleting the record
          return { rowCount: 1, rows: [] };
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    let cleanupError: any = null;
    try {
      await lifecycle.cleanup(fakeAcknowledgedPool, mongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    // Must NOT return cleaned: true; must fail with CLEANUP_FAILED
    assert.ok(cleanupError, 'Cleanup must throw error when record persists despite acknowledged DELETE');
    assert.match(cleanupError.message, new RegExp(uId), 'Error message must identify the residual user ID');
    assert.match(cleanupError.message, /Authoritative readback failed: residual user/i);
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');

    // Authoritative check: record genuinely still exists
    const rowCheckBefore = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(rowCheckBefore.rows[0].count), 1);

    // Identity was retained in pending registry for safe retry:
    assert.ok(lifecycle.pending.pgUsers.has(uId), 'Residual user ID must be retained in pending deletion registry');

    // Retry with real pool: recovers to true zero-residual state
    const retryResult = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(retryResult.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    const rowCheckAfter = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(rowCheckAfter.rows[0].count), 0, 'User must be absent after retry');
  });

  test('Matrix 17: F-10 MongoDB delete acknowledged but matching document remains -> Durable readback fails closed', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const cId = crypto.randomUUID();
    lifecycle.registerMongoDraft(cId);

    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: cId,
      novelId: crypto.randomUUID(),
      title: 'Matrix 17 Fake Delete Draft',
      content: 'Prose',
      createdAt: new Date(),
    });

    const mBefore = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mBefore, 1);

    // Mock mongoDb where deleteMany acknowledges driver success but does NOT delete document
    const fakeMongoDb = {
      collection: (name: string) => {
        const realCol = mongoDb.collection(name);
        if (name === 'draft_chapters') {
          return {
            ...realCol,
            deleteMany: async (_filter: any) => {
              // Return driver acknowledgement without deleting
              return { acknowledged: true, deletedCount: 1 };
            },
            countDocuments: (query: any) => realCol.countDocuments(query),
          };
        }
        return realCol;
      },
    } as unknown as typeof mongoDb;

    let cleanupError: any = null;
    try {
      await lifecycle.cleanup(pool, fakeMongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    assert.ok(cleanupError, 'Cleanup must throw error when MongoDB document persists despite delete acknowledgement');
    assert.match(cleanupError.message, new RegExp(cId), 'Error message must identify the residual chapter ID');
    assert.match(cleanupError.message, /Authoritative readback failed: residual MongoDB draft_chapters/i);
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');

    // Document genuinely still exists
    const mCheckBefore = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mCheckBefore, 1);

    // Retry with real MongoDB: recovers to zero-residual state
    const retryResult = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(retryResult.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    const mCheckAfter = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: cId });
    assert.equal(mCheckAfter, 0, 'Document must be absent after recovery retry');
  });

  test('Matrix 18: F-11 Malformed PostgreSQL readback must fail closed and report affected resource', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `m18_u_${Date.now()}`, `m18_${Date.now()}@ephurin.com`]
    );

    // Mock pool that executes real DELETE queries, but returns malformed results on readback SELECT count(*)
    let callCount = 0;
    const malformedPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('SELECT count(*) FROM users WHERE user_id = $1') && params?.[0] === uId) {
          callCount++;
          if (callCount === 1) {
            // Malformed case 1: empty rows array
            return { rows: [] };
          } else if (callCount === 2) {
            // Malformed case 2: null count
            return { rows: [{ count: null }] };
          } else {
            // Malformed case 3: invalid count string / non-number
            return { rows: [{ count: 'not-an-int' }] };
          }
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    // Test Case 1: Empty rows array
    let cleanupErr: any = null;
    try {
      await lifecycle.cleanup(malformedPool, mongoDb);
    } catch (err: any) {
      cleanupErr = err;
    }

    assert.ok(cleanupErr, 'Cleanup must fail closed when readback query returns empty rows array');
    assert.match(cleanupErr.message, /Malformed PostgreSQL readback for user/i);
    assert.match(cleanupErr.message, new RegExp(uId));
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');
    assert.ok(lifecycle.pending.pgUsers.has(uId), 'Pending user ID must be preserved on readback validation failure');

    // Recovery test: Calling cleanup with genuine pool recovers to CLEANED
    const recoveryResult = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(recoveryResult.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    const finalCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(finalCheck.rows[0].count), 0, 'User record must be cleanly deleted');
  });

  test('Matrix 19: F-12 Outbox registration fails closed when novel and chapter are unowned', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const unownedNovelId = crypto.randomUUID();
    const unownedChapterId = crypto.randomUUID();
    const unownedEventId = crypto.randomUUID();
    const ownershipError = /ownership of BOTH parent novel and chapter is required/i;

    // 1. Neither parent owned -> fail closed
    assert.throws(() => lifecycle.registerOutbox(unownedNovelId, unownedChapterId), ownershipError);
    assert.throws(() => lifecycle.registerOutbox(unownedNovelId, unownedChapterId, unownedEventId), ownershipError);
    // registerOutboxEvent signature is (eventId, novelId, chapterId) (G-01 argument-order correction)
    assert.throws(() => lifecycle.registerOutboxEvent(unownedEventId, unownedNovelId, unownedChapterId), ownershipError);

    // 2. G-01: Owning ONLY the novel is insufficient
    lifecycle.registerNovel(unownedNovelId);
    assert.throws(() => lifecycle.registerOutbox(unownedNovelId, unownedChapterId, unownedEventId), ownershipError);
    assert.throws(() => lifecycle.registerOutboxEvent(unownedEventId, unownedNovelId, unownedChapterId), ownershipError);

    // 3. G-01: Owning ONLY the chapter is insufficient
    const lifecycle2 = new TestFixtureLifecycle();
    await lifecycle2.authorize(pool, mongoDb);
    lifecycle2.registerChapter(unownedChapterId);
    assert.throws(() => lifecycle2.registerOutbox(unownedNovelId, unownedChapterId, unownedEventId), ownershipError);

    // Nothing may have been recorded by rejected registrations
    assert.equal(lifecycle.pending.pgOutboxEvents.size, 0);
    assert.equal(lifecycle.pending.pgOutbox.size, 0);
    assert.equal(lifecycle2.pending.pgOutboxEvents.size, 0);

    // 4. Valid registration succeeds once BOTH parents are owned
    lifecycle.registerChapter(unownedChapterId);
    assert.doesNotThrow(() => lifecycle.registerOutboxEvent(unownedEventId, unownedNovelId, unownedChapterId));
    assert.ok(lifecycle.pending.pgOutboxEvents.has(unownedEventId));
    assert.ok(lifecycle.pending.pgOutbox.has(`${unownedNovelId}:${unownedChapterId}`));

    // 5. Re-registering the same eventId under a different pair fails closed
    const otherChapterId = crypto.randomUUID();
    lifecycle.registerChapter(otherChapterId);
    assert.throws(
      () => lifecycle.registerOutboxEvent(unownedEventId, unownedNovelId, otherChapterId),
      /already registered under a different novel\/chapter pair/i
    );

    // No rows were inserted; cleanup of nonexistent owned IDs reads back clean
    await lifecycle.cleanup(pool, mongoDb);
    await lifecycle2.cleanup(pool, mongoDb);
  });

  test('Matrix 20: F-12 Persisted outbox fixture cleaned and independently verified with fail-closed readback', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    const nId = crypto.randomUUID();
    const cId = crypto.randomUUID();
    const rId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `m20_u_${Date.now()}`, `m20_${Date.now()}@ephurin.com`]
    );

    lifecycle.registerNovel(nId);
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Matrix 20 Novel', $2, 'Synopsis', $3, 'PUBLISHED')`,
      [nId, `m20-slug-${Date.now()}`, uId]
    );

    lifecycle.registerChapter(cId);
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Matrix 20 Chapter', 1, 'DRAFT')`,
      [cId, nId]
    );

    lifecycle.registerRevision(rId);
    await pool.query(
      `INSERT INTO chapter_revisions (revision_id, chapter_id, novel_id, content, content_hash, source_type)
       VALUES ($1, $2, $3, 'Matrix 20 Revision Content', 'hash20', 'AUTHOR_MANUAL')`,
      [rId, cId, nId]
    );

    // Register owned outbox event
    lifecycle.registerOutbox(nId, cId, eventId);

    // Insert real persisted row in revision_outbox_events
    await pool.query(
      `INSERT INTO revision_outbox_events (event_id, event_type, novel_id, chapter_id, revision_id, content_hash, status)
       VALUES ($1, 'INCREMENTAL_ANALYSIS', $2, $3, $4, 'hash20', 'PENDING')`,
      [eventId, nId, cId, rId]
    );

    // Verify row genuinely exists in database
    const obBefore = await pool.query('SELECT count(*) FROM revision_outbox_events WHERE event_id = $1', [eventId]);
    assert.equal(Number(obBefore.rows[0].count), 1);

    // Step A: Negative fault injection — proxy pool acknowledges delete but leaves outbox row intact
    const proxyPool = {
      query: async (text: string, params?: any[]) => {
        if (text.includes('DELETE FROM revision_outbox_events WHERE event_id = $1') && params?.[0] === eventId) {
          // Acknowledge driver success without deleting
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('DELETE FROM revision_outbox_events WHERE novel_id = $1 AND chapter_id = $2')) {
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('DELETE FROM revision_outbox_events WHERE novel_id = $1')) {
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('DELETE FROM revision_outbox_events WHERE chapter_id = $1')) {
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('DELETE FROM chapter_revisions') || text.includes('DELETE FROM chapters') || text.includes('DELETE FROM novels')) {
          // Block cascading delete of parents to keep outbox row alive for readback verification test
          return { rowCount: 1, rows: [] };
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    let cleanupError: any = null;
    try {
      await lifecycle.cleanup(proxyPool, mongoDb);
    } catch (err: any) {
      cleanupError = err;
    }

    assert.ok(cleanupError, 'Cleanup must fail when revision_outbox_events row persists');
    assert.match(cleanupError.message, /Authoritative readback failed: residual revision outbox/i);
    assert.match(cleanupError.message, new RegExp(eventId));
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');
    assert.ok(lifecycle.pending.pgOutboxEvents.has(eventId), 'Pending outbox event ID must be preserved');

    // Step B: Recovery retry with real pool restores complete clean state
    const recoveryResult = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(recoveryResult.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');

    // Authoritative readback checks: zero residual records across all tables
    const obCheck = await pool.query('SELECT count(*) FROM revision_outbox_events WHERE event_id = $1', [eventId]);
    const rCheck = await pool.query('SELECT count(*) FROM chapter_revisions WHERE revision_id = $1', [rId]);
    const cCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [cId]);
    const nCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [nId]);
    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);

    assert.equal(Number(obCheck.rows[0].count), 0, 'Outbox event must be deleted');
    assert.equal(Number(rCheck.rows[0].count), 0, 'Revision must be deleted');
    assert.equal(Number(cCheck.rows[0].count), 0, 'Chapter must be deleted');
    assert.equal(Number(nCheck.rows[0].count), 0, 'Novel must be deleted');
    assert.equal(Number(uCheck.rows[0].count), 0, 'User must be deleted');
  });

  // ---------------------------------------------------------------------------
  // G-01 / G-02 helpers: a complete user -> novel -> chapter -> revision -> outbox chain
  // ---------------------------------------------------------------------------
  type Chain = { uId: string; nId: string; cId: string; rId: string; eId: string; hash: string };

  function makeChain(tag: string): Chain {
    const suffix = crypto.randomUUID().slice(0, 8);
    return {
      uId: crypto.randomUUID(),
      nId: crypto.randomUUID(),
      cId: crypto.randomUUID(),
      rId: crypto.randomUUID(),
      eId: crypto.randomUUID(),
      hash: `hash-${tag}-${suffix}`,
    };
  }

  function registerChain(lc: TestFixtureLifecycle, c: Chain, withEvent = true): void {
    lc.registerUser(c.uId);
    lc.registerNovel(c.nId);
    lc.registerChapter(c.cId);
    lc.registerRevision(c.rId);
    if (withEvent) lc.registerOutboxEvent(c.eId, c.nId, c.cId);
  }

  async function seedChain(c: Chain, tag: string): Promise<void> {
    const suffix = `${tag}_${c.uId.slice(0, 8)}`;
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [c.uId, `g01_${suffix}`, `g01_${suffix}@ephurin.com`]
    );
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status) VALUES ($1, $2, $3, 'Synopsis', $4, 'PUBLISHED')`,
      [c.nId, `G01 Novel ${tag}`, `g01-${suffix}`.toLowerCase().replace(/_/g, '-'), c.uId]
    );
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status) VALUES ($1, $2, $3, 1, 'DRAFT')`,
      [c.cId, c.nId, `G01 Chapter ${tag}`]
    );
    await pool.query(
      `INSERT INTO chapter_revisions (revision_id, chapter_id, novel_id, content, content_hash, source_type)
       VALUES ($1, $2, $3, 'G01 content', $4, 'AUTHOR_MANUAL')`,
      [c.rId, c.cId, c.nId, c.hash]
    );
    await pool.query(
      `INSERT INTO revision_outbox_events (event_id, event_type, novel_id, chapter_id, revision_id, content_hash, status)
       VALUES ($1, 'INCREMENTAL_ANALYSIS', $2, $3, $4, $5, 'PENDING')`,
      [c.eId, c.nId, c.cId, c.rId, c.hash]
    );
  }

  async function countRows(table: string, column: string, id: string): Promise<number> {
    const res = await pool.query(`SELECT count(*) FROM ${table} WHERE ${column} = $1`, [id]);
    return Number(res.rows[0].count);
  }

  async function assertChainAbsent(c: Chain, label: string): Promise<void> {
    assert.equal(await countRows('revision_outbox_events', 'event_id', c.eId), 0, `${label} outbox event must be absent`);
    assert.equal(await countRows('chapter_revisions', 'revision_id', c.rId), 0, `${label} revision must be absent`);
    assert.equal(await countRows('chapters', 'chapter_id', c.cId), 0, `${label} chapter must be absent`);
    assert.equal(await countRows('novels', 'novel_id', c.nId), 0, `${label} novel must be absent`);
    assert.equal(await countRows('users', 'user_id', c.uId), 0, `${label} user must be absent`);
  }

  test('Matrix 21: G-01 Foreign outbox event registered under owned pair survives; cleanup reports ownership mismatch', async () => {
    // Fixture A: owned test fixture
    const lifecycleA = new TestFixtureLifecycle();
    await lifecycleA.authorize(pool, mongoDb);
    const A = makeChain('A');
    registerChain(lifecycleA, A);
    await seedChain(A, 'A');

    // Fixture B: unrelated persisted outbox event, owned by an independent lifecycle
    const lifecycleB = new TestFixtureLifecycle();
    await lifecycleB.authorize(pool, mongoDb);
    const B = makeChain('B');
    registerChain(lifecycleB, B);
    await seedChain(B, 'B');

    // Misconfiguration / attack: associate B's event ID with A's owned novel/chapter pair
    lifecycleA.registerOutboxEvent(B.eId, A.nId, A.cId);

    let errA: any = null;
    try {
      await lifecycleA.cleanup(pool, mongoDb);
    } catch (err: any) {
      errA = err;
    }

    // B's event must survive unchanged (authoritative readback)
    const bRow = await pool.query(
      'SELECT novel_id, chapter_id, revision_id, content_hash FROM revision_outbox_events WHERE event_id = $1',
      [B.eId]
    );
    assert.equal(bRow.rows.length, 1, 'Foreign outbox event B must survive A cleanup');
    assert.equal(bRow.rows[0].novel_id, B.nId);
    assert.equal(bRow.rows[0].chapter_id, B.cId);
    assert.equal(bRow.rows[0].revision_id, B.rId);
    assert.equal(bRow.rows[0].content_hash, B.hash, 'Foreign outbox event hash must be unchanged');

    // Incorrect cleanup is rejected and reported, never claimed CLEANED
    assert.ok(errA, 'A cleanup must report the ownership mismatch');
    assert.match(errA.message, /outbox ownership mismatch/i);
    assert.match(errA.message, new RegExp(B.eId));
    assert.equal(lifecycleA.stage, 'CLEANUP_FAILED');

    // Legitimate A cleanup still works: every A record is absent
    await assertChainAbsent(A, 'A');

    // Retry of A stays fail-closed and still does not destroy B
    let errA2: any = null;
    try {
      await lifecycleA.cleanup(pool, mongoDb);
    } catch (err: any) {
      errA2 = err;
    }
    assert.ok(errA2, 'Retry must keep reporting the ownership violation');
    assert.match(errA2.message, /outbox ownership mismatch/i);
    assert.equal(lifecycleA.stage, 'CLEANUP_FAILED');
    assert.equal(await countRows('revision_outbox_events', 'event_id', B.eId), 1, 'B must survive A retry');

    // Independent cleanup of B remains possible
    const resB = await lifecycleB.cleanup(pool, mongoDb);
    assert.equal(resB.cleaned, true);
    assert.equal(lifecycleB.stage, 'CLEANED');
    await assertChainAbsent(B, 'B');
  });

  test('Matrix 22: G-01 Owned novel/chapter pair that is not a real parent relationship fails closed', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);
    const A = makeChain('P1');
    const X = makeChain('P2');
    registerChain(lifecycle, A, false);
    registerChain(lifecycle, X, false);
    await seedChain(A, 'P1');
    await seedChain(X, 'P2');

    // Both parents owned, but chapter A.cId belongs to novel A.nId, not X.nId
    lifecycle.registerOutbox(X.nId, A.cId);

    let err: any = null;
    try {
      await lifecycle.cleanup(pool, mongoDb);
    } catch (e: any) {
      err = e;
    }
    assert.ok(err, 'Cleanup must report the invalid pair relationship');
    assert.match(err.message, /relationship mismatch/i);
    assert.match(err.message, new RegExp(A.cId));
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');

    // Owned records are still fully cleaned via owned-parent paths
    await assertChainAbsent(A, 'P1');
    await assertChainAbsent(X, 'P2');
  });

  test('Matrix 23: G-01 Exact event DELETE is scoped by event_id + novel_id + chapter_id; failure retries to CLEANED', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);
    const A = makeChain('S');
    registerChain(lifecycle, A);
    await seedChain(A, 'S');

    const issued: Array<{ text: string; params?: any[] }> = [];
    let failExact = true;
    const spyPool = {
      query: async (text: string, params?: any[]) => {
        issued.push({ text, params });
        if (/DELETE FROM revision_outbox_events WHERE event_id = \$1/.test(text) && failExact) {
          failExact = false;
          throw new Error('Injected transient failure on exact outbox delete');
        }
        // Keep parents (and therefore the cascade target) alive for this first pass
        if (/DELETE FROM revision_outbox_events WHERE (novel_id|chapter_id)/.test(text) ||
            /DELETE FROM (chapter_revisions|chapters|novels|users)/.test(text)) {
          return { rowCount: 0, rows: [] };
        }
        return pool.query(text, params);
      },
    } as unknown as Pool;

    let err: any = null;
    try {
      await lifecycle.cleanup(spyPool, mongoDb);
    } catch (e: any) {
      err = e;
    }
    assert.ok(err, 'First pass must fail');
    assert.equal(lifecycle.stage, 'CLEANUP_FAILED');
    assert.ok(lifecycle.pending.pgOutboxEvents.has(A.eId), 'Exact event must remain pending');
    assert.equal(await countRows('revision_outbox_events', 'event_id', A.eId), 1, 'Event row still present after failed pass');

    // Every exact-ID DELETE must be scoped by all three identities
    const exactDeletes = issued.filter((q) => /DELETE FROM revision_outbox_events WHERE event_id/.test(q.text));
    assert.ok(exactDeletes.length >= 1, 'Exact-ID DELETE must have been attempted');
    for (const q of exactDeletes) {
      assert.match(q.text, /event_id = \$1 AND novel_id = \$2 AND chapter_id = \$3/, 'Exact DELETE must be triple-scoped');
      assert.deepEqual(q.params, [A.eId, A.nId, A.cId]);
    }

    // Retry with the real pool: full recovery and authoritative zero readback
    const res = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res.cleaned, true);
    assert.equal(lifecycle.stage, 'CLEANED');
    await assertChainAbsent(A, 'S');
  });

  test('Matrix 24: G-02 Non-decimal / coercible count mutants fail closed on fixture and sentinel readbacks, then recover', async () => {
    const mutants: Array<{ label: string; result: any }> = [
      { label: 'empty string', result: { rows: [{ count: '' }] } },
      { label: 'whitespace string', result: { rows: [{ count: '   ' }] } },
      { label: 'padded decimal', result: { rows: [{ count: ' 0 ' }] } },
      { label: 'exponent', result: { rows: [{ count: '0e0' }] } },
      { label: 'hex', result: { rows: [{ count: '0x0' }] } },
      { label: 'binary', result: { rows: [{ count: '0b0' }] } },
      { label: 'signed plus', result: { rows: [{ count: '+0' }] } },
      { label: 'negative zero string', result: { rows: [{ count: '-0' }] } },
      { label: 'fractional string', result: { rows: [{ count: '0.0' }] } },
      { label: 'boolean false', result: { rows: [{ count: false }] } },
      { label: 'array', result: { rows: [{ count: [] }] } },
      { label: 'fractional number', result: { rows: [{ count: 0.5 }] } },
      { label: 'negative number', result: { rows: [{ count: -1 }] } },
      { label: 'NaN', result: { rows: [{ count: NaN }] } },
      { label: 'Infinity', result: { rows: [{ count: Infinity }] } },
      { label: 'unsafe number', result: { rows: [{ count: 9007199254740992 }] } },
      { label: 'unsafe decimal string', result: { rows: [{ count: '9007199254740993' }] } },
      { label: 'missing count', result: { rows: [{}] } },
      { label: 'null count', result: { rows: [{ count: null }] } },
      { label: 'empty rows', result: { rows: [] } },
      { label: 'multiple rows', result: { rows: [{ count: '0' }, { count: '0' }] } },
    ];

    const accepted: string[] = [];

    // Fixture readback path (Step 8, users)
    for (const m of mutants) {
      const lifecycle = new TestFixtureLifecycle();
      await lifecycle.authorize(pool, mongoDb);
      const uId = crypto.randomUUID();
      lifecycle.registerUser(uId);
      await pool.query(
        `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
        [uId, `g02_${uId.slice(0, 8)}`, `g02_${uId.slice(0, 8)}@ephurin.com`]
      );
      const mutantPool = {
        query: async (text: string, params?: any[]) => {
          if (text.includes('SELECT count(*) FROM users WHERE user_id = $1') && params?.[0] === uId) {
            return m.result;
          }
          return pool.query(text, params);
        },
      } as unknown as Pool;

      let err: any = null;
      try {
        await lifecycle.cleanup(mutantPool, mongoDb);
      } catch (e: any) {
        err = e;
      }
      if (!err || lifecycle.stage !== 'CLEANUP_FAILED' || !/Malformed PostgreSQL readback for user/.test(err.message) || !lifecycle.pending.pgUsers.has(uId)) {
        accepted.push(`fixture:${m.label}`);
      }
      // Recovery with the genuine pool
      if (lifecycle.stage !== 'CLEANED') {
        const rec = await lifecycle.cleanup(pool, mongoDb);
        assert.equal(rec.cleaned, true, `fixture recovery after ${m.label}`);
      }
      assert.equal(await countRows('users', 'user_id', uId), 0, `fixture user absent after ${m.label}`);
    }

    // Sentinel paths: Step 9 preservation readback and Step 11 post-teardown readback
    for (const phase of ['preservation', 'teardown'] as const) {
      for (const m of mutants) {
        const lifecycle = new TestFixtureLifecycle();
        await lifecycle.authorize(pool, mongoDb);
        const sId = crypto.randomUUID();
        lifecycle.registerSentinelUser(sId);
        await pool.query(
          `INSERT INTO users (user_id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
          [sId, `g02s_${sId.slice(0, 8)}`, `g02s_${sId.slice(0, 8)}@ephurin.com`]
        );
        lifecycle.confirmSentinelUser(sId);
        // For preservation, mutate the expected-1 value into coercible forms of 1
        const result = phase === 'preservation'
          ? JSON.parse(JSON.stringify(m.result).replace(/"0/g, '"1').replace(/"count":false/, '"count":true'))
          : m.result;
        let sentinelCalls = 0;
        const mutantPool = {
          query: async (text: string, params?: any[]) => {
            if (text.includes('SELECT count(*) FROM users WHERE user_id = $1') && params?.[0] === sId) {
              sentinelCalls++;
              const target = phase === 'preservation' ? 1 : 2;
              if (sentinelCalls === target) return result;
            }
            return pool.query(text, params);
          },
        } as unknown as Pool;

        let err: any = null;
        try {
          await lifecycle.cleanup(mutantPool, mongoDb);
        } catch (e: any) {
          err = e;
        }
        if (!err || lifecycle.stage !== 'CLEANUP_FAILED' || !/Malformed PostgreSQL readback for sentinel user/.test(err.message)) {
          accepted.push(`sentinel-${phase}:${m.label}`);
        }
        if (lifecycle.stage !== 'CLEANED') {
          const rec = await lifecycle.cleanup(pool, mongoDb);
          assert.equal(rec.cleaned, true, `sentinel ${phase} recovery after ${m.label}`);
        }
        assert.equal(await countRows('users', 'user_id', sId), 0, `sentinel absent after ${phase} ${m.label}`);
      }
    }

    assert.deepEqual(accepted, [], `Malformed count mutants were silently accepted: ${accepted.join(', ')}`);
  });

  test('Matrix 25: G-02 parseStrictRowCount accepts only safe non-negative integers / canonical decimal strings', () => {
    // Valid PostgreSQL count(*) results (pg returns bigint count as a decimal string)
    const valid: Array<[any, number]> = [
      [{ rows: [{ count: '0' }] }, 0],
      [{ rows: [{ count: '1' }] }, 1],
      [{ rows: [{ count: '42' }] }, 42],
      [{ rows: [{ count: '9007199254740991' }] }, Number.MAX_SAFE_INTEGER],
      [{ rows: [{ count: 0 }] }, 0],
      [{ rows: [{ count: 7 }] }, 7],
    ];
    for (const [input, expected] of valid) {
      assert.equal(parseStrictRowCount(input, 'entity', 'id'), expected, `valid ${JSON.stringify(input)}`);
    }

    const invalid: Array<[string, any]> = [
      ['undefined result', undefined],
      ['null result', null],
      ['missing rows', {}],
      ['rows not array', { rows: 'x' }],
      ['empty rows', { rows: [] }],
      ['multiple rows', { rows: [{ count: '0' }, { count: '0' }] }],
      ['null row', { rows: [null] }],
      ['array row', { rows: [['0']] }],
      ['missing count', { rows: [{ total: '0' }] }],
      ['inherited count', { rows: [Object.create({ count: '0' })] }],
      ['null count', { rows: [{ count: null }] }],
      ['undefined count', { rows: [{ count: undefined }] }],
      ['empty string', { rows: [{ count: '' }] }],
      ['whitespace', { rows: [{ count: '   ' }] }],
      ['tab/newline', { rows: [{ count: '\t\n' }] }],
      ['leading space', { rows: [{ count: ' 1' }] }],
      ['trailing space', { rows: [{ count: '1 ' }] }],
      ['leading zero', { rows: [{ count: '01' }] }],
      ['exponent', { rows: [{ count: '1e3' }] }],
      ['hex', { rows: [{ count: '0x10' }] }],
      ['binary', { rows: [{ count: '0b1' }] }],
      ['octal', { rows: [{ count: '0o7' }] }],
      ['plus sign', { rows: [{ count: '+1' }] }],
      ['minus sign', { rows: [{ count: '-1' }] }],
      ['negative zero string', { rows: [{ count: '-0' }] }],
      ['fractional string', { rows: [{ count: '1.0' }] }],
      ['Infinity string', { rows: [{ count: 'Infinity' }] }],
      ['NaN string', { rows: [{ count: 'NaN' }] }],
      ['unsafe string 2^53', { rows: [{ count: '9007199254740992' }] }],
      ['unsafe string 2^53+1', { rows: [{ count: '9007199254740993' }] }],
      ['boolean true', { rows: [{ count: true }] }],
      ['boolean false', { rows: [{ count: false }] }],
      ['object', { rows: [{ count: {} }] }],
      ['array', { rows: [{ count: [] }] }],
      ['NaN', { rows: [{ count: NaN }] }],
      ['Infinity', { rows: [{ count: Infinity }] }],
      ['-Infinity', { rows: [{ count: -Infinity }] }],
      ['fractional', { rows: [{ count: 1.5 }] }],
      ['negative', { rows: [{ count: -1 }] }],
      ['negative zero', { rows: [{ count: -0 }] }],
      ['unsafe number', { rows: [{ count: 2 ** 53 }] }],
    ];
    for (const [label, input] of invalid) {
      assert.throws(
        () => parseStrictRowCount(input, 'entity', 'id-123'),
        /Malformed PostgreSQL readback for entity id-123/,
        `invalid input must be rejected: ${label}`
      );
    }
  });
});

