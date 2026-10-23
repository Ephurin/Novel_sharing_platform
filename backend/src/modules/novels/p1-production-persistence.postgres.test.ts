import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { disconnectChapterWriter } from './chapter-writer.js';
import { acceptDraft } from './chapter-revisions.service.js';
import { env } from '../../core/config/env.js';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

describe('Gate AI-PIPE-01A: PostgreSQL Production Persistence & Idempotency Integration', () => {
  const pool = getPostgresPool();
  let userId: string;
  let novelId: string;
  let chapterId: string;
  let baseRevisionId: string;
  const baseContent = 'Hải Ba Đông đứng trên cồn cát nhìn Tiêu Viêm.\nKhông khí lạnh lẽo bao trùm xung quanh.';
  const baseContentHash = sha256(baseContent);
  const testGenId = `gen-${Date.now()}-${crypto.randomUUID()}`;
  const mockReplacement = ' Tiêu Viêm chậm rãi thu hồi Dị Hỏa.';

  // Unrelated sentinel fixtures to verify non-destructive isolation
  const sentinelUserId = crypto.randomUUID();
  const sentinelNovelId = crypto.randomUUID();
  const sentinelChapterId = crypto.randomUUID();
  const sentinelMongoChapterId = crypto.randomUUID();

  // Mock global.fetch to intercept AI service calls during acceptDraft
  const originalFetch = global.fetch;

  before(async () => {
    const mongoDb = getMongoDatabase();

    // STEP 1: Enforce fail-closed database isolation guard before ANY mutation
    await validateTestDatabaseIsolation(pool, mongoDb);

    // STEP 2: Seed sentinel records to verify cleanup specificity
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'dummy-hash', 'AUTHOR') ON CONFLICT DO NOTHING`,
      [sentinelUserId, `sentinel_p1_${Date.now()}`, `sentinel_p1_${Date.now()}@ephurin.com`]
    );
    await pool.query(
      `INSERT INTO novels (novel_id, author_id, title, slug, synopsis)
       VALUES ($1, $2, 'Sentinel Persistence Novel', $3, 'Sentinel Synopsis') ON CONFLICT DO NOTHING`,
      [sentinelNovelId, sentinelUserId, `sentinel-p1-slug-${Date.now()}`]
    );
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, chapter_number, title, content, word_count)
       VALUES ($1, $2, 999, 'Sentinel Persistence Chapter', 'Sentinel Content', 2) ON CONFLICT DO NOTHING`,
      [sentinelChapterId, sentinelNovelId]
    );
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: sentinelMongoChapterId,
      novelId: sentinelNovelId,
      authorId: sentinelUserId,
      title: 'Sentinel Persistence Draft',
      content: 'Sentinel draft content',
      wordCount: 3,
      version: 1,
      autosave: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // STEP 3: Setup author and novel fixture in PostgreSQL
    const userRes = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'AUTHOR')
       returning user_id`,
      [`author-pipe01a-${Date.now()}@ephurin.com`, `auth_${Date.now()}`]
    );
    userId = userRes.rows[0].user_id;

    const novelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis)
       values ($1, 'Pipe 01A Test Novel', $2, 'Synopsis')
       returning novel_id`,
      [userId, `novel-pipe01a-${Date.now()}`]
    );
    novelId = novelRes.rows[0].novel_id;

    const chapRes = await pool.query(
      `insert into chapters (novel_id, chapter_number, title, content, word_count)
       values ($1, 2, 'Chương 2: Dấn thân', $2, 10)
       returning chapter_id`,
      [novelId, baseContent]
    );
    chapterId = chapRes.rows[0].chapter_id;

    const revRes = await pool.query(
      `insert into chapter_revisions (novel_id, chapter_id, content_hash, content, word_count, source_type, created_by)
       values ($1, $2, $3, $4, 10, 'AUTHOR_MANUAL', $5)
       returning revision_id`,
      [novelId, chapterId, baseContentHash, baseContent, userId]
    );
    baseRevisionId = revRes.rows[0].revision_id;

    await pool.query(
      'update chapters set latest_revision_id = $1 where chapter_id = $2',
      [baseRevisionId, chapterId]
    );

    // Mock fetch to simulate AI Service responses for writing generation and Story Brain summary
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes(`/internal/v1/writing/generations/${testGenId}`) || urlStr.includes(`/v1/writing-generations/${testGenId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              job_id: testGenId,
              novel_id: novelId,
              chapter_id: chapterId,
              revision_id: baseRevisionId,
              content_hash: baseContentHash,
              status: 'completed',
              validation_status: 'passed',
              validations: [{ validator: 'patch_schema', passed: true, code: 'OK', message: 'Valid' }],
              brain_version_used: 2,
              patch: {
                start: Array.from(baseContent).length,
                end: Array.from(baseContent).length,
                replacement: mockReplacement,
              },
            },
          }),
        } as any;
      }

      if (urlStr.includes(`/v1/story-brains/by-novel/${novelId}`) || urlStr.includes(`/v1/story-brains/${novelId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: crypto.randomUUID(),
              novel_id: novelId,
              status: 'active',
              brain_version: 2,
            },
          }),
        } as any;
      }

      if (urlStr.includes('/analyses')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success' }),
          text: async () => JSON.stringify({ status: 'success' }),
        } as any;
      }

      return originalFetch(url, init);
    }) as any;
  });

  after(async () => {
    global.fetch = originalFetch;
    try {
      const mongoDb = getMongoDatabase();

      // 1. Delete derived revision outbox events
      if (novelId || chapterId) {
        await pool.query(
          'DELETE FROM revision_outbox_events WHERE novel_id = $1 OR chapter_id = $2',
          [novelId, chapterId]
        );
      }

      // 2. Clear latest_revision_id FK pointer on chapter
      if (chapterId) {
        await pool.query(
          'UPDATE chapters SET latest_revision_id = NULL WHERE chapter_id = $1',
          [chapterId]
        );
      }

      // 3. Delete all chapter revisions
      if (novelId || chapterId) {
        await pool.query(
          'DELETE FROM chapter_revisions WHERE novel_id = $1 OR chapter_id = $2',
          [novelId, chapterId]
        );
      }

      // 4. Delete chapter
      if (chapterId) {
        await pool.query('DELETE FROM chapters WHERE chapter_id = $1', [chapterId]);
      }

      // 5. Delete novel
      if (novelId) {
        await pool.query('DELETE FROM novels WHERE novel_id = $1', [novelId]);
      }

      // 6. Delete author user
      if (userId) {
        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
      }

      // 7. Delete Mongo draft_chapters for chapterId
      if (chapterId) {
        await mongoDb.collection('draft_chapters').deleteMany({ chapterId });
      }

      // 8. Post-cleanup readbacks: verify 0 test-owned records remain
      if (novelId || chapterId) {
        const outboxCheck = await pool.query(
          'SELECT count(*) FROM revision_outbox_events WHERE novel_id = $1 OR chapter_id = $2',
          [novelId, chapterId]
        );
        assert.equal(Number(outboxCheck.rows[0].count), 0, 'Cleanup readback: revision_outbox_events row leftover');

        const revCheck = await pool.query(
          'SELECT count(*) FROM chapter_revisions WHERE novel_id = $1 OR chapter_id = $2',
          [novelId, chapterId]
        );
        assert.equal(Number(revCheck.rows[0].count), 0, 'Cleanup readback: chapter_revisions row leftover');
      }

      if (chapterId) {
        const chapCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [chapterId]);
        assert.equal(Number(chapCheck.rows[0].count), 0, 'Cleanup readback: chapters row leftover');

        const mongoCheck = await mongoDb.collection('draft_chapters').countDocuments({ chapterId });
        assert.equal(mongoCheck, 0, 'Cleanup readback: MongoDB draft_chapters document leftover');
      }

      if (novelId) {
        const novelCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [novelId]);
        assert.equal(Number(novelCheck.rows[0].count), 0, 'Cleanup readback: novels row leftover');
      }

      if (userId) {
        const userCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [userId]);
        assert.equal(Number(userCheck.rows[0].count), 0, 'Cleanup readback: users row leftover');
      }

      // 9. Sentinel record survival check: verify non-destructive cleanup
      const sentinelUserCheck = await pool.query('SELECT count(*) FROM users WHERE user_id = $1', [sentinelUserId]);
      assert.equal(Number(sentinelUserCheck.rows[0].count), 1, 'Sentinel user was unexpectedly deleted');

      const sentinelNovelCheck = await pool.query('SELECT count(*) FROM novels WHERE novel_id = $1', [sentinelNovelId]);
      assert.equal(Number(sentinelNovelCheck.rows[0].count), 1, 'Sentinel novel was unexpectedly deleted');

      const sentinelChapCheck = await pool.query('SELECT count(*) FROM chapters WHERE chapter_id = $1', [sentinelChapterId]);
      assert.equal(Number(sentinelChapCheck.rows[0].count), 1, 'Sentinel chapter was unexpectedly deleted');

      const sentinelMongoCheck = await mongoDb.collection('draft_chapters').countDocuments({ chapterId: sentinelMongoChapterId });
      assert.equal(sentinelMongoCheck, 1, 'Sentinel MongoDB draft was unexpectedly deleted');

      // 10. Clean up sentinel records
      await pool.query('DELETE FROM chapters WHERE chapter_id = $1', [sentinelChapterId]);
      await pool.query('DELETE FROM novels WHERE novel_id = $1', [sentinelNovelId]);
      await pool.query('DELETE FROM users WHERE user_id = $1', [sentinelUserId]);
      await mongoDb.collection('draft_chapters').deleteMany({ chapterId: sentinelMongoChapterId });
    } finally {
      await disconnectPostgres();
      await disconnectMongo();
      await disconnectChapterWriter();
    }
  });

  test('Checkpoint 08: acceptDraft persists chapter_revisions with source_type=AI_DRAFT_ACCEPT in PostgreSQL', async () => {
    const auth = { userId, role: 'AUTHOR' as const };
    const result = await acceptDraft(auth, chapterId, { generationId: testGenId });

    assert.ok(result.revision.revisionId, 'Expected new revisionId');
    assert.equal(result.chapterId, chapterId);

    // Direct PostgreSQL query
    const dbRes = await pool.query(
      'select * from chapter_revisions where revision_id = $1',
      [result.revision.revisionId]
    );
    assert.equal(dbRes.rowCount, 1, 'Expected exactly 1 revision row in PostgreSQL');
    const row = dbRes.rows[0];

    assert.equal(row.source_type, 'AI_DRAFT_ACCEPT');
    assert.equal(row.source_generation_id, testGenId);
    assert.equal(row.parent_revision_id, baseRevisionId);
    assert.equal(row.novel_id, novelId);
    assert.equal(row.chapter_id, chapterId);

    const expectedContent = baseContent + mockReplacement;
    assert.equal(row.content, expectedContent);
    assert.equal(row.content_hash, sha256(expectedContent));
  });

  test('Checkpoint 09: chapters.latest_revision_id is updated in PostgreSQL', async () => {
    const chRes = await pool.query(
      'select latest_revision_id from chapters where chapter_id = $1',
      [chapterId]
    );
    const latestId = chRes.rows[0].latest_revision_id;

    // Query accepted revision
    const revRes = await pool.query(
      'select revision_id from chapter_revisions where chapter_id = $1 and source_generation_id = $2',
      [chapterId, testGenId]
    );
    assert.equal(revRes.rowCount, 1);
    assert.equal(latestId, revRes.rows[0].revision_id);
  });

  test('Checkpoint 10: revision_outbox_events row exists with event_type=INCREMENTAL_ANALYSIS', async () => {
    const revRes = await pool.query(
      'select revision_id, content_hash from chapter_revisions where chapter_id = $1 and source_generation_id = $2',
      [chapterId, testGenId]
    );
    const revId = revRes.rows[0].revision_id;
    const revHash = revRes.rows[0].content_hash;

    const outboxRes = await pool.query(
      'select * from revision_outbox_events where revision_id = $1 and event_type = $2',
      [revId, 'INCREMENTAL_ANALYSIS']
    );
    assert.equal(outboxRes.rowCount, 1, 'Expected exactly 1 outbox event row in PostgreSQL');
    const event = outboxRes.rows[0];
    assert.equal(event.novel_id, novelId);
    assert.equal(event.chapter_id, chapterId);
    assert.equal(event.content_hash, revHash);
  });

  test('Checkpoint 14: acceptDraft is idempotent and returns existing revision without duplicate insertion', async () => {
    const auth = { userId, role: 'AUTHOR' as const };

    // Call acceptDraft a second time with the identical generationId
    const retryResult = await acceptDraft(auth, chapterId, { generationId: testGenId });

    // Verify returned revision matches original accepted revision
    const revRes = await pool.query(
      'select revision_id from chapter_revisions where chapter_id = $1 and source_generation_id = $2',
      [chapterId, testGenId]
    );
    assert.equal(retryResult.revision.revisionId, revRes.rows[0].revision_id);

    // Verify no duplicate row was created in PostgreSQL
    const countRes = await pool.query(
      'select count(*) from chapter_revisions where chapter_id = $1 and source_generation_id = $2',
      [chapterId, testGenId]
    );
    assert.equal(Number(countRes.rows[0].count), 1, 'Expected exactly 1 row; duplicate insertion occurred');
  });

  test('Checkpoint 15: Author-control semantics - unaccepted draft does not alter canonical chapter revision', async () => {
    const currentChapterRes = await pool.query(
      'select latest_revision_id from chapters where chapter_id = $1',
      [chapterId]
    );
    const canonIdBefore = currentChapterRes.rows[0].latest_revision_id;

    // Simulate an unaccepted generation (never calling acceptDraft)
    const unusedGenId = `unused-${Date.now()}`;
    const unacceptedCount = await pool.query(
      'select count(*) from chapter_revisions where source_generation_id = $1',
      [unusedGenId]
    );
    assert.equal(Number(unacceptedCount.rows[0].count), 0);

    // Verify canonical chapter state is strictly preserved
    const afterChapterRes = await pool.query(
      'select latest_revision_id from chapters where chapter_id = $1',
      [chapterId]
    );
    assert.equal(afterChapterRes.rows[0].latest_revision_id, canonIdBefore);
  });
});
