import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import type { AdminScope } from './admin-access.js';
import { applyUserAccessChange, type AccessChangeOutcome } from './admin-access-change.js';

export type LegacyModeratorAccountRow = {
  user_id: string;
  username: string;
  status: string;
  scope: string;
};

export type LegacyModeratorInventory = {
  userId: string;
  username: string;
  status: string;
  scope: string;
  personal: {
    novels: number;
    chaptersPublished: number;
    chapterDrafts: number;
    scheduledChapters: number;
    publicationReviews: number;
    auditAsActor: number;
    auditAsSubject: number;
    walletCoins: string;
    transactions: number;
    withdrawRequests: number;
    unlockedVipChapters: number;
    readingHistories: number;
    follows: number;
    ratings: number;
    activeRefreshSessions: number;
  };
};

export type ConversionResult = {
  converted: AccessChangeOutcome[];
  skipped: Array<{ userId: string; username: string; reason: string }>;
  reconciliation: Array<{ userId: string; username: string; role: string; scope: string | null; note: string }>;
};

const legacyPairsQuery = `
  select u.user_id,u.username,u.status,a.scope
  from users u
  join admin_access a using(user_id)
  where u.role='ADMIN' and a.scope='MODERATOR' and u.deleted_at is null
  order by u.created_at
`;

export async function listLegacyModeratorAccounts(client = getPostgresPool()) {
  const result = await client.query<LegacyModeratorAccountRow>(legacyPairsQuery);
  return result.rows;
}

export async function inventoryLegacyModeratorConversion(client = getPostgresPool()) {
  const rows = await listLegacyModeratorAccounts(client);
  const accounts: LegacyModeratorInventory[] = [];
  for (const row of rows) {
    const [novels, chapters, schedules, reviews, auditActor, auditSubject, wallet, tx, withdraws, unlocks, histories, follows, ratings, sessions] =
      await Promise.all([
        client.query('select count(*)::int as count from novels where author_id=$1', [row.user_id]),
        client.query(
          "select count(*) filter (where c.status='PUBLISHED')::int as published, count(*) filter (where c.status<>'PUBLISHED')::int as drafts from chapters c join novels n using(novel_id) where n.author_id=$1",
          [row.user_id]
        ),
        client.query(
          'select count(*)::int as count from chapter_publication_schedules s join chapters c on s.chapter_id=c.chapter_id join novels n on c.novel_id=n.novel_id where n.author_id=$1',
          [row.user_id]
        ),
        client.query(
          'select count(*)::int as count from moderation_reviews r join novels n on r.target_id=n.novel_id::text where n.author_id=$1',
          [row.user_id]
        ),
        client.query('select count(*)::int as count from admin_audit where actor_id=$1', [row.user_id]),
        client.query('select count(*)::int as count from admin_audit where affected_user_id=$1', [
          row.user_id
        ]),
        client.query('select coalesce(coins_balance,0)::text as coins from wallets where user_id=$1', [
          row.user_id
        ]),
        client.query(
          'select count(*)::int as count from transactions t join wallets w using(wallet_id) where w.user_id=$1',
          [row.user_id]
        ),
        client.query(
          'select count(*)::int as count from withdraw_requests q join wallets w using(wallet_id) where w.user_id=$1',
          [row.user_id]
        ),
        client.query('select count(*)::int as count from chapter_unlocks where user_id=$1', [row.user_id]),
        client.query('select count(*)::int as count from reading_histories where user_id=$1', [
          row.user_id
        ]),
        client.query(
          'select count(*)::int as count from novel_follows f join novels n using(novel_id) where n.author_id=$1',
          [row.user_id]
        ),
        client.query(
          'select count(*)::int as count from novel_ratings r join novels n using(novel_id) where n.author_id=$1',
          [row.user_id]
        ),
        client.query(
          'select count(*)::int as count from refresh_tokens where user_id=$1 and revoked_at is null',
          [row.user_id]
        )
      ]);
    accounts.push({
      userId: row.user_id,
      username: row.username,
      status: row.status,
      scope: row.scope,
      personal: {
        novels: novels.rows[0].count,
        chaptersPublished: chapters.rows[0].published,
        chapterDrafts: chapters.rows[0].drafts,
        scheduledChapters: schedules.rows[0].count,
        publicationReviews: reviews.rows[0].count,
        auditAsActor: auditActor.rows[0].count,
        auditAsSubject: auditSubject.rows[0].count,
        walletCoins: wallet.rows[0]?.coins ?? '0',
        transactions: tx.rows[0].count,
        withdrawRequests: withdraws.rows[0].count,
        unlockedVipChapters: unlocks.rows[0].count,
        readingHistories: histories.rows[0].count,
        follows: follows.rows[0].count,
        ratings: ratings.rows[0].count,
        activeRefreshSessions: sessions.rows[0].count
      }
    });
  }
  return accounts;
}

/**
 * Converts each legacy `ADMIN` with `admin_access.scope='MODERATOR'` to the
 * `MODERATOR` role through the shared grant command. Conversion runs one
 * account per transaction; an account converted by a concurrent run is
 * skipped, and an account that no longer matches the expected legacy state
 * is reported for reconciliation instead of being converted.
 */
export async function convertLegacyModeratorAccounts(
  actor: { userId: string },
  reason: string,
  options: { accounts?: string[] } = {}
): Promise<ConversionResult> {
  const pool = getPostgresPool();
  const result: ConversionResult = { converted: [], skipped: [], reconciliation: [] };
  let rows = await listLegacyModeratorAccounts(pool);
  if (options.accounts?.length) {
    const wanted = new Set(options.accounts);
    for (const requested of options.accounts) {
      if (!rows.some((row) => row.user_id === requested)) {
        const current = (
          await pool.query(
            `select u.username,u.role,a.scope from users u left join admin_access a using(user_id)
             where u.user_id=$1 and u.deleted_at is null`,
            [requested]
          )
        ).rows[0];
        if (current?.role === 'MODERATOR') {
          result.skipped.push({ userId: requested, username: current.username, reason: 'Đã chuyển đổi trước đó.' });
        } else {
          result.reconciliation.push({
            userId: requested,
            username: current?.username ?? '',
            role: current?.role ?? '',
            scope: current?.scope ?? null,
            note: 'Tài khoản yêu cầu không còn khớp điều kiện legacy (role ADMIN + scope MODERATOR).'
          });
        }
      }
    }
    rows = rows.filter((row) => wanted.has(row.user_id));
  }
  for (const row of rows) {
    const outcome = await withPostgresTransaction(async (client) => {
      const current = await client.query(
        `select u.user_id,u.username,u.role,u.status,a.scope
         from users u left join admin_access a using(user_id)
         where u.user_id=$1 and u.deleted_at is null
         for update of u`,
        [row.user_id]
      );
      const target = current.rows[0];
      if (!target) {
        return { kind: 'reconcile' as const, note: 'Tài khoản không còn tồn tại.', role: '', scope: null };
      }
      // EvalPlanQual rechecks only the locked users row; an admin_access join column can
      // stay stale from the pre-lock snapshot, so the role decides "already converted".
      if (target.role === 'MODERATOR') {
        return { kind: 'skip' as const };
      }
      if (target.role !== 'ADMIN' || target.scope !== 'MODERATOR') {
        return {
          kind: 'reconcile' as const,
          note: 'Trạng thái khác cặp role/scope legacy dự kiến.',
          role: target.role,
          scope: target.scope ?? null
        };
      }
      const changed = await applyUserAccessChange(client, actor, row.user_id, {
        role: 'MODERATOR',
        reason
      });
      return { kind: 'converted' as const, outcome: changed };
    });
    if (outcome.kind === 'converted') result.converted.push(outcome.outcome!);
    else if (outcome.kind === 'skip')
      result.skipped.push({ userId: row.user_id, username: row.username, reason: 'Đã chuyển đổi trước đó.' });
    else
      result.reconciliation.push({
        userId: row.user_id,
        username: row.username,
        role: outcome.role,
        scope: outcome.scope,
        note: outcome.note
      });
  }
  return result;
}

/**
 * Rollback returns previously converted accounts to their recorded
 * `ADMIN` + legacy scope. Session tokens are revoked by the shared grant
 * command so affected users must sign in again.
 */
export async function rollbackModeratorConversion(
  actor: { userId: string },
  accounts: Array<{ userId: string; scope: string }>,
  reason: string
): Promise<ConversionResult> {
  const result: ConversionResult = { converted: [], skipped: [], reconciliation: [] };
  const validScopes = ['SUPER_ADMIN', 'MODERATOR', 'USER_MANAGER', 'FINANCE'];
  for (const account of accounts) {
    if (!validScopes.includes(account.scope)) {
      result.reconciliation.push({
        userId: account.userId,
        username: '',
        role: '',
        scope: null,
        note: `Nhóm quyền rollback không hợp lệ: ${account.scope}.`
      });
      continue;
    }
    const outcome = await withPostgresTransaction(async (client) => {
      const current = await client.query(
        `select u.user_id,u.username,u.role,a.scope
         from users u left join admin_access a using(user_id)
         where u.user_id=$1 and u.deleted_at is null
         for update of u`,
        [account.userId]
      );
      const target = current.rows[0];
      if (!target) {
        return { kind: 'reconcile' as const, note: 'Tài khoản không còn tồn tại.', role: '', scope: null };
      }
      if (target.role === 'ADMIN' && target.scope === account.scope) {
        return { kind: 'skip' as const };
      }
      if (target.role !== 'MODERATOR') {
        return {
          kind: 'reconcile' as const,
          note: 'Tài khoản không còn giữ vai trò Moderator.',
          role: target.role,
          scope: target.scope ?? null
        };
      }
      const changed = await applyUserAccessChange(client, actor, account.userId, {
        role: 'ADMIN',
        scope: account.scope as AdminScope,
        reason
      });
      return { kind: 'converted' as const, outcome: changed };
    });
    if (outcome.kind === 'converted') result.converted.push(outcome.outcome!);
    else if (outcome.kind === 'skip')
      result.skipped.push({
        userId: account.userId,
        username: '',
        reason: 'Tài khoản đã ở trạng thái mục tiêu.'
      });
    else
      result.reconciliation.push({
        userId: account.userId,
        username: '',
        role: outcome.role,
        scope: outcome.scope,
        note: outcome.note
      });
  }
  return result;
}
