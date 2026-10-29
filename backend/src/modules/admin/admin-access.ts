import type { RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';

export type AdminPermission = 'content' | 'users' | 'finance' | 'access' | 'audit';
export type AdminScope = 'SUPER_ADMIN' | 'MODERATOR' | 'USER_MANAGER' | 'FINANCE';
export const scopePermissions: Record<AdminScope, AdminPermission[]> = {
  SUPER_ADMIN: ['content', 'users', 'finance', 'access', 'audit'],
  MODERATOR: ['content'],
  USER_MANAGER: ['users'],
  FINANCE: ['finance']
};
export async function adminAccess(auth: AuthContext, client?: PoolClient) {
  const result = await (client ?? getPostgresPool()).query(
    `select u.user_id,a.scope from users u join admin_access a using(user_id) where u.user_id::text=$1 and u.role='ADMIN' and u.status='ACTIVE' and u.deleted_at is null`,
    [auth.userId]
  );
  if (!result.rows[0] || !scopePermissions[result.rows[0].scope as AdminScope])
    throw new AppError(403, 'ADMIN_ACCESS', 'Tài khoản không có quyền quản trị đang hoạt động.');
  const scope = result.rows[0].scope as AdminScope;
  return { scope, permissions: scopePermissions[scope] };
}
export async function assertAdminPermission(
  auth: AuthContext,
  permission: AdminPermission,
  client?: PoolClient
) {
  const access = await adminAccess(auth, client);
  if (!access.permissions.includes(permission))
    throw new AppError(403, 'ADMIN_PERMISSION', 'Bạn không có quyền thực hiện thao tác này.');
  return access;
}
export function requireAdminPermission(permission: AdminPermission): RequestHandler {
  return async (request, _response, next) => {
    try {
      if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
      await assertAdminPermission(request.auth, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}
export async function audit(
  client: PoolClient,
  auth: AuthContext,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    affectedUserId?: string | null;
    reason?: string;
    before?: unknown;
    after?: unknown;
  }
) {
  const result = await client.query(
    `insert into admin_audit(actor_id,action,target_type,target_id,affected_user_id,reason,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7,$8) returning audit_id`,
    [
      auth.userId,
      input.action,
      input.targetType,
      input.targetId,
      input.affectedUserId ?? null,
      input.reason ?? null,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null)
    ]
  );
  return result.rows[0].audit_id as string;
}
export function requiredReason(reason?: string) {
  if (!reason?.trim()) throw new AppError(422, 'ADMIN_REASON', 'Vui lòng nhập lý do xử lý.');
  return reason.trim();
}
export async function protectAccount(
  client: PoolClient,
  auth: AuthContext,
  userId: string,
  permission: AdminPermission = 'users'
) {
  await client.query("select pg_advisory_xact_lock(hashtext('storycraft-admin-access'))");
  const access = await assertAdminPermission(auth, permission, client);
  const row = (
    await client.query(
      `select u.*,a.scope as admin_scope from users u left join admin_access a using(user_id) where user_id=$1 and deleted_at is null and status<>'DELETED' for update of u`,
      [userId]
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'USER_001', 'Không tìm thấy tài khoản.');
  if (userId.toLowerCase() === auth.userId.toLowerCase())
    throw new AppError(
      409,
      'ADMIN_SELF',
      'Không thể tự khóa hoặc thay đổi quyền của tài khoản đang dùng.'
    );
  if (row.role === 'ADMIN') {
    if (access.scope !== 'SUPER_ADMIN')
      throw new AppError(
        403,
        'ADMIN_PERMISSION',
        'Chỉ quản trị viên toàn quyền được quản lý tài khoản admin.'
      );
    const count = await client.query(
      `select count(*)::int as count from users u join admin_access a using(user_id) where u.role='ADMIN' and u.status='ACTIVE' and u.deleted_at is null and a.scope='SUPER_ADMIN'`
    );
    if (row.status === 'ACTIVE' && row.admin_scope === 'SUPER_ADMIN' && count.rows[0].count <= 1)
      throw new AppError(
        409,
        'ADMIN_LAST',
        'Phải giữ ít nhất một quản trị viên toàn quyền đang hoạt động.'
      );
  }
  return row;
}
