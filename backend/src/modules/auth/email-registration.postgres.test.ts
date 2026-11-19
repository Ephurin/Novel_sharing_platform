import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import nodemailer from 'nodemailer';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';

type RegistrationResponse = {
  data: { registrationId: string; email: string; resendAfterSeconds: number; resendToken?: string; accessToken?: string; user?: { userId: string; role: string } };
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
  t.mock.method(nodemailer, 'createTransport', (options: { host: string; port: number; secure: boolean; requireTLS: boolean; auth: { user: string; pass: string } }) => {
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.auth, { user: 'smtp-fixture@gmail.com', pass: 'abcdefghijklmnop' });
    return {
      sendMail: async ({ to, text }: { to: string; text: string }) => {
        if (smtpUnavailable) throw new Error('Fixture SMTP unavailable');
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
    return { response, body: await response.json() as RegistrationResponse };
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
    assert.doesNotMatch(originalMail ?? '', /verify-email/);

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
});
