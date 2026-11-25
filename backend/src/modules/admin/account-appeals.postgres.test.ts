import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { consumeGoogleChallenge } from '../auth/auth.repository.js';

const clientId = 'storycraft-test.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

type Options = { token?: string; body?: unknown; cookie?: string; ip?: string; origin?: string };

describe('PR-06: account appeals and independent resolution', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const origin = new URL(env.WEB_ORIGIN).origin;
  let server: Server;
  let base: string;

  const mkUser = async (
    prefix: string,
    options: {
      role?: string;
      status?: string;
      password?: string;
      googleSubject?: string;
    } = {}
  ) => {
    const userId = randomUUID();
    await pool.query(
      `insert into users(user_id,email,username,password_hash,role,status,oauth_provider,oauth_subject,access_version)
       values($1,$2,$3,$4,$5,$6,$7,$8,0)`,
      [
        userId,
        `${prefix}-${userId}@example.test`,
        `${prefix}_${userId.slice(0, 8)}`,
        options.password ? await bcrypt.hash(options.password, 12) : null,
        options.role ?? 'READER',
        options.status ?? 'ACTIVE',
        options.googleSubject ? 'google' : null,
        options.googleSubject ?? null
      ]
    );
    return userId as string;
  };

  const mkSanction = async (
    actorId: string,
    input: {
      targetType: string;
      targetId: string;
      ownerId: string;
      action: 'WARN' | 'HIDE' | 'LOCK';
      previous?: Record<string, unknown>;
    }
  ) => {
    const auditId = (
      await pool.query(
        `insert into admin_audit(actor_id,action,target_type,target_id,affected_user_id,reason,before_state,after_state)
         values($1,$2,$3,$4,$5,'fixture',$6,'{}'::jsonb) returning audit_id`,
        [
          actorId,
          `${input.targetType}_${input.action}`,
          input.targetType,
          input.targetId,
          input.ownerId,
          JSON.stringify(input.previous ?? null)
        ]
      )
    ).rows[0].audit_id as string;
    const sanction = (
      await pool.query(
        `insert into admin_sanctions(audit_id,target_type,target_id,owner_id,action,previous_state,active)
         values($1,$2,$3,$4,$5,$6,true) returning *`,
        [auditId, input.targetType, input.targetId, input.ownerId, input.action, JSON.stringify(input.previous ?? null)]
      )
    ).rows[0];
    return { auditId, sanction };
  };

  const lockAccount = async (actorId: string, userId: string) => {
    await pool.query("update users set status='LOCKED' where user_id=$1", [userId]);
    return mkSanction(actorId, {
      targetType: 'USER',
      targetId: userId,
      ownerId: userId,
      action: 'LOCK',
      previous: { status: 'ACTIVE' }
    });
  };

  const adminToken = (userId: string, role = 'ADMIN', ver = 0) =>
    jwt.sign({ sub: userId, role, ver }, env.JWT_ACCESS_SECRET);

  const call = async (method: string, path: string, options: Options = {}, api = base) => {
    const response = await fetch(api + path, {
      method,
      headers: {
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
        ...(options.token && { authorization: `Bearer ${options.token}` }),
        ...(options.cookie && { cookie: options.cookie }),
        ...(options.ip && { 'x-real-ip': options.ip }),
        ...(options.origin && { origin: options.origin })
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) })
    });
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      /* empty responses stay null */
    }
    return { status: response.status, headers: response.headers, body };
  };

  const googleCredential = (
    nonce: string,
    subject: string,
    email: string,
    audience = clientId,
    emailVerified = true
  ) =>
    jwt.sign(
      { nonce, email, email_verified: emailVerified, name: 'Người đọc Google' },
      privateKey,
      { subject, audience, issuer: 'https://accounts.google.com', expiresIn: 300, keyid: 'fixture', algorithm: 'RS256' }
    );

  const appealChallenge = async (ip: string) => {
    const result = await call('POST', '/account/appeal-session/google/challenge', { ip, origin });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.clientId, clientId);
    const setCookie = result.headers.get('set-cookie');
    assert.ok(setCookie, 'the challenge must set its HttpOnly cookie');
    assert.ok(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict'));
    assert.ok(setCookie.includes(`Path=${env.API_PREFIX}/account/appeal-session/google`));
    return { nonce: result.body.data.nonce as string, cookie: setCookie.split(';')[0] };
  };

  let decider: string;
  let indepUsers: string;
  let indepUsers2: string;
  let indepContent: string;

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    env.GOOGLE_OAUTH_CLIENT_ID = clientId;
    // Appeals tests distinguish client buckets through X-Real-IP; the direct test peer is the
    // only trusted proxy in the isolated runner.
    env.AUTH_TRUSTED_PROXY_HOST = '127.0.0.1';
    decider = await mkUser('appeal_decider', { role: 'ADMIN' });
    indepUsers = await mkUser('appeal_indep_users', { role: 'ADMIN' });
    indepUsers2 = await mkUser('appeal_indep_users2', { role: 'ADMIN' });
    indepContent = await mkUser('appeal_indep_content', { role: 'ADMIN' });
    for (const [user, scope] of [
      [decider, 'SUPER_ADMIN'],
      [indepUsers, 'USER_MANAGER'],
      [indepUsers2, 'USER_MANAGER'],
      [indepContent, 'MODERATOR']
    ] as const)
      await pool.query('insert into admin_access(user_id,scope) values($1,$2)', [user, scope]);
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}${env.API_PREFIX}`;
  });

  after(async () => {
    env.AUTH_TRUSTED_PROXY_HOST = undefined as unknown as string;
    if (server)
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('E21-sim: a locked Google-only account verifies, appeals, and nothing else changes', async (t) => {
    t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({
      certs: { fixture: publicKey.export({ format: 'pem', type: 'spki' }) },
      format: 'PEM'
    }));
    const actor = decider;
    const userId = await mkUser('appeal_google', { googleSubject: 'appeal-google-subject', status: 'ACTIVE' });
    const lock = await lockAccount(actor, userId);

    // Origin gate and challenge/nonce/audience/email checks.
    assert.equal(
      (await call('POST', '/account/appeal-session/google/challenge', { ip: '10.20.0.1', origin: 'http://localhost:9999' })).status,
      403
    );
    const challenge = await appealChallenge('10.20.0.1');
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: { credential: googleCredential(challenge.nonce, 'appeal-google-subject', 'person@example.test') }
      })).body.error.code,
      'AUTH_GOOGLE_CHALLENGE'
    );
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: { credential: googleCredential('wrong-nonce', 'appeal-google-subject', 'person@example.test') },
        cookie: challenge.cookie
      })).body.error.code,
      'AUTH_GOOGLE_CHALLENGE'
    );
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: {
          credential: googleCredential(challenge.nonce, 'appeal-google-subject', 'person@example.test', 'other-audience')
        },
        cookie: challenge.cookie
      })).body.error.code,
      'AUTH_GOOGLE_CREDENTIAL'
    );
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: {
          credential: googleCredential(challenge.nonce, 'appeal-google-subject', 'person@example.test', clientId, false)
        },
        cookie: challenge.cookie
      })).body.error.code,
      'AUTH_GOOGLE_EMAIL'
    );

    // A different Google subject with the same email must not open a session for this account.
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: {
          credential: googleCredential(challenge.nonce, 'appeal-imposter-subject', 'appeal-imposter@example.test')
        },
        cookie: challenge.cookie
      })).status,
      401
    );

    // An expired challenge cookie is rejected before any Google call matters.
    const expiredCookie =
      'ephurin_refresh_token_appeal_google=' +
      jwt.sign({ nonce: 'expired-nonce' }, env.JWT_REFRESH_SECRET, {
        audience: 'storycraft-google-appeal',
        jwtid: 'expired-nonce',
        expiresIn: -10
      });
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.1',
        origin,
        body: { credential: googleCredential('expired-nonce', 'appeal-google-subject', 'person@example.test') },
        cookie: expiredCookie
      })).body.error.code,
      'AUTH_GOOGLE_CHALLENGE'
    );

    const hiddenSubject = await mkUser('appeal_google_missing', { googleSubject: 'unlinked-google-subject' });
    await lockAccount(actor, hiddenSubject);
    const fresh = await appealChallenge('10.20.0.1');
    const session = await call('POST', '/account/appeal-session/google', {
      ip: '10.20.0.1',
      origin,
      body: { credential: googleCredential(fresh.nonce, 'appeal-google-subject', 'person@example.test') },
      cookie: fresh.cookie
    });
    assert.equal(session.status, 200);
    const consumed = await pool.query(
      'select purpose from consumed_google_challenges where nonce=$1',
      [fresh.nonce]
    );
    assert.deepEqual(consumed.rows.map((r) => r.purpose), ['appeal']);
    // Replay of the same credential+cookie is refused: the nonce was consumed once.
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.2',
        origin,
        body: { credential: googleCredential(fresh.nonce, 'appeal-google-subject', 'person@example.test') },
        cookie: fresh.cookie
      })).body.error.code,
      'AUTH_GOOGLE_CHALLENGE'
    );

    const row = (await pool.query(
      'select status,role,access_version,last_login_at,oauth_subject from users where user_id=$1',
      [userId]
    )).rows[0];
    assert.equal(row.status, 'LOCKED', 'successful verification keeps the account locked');
    assert.equal(row.role, 'READER');
    assert.equal(row.access_version, 0);
    assert.equal(row.last_login_at, null);
    assert.equal(row.oauth_subject, 'appeal-google-subject');

    const token = session.body.data.token as string;
    const refreshCookies = (session.headers as any).getSetCookie?.() ?? [];
    assert.ok(
      !refreshCookies.some((c: string) => c.startsWith(`${env.REFRESH_TOKEN_COOKIE_NAME}=`)),
      'no refresh cookie may be issued by an appeal session'
    );

    // The appeal token is only valid on the appeal gate.
    assert.equal(
      (await call('GET', '/auth/me', { token })).status,
      401,
      'restricted tokens must be refused by normal APIs'
    );
    // Segregated nonce purposes: a login challenge cookie cannot serve the appeal exchange.
    const loginChallenge = await call('POST', '/auth/google/challenge', { ip: '10.20.0.3', origin, body: {} });
    const loginCookie = (loginChallenge.headers.get('set-cookie') ?? '').split(';')[0];
    assert.equal(
      (await call('POST', '/account/appeal-session/google', {
        ip: '10.20.0.3',
        origin,
        body: {
          credential: googleCredential(
            loginChallenge.body.data.nonce,
            'appeal-google-subject',
            'person@example.test'
          )
        },
        cookie: loginCookie
      })).body.error.code,
      'AUTH_GOOGLE_CHALLENGE'
    );
    // Purpose separation at storage level: one nonce per purpose, never shared.
    const shared = 'nonce-shared-' + randomUUID();
    assert.ok(await withPostgresTransaction((c) => consumeGoogleChallenge(c, shared, 'login', new Date(Date.now() + 60_000))));
    assert.ok(await withPostgresTransaction((c) => consumeGoogleChallenge(c, shared, 'appeal', new Date(Date.now() + 60_000))));
    assert.ok(!(await withPostgresTransaction((c) => consumeGoogleChallenge(c, shared, 'login', new Date(Date.now() + 60_000)))));

    // Decisions and one appeal for the subject.
    const decisions = await call('GET', '/account/decisions', { token });
    assert.equal(decisions.status, 200);
    const own = decisions.body.data as any[];
    assert.equal(own.filter((d) => d.audit_id === lock.auditId).length, 1);
    assert.ok(own.every((d) => d.reason === 'fixture'));
    const appeal = await call('POST', '/account/appeals', {
      token,
      body: { auditId: lock.auditId, message: 'Tôi bị nhầm trong lần khóa này, xin xem xét lại toàn bộ hồ sơ.' }
    });
    assert.equal(appeal.status, 201);
    const duplicate = await call('POST', '/account/appeals', {
      token,
      body: { auditId: lock.auditId, message: 'Gửi lại lần nữa để kiểm tra quy tắc một hồ sơ.' }
    });
    assert.equal(duplicate.status, 409);
    const foreign = await call('POST', '/account/appeals', {
      token,
      body: { auditId: (await mkSanction(decider, {
        targetType: 'USER', targetId: hiddenSubject, ownerId: hiddenSubject, action: 'WARN'
      })).auditId, message: 'Đây là quyết định của người khác, không được phép gửi.' }
    });
    assert.equal(foreign.status, 404, 'only the subject of a decision may appeal it');
    assert.ok(appeal.body.data.appeal_id);
  });

  test('E21-sim: two API processes share challenge, exchange and verified-subject limits', async (t) => {
    t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({
      certs: { fixture: publicKey.export({ format: 'pem', type: 'spki' }) },
      format: 'PEM'
    }));
    const program = `
      import { OAuth2Client } from 'google-auth-library';
      import { createApp } from './src/app.ts';
      OAuth2Client.prototype.getFederatedSignonCertsAsync = async () => ({
        certs: { fixture: process.env.APPEAL_TEST_GOOGLE_PUBLIC_KEY }, format: 'PEM'
      });
      const server = createApp().listen(0, '127.0.0.1');
      server.on('listening', () => process.send(server.address().port));
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GOOGLE_OAUTH_CLIENT_ID: clientId,
        AUTH_TRUSTED_PROXY_HOST: '127.0.0.1',
        APPEAL_TEST_GOOGLE_PUBLIC_KEY: publicKey.export({ format: 'pem', type: 'spki' }).toString()
      },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
    const exited = once(child, 'exit');
    t.after(async () => {
      child.kill();
      await exited;
    });
    const [port] = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(10_000) }),
      exited.then(() => { throw new Error('Second API process exited before listening'); })
    ]);
    assert.equal(typeof port, 'number');
    const secondApi = `http://127.0.0.1:${port}${env.API_PREFIX}`;

    const challengeRoute = '/account/appeal-session/google/challenge';
    const challengeIp = '10.20.1.3';
    const concurrentChallenges = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      call('POST', challengeRoute, { ip: challengeIp, origin }, index % 2 ? secondApi : base)
    ));
    assert.equal(concurrentChallenges.filter((response) => response.status === 200).length, 10);
    assert.equal(concurrentChallenges.filter((response) => response.status === 429).length, 2);
    for (const limited of concurrentChallenges.filter((response) => response.status === 429)) {
      assert.equal(limited.body.error.details.scope, 'appeal-google-challenge');
      assert.equal(limited.headers.get('retry-after'), String(limited.body.error.details.retryAfterSeconds));
    }
    await pool.query(
      "update appeal_google_rate_limits set reset_at=now() - interval '1 second' where scope='appeal-google-challenge' and bucket_key=$1",
      [createHash('sha256').update(`ip:${challengeIp}`).digest('hex')]
    );
    assert.equal((await call('POST', challengeRoute, { ip: challengeIp, origin }, secondApi)).status, 200);

    const userId = await mkUser('appeal_rate', { googleSubject: 'appeal-rate-subject' });
    await lockAccount(decider, userId);
    const session = await appealChallenge('10.20.1.4');
    const first = await call('POST', '/account/appeal-session/google', {
      ip: '10.20.1.4',
      origin,
      body: { credential: googleCredential(session.nonce, 'appeal-rate-subject', 'rate@example.test') },
      cookie: session.cookie
    });
    assert.equal(first.status, 200);
    for (let i = 0; i < 9; i++) {
      const replay = await call('POST', '/account/appeal-session/google', {
        ip: '10.20.1.4',
        origin,
        body: { credential: googleCredential(session.nonce, 'appeal-rate-subject', 'rate@example.test') },
        cookie: session.cookie
      }, i % 2 ? base : secondApi);
      assert.equal(replay.status, 401);
    }
    const ipLimited = await call('POST', '/account/appeal-session/google', {
        ip: '10.20.1.4',
        origin,
        body: { credential: googleCredential(session.nonce, 'appeal-rate-subject', 'rate@example.test') },
        cookie: session.cookie
    }, secondApi);
    assert.equal(ipLimited.status, 429, 'ten shared exchanges exhaust the per-IP budget');
    assert.equal(ipLimited.body.error.details.scope, 'appeal-google-exchange');
    const fresh = await appealChallenge('10.20.1.5');
    const subjectLimited = await call('POST', '/account/appeal-session/google', {
      ip: '10.20.1.5',
      origin,
      body: { credential: googleCredential(fresh.nonce, 'appeal-rate-subject', 'rate@example.test') },
      cookie: fresh.cookie
    }, secondApi);
    assert.equal(
      subjectLimited.status,
      429,
      'a verified subject is limited across client IP buckets'
    );
    assert.equal(subjectLimited.body.error.code, 'RATE_LIMIT_001');
    assert.equal(subjectLimited.body.error.details.scope, 'appeal-google-subject');
    assert.equal(subjectLimited.headers.get('retry-after'), String(subjectLimited.body.error.details.retryAfterSeconds));
  });

  test('E06: the password session reads own decisions and files one appeal', async () => {
    const userId = await mkUser('appeal_password', { password: 'AppealPassword123!' });
    const lock = await lockAccount(decider, userId);
    const other = await mkUser('appeal_password_other', { password: 'AppealPassword123!' });
    await mkSanction(decider, {
      targetType: 'USER', targetId: other, ownerId: other, action: 'WARN'
    });

    const bad = await call('POST', '/account/appeal-session', {
      body: { identifier: `appeal_password-${userId}@example.test`, password: 'WrongPassword123!' }
    });
    assert.equal(bad.status, 401);
    const ok = await call('POST', '/account/appeal-session', {
      body: { identifier: `appeal_password-${userId}@example.test`, password: 'AppealPassword123!' }
    });
    assert.equal(ok.status, 200);
    const token = ok.body.data.token as string;
    assert.equal((await call('GET', '/auth/me', { token })).status, 401);
    const decisions = await call('GET', '/account/decisions', { token });
    assert.equal(decisions.status, 200);
    const own = decisions.body.data as any[];
    assert.equal(own.length, 1, 'the session only sees its own decisions');
    assert.equal(own[0].audit_id, lock.auditId);
    assert.equal((await pool.query('select status from users where user_id=$1', [userId])).rows[0].status, 'LOCKED');
    const appeal = await call('POST', '/account/appeals', {
      token,
      body: { auditId: lock.auditId, message: 'Tài khoản bị khóa do nhầm lẫn định danh, xin xem xét lại.' }
    });
    assert.equal(appeal.status, 201);
    assert.equal(
      (await call('POST', '/account/appeals', {
        token,
        body: { auditId: lock.auditId, message: 'Lần lặp bị từ chối với lỗi trùng hồ sơ.' }
      })).status,
      409
    );
    const user = (await pool.query('select status,last_login_at from users where user_id=$1', [userId])).rows[0];
    assert.equal(user.status, 'LOCKED');
    assert.equal(user.last_login_at, null);
  });

  test('E07: an independent admin resolves once, inverting or keeping the effect', async () => {
    const warnOwner = await mkUser('appeal_warn');
    const warn = await mkSanction(decider, {
      targetType: 'USER', targetId: warnOwner, ownerId: warnOwner, action: 'WARN'
    });
    await pool.query('insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3)', [
      warn.auditId,
      warnOwner,
      'Cảnh cáo này xuất phát từ báo cáo nhầm, đề nghị xem xét lại.'
    ]);
    const appealId = (
      await pool.query('select appeal_id from admin_appeals where audit_id=$1', [warn.auditId])
    ).rows[0].appeal_id as string;
    const readerToken = adminToken(warnOwner, 'READER');
    assert.equal(
      (await call('POST', `/admin/appeals/${appealId}/resolve`, {
        token: readerToken,
        body: { decision: 'ACCEPTED', reason: 'Người dùng thường không được xử lý khiếu nại.' }
      })).status,
      403,
      'a reader cannot resolve appeals'
    );
    assert.equal(
      (await call('POST', `/admin/appeals/${appealId}/resolve`, {
        token: adminToken(decider),
        body: { decision: 'ACCEPTED', reason: 'Người ra quyết định gốc không được tự xét.' }
      })).body.error.code,
      'SANCTION_SELF_REVERSE'
    );
    const resolved = await call('POST', `/admin/appeals/${appealId}/resolve`, {
      token: adminToken(indepUsers),
      body: { decision: 'ACCEPTED', reason: 'Báo cáo gốc không đủ căn cứ, thu hồi cảnh cáo.' }
    });
    assert.equal(resolved.status, 200);
    const appealRow = (await pool.query('select * from admin_appeals where appeal_id=$1', [appealId])).rows[0];
    assert.equal(appealRow.status, 'ACCEPTED');
    assert.equal(appealRow.reviewed_by, indepUsers);
    const sanctionRow = (await pool.query('select * from admin_sanctions where audit_id=$1', [warn.auditId])).rows[0];
    assert.equal(sanctionRow.active, false, 'accepting inverts the sanction');
    const appealAudit = (
      await pool.query('select action,target_type,target_id from admin_audit where target_type=$1', ['APPEAL'])
    ).rows;
    assert.equal(
      appealAudit.filter((r) => r.target_id === appealId && r.action === 'APPEAL_ACCEPTED').length,
      1,
      JSON.stringify(appealAudit)
    );
    const jobs = await pool.query(
      "select count(*)::int as n from admin_jobs where kind='NOTIFY' and payload->'payload'->>'appealId'=$1",
      [appealId]
    );
    assert.equal(jobs.rows[0].n, 1);

    // Exactly one outcome, including under concurrency.
    const warnOwner2 = await mkUser('appeal_warn2');
    const warn2 = await mkSanction(decider, {
      targetType: 'USER', targetId: warnOwner2, ownerId: warnOwner2, action: 'WARN'
    });
    const appealId2 = (
      await pool.query(
        'insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3) returning appeal_id',
        [warn2.auditId, warnOwner2, 'Vận hành kiểm tra hai lệnh xử lý song song trên cùng một hồ sơ.']
      )
    ).rows[0].appeal_id as string;
    const [first, second] = await Promise.all([
      call('POST', `/admin/appeals/${appealId2}/resolve`, {
        token: adminToken(indepUsers),
        body: { decision: 'REJECTED', reason: 'Quyết định giữ nguyên do bằng chứng rõ ràng.' }
      }),
      call('POST', `/admin/appeals/${appealId2}/resolve`, {
        token: adminToken(indepUsers2),
        body: { decision: 'REJECTED', reason: 'Giữ nguyên theo bằng chứng của báo cáo gốc.' }
      })
    ]);
    assert.ok([first.status, second.status].sort().join(',') === '200,409', `one outcome only: ${first.status}/${second.status}`);
    const kept = (await pool.query('select * from admin_sanctions where audit_id=$1', [warn2.auditId])).rows[0];
    assert.equal(kept.active, true, 'a rejection keeps the restriction');
    assert.equal(
      (await call('POST', `/admin/appeals/${appealId2}/resolve`, {
        token: adminToken(indepUsers),
        body: { decision: 'REJECTED', reason: 'Đã xử lý rồi.' }
      })).body.error.code,
      'APPEAL_RESOLVED'
    );

    // Accepting restores a real novel deletion together with the appeal outcome.
    const author = await mkUser('appeal_novel_author');
    const novelId = (
      await pool.query(
        `insert into novels (author_id,title,slug,synopsis,status,deleted_at)
         values($1,'Kiểm tra khôi phục','ktra-khoi-phuc','Tóm tắt', 'PUBLISHED', now()) returning novel_id`,
        [author]
      )
    ).rows[0].novel_id as string;
    const hide = await mkSanction(decider, {
      targetType: 'NOVEL', targetId: novelId, ownerId: author, action: 'HIDE', previous: { deletedAt: null, chapterIds: [] }
    });
    const novelAppeal = (
      await pool.query(
        'insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3) returning appeal_id',
        [hide.auditId, author, 'Truyện của tôi bị ẩn do báo cáo nhầm mục, xin khôi phục.']
      )
    ).rows[0].appeal_id as string;
    const novelResolved = await call('POST', `/admin/appeals/${novelAppeal}/resolve`, {
      token: adminToken(indepContent),
      body: { decision: 'ACCEPTED', reason: 'Nội dung không vi phạm, khôi phục xuất bản.' }
    });
    assert.equal(novelResolved.status, 200);
    const novelRow = (await pool.query('select deleted_at from novels where novel_id=$1', [novelId])).rows[0];
    assert.equal(novelRow.deleted_at, null, 'accepting a HIDE appeal restores the novel');
  });

  test('E07: a mid-transaction failure keeps the appeal open and leaves no audit or notice', async () => {
    const owner = await mkUser('appeal_broken');
    const broken = await mkSanction(decider, {
      targetType: 'DISCUSSION', targetId: randomUUID(), ownerId: owner, action: 'HIDE', previous: { status: 'VISIBLE' }
    });
    const appealId = (
      await pool.query(
        'insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3) returning appeal_id',
        [broken.auditId, owner, 'Chủ đề này không tồn tại nữa, dùng để kiểm tra lỗi giữa giao dịch.']
      )
    ).rows[0].appeal_id as string;
    const failed = await call('POST', `/admin/appeals/${appealId}/resolve`, {
      token: adminToken(indepContent),
      body: { decision: 'ACCEPTED', reason: 'Cố tình đảo một chế tài không thể khôi phục.' }
    });
    assert.notEqual(failed.status, 200);
    const appealRow = (await pool.query('select * from admin_appeals where appeal_id=$1', [appealId])).rows[0];
    assert.equal(appealRow.status, 'OPEN', 'a failed resolution keeps the appeal open');
    assert.equal(appealRow.reviewed_by, null);
    assert.equal(
      (await pool.query('select count(*)::int as n from admin_audit where target_id=$1', [appealId])).rows[0].n,
      0,
      'no audit may survive a rolled-back resolution'
    );
    assert.equal(
      (await pool.query(
        "select count(*)::int as n from admin_jobs where payload->'payload'->>'appealId'=$1",
        [appealId]
      )).rows[0].n,
      0
    );
    const sanctionRow = (await pool.query('select active,restored_at from admin_sanctions where audit_id=$1', [broken.auditId])).rows[0];
    assert.equal(sanctionRow.active, true);
    assert.equal(sanctionRow.restored_at, null);
  });

  test('E08: open appeals and the original decider block every restore alias', async () => {
    const locked = await mkUser('appeal_alias', { password: 'AppealPassword123!' });
    const lock = await lockAccount(decider, locked);
    const appealId = (
      await pool.query(
        'insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3) returning appeal_id',
        [lock.auditId, locked, 'Tôi không vi phạm quy định, đề nghị mở khóa qua khiếu nại.']
      )
    ).rows[0].appeal_id as string;

    const unlock = (token: string) =>
      call('PATCH', `/admin/users/${locked}/unlock`, { token, body: { reason: 'Mở khóa ngoài luồng khiếu nại.' } });
    assert.equal((await unlock(adminToken(indepUsers))).body.error.code, 'APPEAL_OPEN');
    assert.equal((await unlock(adminToken(decider))).status, 409);
    assert.equal(
      (await pool.query('select status from users where user_id=$1', [locked])).rows[0].status,
      'LOCKED'
    );

    // Self-reversal stays blocked for the original decider even once the appeal is closed.
    const closedAllowed = await call('POST', `/admin/appeals/${appealId}/resolve`, {
      token: adminToken(indepUsers),
      body: { decision: 'REJECTED', reason: 'Vi phạm rõ ràng, giữ nguyên lệnh khóa.' }
    });
    assert.equal(closedAllowed.status, 200);
    assert.equal((await unlock(adminToken(decider))).body.error.code, 'SANCTION_SELF_REVERSE');
    assert.equal((await unlock(adminToken(indepUsers))).status, 200);
    assert.equal(
      (await pool.query('select status from users where user_id=$1', [locked])).rows[0].status,
      'ACTIVE'
    );

    // A subject granted Admin after the decision still cannot judge their own appeal.
    const promoted = await mkUser('appeal_promoted', { password: 'AppealPassword123!' });
    const promotedSanction = await mkSanction(decider, {
      targetType: 'USER', targetId: promoted, ownerId: promoted, action: 'WARN'
    });
    const promotedAppeal = (
      await pool.query(
        'insert into admin_appeals(audit_id,user_id,message) values($1,$2,$3) returning appeal_id',
        [promotedSanction.auditId, promoted, 'Sau khi được cấp quyền Admin, tôi tự xử khiếu nại của mình.']
      )
    ).rows[0].appeal_id as string;
    await pool.query("update users set role='ADMIN',access_version=1 where user_id=$1", [promoted]);
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [promoted]);
    const selfResolve = await call('POST', `/admin/appeals/${promotedAppeal}/resolve`, {
      token: adminToken(promoted, 'ADMIN', 1),
      body: { decision: 'ACCEPTED', reason: 'Tự chấp nhận khiếu nại của chính mình.' }
    });
    assert.equal(selfResolve.body.error.code, 'APPEAL_SELF_SUBJECT');
    const stillOpen = (await pool.query('select status from admin_appeals where appeal_id=$1', [promotedAppeal])).rows[0];
    assert.equal(stillOpen.status, 'OPEN');
  });

  test('E06: the admin queue lists appeals for independent review', async () => {
    const list = await call('GET', '/admin/appeals?status=OPEN', { token: adminToken(indepUsers) });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data));
    assert.ok((list.body.data as any[]).length >= 1);
    assert.ok(list.body.meta);
    const forbidden = await mkUser('appeal_noscope', { role: 'ADMIN' });
    assert.equal(
      (await call('GET', '/admin/appeals?status=OPEN', { token: adminToken(forbidden) })).status,
      403,
      'an admin without content or users scope cannot read the queue'
    );
  });
});
