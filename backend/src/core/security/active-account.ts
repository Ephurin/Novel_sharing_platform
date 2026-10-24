import type { RequestHandler } from 'express';
import { getPostgresPool } from '../database/postgres.js';
import { AppError } from '../errors/app-error.js';
import type { AuthContext } from './auth-context.js';

export async function assertActiveAccount(auth?: AuthContext) {
  if (!auth || !auth.userId) throw new AppError(401, 'AUTH_002', 'Authentication required');
  const result = await getPostgresPool().query('select role, status from users where user_id=$1 and deleted_at is null', [auth.userId]);
  const account = result.rows[0];
  if (!account || account.status !== 'ACTIVE' || account.role !== auth.role) throw new AppError(403, 'AUTH_008', 'Tài khoản hoặc quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.');
}
export const requireActiveAccount: RequestHandler = async (request, _response, next) => {
  try {
    if (!request.auth) throw new AppError(401, 'AUTH_002', 'Authentication required');
    await assertActiveAccount(request.auth); next();
  } catch (error) { next(error); }
};
