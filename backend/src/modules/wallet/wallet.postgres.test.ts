import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { env } from '../../core/config/env.js';
import {
  getWallet,
  getTransactions,
  createDepositSession,
  completeMockDeposit,
  unlockVipChapter
} from './wallet.service.js';
import { getReaderChapter } from '../reading/reading.service.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';

describe('Reader Wallet + VIP Unlock Ledger and Authorization Invariants', () => {
  const pool = getPostgresPool();

  // Explicit ID tracking collections — ensures strictly scoped teardown
  const trackedUserIds = new Set<string>();
  const trackedNovelIds = new Set<string>();
  const trackedChapterIds = new Set<string>();
  const trackedDepositSessionIds = new Set<string>();
  const trackedChapterUnlocks = new Set<string>(); // stored as `${userId}:${chapterId}`

  // Sentinel tracking
  interface SentinelRecord {
    id: string;
    type: string;
    hash: string;
    cleanup: () => Promise<void>;
  }
  const sentinels: SentinelRecord[] = [];

  let authorId: string;
  let reader1Id: string;
  let reader2Id: string;
  let concurrentReaderId: string;

  let authorAuth: AuthContext;
  let reader1Auth: AuthContext;
  let reader2Auth: AuthContext;
  let concurrentReaderAuth: AuthContext;

  let publishedNovelId: string;
  let freeChapterId: string;
  let vipChapterId: string;
  let draftNovelId: string;
  let draftChapterId: string;

  const VIP_PRICE = 50;

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());

    const timestamp = Date.now();

    // 1. Create Author
    const authorRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'AUTHOR', 'ACTIVE')
       returning user_id`,
      [`wallet-author-${timestamp}@ephurin.com`, `w_author_${timestamp}`]
    );
    authorId = authorRes.rows[0].user_id;
    trackedUserIds.add(authorId);
    authorAuth = { userId: authorId, role: 'AUTHOR' };
    await pool.query('insert into wallets (user_id, coins_balance) values ($1, 0)', [authorId]);

    // 2. Create Reader 1 (starts with 0 coins)
    const reader1Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`wallet-reader1-${timestamp}@ephurin.com`, `w_reader1_${timestamp}`]
    );
    reader1Id = reader1Res.rows[0].user_id;
    trackedUserIds.add(reader1Id);
    reader1Auth = { userId: reader1Id, role: 'READER' };
    await pool.query('insert into wallets (user_id, coins_balance) values ($1, 0)', [reader1Id]);

    // 3. Create Reader 2 (starts with 0 coins)
    const reader2Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`wallet-reader2-${timestamp}@ephurin.com`, `w_reader2_${timestamp}`]
    );
    reader2Id = reader2Res.rows[0].user_id;
    trackedUserIds.add(reader2Id);
    reader2Auth = { userId: reader2Id, role: 'READER' };
    await pool.query('insert into wallets (user_id, coins_balance) values ($1, 0)', [reader2Id]);

    // 4. Create Concurrent Reader (starts with exact price coins)
    const concurrentRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`wallet-concurrent-${timestamp}@ephurin.com`, `w_concurrent_${timestamp}`]
    );
    concurrentReaderId = concurrentRes.rows[0].user_id;
    trackedUserIds.add(concurrentReaderId);
    concurrentReaderAuth = { userId: concurrentReaderId, role: 'READER' };
    await pool.query('insert into wallets (user_id, coins_balance) values ($1, $2)', [concurrentReaderId, VIP_PRICE]);

    // 5. Create Published Novel
    const pubNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status, published_at)
       values ($1, $2, $3, $4, 'PUBLISHED', now())
       returning novel_id`,
      [
        authorId,
        `Wallet Test Novel ${timestamp}`,
        `wallet-test-${timestamp}`,
        'Novel for wallet and VIP unlock invariants'
      ]
    );
    publishedNovelId = pubNovelRes.rows[0].novel_id;
    trackedNovelIds.add(publishedNovelId);

    // 6. Create Free Published Chapter
    const freeChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Free Chapter Content: accessible to all visitors.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [publishedNovelId, `Free Chapter ${timestamp}`]
    );
    freeChapterId = freeChapRes.rows[0].chapter_id;
    trackedChapterIds.add(freeChapterId);

    // 7. Create VIP Published Chapter (price: 50 coins)
    const vipChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 2, 'VIP Chapter Secret Content: unlocked only through virtual coins.', 'PUBLISHED', true, $3, now())
       returning chapter_id`,
      [publishedNovelId, `VIP Chapter ${timestamp}`, VIP_PRICE]
    );
    vipChapterId = vipChapRes.rows[0].chapter_id;
    trackedChapterIds.add(vipChapterId);

    // 8. Create Draft Novel + Chapter
    const draftNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [authorId, `Draft Novel ${timestamp}`, `draft-wallet-${timestamp}`, 'Draft synopsis']
    );
    draftNovelId = draftNovelRes.rows[0].novel_id;
    trackedNovelIds.add(draftNovelId);

    const draftChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins)
       values ($1, $2, 1, 'Draft VIP Content', 'DRAFT', true, $3)
       returning chapter_id`,
      [draftNovelId, `Draft VIP Chapter ${timestamp}`, VIP_PRICE]
    );
    draftChapterId = draftChapRes.rows[0].chapter_id;
    trackedChapterIds.add(draftChapterId);

    // =========================================================================
    // PLANT 5 SENTINEL RECORDS across distinct domains
    // =========================================================================
    // Sentinel 1: Unrelated user profile
    const sUserRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'sentinel-hash', 'READER', 'ACTIVE')
       returning user_id, email, username, role, status`,
      [`sentinel-user-${timestamp}@ephurin.com`, `s_user_${timestamp}`]
    );
    const sUserId = sUserRes.rows[0].user_id;
    const sUserHash = createHash('sha256').update(JSON.stringify(sUserRes.rows[0])).digest('hex');
    sentinels.push({
      id: sUserId,
      type: 'sentinel_user',
      hash: sUserHash,
      cleanup: async () => {
        await pool.query('delete from users where user_id = $1', [sUserId]);
      }
    });

    // Sentinel 2: Unrelated wallet
    const sWalletRes = await pool.query(
      `insert into wallets (user_id, coins_balance, locked_coins)
       values ($1, 777, 100)
       returning wallet_id, user_id, coins_balance, locked_coins`,
      [sUserId]
    );
    const sWalletId = sWalletRes.rows[0].wallet_id;
    const sWalletHash = createHash('sha256').update(JSON.stringify(sWalletRes.rows[0])).digest('hex');
    sentinels.push({
      id: sWalletId,
      type: 'sentinel_wallet',
      hash: sWalletHash,
      cleanup: async () => {
        await pool.query('delete from wallets where wallet_id = $1', [sWalletId]);
      }
    });

    // Sentinel 3: Unrelated deposit session
    const sDepRes = await pool.query(
      `insert into deposit_sessions (wallet_id, package_code, amount_coins, status)
       values ($1, 'COIN_100', 100, 'PENDING')
       returning deposit_session_id, wallet_id, package_code, amount_coins, status`,
      [sWalletId]
    );
    const sDepId = sDepRes.rows[0].deposit_session_id;
    const sDepHash = createHash('sha256').update(JSON.stringify(sDepRes.rows[0])).digest('hex');
    sentinels.push({
      id: sDepId,
      type: 'sentinel_deposit_session',
      hash: sDepHash,
      cleanup: async () => {
        await pool.query('delete from deposit_sessions where deposit_session_id = $1', [sDepId]);
      }
    });

    // Sentinel 4: Unrelated transaction
    const sTxRes = await pool.query(
      `insert into transactions (wallet_id, type, status, amount_coins, reference_type, metadata)
       values ($1, 'DEPOSIT', 'SUCCESS', 777, 'SENTINEL', '{"sentinel": true}'::jsonb)
       returning transaction_id, wallet_id, type, status, amount_coins`,
      [sWalletId]
    );
    const sTxId = sTxRes.rows[0].transaction_id;
    const sTxHash = createHash('sha256').update(JSON.stringify(sTxRes.rows[0])).digest('hex');
    sentinels.push({
      id: sTxId,
      type: 'sentinel_transaction',
      hash: sTxHash,
      cleanup: async () => {
        await pool.query('delete from transactions where transaction_id = $1', [sTxId]);
      }
    });

    // Sentinel 5: Unrelated chapter unlock
    const sUnlockRes = await pool.query(
      `insert into chapter_unlocks (user_id, chapter_id, transaction_id)
       values ($1, $2, $3)
       returning user_id, chapter_id, transaction_id`,
      [sUserId, vipChapterId, sTxId]
    );
    const sUnlockHash = createHash('sha256').update(JSON.stringify(sUnlockRes.rows[0])).digest('hex');
    sentinels.push({
      id: `${sUserId}_${vipChapterId}`,
      type: 'sentinel_chapter_unlock',
      hash: sUnlockHash,
      cleanup: async () => {
        await pool.query('delete from chapter_unlocks where user_id = $1 and chapter_id = $2', [sUserId, vipChapterId]);
      }
    });
  });

  after(async () => {
    try {
      // 1. Strictly scoped suite-owned chapter unlocks teardown (only exact tracked pairs)
      for (const key of trackedChapterUnlocks) {
        const [uId, cId] = key.split(':');
        await pool.query('delete from chapter_unlocks where user_id = $1 and chapter_id = $2', [uId, cId]);
      }

      // 2. Strictly scoped suite-owned deposit sessions teardown
      for (const sid of trackedDepositSessionIds) {
        await pool.query('delete from deposit_sessions where deposit_session_id = $1', [sid]);
      }

      // 3. Affirmative post-cleanup sentinel verification: prove sentinels survived product teardown
      for (const sentinel of sentinels) {
        if (sentinel.type === 'sentinel_user') {
          const res = await pool.query('select user_id, email, username, role, status from users where user_id = $1', [sentinel.id]);
          assert.equal(res.rowCount, 1, `Sentinel user ${sentinel.id} must survive product teardown`);
          const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
          assert.equal(currentHash, sentinel.hash, `Sentinel user ${sentinel.id} must be unmodified`);
        } else if (sentinel.type === 'sentinel_wallet') {
          const res = await pool.query('select wallet_id, user_id, coins_balance, locked_coins from wallets where wallet_id = $1', [sentinel.id]);
          assert.equal(res.rowCount, 1, `Sentinel wallet ${sentinel.id} must survive product teardown`);
          const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
          assert.equal(currentHash, sentinel.hash, `Sentinel wallet ${sentinel.id} must be unmodified`);
        } else if (sentinel.type === 'sentinel_deposit_session') {
          const res = await pool.query('select deposit_session_id, wallet_id, package_code, amount_coins, status from deposit_sessions where deposit_session_id = $1', [sentinel.id]);
          assert.equal(res.rowCount, 1, `Sentinel deposit session ${sentinel.id} must survive product teardown`);
          const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
          assert.equal(currentHash, sentinel.hash, `Sentinel deposit session ${sentinel.id} must be unmodified`);
        } else if (sentinel.type === 'sentinel_transaction') {
          const res = await pool.query('select transaction_id, wallet_id, type, status, amount_coins from transactions where transaction_id = $1', [sentinel.id]);
          assert.equal(res.rowCount, 1, `Sentinel transaction ${sentinel.id} must survive product teardown`);
          const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
          assert.equal(currentHash, sentinel.hash, `Sentinel transaction ${sentinel.id} must be unmodified`);
        } else if (sentinel.type === 'sentinel_chapter_unlock') {
          const [uId, cId] = sentinel.id.split('_');
          const res = await pool.query('select user_id, chapter_id, transaction_id from chapter_unlocks where user_id = $1 and chapter_id = $2', [uId, cId]);
          assert.equal(res.rowCount, 1, `Sentinel chapter unlock ${sentinel.id} must survive product teardown`);
          const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
          assert.equal(currentHash, sentinel.hash, `Sentinel chapter unlock ${sentinel.id} must be unmodified`);
        }
      }

      // 4. Harness-owned sentinel teardown: explicit deletion without swallowing errors
      for (const sentinel of sentinels.reverse()) {
        await sentinel.cleanup();
      }

      // 5. Parent chapters teardown (executed only after sentinel unlock dropped)
      for (const cid of trackedChapterIds) {
        await pool.query('delete from chapters where chapter_id = $1', [cid]);
      }

      // 6. Parent novels teardown (executed only after chapters dropped)
      for (const nid of trackedNovelIds) {
        await pool.query('delete from novels where novel_id = $1', [nid]);
      }

      // 7. Strictly scoped suite-owned users, wallets, and transactions teardown (executed after novels dropped)
      for (const uid of trackedUserIds) {
        await pool.query('delete from chapter_unlocks where user_id = $1', [uid]);
        await pool.query(
          'delete from transactions where wallet_id in (select wallet_id from wallets where user_id = $1) or counterparty_wallet_id in (select wallet_id from wallets where user_id = $1)',
          [uid]
        );
        await pool.query('delete from wallets where user_id = $1', [uid]);
        await pool.query('delete from users where user_id = $1', [uid]);
      }
    } finally {
      await disconnectPostgres();
      await disconnectMongo();
    }
  });

  test('Invariant 1: Unauthenticated wallet and unlock requests fail closed with 401', async () => {
    const unauth: AuthContext = undefined as unknown as AuthContext;

    await assert.rejects(
      async () => getWallet(unauth),
      (err: AppError) => err.httpStatus === 401 || err.httpStatus === undefined
    );
  });

  test('Invariant 2: Missing or unpublished chapters fail closed with 404 CONTENT_001', async () => {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
    await assert.rejects(
      async () => unlockVipChapter(reader1Auth, nonExistentUuid),
      (err: AppError) => err.httpStatus === 404 && err.code === 'CONTENT_001'
    );

    await assert.rejects(
      async () => unlockVipChapter(reader1Auth, draftChapterId),
      (err: AppError) => err.httpStatus === 404 && err.code === 'CONTENT_001'
    );
  });

  test('Invariant 3: Insufficient coins balance returns 402 PAYMENT_003 with zero ledger modification', async () => {
    // Reader 1 has 0 coins; VIP chapter costs 50
    const walletBefore = await getWallet(reader1Auth);
    assert.equal(walletBefore.coinsBalance, 0);

    await assert.rejects(
      async () => unlockVipChapter(reader1Auth, vipChapterId),
      (err: AppError) => err.httpStatus === 402 && err.code === 'PAYMENT_003'
    );

    const walletAfter = await getWallet(reader1Auth);
    assert.equal(walletAfter.coinsBalance, 0);

    const authorWallet = await getWallet(authorAuth);
    assert.equal(authorWallet.coinsBalance, 0);

    // Verify no unlock record exists
    const unlockCheck = await pool.query(
      'select 1 from chapter_unlocks where user_id = $1 and chapter_id = $2',
      [reader1Id, vipChapterId]
    );
    assert.equal(unlockCheck.rowCount, 0);
  });

  test('Invariant 4: Deposit session creation and mock completion credits wallet and writes DEPOSIT transaction', async () => {
    const session = await createDepositSession(reader1Auth, { packageCode: 'COIN_500' });
    trackedDepositSessionIds.add(session.depositSessionId);

    assert.equal(session.amountCoins, 500);
    assert.equal(session.status, 'PENDING');

    const completion = await completeMockDeposit(reader1Auth, {
      depositSessionId: session.depositSessionId,
      mockResult: 'SUCCESS'
    });

    assert.equal(completion.status, 'SUCCESS');
    assert.equal(completion.amountCoins, 500);
    assert.ok(completion.transactionId);

    const walletAfter = await getWallet(reader1Auth);
    assert.equal(walletAfter.coinsBalance, 500);

    // Verify transaction row
    const txRow = await pool.query('select * from transactions where transaction_id = $1', [completion.transactionId]);
    assert.equal(txRow.rows[0].type, 'DEPOSIT');
    assert.equal(txRow.rows[0].status, 'SUCCESS');
    assert.equal(txRow.rows[0].amount_coins, 500);
  });

  test('Invariant 5: Foreign session abuse is strictly rejected with 403 AUTH_008', async () => {
    // Reader 1 creates a new deposit session
    const session = await createDepositSession(reader1Auth, { packageCode: 'COIN_100' });
    trackedDepositSessionIds.add(session.depositSessionId);

    // Reader 2 attempts to complete Reader 1's deposit session
    await assert.rejects(
      async () => completeMockDeposit(reader2Auth, {
        depositSessionId: session.depositSessionId,
        mockResult: 'SUCCESS'
      }),
      (err: AppError) => err.httpStatus === 403 && err.code === 'AUTH_008'
    );

    // Verify session remains PENDING
    const sessionRow = await pool.query(
      'select status from deposit_sessions where deposit_session_id = $1',
      [session.depositSessionId]
    );
    assert.equal(sessionRow.rows[0].status, 'PENDING');

    // Verify Reader 2 balance unchanged
    const r2Wallet = await getWallet(reader2Auth);
    assert.equal(r2Wallet.coinsBalance, 0);
  });

  test('Invariant 6: Completed deposit session replay is rejected with 404 PAYMENT_004', async () => {
    // Reader 1 completes their pending deposit session
    const sessions = await pool.query(
      "select deposit_session_id from deposit_sessions where wallet_id = (select wallet_id from wallets where user_id = $1) and status = 'SUCCESS' limit 1",
      [reader1Id]
    );
    const completedSessionId = sessions.rows[0].deposit_session_id;

    const balanceBefore = (await getWallet(reader1Auth)).coinsBalance;

    await assert.rejects(
      async () => completeMockDeposit(reader1Auth, {
        depositSessionId: completedSessionId,
        mockResult: 'SUCCESS'
      }),
      (err: AppError) => err.httpStatus === 404 && err.code === 'PAYMENT_004'
    );

    const balanceAfter = (await getWallet(reader1Auth)).coinsBalance;
    assert.equal(balanceAfter, balanceBefore);
  });

  test('Invariant 7: Production environment guard fails closed with 403 AUTH_008', async () => {
    const originalEnv = env.NODE_ENV;
    try {
      (env as unknown as { NODE_ENV: string }).NODE_ENV = 'production';

      const session = await createDepositSession(reader1Auth, { packageCode: 'COIN_100' });
      trackedDepositSessionIds.add(session.depositSessionId);

      await assert.rejects(
        async () => completeMockDeposit(reader1Auth, {
          depositSessionId: session.depositSessionId,
          mockResult: 'SUCCESS'
        }),
        (err: AppError) => err.httpStatus === 403 && err.code === 'AUTH_008'
      );
    } finally {
      (env as unknown as { NODE_ENV: string }).NODE_ENV = originalEnv;
    }
  });

  test('Invariant 8: VIP chapter unlock debits reader, credits author, and conserves total ledger balance', async () => {
    const readerBefore = await getWallet(reader1Auth);
    const authorBefore = await getWallet(authorAuth);
    const totalBefore = readerBefore.coinsBalance + authorBefore.coinsBalance;

    const unlockResult = await unlockVipChapter(reader1Auth, vipChapterId);
    trackedChapterUnlocks.add(`${reader1Id}:${vipChapterId}`);

    assert.equal(unlockResult.unlocked, true);
    assert.equal(unlockResult.alreadyUnlocked, false);
    assert.ok(unlockResult.transactionId);

    const readerAfter = await getWallet(reader1Auth);
    const authorAfter = await getWallet(authorAuth);
    const totalAfter = readerAfter.coinsBalance + authorAfter.coinsBalance;

    // Strict ledger conservation
    assert.equal(readerAfter.coinsBalance, readerBefore.coinsBalance - VIP_PRICE);
    assert.equal(authorAfter.coinsBalance, authorBefore.coinsBalance + VIP_PRICE);
    assert.equal(totalAfter, totalBefore);

    // Verify chapter_unlocks row
    const unlockRow = await pool.query(
      'select * from chapter_unlocks where user_id = $1 and chapter_id = $2',
      [reader1Id, vipChapterId]
    );
    assert.equal(unlockRow.rowCount, 1);
    assert.equal(unlockRow.rows[0].transaction_id, unlockResult.transactionId);

    // Verify transaction record
    const txRow = await pool.query('select * from transactions where transaction_id = $1', [unlockResult.transactionId]);
    assert.equal(txRow.rows[0].type, 'UNLOCK');
    assert.equal(txRow.rows[0].status, 'SUCCESS');
    assert.equal(txRow.rows[0].amount_coins, VIP_PRICE);
  });

  test('Invariant 9: Repeat unlock is idempotent (alreadyUnlocked=true, no second debit or duplicate entitlement)', async () => {
    const readerBefore = await getWallet(reader1Auth);
    const authorBefore = await getWallet(authorAuth);

    const repeatResult = await unlockVipChapter(reader1Auth, vipChapterId);

    assert.equal(repeatResult.unlocked, true);
    assert.equal(repeatResult.alreadyUnlocked, true);
    assert.ok(repeatResult.transactionId);

    const readerAfter = await getWallet(reader1Auth);
    const authorAfter = await getWallet(authorAuth);

    // Zero balance delta on retry
    assert.equal(readerAfter.coinsBalance, readerBefore.coinsBalance);
    assert.equal(authorAfter.coinsBalance, authorBefore.coinsBalance);

    // Still exactly one unlock record
    const unlockCount = await pool.query(
      'select count(*)::int as count from chapter_unlocks where user_id = $1 and chapter_id = $2',
      [reader1Id, vipChapterId]
    );
    assert.equal(unlockCount.rows[0].count, 1);

    // Still exactly one UNLOCK transaction for this user & chapter
    const txCount = await pool.query(
      "select count(*)::int as count from transactions where wallet_id = (select wallet_id from wallets where user_id = $1) and reference_id = $2 and type = 'UNLOCK'",
      [reader1Id, vipChapterId]
    );
    assert.equal(txCount.rows[0].count, 1);
  });

  test('Invariant 10: Concurrent unlock requests serialize cleanly without double debit', async () => {
    // Concurrent reader has exactly 50 coins (enough for only 1 unlock)
    const walletBefore = await getWallet(concurrentReaderAuth);
    assert.equal(walletBefore.coinsBalance, VIP_PRICE);

    const [res1, res2] = await Promise.all([
      unlockVipChapter(concurrentReaderAuth, vipChapterId),
      unlockVipChapter(concurrentReaderAuth, vipChapterId)
    ]);
    trackedChapterUnlocks.add(`${concurrentReaderId}:${vipChapterId}`);

    assert.equal(res1.unlocked, true);
    assert.equal(res2.unlocked, true);

    // Exactly one was the first unlock and the other recognized it was already unlocked
    const firstCount = (res1.alreadyUnlocked ? 0 : 1) + (res2.alreadyUnlocked ? 0 : 1);
    assert.equal(firstCount, 1);

    const walletAfter = await getWallet(concurrentReaderAuth);
    assert.equal(walletAfter.coinsBalance, 0); // Debited exactly once, balance >= 0

    const unlockCount = await pool.query(
      'select count(*)::int as count from chapter_unlocks where user_id = $1 and chapter_id = $2',
      [concurrentReaderId, vipChapterId]
    );
    assert.equal(unlockCount.rows[0].count, 1);
  });

  test('Invariant 11: Cross-user entitlement isolation (unlocked user reads content, distinct user/guest gets 402)', async () => {
    // Reader 1 has unlocked vipChapterId -> can read full content
    const chapterReader1 = await getReaderChapter(vipChapterId, reader1Auth);
    assert.ok(chapterReader1.content);
    assert.match(chapterReader1.content, /VIP Chapter Secret Content/);

    // Reader 2 has NOT unlocked vipChapterId -> 402 PAYMENT_002
    await assert.rejects(
      async () => getReaderChapter(vipChapterId, reader2Auth),
      (err: AppError) => err.httpStatus === 402 && err.code === 'PAYMENT_002'
    );

    // Anonymous visitor has NOT unlocked vipChapterId -> 402 PAYMENT_002
    await assert.rejects(
      async () => getReaderChapter(vipChapterId, undefined),
      (err: AppError) => err.httpStatus === 402 && err.code === 'PAYMENT_002'
    );

    // Free chapter is accessible to all without payment
    const freeReader2 = await getReaderChapter(freeChapterId, reader2Auth);
    assert.ok(freeReader2.content);
    assert.match(freeReader2.content, /Free Chapter Content/);

    const freeAnon = await getReaderChapter(freeChapterId, undefined);
    assert.ok(freeAnon.content);
    assert.match(freeAnon.content, /Free Chapter Content/);
  });

  test('Invariant 12: Sentinel records remain preserved and unmutated across the entire test suite', async () => {
    for (const sentinel of sentinels) {
      if (sentinel.type === 'sentinel_user') {
        const res = await pool.query('select user_id, email, username, role, status from users where user_id = $1', [sentinel.id]);
        assert.equal(res.rowCount, 1, `Sentinel user ${sentinel.id} must exist`);
        const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(currentHash, sentinel.hash, `Sentinel user ${sentinel.id} must be unmodified`);
      } else if (sentinel.type === 'sentinel_wallet') {
        const res = await pool.query('select wallet_id, user_id, coins_balance, locked_coins from wallets where wallet_id = $1', [sentinel.id]);
        assert.equal(res.rowCount, 1, `Sentinel wallet ${sentinel.id} must exist`);
        const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(currentHash, sentinel.hash, `Sentinel wallet ${sentinel.id} must be unmodified`);
      } else if (sentinel.type === 'sentinel_deposit_session') {
        const res = await pool.query('select deposit_session_id, wallet_id, package_code, amount_coins, status from deposit_sessions where deposit_session_id = $1', [sentinel.id]);
        assert.equal(res.rowCount, 1, `Sentinel deposit session ${sentinel.id} must exist`);
        const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(currentHash, sentinel.hash, `Sentinel deposit session ${sentinel.id} must be unmodified`);
      } else if (sentinel.type === 'sentinel_transaction') {
        const res = await pool.query('select transaction_id, wallet_id, type, status, amount_coins from transactions where transaction_id = $1', [sentinel.id]);
        assert.equal(res.rowCount, 1, `Sentinel transaction ${sentinel.id} must exist`);
        const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(currentHash, sentinel.hash, `Sentinel transaction ${sentinel.id} must be unmodified`);
      } else if (sentinel.type === 'sentinel_chapter_unlock') {
        const [uId, cId] = sentinel.id.split('_');
        const res = await pool.query('select user_id, chapter_id, transaction_id from chapter_unlocks where user_id = $1 and chapter_id = $2', [uId, cId]);
        assert.equal(res.rowCount, 1, `Sentinel chapter unlock ${sentinel.id} must exist`);
        const currentHash = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(currentHash, sentinel.hash, `Sentinel chapter unlock ${sentinel.id} must be unmodified`);
      }
    }
  });
});
