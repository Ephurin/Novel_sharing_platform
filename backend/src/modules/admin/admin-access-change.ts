import type { PoolClient } from 'pg';
import { z } from 'zod';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { userRoles } from '../../shared/constants/roles.js';
import { audit, protectAccount, type AccessActor } from './admin-access.js';

const adminScopeEnum = z.enum(['SUPER_ADMIN', 'MODERATOR', 'USER_MANAGER', 'FINANCE']);

export const userAccessChangeSchema = z.object({
  role: z.enum(userRoles),
  scope: adminScopeEnum.optional(),
  reason: z.string().trim().min(1).max(1000)
});

export type UserAccessChange = z.infer<typeof userAccessChangeSchema>;

export const legacyModeratorAccessOperation = {
  CONVERT: 'LEGACY_MODERATOR_CONVERSION',
  ROLLBACK: 'LEGACY_MODERATOR_ROLLBACK'
} as const;

type AccessOperation = (typeof legacyModeratorAccessOperation)[keyof typeof legacyModeratorAccessOperation];

export type AccessChangeOutcome = {
  userId: string;
  changed: boolean;
  role: string;
  scope: string | null;
  accessVersion: number;
};

export async function applyUserAccessChange(
  client: PoolClient,
  actor: AccessActor,
  targetUserId: string,
  input: UserAccessChange,
  operation?: AccessOperation
): Promise<AccessChangeOutcome> {
  if (input.role === 'ADMIN' && !input.scope) {
    throw new AppError(422, 'ADMIN_SCOPE', 'Chọn nhóm quyền admin.');
  }
  if (input.role !== 'ADMIN' && input.scope) {
    throw new AppError(422, 'ADMIN_SCOPE_ONLY', 'Chỉ vai trò quản trị viên cần nhóm quyền.');
  }
  if (input.role === 'MODERATOR' && !env.MODERATOR_ENABLED) {
    throw new AppError(403, 'MODERATOR_DISABLED', 'Chức năng điều hành viên chưa được mở trên hệ thống này.');
  }

  const before = await protectAccount(client, actor, targetUserId, 'access');
  const currentRole = before.role;
  const currentScope = currentRole === 'ADMIN' ? before.admin_scope : null;
  const changed =
    currentRole !== input.role || (input.role === 'ADMIN' && currentScope !== (input.scope ?? null));

  if (!changed) {
    return {
      userId: targetUserId,
      changed: false,
      role: currentRole,
      scope: currentScope,
      accessVersion: before.access_version
    };
  }

  await client.query('update users set role=$2,updated_at=now(),access_version=access_version+1 where user_id=$1', [
    targetUserId,
    input.role
  ]);
  if (input.role === 'ADMIN') {
    await client.query(
      'insert into admin_access(user_id,scope,updated_by) values($1,$2,$3) on conflict(user_id) do update set scope=excluded.scope,updated_by=excluded.updated_by,updated_at=now()',
      [targetUserId, input.scope, actor.userId]
    );
  } else {
    await client.query('delete from admin_access where user_id=$1', [targetUserId]);
  }
  await client.query('update refresh_tokens set revoked_at=now() where user_id=$1 and revoked_at is null', [
    targetUserId
  ]);
  const accessVersion = before.access_version + 1;
  await audit(client, actor, {
    action: 'USER_ACCESS_CHANGED',
    targetType: 'USER',
    targetId: targetUserId,
    affectedUserId: targetUserId,
    reason: input.reason,
    before: { role: currentRole, scope: currentScope, accessVersion: before.access_version },
    after: {
      role: input.role,
      ...(input.role === 'ADMIN' ? { scope: input.scope } : {}),
      accessVersion,
      ...(operation ? { operation } : {})
    }
  });

  return {
    userId: targetUserId,
    changed: true,
    role: input.role,
    scope: input.role === 'ADMIN' ? (input.scope ?? null) : null,
    accessVersion
  };
}
