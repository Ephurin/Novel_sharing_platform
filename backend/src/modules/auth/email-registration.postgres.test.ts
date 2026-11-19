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
  data: { registrationId: string; email: string; accessToken?: string; user?: { userId: string; role: string } };
  error: { code: string };
};

test('password registration sends a code and creates only one account after verification', async (t) => {
  const pool = getPostgresPool();
  t.after(async () => {
    await disconnectMongo();
    await disconnectPostgres();
  });
  await validateTestDatabaseIsolation(pool, getMongoDatabase());
  env.SMTP_URL = 'smtp://localhost:1026';
  env.SMTP_FROM = 'no-reply@storycraft.test';
  const inbox = new Map<string, string>();
  let smtpUnavailable = false;
  t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async ({ to, text }: { to: string; text: string }) => {
      if (smtpUnavailable) throw new Error('Fixture SMTP unavailable');
      inbox.set(to, text);
      return { accepted: [to] };
    }
  }));

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${env.API_PREFIX}/auth`;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { response, body: await response.json() as RegistrationResponse };
  };
  const details = { username: 'verify_reader', email: 'verify-reader@example.test', password: 'StrongPassword123!' };
  const awaiting = await post('/register', details);
  assert.equal(awaiting.response.status, 202);
  const { registrationId, email } = awaiting.body.data;
  assert.equal(email, details.email);
  assert.equal(awaiting.body.data.accessToken, undefined);
  assert.equal(awaiting.response.headers.get('set-cookie'), null);
  const code = inbox.get(email)?.match(/\b\d{8}\b/)?.[0];
  assert.ok(code);
  const pending = (await pool.query('select password_hash, code_hash from pending_email_registrations where registration_id=$1', [registrationId])).rows[0];
  assert.match(pending.password_hash, /^\$2/);
  assert.match(pending.code_hash, /^[a-f0-9]{64}$/);
  assert.equal((await pool.query('select user_id from users where email=$1', [email])).rowCount, 0);
  assert.equal((await post('/login', { identifier: email, password: details.password })).response.status, 401);
  assert.equal((await post('/register', details)).body.error.code, 'AUTH_EMAIL_RATE_LIMIT');

  const wrongCode = code === '00000000' ? '00000001' : '00000000';
  assert.equal((await post('/register/verify', { registrationId, code: wrongCode })).body.error.code, 'AUTH_EMAIL_CODE');
  assert.equal((await pool.query('select attempts from pending_email_registrations where registration_id=$1', [registrationId])).rows[0].attempts, 1);
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

  const retryDetails = { ...details, username: 'verify_retry', email: 'verify-retry@example.test' };
  smtpUnavailable = true;
  assert.equal((await post('/register', retryDetails)).response.status, 503);
  assert.equal((await pool.query('select registration_id from pending_email_registrations where email=$1', [retryDetails.email])).rowCount, 0);
  smtpUnavailable = false;
  const retry = await post('/register', retryDetails);
  assert.equal(retry.response.status, 202);
  await pool.query('update pending_email_registrations set expires_at=now() where registration_id=$1', [retry.body.data.registrationId]);
  const expired = inbox.get(retryDetails.email)?.match(/\b\d{8}\b/)?.[0];
  assert.ok(expired);
  assert.equal((await post('/register/verify', { registrationId: retry.body.data.registrationId, code: expired })).body.error.code, 'AUTH_EMAIL_CODE');
});
