import type { PoolClient } from 'pg';
import { AppError } from '../errors/app-error.js';
import type { AuthContext } from './auth-context.js';

// Both modes keep the validated identity stable until commit and allow FK checks.
// Use the write mode when the caller will update the user in the same transaction.
export async function lockFreshActor(
  client: PoolClient,
  auth: { userId: string } & Partial<Pick<AuthContext, 'role' | 'accessVersion'>>,
  mode: 'read' | 'write' = 'read'
) {
  const lock = mode === 'write' ? 'for no key update' : 'for share';
  const { rows: [actor] } = await client.query<{ role: string; status: string; access_version: number }>(
    `select role, status, access_version from users where user_id=$1 and deleted_at is null ${lock}`,
    [auth.userId]
  );
  if (
    !actor ||
    actor.status !== 'ACTIVE' ||
    (auth.role !== undefined &&
      (actor.role !== auth.role || actor.access_version !== (auth.accessVersion ?? 0)))
  ) {
    throw new AppError(401, 'AUTH_009', 'Phiên đã đổi quyền trong lúc thao tác. Hãy đăng nhập lại.');
  }
}
