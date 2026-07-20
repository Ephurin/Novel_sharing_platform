import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  approveWithdrawRequest,
  listWithdrawRequests as listWithdrawRequestRows,
  rejectWithdrawRequest
} from '../wallet/wallet.repository.js';
import type { ListAdminUsersInput, ListWithdrawRequestsInput, TaxonomyNameInput } from './admin.schemas.js';
import {
  createGenre,
  createTag,
  getDashboardStats,
  listAdminUsers as listAdminUserRows,
  listTaxonomy,
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
  return result;
}

export async function rejectWithdraw(auth: AuthContext, withdrawRequestId: string, reason: string) {
  const result = await rejectWithdrawRequest(withdrawRequestId, auth.userId, reason);
  if (result === false) throw new AppError(409, 'PAYMENT_004', 'Invalid wallet state');
  if (!result) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  return result;
}

export async function dashboardStats() {
  return getDashboardStats();
}
