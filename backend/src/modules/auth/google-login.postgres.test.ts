import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { register } from './auth.service.js';
import type { PublicAuthUser } from './auth.types.js';

type TestResponse = {
  data: { clientId: string; nonce: string; user: PublicAuthUser; accessToken: string };
  error: { code: string };
};

test('Google sign-in validates the web challenge and links only with the existing password', async (t) => {
  const pool = getPostgresPool();
  t.after(async () => {
    await disconnectMongo();
    await disconnectPostgres();
  });
  await validateTestDatabaseIsolation(pool, getMongoDatabase());

  const clientId = 'storycraft-test.apps.googleusercontent.com';
  env.GOOGLE_OAUTH_CLIENT_ID = clientId;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({
    certs: { fixture: publicKey.export({ format: 'pem', type: 'spki' }) },
    format: 'PEM'
  }));
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const origin = new URL(env.WEB_ORIGIN).origin;
  const authUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${env.API_PREFIX}/auth`;
  const post = async (endpoint: string, body: unknown, cookie?: string, requestOrigin = origin) => {
    const response = await fetch(`${authUrl}${endpoint}`, {
      method: 'POST',
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: JSON.stringify(body)
    });
    return { response, body: await response.json() as TestResponse };
  };
  const challenge = async () => {
    const result = await post('/google/challenge', {});
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.clientId, clientId);
    const setCookie = result.response.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.ok(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict'));
    return { nonce: result.body.data.nonce, cookie: setCookie.split(';')[0] };
  };
  const credential = (nonce: string, subject: string, email: string, audience = clientId, emailVerified = true) =>
    jwt.sign({ nonce, email, email_verified: emailVerified, name: 'Độc giả Google' }, privateKey, {
      subject, audience, issuer: 'https://accounts.google.com', expiresIn: 300, keyid: 'fixture', algorithm: 'RS256'
    });

  assert.equal((await post('/google/challenge', {}, undefined, 'http://localhost:9999')).response.status, 403);
  const first = await challenge();
  const email = `google-${Date.now()}@example.test`;
  const firstToken = credential(first.nonce, 'google-new-user', email);
  assert.equal((await post('/google', { credential: firstToken })).body.error.code, 'AUTH_GOOGLE_CHALLENGE');
  assert.equal((await post('/google', { credential: credential('wrong', 'google-new-user', email) }, first.cookie)).body.error.code, 'AUTH_GOOGLE_CHALLENGE');
  assert.equal((await post('/google', { credential: credential(first.nonce, 'google-new-user', email, 'wrong-audience') }, first.cookie)).body.error.code, 'AUTH_GOOGLE_CREDENTIAL');
  assert.equal((await post('/google', { credential: credential(first.nonce, 'google-new-user', email, clientId, false) }, first.cookie)).body.error.code, 'AUTH_GOOGLE_EMAIL');

  const concurrent = await challenge();
  const [created, retried] = await Promise.all([
    post('/google', { credential: firstToken }, first.cookie),
    post('/google', { credential: credential(concurrent.nonce, 'google-new-user', email) }, concurrent.cookie)
  ]);
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.data.user.userId, created.body.data.user.userId);
  assert.equal((await post('/google', { credential: firstToken }, first.cookie)).body.error.code, 'AUTH_GOOGLE_CHALLENGE');
  const userId = created.body.data.user.userId;
  assert.equal(created.body.data.user.role, 'READER');
  assert.equal(created.body.data.user.displayName, 'Độc giả Google');
  assert.ok(created.body.data.accessToken);
  assert.ok(created.response.headers.getSetCookie().some((value) => value.startsWith(`${env.REFRESH_TOKEN_COOKIE_NAME}=`)));
  const stored = await pool.query('select u.password_hash, w.user_id from users u join wallets w using(user_id) where u.oauth_subject=$1', ['google-new-user']);
  assert.deepEqual(stored.rows, [{ password_hash: null, user_id: userId }]);

  const returning = await challenge();
  const changedEmailToken = credential(returning.nonce, 'google-new-user', 'changed-google-email@example.test');
  assert.equal((await post('/google', { credential: changedEmailToken }, returning.cookie)).body.data.user.userId, userId);
  await pool.query("update users set status='LOCKED' where user_id=$1", [userId]);
  const locked = await challenge();
  assert.equal((await post('/google', { credential: credential(locked.nonce, 'google-new-user', email) }, locked.cookie)).response.status, 403);

  const existing = await register({ email: 'password-google@example.test', username: 'google_existing_account', password: 'StrongPassword123!' });
  const link = await challenge();
  const linkToken = credential(link.nonce, 'google-existing-user', existing.user.email);
  assert.equal((await post('/google', { credential: linkToken }, link.cookie)).body.error.code, 'AUTH_GOOGLE_LINK_REQUIRED');
  assert.equal((await post('/google', { credential: linkToken, password: 'incorrect' }, link.cookie)).body.error.code, 'AUTH_GOOGLE_LINK_PASSWORD');
  const linked = await post('/google', { credential: linkToken, password: 'StrongPassword123!' }, link.cookie);
  assert.equal(linked.response.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.data.user.userId, existing.user.userId);
  const linkedAgain = await challenge();
  assert.equal((await post('/google', { credential: credential(linkedAgain.nonce, 'google-existing-user', existing.user.email) }, linkedAgain.cookie)).body.data.user.userId, existing.user.userId);
  assert.equal((await post('/login', { identifier: existing.user.username, password: 'StrongPassword123!' })).body.data.user.userId, existing.user.userId);
});
