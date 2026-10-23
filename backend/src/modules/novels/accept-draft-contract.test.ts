import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { disconnectChapterWriter } from './chapter-writer.js';
import { acceptDraft } from './chapter-revisions.service.js';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

describe('Accept Draft Server-to-Server Trust Contract (P0/P1 Hardening)', () => {
  const originalFetch = global.fetch;
  const authorId = crypto.randomUUID();
  const novelId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const baseRevisionId = crypto.randomUUID();
  const baseContent = 'Base chapter prose for contract testing.';
  const baseContentHash = crypto.createHash('sha256').update(baseContent).digest('hex');

  // Unrelated sentinel fixtures to prove cleanup specificity and non-destructive isolation
  const sentinelUserId = crypto.randomUUID();
  const sentinelNovelId = crypto.randomUUID();
  const sentinelChapterId = crypto.randomUUID();
  const sentinelMongoChapterId = crypto.randomUUID();

  let fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];

  before(async () => {
    const pool = getPostgresPool();
    const mongoDb = getMongoDatabase();

    // STEP 1: Enforce fail-closed database isolation guard before ANY mutation
    await validateTestDatabaseIsolation(pool, mongoDb);

    // STEP 2: Schema verification tiering
    // Detect if running under Tier B (real Alembic schema) or Tier A (narrow contract fixture)
    const schemaProbe = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'alembic_version'
      ) AS has_alembic,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'narrative' AND table_name = 'autonomous_runs'
      ) AS has_real_runs
    `);
    const isRealAlembicSchema = Boolean(schemaProbe.rows[0]?.has_alembic && schemaProbe.rows[0]?.has_real_runs);

    if (!isRealAlembicSchema) {
      // TIER A (Narrow Contract Fixture): Alembic migrations not present.
      // Bootstrap minimal stub schema for the REST controller-intent contract tests.
      await pool.query(`
        CREATE SCHEMA IF NOT EXISTS narrative;
        CREATE TABLE IF NOT EXISTS narrative.autonomous_runs (
          id UUID PRIMARY KEY,
          novel_id UUID NOT NULL,
          tenant_id UUID,
          created_by UUID,
          plan_id UUID,
          plan_version INT,
          current_objective_id UUID,
          current_chapter_id UUID,
          last_generation_id VARCHAR,
          current_iteration INT,
          current_retries INT,
          status VARCHAR(32)
        );
        CREATE TABLE IF NOT EXISTS narrative.story_plans (
          id UUID PRIMARY KEY,
          novel_id UUID NOT NULL,
          tenant_id UUID,
          plan_version INT,
          status VARCHAR(32)
        );
        CREATE TABLE IF NOT EXISTS narrative.story_plan_objectives (
          id UUID PRIMARY KEY,
          plan_id UUID NOT NULL,
          novel_id UUID NOT NULL,
          tenant_id UUID,
          intent_version INT,
          status VARCHAR(32)
        );
      `);
    }

    // STEP 3: Seed sentinel records in PostgreSQL and MongoDB
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR') ON CONFLICT DO NOTHING`,
      [sentinelUserId, `sentinel_${Date.now()}`, `sentinel_${Date.now()}@example.com`]
    );
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Sentinel Novel', $2, 'Sentinel Synopsis', $3, 'PUBLISHED') ON CONFLICT DO NOTHING`,
      [sentinelNovelId, `sentinel-slug-${Date.now()}`, sentinelUserId]
    );
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Sentinel Chapter', 999, 'DRAFT') ON CONFLICT DO NOTHING`,
      [sentinelChapterId, sentinelNovelId]
    );
    await mongoDb.collection('draft_chapters').insertOne({
      chapterId: sentinelMongoChapterId,
      novelId: sentinelNovelId,
      authorId: sentinelUserId,
      title: 'Sentinel Draft',
      content: 'Sentinel draft content for isolation check',
      wordCount: 7,
      version: 1,
      autosave: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // STEP 4: Seed test-owned fixture records
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, 'hash', 'AUTHOR') ON CONFLICT DO NOTHING`,
      [authorId, `auth_${Date.now()}`, `auth_${Date.now()}@example.com`]
    );
    await pool.query(
      `INSERT INTO novels (novel_id, title, slug, synopsis, author_id, status)
       VALUES ($1, 'Contract Novel', $2, 'Test Synopsis', $3, 'PUBLISHED') ON CONFLICT DO NOTHING`,
      [novelId, `slug-${Date.now()}`, authorId]
    );
    await pool.query(
      `INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, status)
       VALUES ($1, $2, 'Chapter 1', 1, 'DRAFT') ON CONFLICT DO NOTHING`,
      [chapterId, novelId]
    );
    await pool.query(
      `INSERT INTO chapter_revisions (revision_id, chapter_id, novel_id, content, content_hash, source_type)
       VALUES ($1, $2, $3, $4, $5, 'AUTHOR_MANUAL') ON CONFLICT DO NOTHING`,
      [baseRevisionId, chapterId, novelId, baseContent, baseContentHash]
    );
    await pool.query(
      `UPDATE chapters SET latest_revision_id = $1 WHERE chapter_id = $2`,
      [baseRevisionId, chapterId]
    );
  });

  after(async () => {
    global.fetch = originalFetch;
    try {
      const pool = getPostgresPool();
      const mongoDb = getMongoDatabase();

      // 1. Delete derived revision outbox events
      await pool.query(
        'DELETE FROM revision_outbox_events WHERE novel_id = $1 OR chapter_id = $2',
        [novelId, chapterId]
      );

      // 2. Clear latest_revision_id FK pointer on chapter
      await pool.query(
        'UPDATE chapters SET latest_revision_id = NULL WHERE chapter_id = $1',
        [chapterId]
      );

      // 3. Delete all chapter revisions
      await pool.query(
        'DELETE FROM chapter_revisions WHERE novel_id = $1 OR chapter_id = $2',
        [novelId, chapterId]
      );

      // 4. Delete chapter
      await pool.query(
        'DELETE FROM chapters WHERE chapter_id = $1',
        [chapterId]
      );

      // 5. Delete novel
      await pool.query(
        'DELETE FROM novels WHERE novel_id = $1',
        [novelId]
      );

      // 6. Delete author user
      await pool.query(
        'DELETE FROM users WHERE user_id = $1',
        [authorId]
      );

      // 7. Delete Mongo draft_chapters for this chapter
      await mongoDb.collection('draft_chapters').deleteMany({
        chapterId: chapterId
      });

      // 8. Post-cleanup readbacks: verify 0 test-owned records remain
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

      const chapCheck = await pool.query(
        'SELECT count(*) FROM chapters WHERE chapter_id = $1',
        [chapterId]
      );
      assert.equal(Number(chapCheck.rows[0].count), 0, 'Cleanup readback: chapters row leftover');

      const novelCheck = await pool.query(
        'SELECT count(*) FROM novels WHERE novel_id = $1',
        [novelId]
      );
      assert.equal(Number(novelCheck.rows[0].count), 0, 'Cleanup readback: novels row leftover');

      const userCheck = await pool.query(
        'SELECT count(*) FROM users WHERE user_id = $1',
        [authorId]
      );
      assert.equal(Number(userCheck.rows[0].count), 0, 'Cleanup readback: users row leftover');

      const mongoCheck = await mongoDb.collection('draft_chapters').countDocuments({
        chapterId: chapterId
      });
      assert.equal(mongoCheck, 0, 'Cleanup readback: MongoDB draft_chapters document leftover');

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

  function setupMockAi(customJob: Record<string, unknown> = {}, brainVersion: number | null = 1) {
    fetchCalls = [];
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      const headers = (init?.headers as Record<string, string>) || {};
      fetchCalls.push({ url: urlStr, headers });

      if (urlStr.includes('/internal/v1/writing/generations/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              job_id: customJob.job_id ?? 'test-gen-id',
              novel_id: customJob.novel_id ?? novelId,
              chapter_id: customJob.chapter_id ?? chapterId,
              revision_id: customJob.revision_id ?? baseRevisionId,
              content_hash: customJob.content_hash ?? baseContentHash,
              tenant_id: customJob.tenant_id ?? authorId,
              actor_id: customJob.actor_id ?? authorId,
              idempotency_key: customJob.idempotency_key ?? 'test-key-p1',
              status: customJob.status ?? 'completed',
              validation_status: customJob.validation_status ?? 'passed',
              patch: customJob.patch !== undefined ? customJob.patch : {
                start: Array.from(baseContent).length,
                end: Array.from(baseContent).length,
                replacement: ' Appended prose.'
              },
              brain_version_used: customJob.brain_version_used !== undefined ? customJob.brain_version_used : brainVersion,
              ...customJob
            }
          })
        } as any;
      }

      if (urlStr.includes('/v1/story-brains/by-novel/')) {
        if (brainVersion === null) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: { code: 'NOT_FOUND', message: 'Brain not found' } })
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: crypto.randomUUID(),
              novel_id: novelId,
              status: 'active',
              brain_version: brainVersion
            }
          })
        } as any;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND' } })
      } as any;
    }) as any;
  }

  test('calls authenticated /internal/v1/writing/generations/{id} route with service token and headers', async () => {
    const genId = 'gen-call-route-1';
    setupMockAi({ job_id: genId });

    await acceptDraft(
      { userId: authorId, role: 'AUTHOR' } as any,
      chapterId,
      { generationId: genId }
    );

    const internalCall = fetchCalls.find(c => c.url.includes(`/internal/v1/writing/generations/${genId}`));
    assert.ok(internalCall, `Expected call to /internal/v1/writing/generations/${genId}`);
    assert.equal(internalCall.headers['x-service-token'], env.PLATFORM_SERVICE_TOKEN ?? '');
    assert.equal(internalCall.headers['x-user-id'], authorId);
    assert.equal(internalCall.headers['x-tenant-id'], authorId);
  });

  test('rejects with 400 NOVEL_MISMATCH if generation novel does not match chapter novel', async () => {
    const genId = 'gen-novel-mismatch';
    setupMockAi({ job_id: genId, novel_id: crypto.randomUUID() });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'NOVEL_MISMATCH'
    );
  });

  test('rejects with 400 CHAPTER_MISMATCH if generation chapter does not match target chapter', async () => {
    const genId = 'gen-chap-mismatch';
    setupMockAi({ job_id: genId, chapter_id: crypto.randomUUID() });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'CHAPTER_MISMATCH'
    );
  });

  test('rejects with 403 FORBIDDEN if generation belongs to another tenant or actor', async () => {
    const genId = 'gen-foreign-tenant';
    setupMockAi({ job_id: genId, tenant_id: crypto.randomUUID() });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'FORBIDDEN'
    );
  });

  test('rejects with 409 GENERATION_NOT_COMPLETED if generation status is not completed', async () => {
    const genId = 'gen-status-running';
    setupMockAi({ job_id: genId, status: 'running' });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'GENERATION_NOT_COMPLETED'
    );
  });

  test('rejects with 422 GENERATION_VALIDATION_FAILED if validation_status is not passed', async () => {
    const genId = 'gen-val-failed';
    setupMockAi({ job_id: genId, validation_status: 'failed' });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'GENERATION_VALIDATION_FAILED'
    );
  });

  test('rejects with 422 INVALID_PATCH if patch structure is missing or malformed', async () => {
    const genId = 'gen-bad-patch';
    setupMockAi({ job_id: genId, patch: null });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'INVALID_PATCH'
    );
  });

  test('rejects with 409 BRAIN_VERSION_CONFLICT if current Story Brain has advanced beyond generation brain_version_used', async () => {
    const genId = 'gen-stale-brain';
    setupMockAi({ job_id: genId, brain_version_used: 1 }, 3);

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'BRAIN_VERSION_CONFLICT'
    );
  });

  test('rejects with 404 STORY_BRAIN_NOT_FOUND if Story Brain route returns 404 when brain is required', async () => {
    const genId = 'gen-brain-404';
    setupMockAi({ job_id: genId, brain_version_used: 1 }, null);

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'STORY_BRAIN_NOT_FOUND'
    );
  });

  test('rejects with 409 OBJECTIVE_INTENT_REQUIRED if P3 controller idempotency_key is malformed', async () => {
    const genId = 'gen-p3-malformed-key';
    setupMockAi({
      job_id: genId,
      idempotency_key: 'auto-11111111-1111-1111-1111-111111111111-iter-1'
    });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'OBJECTIVE_INTENT_REQUIRED'
    );
  });

  test('rejects with 409 OBJECTIVE_INTENT_SUPERSEDED if P3 controller intent changed or plan missing', async () => {
    const genId = 'gen-p3-superseded';
    setupMockAi({
      job_id: genId,
      idempotency_key: 'auto-11111111-1111-1111-1111-111111111111-obj-22222222-2222-2222-2222-222222222222-intent-1-plan-1-iter-1-try-1'
    });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'OBJECTIVE_INTENT_SUPERSEDED'
    );
  });

  test('rejects with 404 BASE_REVISION_NOT_FOUND if base revision does not belong to chapter', async () => {
    const genId = 'gen-foreign-revision';
    setupMockAi({ job_id: genId, revision_id: crypto.randomUUID() });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'BASE_REVISION_NOT_FOUND'
    );
  });

  test('rejects with 409 STALE_BASE_REVISION if base revision is no longer current latest revision', async () => {
    const genId = 'gen-stale-rev';
    // baseRevisionId is no longer the latest revision because test 1 committed a newer one
    setupMockAi({ job_id: genId, revision_id: baseRevisionId });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'STALE_BASE_REVISION'
    );
  });

  test('rejects with 409 CONTENT_HASH_MISMATCH if base revision content hash does not match generation', async () => {
    const genId = 'gen-hash-mismatch';
    const pool = getPostgresPool();
    const latestRes = await pool.query('SELECT latest_revision_id FROM chapters WHERE chapter_id = $1', [chapterId]);
    const currentLatestId = latestRes.rows[0].latest_revision_id;

    setupMockAi({ job_id: genId, revision_id: currentLatestId, content_hash: 'mismatched-content-hash' });

    await assert.rejects(
      () => acceptDraft(
        { userId: authorId, role: 'AUTHOR' } as any,
        chapterId,
        { generationId: genId }
      ),
      (err: any) => err instanceof AppError && err.code === 'CONTENT_HASH_MISMATCH'
    );
  });
});
