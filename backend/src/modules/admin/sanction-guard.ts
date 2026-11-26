import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';

export async function assertNoOpenAppeal(client: PoolClient, sanctionId: string) {
  const appeal = (
    await client.query(
      `select p.appeal_id from admin_appeals p join admin_sanctions s using(audit_id)
        where s.sanction_id=$1 and p.status='OPEN' limit 1`,
      [sanctionId]
    )
  ).rows[0];
  if (appeal)
    throw new AppError(
      409,
      'APPEAL_OPEN',
      'Nội dung đang có khiếu nại mở. Mọi khôi phục phải qua quyết định Admin.'
    );
}

export async function assertNotOriginalDecider(
  client: PoolClient,
  auth: AuthContext,
  sanctionId: string
) {
  const decider = (
    await client.query(
      'select a.actor_id from admin_audit a join admin_sanctions s using(audit_id) where s.sanction_id=$1',
      [sanctionId]
    )
  ).rows[0];
  if (decider && String(decider.actor_id).toLowerCase() === String(auth.userId).toLowerCase()) {
    throw new AppError(
      403,
      'SANCTION_SELF_REVERSE',
      'Người ra quyết định gốc không thể tự xử quyết định của mình.'
    );
  }
}
