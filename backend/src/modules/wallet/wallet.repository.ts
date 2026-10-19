import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import type {
  CreateDepositSessionInput,
  CreateWithdrawRequestInput,
  DonateInput,
  WalletTransactionsInput
} from './wallet.schemas.js';

type DbClient = Pick<PoolClient, 'query'>;

const depositPackages: Record<CreateDepositSessionInput['packageCode'], number> = {
  COIN_100: 100,
  COIN_500: 500,
  COIN_1000: 1000,
  COIN_5000: 5000
};

function mapWallet(row: QueryResultRow) {
  return {
    walletId: row.wallet_id,
    userId: row.user_id,
    coinsBalance: row.coins_balance,
    lockedCoins: row.locked_coins
  };
}

function mapTransaction(row: QueryResultRow) {
  return {
    transactionId: row.transaction_id,
    walletId: row.wallet_id,
    counterpartyWalletId: row.counterparty_wallet_id,
    type: row.type,
    status: row.status,
    amountCoins: row.amount_coins,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: row.metadata,
    direction: row.type === 'DEPOSIT' || row.counterparty_wallet_id === row.viewer_wallet_id ? 'IN' : 'OUT',
    createdAt: row.created_at
  };
}

export function getDepositAmount(packageCode: CreateDepositSessionInput['packageCode']) {
  return depositPackages[packageCode];
}

export function listDepositPackages() {
  return Object.entries(depositPackages).map(([code, amountCoins]) => ({ code, amountCoins }));
}

export async function findWalletByUserId(userId: string) {
  const result = await getPostgresPool().query('select * from wallets where user_id = $1 limit 1', [userId]);
  return result.rows[0] ? mapWallet(result.rows[0]) : null;
}

async function findWalletByUserIdForUpdate(client: DbClient, userId: string) {
  const result = await client.query('select * from wallets where user_id = $1 for update', [userId]);
  return result.rows[0] ? mapWallet(result.rows[0]) : null;
}

async function findWalletByIdForUpdate(client: DbClient, walletId: string) {
  const result = await client.query('select * from wallets where wallet_id = $1 for update', [walletId]);
  return result.rows[0] ? mapWallet(result.rows[0]) : null;
}

export async function listTransactions(userId: string, input: WalletTransactionsInput) {
  const offset = (input.page - 1) * input.limit;
  const dataResult = await getPostgresPool().query(
    `
      select tx.*, w.wallet_id as viewer_wallet_id
      from transactions tx
      join wallets w on w.wallet_id in (tx.wallet_id, tx.counterparty_wallet_id)
      where w.user_id = $1
        and ($2::transaction_type is null or tx.type = $2)
        and ($3::transaction_status is null or tx.status = $3)
      order by tx.created_at desc
      limit $4 offset $5
    `,
    [userId, input.type ?? null, input.status ?? null, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from transactions tx
      join wallets w on w.wallet_id in (tx.wallet_id, tx.counterparty_wallet_id)
      where w.user_id = $1
        and ($2::transaction_type is null or tx.type = $2)
        and ($3::transaction_status is null or tx.status = $3)
    `,
    [userId, input.type ?? null, input.status ?? null]
  );

  return {
    items: dataResult.rows.map(mapTransaction),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function getAuthorEarnings(userId: string) {
  const result = await getPostgresPool().query(
    `
      select date_trunc('day', tx.created_at)::date as day,
             sum(tx.amount_coins)::bigint as amount,
             coalesce(sum(tx.amount_coins) filter (where tx.type = 'UNLOCK'), 0)::bigint as unlock_amount,
             coalesce(sum(tx.amount_coins) filter (where tx.type = 'DONATE'), 0)::bigint as donate_amount
      from transactions tx
      join wallets w on w.wallet_id = tx.counterparty_wallet_id
      where w.user_id = $1
        and tx.type in ('UNLOCK', 'DONATE')
        and tx.status = 'SUCCESS'
        and tx.created_at >= current_date - interval '364 days'
      group by 1
      order by 1
    `,
    [userId]
  );
  const totalResult = await getPostgresPool().query(
    `
      select coalesce(sum(tx.amount_coins), 0)::bigint as total
      from transactions tx
      join wallets w on w.wallet_id = tx.counterparty_wallet_id
      where w.user_id = $1
        and tx.type in ('UNLOCK', 'DONATE')
        and tx.status = 'SUCCESS'
    `,
    [userId]
  );
  return {
    totalEarnedCoins: Number(totalResult.rows[0]?.total ?? 0),
    daily: result.rows.map((row) => ({ day: row.day, amountCoins: Number(row.amount), unlockCoins: Number(row.unlock_amount), donateCoins: Number(row.donate_amount) }))
  };
}

export async function createDepositSession(userId: string, input: CreateDepositSessionInput) {
  const wallet = await findWalletByUserId(userId);
  if (!wallet) return null;

  const amountCoins = getDepositAmount(input.packageCode);
  const result = await getPostgresPool().query(
    `
      insert into deposit_sessions (wallet_id, package_code, amount_coins)
      values ($1, $2, $3)
      returning *
    `,
    [wallet.walletId, input.packageCode, amountCoins]
  );

  return {
    depositSessionId: result.rows[0].deposit_session_id,
    walletId: result.rows[0].wallet_id,
    packageCode: result.rows[0].package_code,
    amountCoins: result.rows[0].amount_coins,
    status: result.rows[0].status
  };
}

export async function completeDepositSession(depositSessionId: string) {
  return withPostgresTransaction(async (client) => {
    const sessionResult = await client.query(
      'select * from deposit_sessions where deposit_session_id = $1 for update',
      [depositSessionId]
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== 'PENDING') return null;

    const wallet = await findWalletByIdForUpdate(client, session.wallet_id);
    if (!wallet) return null;

    await client.query(
      `
        update wallets
        set coins_balance = coins_balance + $2,
            updated_at = now()
        where wallet_id = $1
      `,
      [wallet.walletId, session.amount_coins]
    );

    const txResult = await client.query(
      `
        insert into transactions (wallet_id, type, status, amount_coins, reference_type, reference_id, metadata)
        values ($1, 'DEPOSIT', 'SUCCESS', $2, 'DEPOSIT_SESSION', $3, $4)
        returning *
      `,
      [
        wallet.walletId,
        session.amount_coins,
        depositSessionId,
        { packageCode: session.package_code, mockGateway: true }
      ]
    );

    await client.query(
      `
        update deposit_sessions
        set status = 'SUCCESS',
            transaction_id = $2,
            updated_at = now()
        where deposit_session_id = $1
      `,
      [depositSessionId, txResult.rows[0].transaction_id]
    );

    return {
      depositSessionId,
      status: 'SUCCESS',
      transactionId: txResult.rows[0].transaction_id,
      amountCoins: session.amount_coins
    };
  });
}

export async function findPublishedChapterForUnlock(chapterId: string) {
  const result = await getPostgresPool().query(
    `
      select c.*, n.author_id
      from chapters c
      join novels n on n.novel_id = c.novel_id
      where c.chapter_id = $1
        and c.deleted_at is null
        and c.status = 'PUBLISHED'
        and n.deleted_at is null
        and n.status = 'PUBLISHED'
      limit 1
    `,
    [chapterId]
  );

  return result.rows[0] ?? null;
}

export async function userHasChapterUnlock(userId: string, chapterId: string) {
  const result = await getPostgresPool().query(
    'select 1 from chapter_unlocks where user_id = $1 and chapter_id = $2 limit 1',
    [userId, chapterId]
  );
  return Boolean(result.rows[0]);
}

export async function unlockChapter(userId: string, chapter: QueryResultRow) {
  return withPostgresTransaction(async (client) => {
    const existingUnlock = await client.query(
      'select transaction_id from chapter_unlocks where user_id = $1 and chapter_id = $2',
      [userId, chapter.chapter_id]
    );
    if (existingUnlock.rows[0]) {
      return {
        chapterId: chapter.chapter_id,
        unlocked: true,
        transactionId: existingUnlock.rows[0].transaction_id,
        alreadyUnlocked: true
      };
    }

    const readerWallet = await findWalletByUserIdForUpdate(client, userId);
    const authorWallet = await findWalletByUserIdForUpdate(client, chapter.author_id);
    if (!readerWallet || !authorWallet) return null;
    if (readerWallet.coinsBalance < chapter.price_coins) return false;

    await client.query('update wallets set coins_balance = coins_balance - $2, updated_at = now() where wallet_id = $1', [
      readerWallet.walletId,
      chapter.price_coins
    ]);
    await client.query('update wallets set coins_balance = coins_balance + $2, updated_at = now() where wallet_id = $1', [
      authorWallet.walletId,
      chapter.price_coins
    ]);

    const txResult = await client.query(
      `
        insert into transactions (wallet_id, counterparty_wallet_id, type, status, amount_coins, reference_type, reference_id)
        values ($1, $2, 'UNLOCK', 'SUCCESS', $3, 'CHAPTER', $4)
        returning transaction_id
      `,
      [readerWallet.walletId, authorWallet.walletId, chapter.price_coins, chapter.chapter_id]
    );

    await client.query(
      'insert into chapter_unlocks (user_id, chapter_id, transaction_id) values ($1, $2, $3)',
      [userId, chapter.chapter_id, txResult.rows[0].transaction_id]
    );

    return {
      chapterId: chapter.chapter_id,
      unlocked: true,
      transactionId: txResult.rows[0].transaction_id,
      alreadyUnlocked: false
    };
  });
}

export async function findActiveAuthorWallet(authorId: string) {
  const result = await getPostgresPool().query(
    `
      select w.*
      from wallets w
      join users u on u.user_id = w.user_id
      where u.user_id = $1
        and u.role in ('AUTHOR', 'ADMIN')
        and u.status = 'ACTIVE'
        and u.deleted_at is null
      limit 1
    `,
    [authorId]
  );
  return result.rows[0] ? mapWallet(result.rows[0]) : null;
}

export async function donateToAuthor(userId: string, authorId: string, input: DonateInput) {
  return withPostgresTransaction(async (client) => {
    if (userId === authorId) return false;
    const donorWallet = await findWalletByUserIdForUpdate(client, userId);
    const authorWallet = await findWalletByUserIdForUpdate(client, authorId);
    if (!donorWallet || !authorWallet) return null;
    if (donorWallet.coinsBalance < input.amountCoins) return false;

    await client.query('update wallets set coins_balance = coins_balance - $2, updated_at = now() where wallet_id = $1', [
      donorWallet.walletId,
      input.amountCoins
    ]);
    await client.query('update wallets set coins_balance = coins_balance + $2, updated_at = now() where wallet_id = $1', [
      authorWallet.walletId,
      input.amountCoins
    ]);
    const txResult = await client.query(
      `
        insert into transactions (wallet_id, counterparty_wallet_id, type, status, amount_coins, reference_type, reference_id, metadata)
        values ($1, $2, 'DONATE', 'SUCCESS', $3, 'AUTHOR', $4, $5)
        returning transaction_id
      `,
      [donorWallet.walletId, authorWallet.walletId, input.amountCoins, authorId, { message: input.message ?? null }]
    );

    return {
      authorId,
      donated: true,
      amountCoins: input.amountCoins,
      transactionId: txResult.rows[0].transaction_id
    };
  });
}

export async function createWithdrawRequest(userId: string, input: CreateWithdrawRequestInput) {
  return withPostgresTransaction(async (client) => {
    const wallet = await findWalletByUserIdForUpdate(client, userId);
    if (!wallet) return null;
    if (wallet.coinsBalance < input.amountCoins) return false;

    await client.query(
      `
        update wallets
        set coins_balance = coins_balance - $2,
            locked_coins = locked_coins + $2,
            updated_at = now()
        where wallet_id = $1
      `,
      [wallet.walletId, input.amountCoins]
    );

    const txResult = await client.query(
      `
        insert into transactions (wallet_id, type, status, amount_coins, reference_type, metadata)
        values ($1, 'WITHDRAW', 'PENDING', $2, 'WITHDRAW_REQUEST', $3)
        returning transaction_id
      `,
      [wallet.walletId, input.amountCoins, { bankAccountLabel: input.bankAccountLabel }]
    );

    const withdrawResult = await client.query(
      `
        insert into withdraw_requests (wallet_id, amount_coins, bank_account_label, transaction_id)
        values ($1, $2, $3, $4)
        returning *
      `,
      [wallet.walletId, input.amountCoins, input.bankAccountLabel, txResult.rows[0].transaction_id]
    );

    await client.query(
      'update transactions set reference_id = $2, updated_at = now() where transaction_id = $1',
      [txResult.rows[0].transaction_id, withdrawResult.rows[0].withdraw_request_id]
    );

    return {
      withdrawRequestId: withdrawResult.rows[0].withdraw_request_id,
      transactionId: txResult.rows[0].transaction_id,
      status: withdrawResult.rows[0].status
    };
  });
}

export async function listWithdrawRequests(input: {
  status?: 'PENDING' | 'SUCCESS' | 'FAILED';
  page: number;
  limit: number;
}) {
  const offset = (input.page - 1) * input.limit;
  const dataResult = await getPostgresPool().query(
    `
      select wr.*, w.user_id, u.username
      from withdraw_requests wr
      join wallets w on w.wallet_id = wr.wallet_id
      join users u on u.user_id = w.user_id
      where ($1::transaction_status is null or wr.status = $1)
      order by wr.created_at desc
      limit $2 offset $3
    `,
    [input.status ?? null, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    'select count(*)::int as total from withdraw_requests where ($1::transaction_status is null or status = $1)',
    [input.status ?? null]
  );

  return {
    items: dataResult.rows.map((row) => ({
      withdrawRequestId: row.withdraw_request_id,
      userId: row.user_id,
      username: row.username,
      walletId: row.wallet_id,
      amountCoins: row.amount_coins,
      bankAccountLabel: row.bank_account_label,
      status: row.status,
      transactionId: row.transaction_id,
      createdAt: row.created_at
    })),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function approveWithdrawRequest(withdrawRequestId: string, adminUserId: string) {
  return withPostgresTransaction(async (client) => {
    const requestResult = await client.query(
      'select * from withdraw_requests where withdraw_request_id = $1 for update',
      [withdrawRequestId]
    );
    const withdrawRequest = requestResult.rows[0];
    if (!withdrawRequest || withdrawRequest.status !== 'PENDING') return null;

    const wallet = await findWalletByIdForUpdate(client, withdrawRequest.wallet_id);
    if (!wallet || wallet.lockedCoins < withdrawRequest.amount_coins) return false;

    await client.query(
      'update wallets set locked_coins = locked_coins - $2, updated_at = now() where wallet_id = $1',
      [wallet.walletId, withdrawRequest.amount_coins]
    );
    await client.query(
      `
        update transactions
        set status = 'SUCCESS',
            updated_at = now()
        where transaction_id = $1
      `,
      [withdrawRequest.transaction_id]
    );
    const result = await client.query(
      `
        update withdraw_requests
        set status = 'SUCCESS',
            reviewed_by = $2,
            reviewed_at = now(),
            updated_at = now()
        where withdraw_request_id = $1
        returning *
      `,
      [withdrawRequestId, adminUserId]
    );

    return {
      withdrawRequestId,
      userId: wallet.userId,
      amountCoins: result.rows[0].amount_coins,
      transactionId: result.rows[0].transaction_id,
      status: result.rows[0].status
    };
  });
}

export async function rejectWithdrawRequest(withdrawRequestId: string, adminUserId: string, reason: string) {
  return withPostgresTransaction(async (client) => {
    const requestResult = await client.query(
      'select * from withdraw_requests where withdraw_request_id = $1 for update',
      [withdrawRequestId]
    );
    const withdrawRequest = requestResult.rows[0];
    if (!withdrawRequest || withdrawRequest.status !== 'PENDING') return null;

    const wallet = await findWalletByIdForUpdate(client, withdrawRequest.wallet_id);
    if (!wallet || wallet.lockedCoins < withdrawRequest.amount_coins) return false;

    await client.query(
      `
        update wallets
        set coins_balance = coins_balance + $2,
            locked_coins = locked_coins - $2,
            updated_at = now()
        where wallet_id = $1
      `,
      [wallet.walletId, withdrawRequest.amount_coins]
    );
    await client.query(
      "update transactions set status = 'FAILED', updated_at = now() where transaction_id = $1",
      [withdrawRequest.transaction_id]
    );
    const result = await client.query(
      `
        update withdraw_requests
        set status = 'FAILED',
            reviewed_by = $2,
            reviewed_at = now(),
            rejection_reason = $3,
            updated_at = now()
        where withdraw_request_id = $1
        returning *
      `,
      [withdrawRequestId, adminUserId, reason]
    );

    return {
      withdrawRequestId,
      userId: wallet.userId,
      amountCoins: result.rows[0].amount_coins,
      rejectionReason: result.rows[0].rejection_reason,
      transactionId: result.rows[0].transaction_id,
      status: result.rows[0].status
    };
  });
}
