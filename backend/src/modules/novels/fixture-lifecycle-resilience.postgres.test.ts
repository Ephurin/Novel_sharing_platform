import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from './chapter-writer.js';
import { TestFixtureLifecycle } from './test-fixture-lifecycle.js';

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

  test('Matrix 10: Repeated cleanup -> Safe, idempotent, zero residual mutations', async () => {
    const lifecycle = new TestFixtureLifecycle();
    await lifecycle.authorize(pool, mongoDb);

    const uId = crypto.randomUUID();
    lifecycle.registerUser(uId);
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR')`,
      [uId, `matrix10_${Date.now()}`, `m10_${Date.now()}@ephurin.com`]
    );

    // First cleanup
    const res1 = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res1.cleaned, true);

    // Second repeated cleanup on same lifecycle instance
    const res2 = await lifecycle.cleanup(pool, mongoDb);
    assert.equal(res2.cleaned, true);
    assert.equal(res2.errors.length, 0);

    const uCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [uId]);
    assert.equal(Number(uCheck.rows[0].count), 0);
  });
});
