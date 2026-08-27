import { AppError } from '../../core/errors/app-error.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { createNotification } from '../interactions/notifications.repository.js';
import {
  markDraftChaptersDeletedByNovelId,
  restoreDraftChaptersByNovelId
} from '../novels/draft-chapters.repository.js';
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
  getDashboardStats,
  listAdminNovels as listAdminNovelRows,
  listAdminUsers as listAdminUserRows,
  listTaxonomy,
  restoreNovelAggregate,
  softRemoveNovelAggregate,
  updateUserStatus
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
  const existingNovel = await findAdminNovelById(novelId, false);
  if (!existingNovel) throw new AppError(404, 'CONTENT_001', 'Content not found');

  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    const removedNovel = await softRemoveNovelAggregate(client, novelId);
    if (!removedNovel) throw new AppError(404, 'CONTENT_001', 'Content not found');
    await markDraftChaptersDeletedByNovelId(novelId, input.reason);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await createNotification({
    userId: existingNovel.authorId,
    type: 'NOVEL_REMOVED_BY_ADMIN',
    title: 'Truyện đã bị gỡ bởi Admin',
    content: input.reason
      ? `Truyện "${existingNovel.title}" đã bị gỡ bởi Admin. Lý do: ${input.reason}`
      : `Truyện "${existingNovel.title}" đã bị gỡ bởi Admin.`,
    payload: {
      novelId,
      novelTitle: existingNovel.title,
      reason: input.reason ?? null,
      adminId: auth.userId
    }
  });
}

export async function restoreNovel(auth: AuthContext, novelId: string, input: RestoreNovelInput) {
  const existingNovel = await findAdminNovelById(novelId, true);
  if (!existingNovel) throw new AppError(404, 'CONTENT_001', 'Content not found');

  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    const restoredNovel = await restoreNovelAggregate(client, novelId);
    if (!restoredNovel) throw new AppError(404, 'CONTENT_001', 'Content not found');
    await restoreDraftChaptersByNovelId(novelId);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await createNotification({
    userId: existingNovel.authorId,
    type: 'NOVEL_RESTORED_BY_ADMIN',
    title: 'Truyện đã được khôi phục bởi Admin',
    content: input.reason
      ? `Truyện "${existingNovel.title}" đã được khôi phục bởi Admin. Lý do: ${input.reason}`
      : `Truyện "${existingNovel.title}" đã được khôi phục bởi Admin.`,
    payload: {
      novelId,
      novelTitle: existingNovel.title,
      reason: input.reason ?? null,
      adminId: auth.userId
    }
  });
}

export async function lockUser(userId: string) {
  const user = await updateUserStatus(userId, 'LOCKED');
  if (!user) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  return user;
}

export async function unlockUser(userId: string) {
  const user = await updateUserStatus(userId, 'ACTIVE');
  if (!user) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  return user;
}

export async function getTaxonomy() {
  return listTaxonomy();
}

export async function addGenre(input: TaxonomyNameInput) {
  return createGenre(input);
}

export async function addTag(input: TaxonomyNameInput) {
  return createTag(input);
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
