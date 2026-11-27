import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { signVnpayParams, toVnpayTxnRef, verifyVnpayCallback } from './vnpay.js';

// VNPay sandbox top-up, end to end through the HTTP API on an isolated database.
// VNPay itself is simulated: callbacks are signed with a fake secret configured for this test only.
describe('VNPay sandbox deposits', () => {
  const pool = getPostgresPool();
  const stamp = Date.now();
  const secret = 'TEST_ONLY_VNPAY_SECRET_NOT_REAL';
  const saved = {
    gateway: env.PAYMENT_GATEWAY,
    tmnCode: env.VNPAY_TMN_CODE,
    hashSecret: env.VNPAY_HASH_SECRET
  };
  let readerId: string;
  let strangerId: string;

  async function user(role: string, name: string) {
    const userId = (await pool.query(
      `insert into users (email, username, password_hash, role) values ($1, $2, 'hash', $3) returning user_id`,
      [`${name}-${stamp}@vnpay.test`, `${name}_${stamp}`, role]
    )).rows[0].user_id as string;
    await pool.query('insert into wallets (user_id) values ($1) on conflict (user_id) do nothing', [userId]);
    return userId;
  }

  async function balance(userId: string) {
    return (await pool.query('select coins_balance from wallets where user_id = $1', [userId])).rows[0].coins_balance as number;
  }

  async function session(depositSessionId: string) {
    return (await pool.query('select * from deposit_sessions where deposit_session_id = $1', [depositSessionId])).rows[0];
  }

  async function depositCount(depositSessionId: string) {
    return (await pool.query(
      `select count(*)::int as count from transactions where type = 'DEPOSIT' and reference_id = $1`,
      [depositSessionId]
    )).rows[0].count as number;
  }

  /** What VNPay would append to the Return URL / send to the IPN for this session. */
  function callback(depositSessionId: string, overrides: Record<string, string> = {}, signWith = secret) {
    const fields: Record<string, string> = {
      vnp_Amount: '5000000',
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: 'Nap 500 Xu StoryCraft',
      vnp_PayDate: '20261125101500',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'TESTCODE',
      vnp_TransactionNo: String(14_000_000 + Math.floor(Math.random() * 1_000_000)),
      vnp_TransactionStatus: '00',
      vnp_TxnRef: toVnpayTxnRef(depositSessionId),
      ...overrides
    };
    const query = new URLSearchParams({ ...fields, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: signVnpayParams(fields, signWith) });
    return query.toString();
  }

  async function withApi(run: (api: {
    createDeposit: (userId: string) => Promise<{ status: number; body: any }>;
    returnUrl: (userId: string, query: string) => Promise<{ status: number; body: any }>;
    ipn: (query: string) => Promise<{ status: number; body: any }>;
    mockWebhook: (depositSessionId: string) => Promise<number>;
  }) => Promise<void>) {
    const { createApp } = await import('../../app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/wallet`;
    const auth = (userId: string) => ({ Authorization: `Bearer ${jwt.sign({ sub: userId, role: 'READER' }, env.JWT_ACCESS_SECRET)}` });
    const json = async (response: Response) => ({ status: response.status, body: await response.json() });
    try {
      await run({
        createDeposit: (userId) => fetch(`${base}/deposit-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth(userId) },
          body: JSON.stringify({ packageCode: 'COIN_500' })
        }).then(json),
        returnUrl: (userId, query) => fetch(`${base}/vnpay/return?${query}`, { headers: auth(userId) }).then(json),
        ipn: (query) => fetch(`${base}/vnpay/ipn?${query}`).then(json),
        mockWebhook: (depositSessionId) => fetch(`${base}/mock-webhook/deposit-success`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ depositSessionId, mockResult: 'SUCCESS' })
        }).then((response) => response.status)
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  async function newSession(api: Parameters<Parameters<typeof withApi>[0]>[0], userId = readerId) {
    const created = await api.createDeposit(userId);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.data.depositSessionId as string;
  }

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    env.PAYMENT_GATEWAY = 'vnpay';
    env.VNPAY_TMN_CODE = 'TESTCODE';
    env.VNPAY_HASH_SECRET = secret;
    readerId = await user('READER', 'vnpay_reader');
    strangerId = await user('READER', 'vnpay_stranger');
  });

  after(async () => {
    env.PAYMENT_GATEWAY = saved.gateway;
    env.VNPAY_TMN_CODE = saved.tmnCode;
    env.VNPAY_HASH_SECRET = saved.hashSecret;
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('creating a deposit returns a signed sandbox URL priced by the server', async () => {
    await withApi(async (api) => {
      const created = await api.createDeposit(readerId);
      assert.equal(created.status, 201);
      const data = created.body.data;
      assert.equal(data.gateway, 'VNPAY');
      assert.equal(data.amountCoins, 500);
      assert.equal(data.amountVnd, 50_000);
      assert.equal(data.mockPaymentUrl, undefined);

      const url = new URL(data.paymentUrl);
      assert.equal(url.origin + url.pathname, env.VNPAY_PAYMENT_URL);
      const query = Object.fromEntries(url.searchParams);
      assert.equal(query.vnp_Amount, '5000000');
      assert.equal(query.vnp_BankCode, 'VNBANK');
      assert.equal(query.vnp_TxnRef, toVnpayTxnRef(data.depositSessionId));
      assert.equal(query.vnp_ReturnUrl, `${env.WEB_ORIGIN}/wallet/vnpay-return`);
      assert.equal(verifyVnpayCallback(query, secret).signatureValid, true);

      const row = await session(data.depositSessionId);
      assert.equal(row.gateway, 'VNPAY');
      assert.equal(row.amount_vnd, 50_000);
      assert.equal(row.status, 'PENDING');
      assert.ok(row.expires_at > row.created_at);
    });
  });

  test('Return then IPN: credited once, IPN answers 02, reloading the result page changes nothing', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const query = callback(id);

      const returned = await api.returnUrl(readerId, query);
      assert.equal(returned.status, 200, JSON.stringify(returned.body));
      assert.equal(returned.body.data.status, 'SUCCESS');
      assert.equal(returned.body.data.amountCoins, 500);
      assert.equal(await balance(readerId), before + 500);

      assert.deepEqual((await api.ipn(query)).body, { RspCode: '02', Message: 'Order already confirmed' });
      const reloaded = await api.returnUrl(readerId, query);
      assert.equal(reloaded.body.data.status, 'SUCCESS');
      assert.equal(await balance(readerId), before + 500);
      assert.equal(await depositCount(id), 1);

      const row = await session(id);
      assert.equal(row.status, 'SUCCESS');
      assert.equal(row.gateway_response_code, '00');
      assert.ok(row.gateway_txn_no);
    });
  });

  test('IPN then Return: credited once', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const query = callback(id);
      assert.deepEqual((await api.ipn(query)).body, { RspCode: '00', Message: 'Confirm Success' });
      assert.equal((await api.returnUrl(readerId, query)).body.data.status, 'SUCCESS');
      assert.equal(await balance(readerId), before + 500);
      assert.equal(await depositCount(id), 1);
    });
  });

  test('concurrent Return and IPN still credit once', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const query = callback(id);
      await Promise.all([api.ipn(query), api.returnUrl(readerId, query), api.ipn(query)]);
      assert.equal(await balance(readerId), before + 500);
      assert.equal(await depositCount(id), 1);
    });
  });

  test('a signed result for a different amount is refused and the session stays pending', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const query = callback(id, { vnp_Amount: '100000000' });
      assert.deepEqual((await api.ipn(query)).body, { RspCode: '04', Message: 'Invalid amount' });
      const returned = await api.returnUrl(readerId, query);
      assert.equal(returned.status, 400);
      assert.equal(returned.body.error.code, 'PAYMENT_008');
      assert.equal(await balance(readerId), before);
      assert.equal((await session(id)).status, 'PENDING');
    });
  });

  test('a forged or tampered signature changes nothing', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const forged = callback(id, {}, 'attacker-guess');
      assert.deepEqual((await api.ipn(forged)).body, { RspCode: '97', Message: 'Invalid signature' });
      const tampered = callback(id).replace('vnp_Amount=5000000', 'vnp_Amount=500000000');
      const returned = await api.returnUrl(readerId, tampered);
      assert.equal(returned.status, 400);
      assert.equal(returned.body.error.code, 'PAYMENT_007');
      assert.equal(await balance(readerId), before);
      assert.equal((await session(id)).status, 'PENDING');
    });
  });

  test('a cancelled payment fails the session without crediting', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      const query = callback(id, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02', vnp_TransactionNo: '0' });
      const returned = await api.returnUrl(readerId, query);
      assert.equal(returned.status, 200);
      assert.equal(returned.body.data.status, 'FAILED');
      assert.equal(returned.body.data.responseCode, '24');
      assert.equal(await balance(readerId), before);
      assert.equal(await depositCount(id), 0);
      // A later "success" for the same order cannot revive it.
      assert.deepEqual((await api.ipn(callback(id))).body, { RspCode: '02', Message: 'Order already confirmed' });
      assert.equal(await balance(readerId), before);
    });
  });

  test("another user relaying the Return URL cannot read it, and the owner's wallet is the one credited", async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const readerBefore = await balance(readerId);
      const strangerBefore = await balance(strangerId);
      const relayed = await api.returnUrl(strangerId, callback(id));
      assert.equal(relayed.status, 403);
      assert.equal(relayed.body.error.code, 'PAYMENT_006');
      assert.equal(await balance(readerId), readerBefore + 500);
      assert.equal(await balance(strangerId), strangerBefore);
    });
  });

  test('unknown orders answer 01', async () => {
    await withApi(async (api) => {
      assert.deepEqual((await api.ipn(callback(randomUUID()))).body, { RspCode: '01', Message: 'Order not found' });
      assert.deepEqual((await api.ipn(callback(randomUUID(), { vnp_TxnRef: 'not-ours' }))).body, { RspCode: '01', Message: 'Order not found' });
    });
  });

  test('the unauthenticated mock webhook is off under VNPay and can never settle a VNPay session', async () => {
    await withApi(async (api) => {
      const id = await newSession(api);
      const before = await balance(readerId);
      assert.equal(await api.mockWebhook(id), 404);

      env.PAYMENT_GATEWAY = 'mock';
      try {
        assert.equal(await api.mockWebhook(id), 404, 'mock settlement ignores sessions owned by VNPay');
      } finally {
        env.PAYMENT_GATEWAY = 'vnpay';
      }
      assert.equal(await balance(readerId), before);
      assert.equal((await session(id)).status, 'PENDING');
    });
  });
});
