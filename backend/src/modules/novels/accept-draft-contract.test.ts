import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { disconnectMongo } from '../../core/database/mongo.js';
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

  let fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];

  before(async () => {
    const pool = getPostgresPool();
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
      await pool.query('DELETE FROM chapter_revisions WHERE chapter_id = $1', [chapterId]);
      await pool.query('DELETE FROM chapters WHERE chapter_id = $1', [chapterId]);
      await pool.query('DELETE FROM novels WHERE novel_id = $1', [novelId]);
      await pool.query('DELETE FROM users WHERE user_id = $1', [authorId]);
    } catch {
      // Best-effort fixture cleanup
    }
    await disconnectPostgres();
    await disconnectMongo();
    await disconnectChapterWriter();
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
