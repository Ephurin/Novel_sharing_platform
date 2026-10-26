import type { PoolClient } from 'pg';
import type { AuthContext } from '../../core/security/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertAdminPermission, audit, protectAccount, requiredReason } from './admin-access.js';
import { queueAdminNotification } from './admin-jobs.js';
import { findCommentRecordById } from '../interactions/comments.repository.js';

export type SanctionAction = 'WARN' | 'HIDE' | 'LOCK';
export async function applySanction(
  client: PoolClient,
  auth: AuthContext,
  input: {
    targetType: string;
    targetId: string;
    action: SanctionAction;
    reason: string;
    reviewId?: string;
  }
) {
  const reason = requiredReason(input.reason);
  if (input.targetType === 'USER')
    await client.query("select pg_advisory_xact_lock(hashtext('storycraft-admin-access'))");
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [
    `sanction:${input.targetType}:${input.targetId}`
  ]);
  let ownerId: string;
  let before: any;
  if (input.targetType === 'COMMENT') {
    const comment = await findCommentRecordById(input.targetId);
    if (!comment) throw new AppError(404, 'CONTENT_001', 'Không tìm thấy bình luận.');
    before = { status: comment.status, deletedAt: comment.deletedAt };
    ownerId = comment.userId;
  } else if (input.targetType === 'USER') {
    if (input.action === 'LOCK') await assertAdminPermission(auth, 'users', client);
    const row = await protectAccount(
      client,
      auth,
      input.targetId,
      input.reviewId ? 'content' : 'users'
    );
    before = { status: row.status };
    ownerId = row.user_id;
  } else {
    const type = input.targetType;
    if (type !== 'NOVEL' && type !== 'CHAPTER')
      throw new AppError(422, 'ADMIN_TARGET', 'Đối tượng không hợp lệ.');
    const row =
      type === 'NOVEL'
        ? (
            await client.query(
              'select novel_id,author_id,deleted_at,status from novels where novel_id::text=$1 for update',
              [input.targetId]
            )
          ).rows[0]
        : (
            await client.query(
              'select c.chapter_id,n.author_id,c.deleted_at,c.status from chapters c join novels n using(novel_id) where c.chapter_id::text=$1 for update of c',
              [input.targetId]
            )
          ).rows[0];
    if (!row) throw new AppError(404, 'CONTENT_001', 'Không tìm thấy nội dung.');
    ownerId = row.author_id;
    before = { status: row.status, deletedAt: row.deleted_at };
  }
  if (
    (input.action === 'LOCK' && input.targetType !== 'USER') ||
    (input.action === 'HIDE' && input.targetType === 'USER')
  )
    throw new AppError(422, 'ADMIN_ACTION', 'Hành động không phù hợp với đối tượng.');
  if (input.action !== 'WARN') {
    const existing = await client.query(
      "select 1 from admin_sanctions where target_type=$1 and target_id=$2 and active and action in ('HIDE','LOCK')",
      [input.targetType, input.targetId]
    );
    if (existing.rowCount || before.deletedAt || before.status === 'LOCKED')
      throw new AppError(
        409,
        'ADMIN_SANCTION_ACTIVE',
        'Đối tượng đã bị hạn chế. Hãy xem quyết định trước đó.'
      );
  }
  const event = await audit(client, auth, {
    action: `${input.targetType}_${input.action}`,
    targetType: input.targetType,
    targetId: input.targetId,
    affectedUserId: ownerId,
    reason,
    before,
    after: { action: input.action, reviewId: input.reviewId ?? null }
  });
  const sanction = (
    await client.query(
      'insert into admin_sanctions(audit_id,review_id,target_type,target_id,owner_id,action,previous_state) values($1,$2,$3,$4,$5,$6,$7) returning *',
      [
        event,
        input.reviewId ?? null,
        input.targetType,
        input.targetId,
        ownerId,
        input.action,
        before
      ]
    )
  ).rows[0];
  if (input.action === 'LOCK')
    await client.query("update users set status='LOCKED',updated_at=now() where user_id=$1", [
      input.targetId
    ]);
  if (input.action === 'HIDE' && input.targetType === 'NOVEL')
    await client.query('update novels set deleted_at=now(),updated_at=now() where novel_id=$1', [
      input.targetId
    ]);
  if (input.action === 'HIDE' && input.targetType === 'CHAPTER')
    await client.query(
      'update chapters set deleted_at=now(),updated_at=now() where chapter_id=$1',
      [input.targetId]
    );
  if (input.action === 'HIDE' && input.targetType === 'COMMENT')
    await client.query("insert into admin_jobs(kind,payload) values('COMMENT_SYNC',$1)", [
      { sanctionId: sanction.sanction_id }
    ]);
  if (!(input.targetType === 'COMMENT' && input.reviewId))
    await queueAdminNotification(client, {
      userId: ownerId,
      type: 'ADMIN_DECISION',
      title:
        input.action === 'WARN'
          ? 'Cảnh báo từ quản trị viên'
          : 'Quyết định quản trị đối với tài khoản/nội dung của bạn',
      content: reason,
      payload: {
        auditId: event,
        sanctionId: sanction.sanction_id,
        reviewId: input.reviewId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        appealsUrl: '/appeals'
      }
    });
  return sanction;
}

export async function restoreSanction(
  client: PoolClient,
  auth: AuthContext,
  sanction: any,
  reason: string
) {
  if (sanction.target_type === 'USER')
    await client.query("select pg_advisory_xact_lock(hashtext('storycraft-admin-access'))");
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [
    `sanction:${sanction.target_type}:${sanction.target_id}`
  ]);
  const row = (
    await client.query('select * from admin_sanctions where sanction_id=$1 for update', [
      sanction.sanction_id
    ])
  ).rows[0];
  if (!row?.active) return;
  if (row.action === 'LOCK') {
    const user = (
      await client.query('select status from users where user_id=$1 for update', [row.target_id])
    ).rows[0];
    if (user?.status === 'LOCKED')
      await client.query('update users set status=$2,updated_at=now() where user_id=$1', [
        row.target_id,
        row.previous_state.status
      ]);
  } else if (row.action === 'HIDE' && row.target_type !== 'COMMENT') {
    const table = row.target_type === 'NOVEL' ? 'novels' : 'chapters';
    const column = row.target_type === 'NOVEL' ? 'novel_id' : 'chapter_id';
    await client.query(`update ${table} set deleted_at=$2,updated_at=now() where ${column}=$1`, [
      row.target_id,
      row.previous_state.deletedAt ?? null
    ]);
  }
  await client.query(
    'update admin_sanctions set active=false,restored_at=now(),restored_by=$2 where sanction_id=$1',
    [row.sanction_id, auth.userId]
  );
  if (row.target_type === 'COMMENT' && row.action === 'HIDE')
    await client.query("insert into admin_jobs(kind,payload) values('COMMENT_SYNC',$1)", [
      { sanctionId: row.sanction_id }
    ]);
  await audit(client, auth, {
    action: 'SANCTION_RESTORED',
    targetType: row.target_type,
    targetId: row.target_id,
    affectedUserId: row.owner_id,
    reason,
    before: row,
    after: { active: false }
  });
}
