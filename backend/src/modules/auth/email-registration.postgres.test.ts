import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import nodemailer from 'nodemailer';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { register, resendRegistrationEmail } from './auth.service.js';

type RegistrationResponse = {
  data: { registrationId: string; email: string; expiresAt: string; resendsRemaining: number; resendAfterSeconds: number; resendToken?: string; accessToken?: string; user?: { userId: string; role: string } };
  error: { code: string };
};

test('password registration offers a browser-bound link and a one-time backup code', async (t) => {
  const pool = getPostgresPool();
  t.after(async () => {
    await disconnectMongo();
    await disconnectPostgres();
  });
  await validateTestDatabaseIsolation(pool, getMongoDatabase());
  env.SMTP_URL = undefined;
  env.SMTP_HOST = 'smtp.gmail.com';
  env.SMTP_PORT = 587;
  env.SMTP_SECURE = false;
  env.SMTP_USER = 'smtp-fixture@gmail.com';
  env.SMTP_PASS = 'abcd efgh ijkl mnop';
  env.SMTP_FROM = 'no-reply@storycraft.test';
  const inbox = new Map<string, string>();
  let smtpUnavailable = false;
  let beforeSend: (() => Promise<void>) | undefined;
  t.mock.method(nodemailer, 'createTransport', (options: { host: string; port: number; secure: boolean; requireTLS: boolean; auth: { user: string; pass: string } }) => {
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.auth, { user: 'smtp-fixture@gmail.com', pass: 'abcdefghijklmnop' });
    return {
      sendMail: async ({ to, text }: { to: string; text: string }) => {
        if (smtpUnavailable) throw new Error('Fixture SMTP unavailable');
        await beforeSend?.();
        inbox.set(to, text);
        return { accepted: [to] };
      }
    };
  });

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${env.API_PREFIX}/auth`;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
    return { response, body: (response.status === 204 ? null : await response.json()) as RegistrationResponse };
  };
  const details = { username: 'verify_reader', email: 'verify-reader@gmail.com', password: 'StrongPassword123!' };
  assert.equal((await post('/register', { ...details, email: 'verify-reader@gmail.com.example.test' })).body.error.code, 'AUTH_EMAIL_DOMAIN');
  assert.equal(inbox.size, 0);
  const awaiting = await post('/register', details);
  assert.equal(awaiting.response.status, 202);
  const { registrationId, email } = awaiting.body.data;
  assert.equal(email, details.email);
  assert.equal(awaiting.body.data.resendAfterSeconds, 60);
  assert.equal(awaiting.body.data.accessToken, undefined);
  const pendingCookie = awaiting.response.headers.get('set-cookie');
  assert.match(pendingCookie ?? '', /_registration=.+HttpOnly/i);
  assert.ok(!pendingCookie?.startsWith(`${env.REFRESH_TOKEN_COOKIE_NAME}=`));
  const code = inbox.get(email)?.match(/Mã dự phòng là (\d{8})/)?.[1];
  assert.ok(code);
  const pending = (await pool.query('select password_hash, code_hash, link_token_hash from pending_email_registrations where registration_id=$1', [registrationId])).rows[0];
  assert.match(pending.password_hash, /^\$2/);
  assert.match(pending.code_hash, /^[a-f0-9]{64}$/);
  assert.match(pending.link_token_hash, /^[a-f0-9]{64}$/);
  assert.equal((await pool.query('select user_id from users where email=$1', [email])).rowCount, 0);
  assert.equal((await post('/login', { identifier: email, password: details.password })).response.status, 401);
  assert.equal((await post('/register', details)).body.error.code, 'AUTH_EMAIL_RATE_LIMIT');

  const wrongCode = code === '00000000' ? '00000001' : '00000000';
  assert.equal((await post('/register/verify', { registrationId, code: wrongCode })).body.error.code, 'AUTH_EMAIL_CODE');
  assert.equal((await pool.query('select attempts from pending_email_registrations where registration_id=$1', [registrationId])).rows[0].attempts, 1);
  // A code sent before the link migration can still be used.
  await pool.query('update pending_email_registrations set link_token_hash=null where registration_id=$1', [registrationId]);
  const responses = await Promise.all([
    post('/register/verify', { registrationId, code }), post('/register/verify', { registrationId, code })
  ]);
  assert.deepEqual(responses.map(({ response }) => response.status).sort(), [201, 400]);
  const confirmed = responses.find(({ response }) => response.status === 201)!;
  assert.equal(confirmed.body.data.user?.role, 'READER');
  assert.ok(confirmed.body.data.accessToken);
  assert.match(confirmed.response.headers.get('set-cookie') ?? '', /HttpOnly/i);
  assert.equal((await post('/login', { identifier: email, password: details.password })).response.status, 200);
  assert.equal((await post('/register', details)).body.error.code, 'USER_005');

  const linkDetails = { ...details, username: 'verify_link', email: 'verify-link@gmail.com' };
  const linkPending = await post('/register', linkDetails);
  assert.equal(linkPending.response.status, 202);
  const linkCookie = linkPending.response.headers.get('set-cookie')?.split(';')[0];
  const linkMail = inbox.get(linkDetails.email);
  const link = linkMail?.match(/https?:\/\/\S+\/verify-email#token=[A-Za-z0-9_-]{43}/)?.[0];
  const backupCode = linkMail?.match(/Mã dự phòng là (\d{8})/)?.[1];
  assert.ok(linkCookie && link && backupCode);
  const linkUrl = new URL(link);
  const token = new URLSearchParams(linkUrl.hash.slice(1)).get('token');
  const headers = { Origin: linkUrl.origin, Cookie: linkCookie };
  assert.equal((await post('/register/pending', {}, headers)).body.data.registrationId, linkPending.body.data.registrationId);
  assert.equal((await post('/register/pending', {}, { Origin: linkUrl.origin })).body.data, null);
  await pool.query("update pending_email_registrations set requested_at=now() - interval '2 minutes' where registration_id=$1", [linkPending.body.data.registrationId]);
  // A different browser has no cookie or access to the pending link, even after the delivery cooldown.
  const duplicate = await post('/register', { ...linkDetails, username: 'other_browser', password: 'AnotherPassword456!' });
  assert.equal(duplicate.body.error.code, 'AUTH_EMAIL_RATE_LIMIT');
  assert.equal(duplicate.response.headers.get('set-cookie'), null);
  assert.equal(inbox.get(linkDetails.email), linkMail);
  assert.equal((await post('/register/verify-link', { token }, { Origin: linkUrl.origin })).body.error.code, 'AUTH_EMAIL_BROWSER');
  assert.equal((await post('/register/verify-link', { token }, { ...headers, Origin: 'http://localhost:9999' })).body.error.code, 'AUTH_EMAIL_BROWSER');
  assert.equal((await post('/register/verify-link', { token: 'Z'.repeat(43) }, headers)).body.error.code, 'AUTH_EMAIL_LINK');
  assert.equal((await pool.query('select user_id from users where email=$1', [linkDetails.email])).rowCount, 0);
  const linked = await post('/register/verify-link', { token }, headers);
  assert.equal(linked.response.status, 201);
  assert.equal(linked.body.data.user?.role, 'READER');
  assert.equal((await post('/login', { identifier: linkDetails.email, password: linkDetails.password })).response.status, 200);
  assert.equal((await post('/register/verify-link', { token }, headers)).body.error.code, 'AUTH_EMAIL_LINK');
  assert.equal((await post('/register/verify', { registrationId: linkPending.body.data.registrationId, code: backupCode })).body.error.code, 'AUTH_EMAIL_CODE');

  const retryDetails = { ...details, username: 'verify_retry', email: 'verify-retry@gmail.com' };
  smtpUnavailable = true;
  assert.equal((await post('/register', retryDetails)).response.status, 503);
  assert.equal((await pool.query('select registration_id from pending_email_registrations where email=$1', [retryDetails.email])).rowCount, 0);
  smtpUnavailable = false;
  const retry = await post('/register', retryDetails);
  assert.equal(retry.response.status, 202);
  const resendId = retry.body.data.registrationId;
  const resendBody = { registrationId: resendId };
  const oldMail = inbox.get(retryDetails.email);
  const oldCode = oldMail?.match(/Mã dự phòng là (\d{8})/)?.[1];
  const oldToken = oldMail?.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(oldCode && oldToken);
  const resendHeaders = { Origin: linkUrl.origin, Cookie: retry.response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  assert.equal((await post('/register/resend', resendBody, { Origin: linkUrl.origin })).response.status, 403);
  assert.equal((await post('/register/resend', resendBody, { ...resendHeaders, Origin: 'http://localhost:9999' })).response.status, 403);
  assert.equal((await post('/register/resend', resendBody, resendHeaders)).body.error.code, 'AUTH_EMAIL_RATE_LIMIT');

  await pool.query("update pending_email_registrations set requested_at=now() - interval '2 minutes' where registration_id=$1", [resendId]);
  const previousProofs = await pool.query('select code_hash, link_token_hash from pending_email_registrations where registration_id=$1', [resendId]);
  smtpUnavailable = true;
  assert.equal((await post('/register/resend', resendBody, resendHeaders)).response.status, 503);
  assert.deepEqual((await pool.query('select code_hash, link_token_hash from pending_email_registrations where registration_id=$1', [resendId])).rows, previousProofs.rows);
  smtpUnavailable = false;

  await pool.query("update pending_email_registrations set requested_at=now() - interval '16 minutes', expires_at=now() where registration_id=$1", [resendId]);
  assert.equal((await post('/register/verify', { registrationId: resendId, code: oldCode })).body.error.code, 'AUTH_EMAIL_CODE');
  const resendResults = await Promise.all([
    post('/register/resend', resendBody, resendHeaders), post('/register/resend', resendBody, resendHeaders)
  ]);
  assert.deepEqual(resendResults.map(({ response }) => response.status).sort(), [202, 429]);
  assert.equal(resendResults.find(({ response }) => response.status === 202)?.body.data.registrationId, resendId);
  const newMail = inbox.get(retryDetails.email);
  const newCode = newMail?.match(/Mã dự phòng là (\d{8})/)?.[1];
  assert.ok(newCode && newCode !== oldCode);
  assert.equal((await post('/register/verify-link', { token: oldToken }, resendHeaders)).body.error.code, 'AUTH_EMAIL_LINK');
  assert.equal((await post('/register/verify', { registrationId: resendId, code: oldCode })).body.error.code, 'AUTH_EMAIL_CODE');
  assert.equal((await post('/register/verify', { registrationId: resendId, code: newCode })).response.status, 201);
  assert.equal((await post('/register/resend', resendBody, resendHeaders)).body.error.code, 'AUTH_EMAIL_REGISTRATION_EXPIRED');

  await t.test('native signup recovers an expired code with its original app ticket', async () => {
    const nativeDetails = { ...details, email: 'verify-native@gmail.com', username: 'verify_native' };
    const signup = await post('/register/native', nativeDetails);
    assert.equal(signup.response.status, 202);
    assert.equal(signup.response.headers.get('set-cookie'), null);
    const { registrationId, resendToken } = signup.body.data;
    assert.ok(resendToken);
    const originalMail = inbox.get(nativeDetails.email);
    const originalCode = originalMail?.match(/Mã xác nhận là (\d{8})/)?.[1];
    assert.ok(originalCode);
    assert.match(originalMail ?? '', /ứng dụng StoryCraft/);
    assert.doesNotMatch(originalMail ?? '', /#token=/);
    assert.match(originalMail ?? '', /#recovery=/);
    const context = { registrationId, resendToken };
    const restored = await post('/register/native/pending', context);
    assert.equal(restored.body.data.registrationId, registrationId);
    assert.equal(restored.body.data.expiresAt, signup.body.data.expiresAt);
    assert.equal(restored.body.data.resendToken, undefined);
    assert.equal((await post('/register/native/cancel', { registrationId, resendToken: 'invalid-ticket' })).response.status, 403);

    await pool.query("update pending_email_registrations set requested_at=now() - interval '16 minutes', expires_at=now(), attempts=5 where registration_id=$1", [registrationId]);
    assert.equal((await post('/register/verify', { registrationId, code: originalCode })).body.error.code, 'AUTH_EMAIL_CODE');
    const path = '/register/native/resend';
    assert.equal((await post(path, { registrationId, resendToken: 'invalid-ticket' })).response.status, 403);
    const request = { registrationId, resendToken };
    smtpUnavailable = true;
    assert.equal((await post(path, request)).response.status, 503);
    assert.equal(inbox.get(nativeDetails.email), originalMail);
    smtpUnavailable = false;
    const renewed = await post(path, request);
    assert.equal(renewed.response.status, 202);
    assert.equal(renewed.body.data.registrationId, registrationId);
    assert.ok(renewed.body.data.resendToken);
    const newCode = inbox.get(nativeDetails.email)?.match(/Mã xác nhận là (\d{8})/)?.[1];
    assert.ok(newCode && newCode !== originalCode);
    assert.equal((await post('/register/verify', { registrationId, code: originalCode })).body.error.code, 'AUTH_EMAIL_CODE');
    assert.equal((await post('/register/verify', { registrationId, code: newCode })).response.status, 201);
    assert.equal((await post('/login', { identifier: nativeDetails.email, password: nativeDetails.password })).response.status, 200);
  });

  await t.test('signup deadlines and delivery budgets cannot block mailbox-owner recovery', async () => {
    const held = { email: 'verify-held@gmail.com', username: 'verify_held', password: 'InitialPassword123!' };
    const signup = await post('/register', held);
    assert.equal(signup.response.status, 202);
    const { registrationId, expiresAt } = signup.body.data;
    const firstRecovery = inbox.get(held.email)?.match(/#recovery=([A-Za-z0-9_.-]+)/)?.[1];
    assert.ok(firstRecovery);
    await pool.query("update pending_email_registrations set deadline_at = now() + interval '3 minutes' where registration_id = $1", [registrationId]);
    const deadline = (await pool.query('select deadline_at from pending_email_registrations where registration_id = $1', [registrationId])).rows[0].deadline_at as Date;
    assert.ok(deadline.getTime() < Date.parse(expiresAt));
    for (const remaining of [2, 1, 0]) {
      await pool.query("update pending_email_registrations set requested_at = now() - interval '2 minutes' where registration_id = $1", [registrationId]);
      const renewed = await resendRegistrationEmail(registrationId);
      assert.equal(renewed.expiresAt, deadline.toISOString());
      assert.equal(renewed.resendsRemaining, remaining);
      const row = (await pool.query('select expires_at <= deadline_at as bounded from pending_email_registrations where registration_id = $1', [registrationId])).rows[0];
      assert.equal(row.bounded, true);
    }
    await pool.query("update pending_email_registrations set requested_at = now() - interval '2 minutes' where registration_id = $1", [registrationId]);
    await assert.rejects(resendRegistrationEmail(registrationId), { code: 'AUTH_EMAIL_RESEND_LIMIT' });
    await pool.query("update pending_email_registrations set deadline_at = now() - interval '1 second' where registration_id = $1", [registrationId]);
    await assert.rejects(resendRegistrationEmail(registrationId), { code: 'AUTH_EMAIL_REGISTRATION_EXPIRED' });

    const replacement = await post('/register', held);
    assert.equal(replacement.response.status, 202);
    const activeId = replacement.body.data.registrationId;
    const cancelHeaders = { Origin: linkUrl.origin, Cookie: replacement.response.headers.get('set-cookie')?.split(';')[0] ?? '' };
    assert.equal((await post('/register/cancel', { registrationId: activeId }, { Origin: linkUrl.origin })).response.status, 403);
    assert.equal((await post('/register/cancel', { registrationId: activeId }, cancelHeaders)).response.status, 204);
    assert.equal((await post('/register', held)).body.error.code, 'AUTH_EMAIL_DELIVERY_LIMIT');

    const owned = { token: firstRecovery, username: 'email_owner', password: 'MailboxOwner123!' };
    assert.equal((await post('/register/recover', { ...owned, token: 'invalid' }, { Origin: linkUrl.origin })).body.error.code, 'AUTH_EMAIL_RECOVERY');
    const recovered = await post('/register/recover', owned, { Origin: linkUrl.origin });
    assert.equal(recovered.response.status, 201);
    assert.equal((await post('/login', { identifier: held.email, password: held.password })).response.status, 401);
    assert.equal((await post('/login', { identifier: held.email, password: owned.password })).response.status, 200);
    assert.equal((await post('/register/recover', owned, { Origin: linkUrl.origin })).body.error.code, 'USER_005');
  });

  await t.test('Gmail dot and plus aliases share the signup and resend budget', async () => {
    const variants = ['quotafixture', 'quota.fixture+tag', 'q.uota.fixture', 'quotafixture+other'];
    const registrations = [];
    for (const [index, alias] of variants.entries()) {
      const email = `${alias}@gmail.com`;
      const result = await post('/register', { ...details, email, username: `mailbox_budget_${index}` });
      assert.equal(result.response.status, 202);
      assert.equal(result.body.data.email, email);
      assert.ok(inbox.has(email), 'The recipient remains the submitted alias');
      registrations.push(result.body.data.registrationId);
    }
    const [first, second] = registrations;
    await pool.query("update pending_email_registrations set requested_at = now() - interval '2 minutes' where registration_id = any($1::uuid[])", [[first, second]]);
    await resendRegistrationEmail(first);
    await assert.rejects(resendRegistrationEmail(second), { code: 'AUTH_EMAIL_DELIVERY_LIMIT' });

    const overLimit = 'Qu.o.ta.fixture+overflow@gmail.com';
    const blocked = await post('/register', { ...details, email: overLimit, username: 'mailbox_over_limit' });
    assert.equal(blocked.body.error.code, 'AUTH_EMAIL_DELIVERY_LIMIT');
    assert.ok(!inbox.has(overLimit.toLowerCase()));
    assert.equal((await pool.query('select sent_count from registration_email_delivery_budget where mailbox_key = $1',
      ['quotafixture@gmail.com'])).rows[0].sent_count, 5);
    assert.equal((await post('/register', {
      ...details, email: 'differentfixture@gmail.com', username: 'mailbox_distinct'
    })).response.status, 202);
  });

  await t.test('slow SMTP leaves shared database capacity for ordinary API requests', async () => {
    const smtp = new EventEmitter();
    let sends = 0;
    let release!: () => void;
    const blockedSmtp = new Promise<void>(resolve => { release = resolve; });
    beforeSend = () => {
      if (++sends === 2) smtp.emit('both-sending');
      return blockedSmtp;
    };

    const started = once(smtp, 'both-sending', { signal: AbortSignal.timeout(5_000) });
    const inFlight = [
      post('/register', { ...details, email: 'heldmailone@gmail.com', username: 'held_mail_one' }),
      post('/register/native', { ...details, email: 'heldmailtwo@gmail.com', username: 'held_mail_two' })
    ];
    let queued: Promise<unknown>[] = [];
    try {
      await started;
      const timeout = new AbortController();
      // Offer more deliveries than the whole pg pool could serve while SMTP is stalled.
      queued = Array.from({ length: 12 }, (_, index) => assert.rejects(register({
        ...details, email: `heldoverflow${index}@gmail.com`, username: `held_overflow_${index}`
      }), { code: 'AUTH_EMAIL_BUSY' }));
      try {
        await Promise.race([
          Promise.all(queued),
          delay(5_000, undefined, { signal: timeout.signal }).then(() => assert.fail('Over-capacity requests did not return promptly'))
        ]);
      } finally {
        timeout.abort();
      }
      const overCapacity = await post('/register', { ...details, email: 'heldmailmore@gmail.com', username: 'held_mail_more' });
      assert.equal(overCapacity.response.status, 503);
      assert.equal(overCapacity.body.error.code, 'AUTH_EMAIL_BUSY');
      await assert.rejects(resendRegistrationEmail(retry.body.data.registrationId), { code: 'AUTH_EMAIL_BUSY' });
      assert.equal(sends, 2);
      assert.equal(pool.waitingCount, 0);
      const account = await fetch(`${base}/me`, {
        headers: { Authorization: `Bearer ${confirmed.body.data.accessToken}` },
        signal: AbortSignal.timeout(3_000)
      });
      assert.equal(account.status, 200);
      assert.equal((await account.json() as { data: { userId: string } }).data.userId, confirmed.body.data.user?.userId);
    } finally {
      release();
      await Promise.allSettled([...inFlight, ...queued]);
      beforeSend = undefined;
    }
    assert.deepEqual((await Promise.all(inFlight)).map(result => result.response.status), [202, 202]);
    assert.equal((await post('/register', {
      ...details, email: 'heldmailretry@gmail.com', username: 'held_mail_retry'
    })).response.status, 202);
  });
});
