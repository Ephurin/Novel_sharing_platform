import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { publishDueChapters } from '../novels/chapter-schedules.js';
import {
  assertIndependentActor
} from '../../core/security/moderation-policy.js';

const PASSWORD = 'Moderator-Contract-1';

async function insertUser(pool: ReturnType<typeof getPostgresPool>, user: { id: string; role: string; passwordHash?: string | null }) {
  await pool.query(
    "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,$4,$5,'ACTIVE')",
    [user.id, `pr01-${user.id}@example.test`, `pr01-${user.id.slice(0, 12)}`, user.passwordHash ?? 'test-only', user.role]
  );
}

async function insertPublishedNovel(pool: ReturnType<typeof getPostgresPool>, novelId: string, authorId: string, title: string, synopsis: string) {
  await pool.query(
    "insert into novels(novel_id,author_id,title,slug,synopsis,status,published_at) values($1,$2,$3,$4,$5,'PUBLISHED',now())",
    [novelId, authorId, title, `pr01-${novelId.slice(0, 12)}`, synopsis]
  );
}

async function bearerCall(base: string, path: string, options: { method?: string; token?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.cookie = options.cookie;
  const response = await fetch(base + path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}

describe('PR-01: moderator role capability and access-version session contract', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const root = randomUUID();
  const moderator = randomUUID();
  const reader = randomUUID();
  const stranger = randomUUID();
  const modNovel = randomUUID();
  const strangerNovel = randomUUID();
  let modChapter = '';
  let modScheduledChapter = '';
  let server: Server;
  let base: string;

  const mint = (userId: string, role: string, ver?: number) =>
    jwt.sign({ sub: userId, role, ...(ver === undefined ? {} : { ver }) }, env.JWT_ACCESS_SECRET);
  const moderatorToken = (ver = 0) => mint(moderator, 'MODERATOR', ver);

  const createChapterViaApi = async (token: string, novelId: string, title: string, content: string) => {
    const created = await bearerCall(base, `/novels/${novelId}/chapters`, {
      method: 'POST',
      token,
      body: { title, content }
    });
    assert.ok([200, 201].includes(created.status), `chapter create returned ${created.status}`);
    const chapterId = created.body.data.chapterId as string;
    const detail = await bearerCall(base, `/chapters/${chapterId}`, { token });
    assert.equal(detail.status, 200);
    return { chapterId, draft: detail.body.data.draft as { version: number } | null };
  };

  const login = async (identifier: string, password: string) => {
    const response = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    const setCookie = response.headers.get('set-cookie') ?? '';
    const body = (await response.json()) as { data: { user: { role: string }; accessToken: string } };
    return { status: response.status, body, refreshToken: setCookie.match(/ephurin_refresh_token=([^;]+)/)?.[1] };
  };

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    await insertUser(pool, { id: root, role: 'ADMIN' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [root]);
    await insertUser(pool, { id: moderator, role: 'MODERATOR' });
    await insertUser(pool, { id: reader, role: 'READER', passwordHash: await bcrypt.hash(PASSWORD, 4) });
    await insertUser(pool, { id: stranger, role: 'AUTHOR' });
    await pool.query(
      'insert into user_profiles(user_id,display_name,bio) values($1,$2,$3),($4,$5,$6)',
      [moderator, 'Điều hành viên PR-01', 'Hồ sơ tác giả của moderator.', stranger, 'Tác giả PR-01', 'Hồ sơ tác giả khác.']
    );
    await pool.query("insert into wallets(user_id,coins_balance) values($1,200),($2,50),($3,50000)", [moderator, reader, stranger]);
    await insertPublishedNovel(pool, modNovel, moderator, 'PR-01 moderator novel', 'Một tác phẩm do moderator sở hữu để kiểm khả năng Author.');
    await insertPublishedNovel(pool, strangerNovel, stranger, 'PR-01 stranger novel', 'Tác phẩm của tác giả khác để kiểm sở hữu.');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}${env.API_PREFIX}`;

    // Seed drafts through the guarded APIs so the Mongo draft store and Postgres stay consistent.
    const modDraft = await createChapterViaApi(
      moderatorToken(),
      modNovel,
      'PR-01 chương nháp một',
      'Nội dung nháp chương một của moderator.'
    );
    modChapter = modDraft.chapterId;
    const modScheduled = await createChapterViaApi(
      moderatorToken(),
      modNovel,
      'PR-01 chương hai theo lịch',
      'Nội dung chương hai theo lịch của moderator. '.repeat(20)
    );
    modScheduledChapter = modScheduled.chapterId;
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    const scheduleResponse = await bearerCall(base, `/chapters/${modScheduledChapter}/schedule`, {
      method: 'POST',
      token: moderatorToken(),
      body: { scheduledAt, expectedVersion: modScheduled.draft!.version }
    });
    assert.equal(scheduleResponse.status, 200);
    await pool.query(
      "update chapter_publication_schedules set scheduled_at = now() - interval '1 second' where chapter_id=$1",
      [modScheduledChapter]
    );
  });

  after(async () => {
    server?.close();
    await disconnectPostgres();
    await disconnectMongo();
  });

  test('E09: a session issued before an access change is rejected until re-login', async () => {
    const session = await login(`pr01-${reader}@example.test`, PASSWORD);
    assert.equal(session.status, 200);
    assert.equal(session.body.data.user.role, 'READER');
    const oldAccessToken = session.body.data.accessToken as string;
    const oldRefreshToken = session.refreshToken as string;
    assert.equal((await bearerCall(base, '/auth/me', { token: oldAccessToken })).status, 200);

    const grant = await bearerCall(base, `/admin/users/${reader}/access`, {
      method: 'PATCH',
      token: mint(root, 'ADMIN', 0),
      body: { role: 'ADMIN', scope: 'FINANCE', reason: 'E09 promote reader' }
    });
    assert.equal(grant.status, 200);
    assert.equal(grant.body.data.accessVersion, 1);

    const rejectedMe = await bearerCall(base, '/auth/me', { token: oldAccessToken });
    assert.equal(rejectedMe.status, 401);
    assert.equal((rejectedMe.body as { error?: { code?: string } }).error?.code, 'AUTH_009');
    const rejectedRefresh = await bearerCall(base, '/auth/refresh-token', {
      method: 'POST',
      cookie: `${env.REFRESH_TOKEN_COOKIE_NAME}=${oldRefreshToken}`
    });
    assert.equal(rejectedRefresh.status, 401);

    const renewed = await login(`pr01-${reader}@example.test`, PASSWORD);
    assert.equal(renewed.status, 200);
    assert.equal(renewed.body.data.user.role, 'ADMIN');
    const freshCalls = await Promise.all([
      bearerCall(base, '/admin/access', { token: renewed.body.data.accessToken }),
      bearerCall(base, '/auth/me', { token: renewed.body.data.accessToken })
    ]);
    assert.equal(freshCalls[0].status, 200);
    assert.equal((freshCalls[0].body as { data: { scope?: string } }).data.scope, 'FINANCE');
    assert.equal(freshCalls[1].status, 200);
    assert.equal((freshCalls[1].body as { data: { role?: string } }).data.role, 'ADMIN');
  });

  test('E09: an Admin scope change rejects previously issued sessions', async () => {
    const demote = await bearerCall(base, `/admin/users/${reader}/access`, {
      method: 'PATCH',
      token: mint(root, 'ADMIN', 0),
      body: { role: 'ADMIN', scope: 'MODERATOR', reason: 'E09 scope change' }
    });
    assert.equal(demote.status, 200);
    assert.equal(demote.body.data.accessVersion, 2);
    // Scope changed from FINANCE to MODERATOR but role stayed ADMIN: response still bumps the version.
    const staleScopeToken = mint(reader, 'ADMIN', 1);
    assert.equal((await bearerCall(base, '/admin/access', { token: staleScopeToken })).status, 401);
    assert.equal((await bearerCall(base, '/admin/access', { token: mint(reader, 'ADMIN', 2) })).status, 200);
  });

  test('E09: repeating the same access state does not bump the version', async () => {
    const repeat = await bearerCall(base, `/admin/users/${reader}/access`, {
      method: 'PATCH',
      token: mint(root, 'ADMIN', 0),
      body: { role: 'ADMIN', scope: 'MODERATOR', reason: 'E09 no-op repeat' }
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.data.accessVersion, 2);
    assert.equal((await bearerCall(base, '/admin/access', { token: mint(reader, 'ADMIN', 2) })).status, 200);
  });

  test('E09: a moderator session before revocation stops working after the version moves', async () => {
    const beforeRevoke = await bearerCall(base, '/auth/me', { token: moderatorToken(0) });
    assert.equal(beforeRevoke.status, 200);
    // PR-07 owns real grant/revoke. This simulates the same transactional revoke: bump + refresh revocation.
    await pool.query('update users set access_version=access_version+1 where user_id=$1', [moderator]);
    await pool.query("update refresh_tokens set revoked_at=now() where user_id=$1 and revoked_at is null", [moderator]);
    const revoked = await bearerCall(base, '/auth/me', { token: moderatorToken(0) });
    assert.equal(revoked.status, 401);
    assert.equal((await bearerCall(base, '/auth/me', { token: moderatorToken(1) })).status, 200);
  });

  test('E09: refresh racing an access change can only mint an already-stale token', async () => {
    const racing = randomUUID();
    await insertUser(pool, { id: racing, role: 'READER', passwordHash: await bcrypt.hash(PASSWORD, 4) });
    const session = await login(`pr01-${racing}@example.test`, PASSWORD);
    const oldAccessToken = session.body.data.accessToken as string;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('update users set role=$2,access_version=access_version+1 where user_id=$1', [racing, 'AUTHOR']);
      // Reads outside this transaction still see the pre-commit snapshot.
      const racedRefresh = await bearerCall(base, '/auth/refresh-token', {
        method: 'POST',
        cookie: `${env.REFRESH_TOKEN_COOKIE_NAME}=${session.refreshToken}`
      });
      assert.equal(racedRefresh.status, 200);
      const decoded = jwt.decode(racedRefresh.body.data.accessToken as string) as { ver?: number; role?: string };
      assert.equal(decoded.ver, 0);
      assert.equal(decoded.role, 'READER');
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    assert.equal((await bearerCall(base, '/auth/me', { token: oldAccessToken })).status, 401);
    const afterCommit = await bearerCall(base, '/auth/me', { token: mint(racing,'AUTHOR',1) });
    assert.equal(afterCommit.status, 200);
    assert.equal((afterCommit.body as { data: { role?: string } }).data.role, 'AUTHOR');
  });

  test('E09: the Reader-to-Author transition keeps the existing session mechanism', async () => {
    const transitioning = randomUUID();
    await insertUser(pool, { id: transitioning, role: 'READER', passwordHash: await bcrypt.hash(PASSWORD, 4) });
    const session = await login(`pr01-${transitioning}@example.test`, PASSWORD);
    const oldAccessToken = session.body.data.accessToken as string;

    const become = await bearerCall(base, '/auth/become-author', { method: 'POST', token: oldAccessToken });
    assert.equal(become.status, 200);
    assert.equal((become.body as { data: { user: { role: string } } }).data.user.role, 'AUTHOR');
    // Self-service promotion keeps the current session alive: the old token still resolves the fresh DB role.
    const me = await bearerCall(base, '/auth/me', { token: oldAccessToken });
    assert.equal(me.status, 200);
    assert.equal((me.body as { data: { role?: string } }).data.role, 'AUTHOR');
  });

  test('PR-01: the platform access API cannot grant the MODERATOR role yet', async () => {
    const attempt = await bearerCall(base, `/admin/users/${reader}/access`, {
      method: 'PATCH',
      token: mint(root, 'ADMIN', 0),
      body: { role: 'MODERATOR', reason: 'should be rejected' }
    });
    assert.equal(attempt.status, 400);
    const row = (await pool.query('select role from users where user_id=$1', [reader])).rows[0];
    assert.equal(row.role, 'ADMIN');
  });

  test('E16: a moderator keeps ordinary reader capabilities on public novels', async () => {
    const follow = await bearerCall(base, `/novels/${strangerNovel}/follow`, { method: 'PUT', token: moderatorToken(1) });
    assert.equal(follow.status, 200);
    const rate = await bearerCall(base, `/novels/${strangerNovel}/rating`, {
      method: 'PUT',
      token: moderatorToken(1),
      body: { score: 8, review: 'Một đánh giá từ moderator theo quyền độc giả.' }
    });
    assert.equal(rate.status, 200);

    const statistics = await bearerCall(base, `/novels/${strangerNovel}/statistics`, { token: moderatorToken(1) });
    assert.equal(statistics.status, 200);
    assert.equal((statistics.body as { data: { followersCount?: number } }).data.followersCount, 1);
    assert.equal((statistics.body as { data: { ratingsCount?: number } }).data.ratingsCount, 1);

    const reviews = await bearerCall(base, `/novels/${strangerNovel}/reviews?page=1&limit=10`, { token: moderatorToken(1) });
    assert.equal(reviews.status, 200);
    assert.equal((reviews.body as { data: Array<{ userId: string }> }).data[0].userId, moderator);

    const ownRatingBlocked = await bearerCall(base, `/novels/${modNovel}/rating`, {
      method: 'PUT',
      token: moderatorToken(1),
      body: { score: 9 }
    });
    assert.equal(ownRatingBlocked.status, 403);
  });

  test('E16: a moderator reads VIP with personal wallet rights and never platform finance', async () => {
    const wallet = await bearerCall(base, '/wallet/me', { token: moderatorToken(1) });
    assert.equal(wallet.status, 200);
    assert.equal((wallet.body as { data: { coinsBalance?: number } }).data.coinsBalance, 200);
    const finance = await bearerCall(base, '/admin/withdraw-requests', { token: moderatorToken(1) });
    assert.equal(finance.status, 403);
    const adminAccess = await bearerCall(base, '/admin/access', { token: moderatorToken(1) });
    assert.equal(adminAccess.status, 403);
  });

  test('E17: a moderator keeps Author capability only for owned works', async () => {
    const created = await bearerCall(base, '/novels', {
      token: moderatorToken(1),
      body: { title: 'PR-01 workspace novel', synopsis: 'Tác phẩm mới do moderator tạo theo khả năng Author.', tags: [] }
    });
    assert.ok([200, 201].includes(created.status), `novel create returned ${created.status}`);
    const createdNovelId = (created.body as { data: { novelId?: string } }).data.novelId;

    const renamed = await bearerCall(base, `/novels/${createdNovelId}`, {
      method: 'PATCH',
      token: moderatorToken(1),
      body: { title: 'PR-01 workspace novel (renamed)' }
    });
    assert.equal(renamed.status, 200);

    const foreignNovel = await bearerCall(base, `/novels/${strangerNovel}`, {
      method: 'PATCH',
      token: moderatorToken(1),
      body: { title: 'Không được sửa truyện người khác' }
    });
    assert.equal(foreignNovel.status, 403);

    const ownDraft = await bearerCall(base, `/chapters/${modChapter}`, { token: moderatorToken(1) });
    assert.equal(ownDraft.status, 200);
    const foreignDraft = await createChapterViaApi(
      mint(stranger, 'AUTHOR', 0),
      strangerNovel,
      'PR-01 nháp của tác giả khác',
      'Nội dung nháp của tác giả khác.'
    );
    const foreignDraftRead = await bearerCall(base, `/chapters/${foreignDraft.chapterId}`, { token: moderatorToken(1) });
    assert.equal(foreignDraftRead.status, 403);
  });

  test('E17: a scheduled moderator chapter still queues for review through the schedule worker', async () => {
    await publishDueChapters();
    const schedule = (
      await pool.query('select * from chapter_publication_schedules where chapter_id=$1', [modScheduledChapter])
    ).rows[0];
    assert.ok(schedule, 'scheduled chapter row missing');
    assert.equal(schedule.status, 'PENDING_MODERATION', `worker error: ${schedule.error}`);
    const review = (
      await pool.query('select * from moderation_reviews where review_id=$1', [schedule.moderation_review_id])
    ).rows[0];
    assert.equal(review.status, 'PENDING');
    assert.equal(review.target_type, 'CHAPTER');
  });

  test('E17: a moderator uses the personal wallet and earnings scope without platform finance', async () => {
    const earnings = await bearerCall(base, '/wallet/earnings', { token: moderatorToken(1) });
    assert.equal(earnings.status, 200);
    // Ví 200 Xu rút được 150 Xu: cổng quyền đã thông qua và lệnh rút thuộc ví của moderator.
    const withdraw = await bearerCall(base, '/wallet/withdraw-requests', {
      token: moderatorToken(1),
      body: { amountCoins: 150, bankAccountLabel: 'PR-01 ví cá nhân' }
    });
    assert.equal(withdraw.status, 201);
    const row = (
      await pool.query(
        `select wr.* from withdraw_requests wr join wallets w using(wallet_id) where w.user_id=$1`,
        [moderator]
      )
    ).rows[0];
    assert.ok(row, 'withdrawal row missing for moderator');
    assert.equal(row.amount_coins, 150);
  });

  test('E16: following a moderator author page stays reachable and notifies', async () => {
    const followAuthor = await bearerCall(base, `/authors/${moderator}/follow`, { method: 'POST', token: mint(stranger, 'AUTHOR', 0) });
    assert.equal(followAuthor.status, 200);
    const profile = await bearerCall(base, `/authors/${moderator}/profile`);
    assert.equal(profile.status, 200);
    assert.equal((profile.body as { data: { authorId?: string } }).data.authorId, moderator);
    const notified = (
      await pool.query("select 1 from notification_events where user_id=$1 and type='AUTHOR_FOLLOW'", [moderator])
    ).rowCount;
    assert.equal(notified, 1);
  });

  test('Reviewer gate: the shared conflict policy blocks involved actors', () => {
    assert.doesNotThrow(() => assertIndependentActor(moderator, [stranger, root]));
    assert.throws(() => assertIndependentActor(moderator, [stranger, moderator]), { httpStatus: 403, code: 'MOD_CONFLICT' });
    assert.throws(() => assertIndependentActor(moderator, [null, undefined, moderator]), { httpStatus: 403, code: 'MOD_CONFLICT' });
  });

  test('MODERATOR_ENABLED keeps the operational permission set off by default', async () => {
    const flagOn = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const program =
        "import {moderatorPermissionsFor} from './src/core/security/moderation-policy.ts';import {disconnectPostgres} from './src/core/database/postgres.ts';console.log(JSON.stringify(moderatorPermissionsFor('MODERATOR')));await disconnectPostgres();";
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
        cwd: process.cwd(),
        env: { ...process.env, MODERATOR_ENABLED: 'true' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => (stdout += data));
      child.stderr.on('data', (data) => (stderr += data));
      child.on('error', reject);
      child.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
    assert.equal(flagOn.code, 0, flagOn.stderr);
    assert.deepEqual(JSON.parse(flagOn.stdout), [
      'publication.review',
      'comment.review',
      'report.review',
      'sanction.warn',
      'sanction.hide',
      'discussion.operate',
      'escalation.submit'
    ]);
  });
});
