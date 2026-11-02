import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { rateLimit } from '../../core/security/rate-limit.js';
import { removeNovel, restoreNovel } from '../admin/admin.service.js';
import { createCopilotSuggestion } from '../ai-copilot/ai-copilot.service.js';
import { generateCopilotSuggestionWithLlm, isLlmConfigured } from '../ai-copilot/llm-provider.js';
import { env } from '../../core/config/env.js';
import { createServer } from 'node:http';
import { notifyFollowersOfPublishedChapter } from '../interactions/new-chapter-notifications.js';
import { submitChapterPublish } from './chapters.service.js';
import { createNovelSchema } from './novels.schemas.js';
import { createNovel, submitPublish } from './novels.service.js';

// Backend rules from docs/SRS that the SRS acceptance runner (scripts/run_srs_acceptance_e2e.py) found missing.
describe('SRS backend rules', () => {
  const pool = getPostgresPool();
  const longText = 'Đoạn văn kiểm thử đủ dài cho luật xuất bản của SRS. '.repeat(12);
  const stamp = Date.now();
  let authorAuth: AuthContext;
  let adminAuth: AuthContext;
  let followerId: string;
  let novelFollowerId: string;
  let strangerId: string;

  async function user(role: string, name: string) {
    return (await pool.query(
      `insert into users (email, username, password_hash, role) values ($1, $2, 'hash', $3) returning user_id`,
      [`${name}-${stamp}@srs.test`, `${name}_${stamp}`, role]
    )).rows[0].user_id as string;
  }

  async function novel(status: 'DRAFT' | 'PUBLISHED', title = `SRS rules ${stamp} ${Math.random()}`) {
    return (await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status) values ($1, $2, $3, $4, $5) returning novel_id`,
      [authorAuth.userId, title, `srs-rules-${stamp}-${Math.random().toString(36).slice(2)}`, longText, status]
    )).rows[0].novel_id as string;
  }

  async function chapter(novelId: string, number: number, content: string, extra: { deleted?: boolean } = {}) {
    return (await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, deleted_at)
       values ($1, $2, $3, $4, 'DRAFT', $5) returning chapter_id`,
      [novelId, `Chương ${number}`, number, content, extra.deleted ? new Date('2026-01-01') : null]
    )).rows[0].chapter_id as string;
  }

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    authorAuth = { userId: await user('AUTHOR', 'srs_author'), role: 'AUTHOR' };
    const adminId = await user('ADMIN', 'srs_admin');
    await pool.query("insert into admin_access(user_id, scope) values ($1, 'SUPER_ADMIN')", [adminId]);
    adminAuth = { userId: adminId, role: 'ADMIN', adminScope: 'SUPER_ADMIN' };
    followerId = await user('READER', 'srs_follower');
    novelFollowerId = await user('READER', 'srs_novel_follower');
    strangerId = await user('READER', 'srs_stranger');
  });

  after(async () => {
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('AUTH-02: a malformed email on register is AUTH_001; other bad fields stay VALIDATION_001', async () => {
    const { createApp } = await import('../../app.js');
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth/register`;
      const post = async (body: unknown) => {
        const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: response.status, body: (await response.json()) as any };
      };
      const badEmail = await post({ email: 'not-an-email', username: `srs_${stamp}`, password: 'Password1!' });
      assert.equal(badEmail.status, 400);
      assert.equal(badEmail.body.error.code, 'AUTH_001');
      const badPassword = await post({ email: `ok-${stamp}@srs.test`, username: `srs_${stamp}`, password: 'short' });
      assert.equal(badPassword.status, 400);
      assert.equal(badPassword.body.error.code, 'VALIDATION_001');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('NOV-02/03: title must be under 255 characters and synopsis at least 500; a 254-character title gets a valid slug', async () => {
    const body = { title: 'T'.repeat(254), synopsis: longText, tags: [] };
    assert.equal(createNovelSchema.safeParse({ body }).success, true);
    assert.equal(createNovelSchema.safeParse({ body: { ...body, title: 'T'.repeat(255) } }).success, false);
    assert.equal(createNovelSchema.safeParse({ body: { ...body, synopsis: 'Ngắn.' } }).success, false);
    const created = await createNovel(authorAuth, { ...body, tags: [] });
    assert.ok(created.slug.length <= 255);
  });

  test('NOV-04: a novel with fewer than five valid chapters cannot be submitted for publishing', async () => {
    const novelId = await novel('DRAFT');
    for (let number = 1; number <= 4; number++) await chapter(novelId, number, longText);
    await chapter(novelId, 5, 'Quá ngắn.');
    await chapter(novelId, 6, longText, { deleted: true });
    await assert.rejects(submitPublish(authorAuth, novelId), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.httpStatus, 422);
      assert.equal(error.code, 'VALIDATION_002');
      assert.deepEqual(error.details, { readyChapters: 4, requiredChapters: 5 });
      return true;
    });
    assert.equal((await pool.query('select status from novels where novel_id = $1', [novelId])).rows[0].status, 'DRAFT');
    await chapter(novelId, 7, longText);
    const submitted = await submitPublish(authorAuth, novelId);
    assert.ok(['PUBLISHED', 'PENDING_MODERATION'].includes(submitted.status));
  });

  test('NOV-06: a chapter under 500 characters is not published', async () => {
    const novelId = await novel('PUBLISHED');
    const chapterId = await chapter(novelId, 1, 'Nội dung quá ngắn.');
    await assert.rejects(submitChapterPublish(authorAuth, chapterId), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.httpStatus, 422);
      assert.equal(error.code, 'CONTENT_003');
      return true;
    });
    assert.equal((await pool.query('select status from chapters where chapter_id = $1', [chapterId])).rows[0].status, 'DRAFT');
  });

  test('SOC-12: publishing a chapter notifies author and novel followers once each', async () => {
    const novelId = await novel('PUBLISHED');
    await pool.query('insert into follows (follower_id, author_id) values ($1, $2)', [followerId, authorAuth.userId]);
    await pool.query('insert into novel_follows (novel_id, user_id) values ($1, $2), ($1, $3)', [novelId, novelFollowerId, followerId]);
    const chapterId = await chapter(novelId, 1, longText);
    const published = await submitChapterPublish(authorAuth, chapterId);
    assert.equal(published.status, 'PUBLISHED');
    const recipients = async () => (await pool.query(
      "select user_id, title, payload from notification_events where type = 'NEW_CHAPTER' and payload->>'chapterId' = $1 order by user_id",
      [chapterId]
    )).rows;
    const first = await recipients();
    assert.deepEqual(first.map((row) => row.user_id).sort(), [followerId, novelFollowerId].sort());
    assert.ok(!first.some((row) => row.user_id === strangerId || row.user_id === authorAuth.userId));
    assert.equal(first[0].payload.href, `/reader/chapters/${chapterId}`);
    await notifyFollowersOfPublishedChapter(pool, chapterId);
    assert.equal((await recipients()).length, 2);
  });

  test('SOC-12: a chapter of a novel that is not public yet notifies nobody', async () => {
    const novelId = await novel('DRAFT');
    await pool.query('insert into novel_follows (novel_id, user_id) values ($1, $2)', [novelId, novelFollowerId]);
    const chapterId = await chapter(novelId, 1, longText);
    await submitChapterPublish(authorAuth, chapterId);
    const count = (await pool.query("select count(*)::int as n from notification_events where type = 'NEW_CHAPTER' and payload->>'chapterId' = $1", [chapterId])).rows[0].n;
    assert.equal(count, 0);
  });

  test('ADM-03/08: removing a novel hides its chapters and drafts, tells the author, and restore brings back only those', async () => {
    const title = `Truyện bị gỡ ${stamp}`;
    const novelId = await novel('PUBLISHED', title);
    const live = await chapter(novelId, 1, longText);
    const alreadyDeleted = await chapter(novelId, 2, longText, { deleted: true });
    const drafts = getMongoDatabase().collection('draft_chapters');
    const now = new Date();
    const draftBase = { novelId, authorId: authorAuth.userId, title: 'Nháp', content: longText, wordCount: 10, version: 1, autosave: false, createdAt: now, updatedAt: now };
    await drafts.insertMany([
      { ...draftBase, chapterId: live, deletedAt: null },
      { ...draftBase, chapterId: alreadyDeleted, deletedAt: new Date('2026-01-01'), deletionReason: 'AUTHOR_DELETED' }
    ]);

    const reason = `Vi phạm SRS ${stamp}`;
    await removeNovel(adminAuth, novelId, { confirm: true, reason });
    assert.notEqual((await pool.query('select deleted_at from novels where novel_id = $1', [novelId])).rows[0].deleted_at, null);
    assert.equal((await pool.query('select count(*)::int as n from chapters where novel_id = $1 and deleted_at is null', [novelId])).rows[0].n, 0);
    assert.notEqual((await drafts.findOne({ chapterId: live }))?.deletedAt, null);
    assert.equal((await drafts.findOne({ chapterId: alreadyDeleted }))?.adminSanctionId, undefined);

    const notice = await getMongoDatabase().collection('notifications').findOne({ userId: authorAuth.userId, title: 'Truyện đã bị gỡ bởi Admin', 'payload.targetId': novelId });
    assert.ok(notice, 'author receives the SRS removal notification');
    assert.ok(String(notice.content).includes(title));
    assert.ok(String(notice.content).includes(reason));
    assert.equal(notice.payload.novelTitle, title);
    assert.ok(notice.payload.removedAt);

    await restoreNovel(adminAuth, novelId, { reason: 'Khôi phục SRS' });
    assert.equal((await pool.query('select deleted_at from novels where novel_id = $1', [novelId])).rows[0].deleted_at, null);
    assert.equal((await pool.query('select deleted_at from chapters where chapter_id = $1', [live])).rows[0].deleted_at, null);
    assert.notEqual((await pool.query('select deleted_at from chapters where chapter_id = $1', [alreadyDeleted])).rows[0].deleted_at, null);
    assert.equal((await drafts.findOne({ chapterId: live }))?.deletedAt, null);
    assert.notEqual((await drafts.findOne({ chapterId: alreadyDeleted }))?.deletedAt, null);
  });

  test('PAY-15: the payment limiter answers 429 RATE_LIMIT_001 with Retry-After once a user exceeds the budget', () => {
    const limiter = rateLimit({ scope: 'payment', max: 2, windowMs: 60_000 });
    const call = (userId: string) => {
      const headers: Record<string, string> = {};
      let error: unknown;
      limiter({ auth: { userId, role: 'READER' }, ip: '127.0.0.1' } as any, { setHeader: (name: string, value: string) => { headers[name] = value; } } as any, (err?: unknown) => { error = err; });
      return { error, headers };
    };
    assert.equal(call('reader-a').error, undefined);
    assert.equal(call('reader-a').error, undefined);
    const limited = call('reader-a');
    assert.ok(limited.error instanceof AppError);
    assert.equal(limited.error.httpStatus, 429);
    assert.equal(limited.error.code, 'RATE_LIMIT_001');
    assert.ok(Number(limited.headers['Retry-After']) > 0);
    assert.equal(call('reader-b').error, undefined, 'each user has a separate budget');
  });

  test('AI-06: without an LLM the copilot answers AI_001 at once instead of a canned suggestion', { skip: isLlmConfigured() && 'an LLM is configured' }, async () => {
    const novelId = await novel('DRAFT');
    const started = Date.now();
    await assert.rejects(createCopilotSuggestion(authorAuth, { novelId, instruction: 'Viết tiếp', recentText: '' }), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.httpStatus, 503);
      assert.equal(error.code, 'AI_001');
      return true;
    });
    assert.ok(Date.now() - started < 5000);
  });

  test('AI-06: a provider that answers 5xx, hangs past the timeout or is down gives AI_001 with the reason', async () => {
    let mode: 'error' | 'hang' = 'error';
    const provider = createServer((_request, response) => {
      if (mode === 'error') response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"down"}');
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', () => resolve()));
    const saved = { baseUrl: env.AI_LLM_BASE_URL, timeout: env.AI_LLM_TIMEOUT_MS };
    env.AI_LLM_BASE_URL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
    env.AI_LLM_TIMEOUT_MS = 500;
    const reason = async () => {
      const started = Date.now();
      try {
        await generateCopilotSuggestionWithLlm({ instruction: 'Viết tiếp', recentText: '', characters: [], recentEvents: [] });
        return 'resolved';
      } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.httpStatus, 503);
        assert.equal(error.code, 'AI_001');
        assert.ok(Date.now() - started < 5000);
        return (error.details as { reason: string }).reason;
      }
    };
    try {
      assert.equal(await reason(), 'provider_http_503');
      mode = 'hang';
      assert.equal(await reason(), 'timeout');
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      assert.equal(await reason(), 'unreachable');
    } finally {
      if (provider.listening) {
        provider.closeAllConnections();
        provider.close();
      }
      env.AI_LLM_BASE_URL = saved.baseUrl;
      env.AI_LLM_TIMEOUT_MS = saved.timeout;
    }
  });
});
