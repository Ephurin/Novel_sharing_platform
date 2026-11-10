import { withPostgresTransaction } from '../../core/database/transaction.js';
import { assertAdminPermission, audit, protectAccount, requiredReason } from './admin-access.js';
import { applySanction, restoreSanction } from './admin-sanctions.js';
import { drainAdminJobs } from './admin-jobs.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { createNotification } from '../interactions/notifications.repository.js';
import { restoreDraftChaptersByNovelId } from '../novels/draft-chapters.repository.js';
import {
  approveWithdrawRequest,
  listWithdrawRequests as listWithdrawRequestRows,
  rejectWithdrawRequest
} from '../wallet/wallet.repository.js';
import type {
  ListAdminNovelsInput,
  ListAdminUsersInput,
  ListWithdrawRequestsInput,
  RemoveNovelInput,
  RestoreNovelInput,
  TaxonomyNameInput
} from './admin.schemas.js';
import {
  createGenre,
  createTag,
  findAdminNovelById,
  findAdminUserById,
  getDashboardStats,
  listAdminNovels as listAdminNovelRows,
  listAdminUsers as listAdminUserRows,
  listTaxonomy,
  restoreNovelAggregate
} from './admin.repository.js';

function buildMeta(totalItems: number, page: number, limit: number) {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit)
  };
}

export async function listUsers(input: ListAdminUsersInput) {
  const result = await listAdminUserRows(input);
  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function listNovels(input: ListAdminNovelsInput) {
  const result = await listAdminNovelRows(input);
  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function getNovel(novelId: string) {
  const novel = await findAdminNovelById(novelId, true);
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  return novel;
}

export async function removeNovel(auth: AuthContext, novelId: string, input: RemoveNovelInput) {
  await withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'content', client);
    await applySanction(client, auth, {
      targetType: 'NOVEL',
      targetId: novelId,
      action: 'HIDE',
      reason: requiredReason(input.reason)
    });
  });
  await drainAdminJobs();
}
export async function restoreNovel(auth: AuthContext, novelId: string, input: RestoreNovelInput) {
  await withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'content', client);
    const reason = requiredReason(input.reason);
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`sanction:NOVEL:${novelId}`]);
    const sanction = (
      await client.query(
        "select * from admin_sanctions where target_type='NOVEL' and target_id=$1 and action='HIDE' and active",
        [novelId]
      )
    ).rows[0];
    if (sanction) await restoreSanction(client, auth, sanction, reason);
    else {
      const before = await findAdminNovelById(novelId, true);
      if (!before?.deletedAt)
        throw new AppError(409, 'ADMIN_NOT_REMOVED', 'Content is not removed');
      const restored = await restoreNovelAggregate(client, novelId);
      await restoreDraftChaptersByNovelId(novelId, restored?.chapterIds ?? []);
      await audit(client, auth, {
        action: 'NOVEL_RESTORED',
        targetType: 'NOVEL',
        targetId: novelId,
        affectedUserId: before.authorId,
        reason,
        before,
        after: { deletedAt: null }
      });
    }
  });
  await drainAdminJobs();
}
export async function lockUser(auth: AuthContext, userId: string, reason?: string) {
  await withPostgresTransaction((client) =>
    applySanction(client, auth, {
      targetType: 'USER',
      targetId: userId,
      action: 'LOCK',
      reason: requiredReason(reason)
    })
  );
  await drainAdminJobs();
  return findAdminUserById(userId);
}
export async function unlockUser(auth: AuthContext, userId: string, reason?: string) {
  await withPostgresTransaction(async (client) => {
    const before = await protectAccount(client, auth, userId);
    const note = requiredReason(reason);
    const sanction = (
      await client.query(
        "select * from admin_sanctions where target_type='USER' and target_id=$1 and action='LOCK' and active",
        [userId]
      )
    ).rows[0];
    if (sanction) await restoreSanction(client, auth, sanction, note);
    else {
      if (before.status !== 'LOCKED')
        throw new AppError(409, 'ADMIN_NOT_LOCKED', 'User is not locked');
      await client.query("update users set status='ACTIVE',updated_at=now() where user_id=$1", [
        userId
      ]);
      await audit(client, auth, {
        action: 'USER_UNLOCKED',
        targetType: 'USER',
        targetId: userId,
        affectedUserId: userId,
        reason: note,
        before: { status: before.status },
        after: { status: 'ACTIVE' }
      });
    }
  });
  await drainAdminJobs();
  return findAdminUserById(userId);
}

export async function getTaxonomy() {
  return listTaxonomy();
}

export async function addGenre(auth: AuthContext, input: TaxonomyNameInput) {
  return withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'content', client);
    const result = await createGenre(input, client);
    await audit(client, auth, {
      action: 'TAXONOMY_CREATED',
      targetType: 'genres',
      targetId: result.genreId,
      after: result
    });
    return result;
  });
}

export async function addTag(auth: AuthContext, input: TaxonomyNameInput) {
  return withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'content', client);
    const result = await createTag(input, client);
    await audit(client, auth, {
      action: 'TAXONOMY_CREATED',
      targetType: 'tags',
      targetId: result.tagId,
      after: result
    });
    return result;
  });
}

export async function listWithdrawRequests(input: ListWithdrawRequestsInput) {
  const result = await listWithdrawRequestRows(input);
  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function approveWithdraw(auth: AuthContext, withdrawRequestId: string) {
  const result = await approveWithdrawRequest(withdrawRequestId, auth.userId);
  if (result === false) throw new AppError(409, 'PAYMENT_004', 'Invalid wallet state');
  if (!result) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  await createNotification({
    userId: result.userId,
    type: 'WITHDRAW_APPROVED',
    title: 'Yêu cầu rút Coin đã được duyệt',
    content: `Yêu cầu rút ${result.amountCoins} Coin của bạn đã được Admin duyệt.`,
    payload: {
      withdrawRequestId,
      transactionId: result.transactionId,
      amountCoins: result.amountCoins,
      status: result.status,
      adminId: auth.userId
    }
  });
  return result;
}

export async function rejectWithdraw(auth: AuthContext, withdrawRequestId: string, reason: string) {
  const result = await rejectWithdrawRequest(withdrawRequestId, auth.userId, reason);
  if (result === false) throw new AppError(409, 'PAYMENT_004', 'Invalid wallet state');
  if (!result) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  await createNotification({
    userId: result.userId,
    type: 'WITHDRAW_REJECTED',
    title: 'Yêu cầu rút Coin đã bị từ chối',
    content: `Yêu cầu rút ${result.amountCoins} Coin của bạn đã bị Admin từ chối. Lý do: ${
      result.rejectionReason ?? reason
    }`,
    payload: {
      withdrawRequestId,
      transactionId: result.transactionId,
      amountCoins: result.amountCoins,
      status: result.status,
      reason: result.rejectionReason ?? reason,
      adminId: auth.userId
    }
  });
  return result;
}

export async function dashboardStats() {
  return getDashboardStats();
}
