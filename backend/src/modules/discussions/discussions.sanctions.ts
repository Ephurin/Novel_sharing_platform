import { appealsPath } from '../../core/config/web-paths.js';
import type { PoolClient, QueryResult } from 'pg';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { assertAdminPermission, audit, requiredReason } from '../admin/admin-access.js';
import { assertNoOpenAppeal, assertNotOriginalDecider } from '../admin/sanction-guard.js';
import { queueAdminNotification } from '../admin/admin-jobs.js';
import { lockFreshActor } from '../../core/security/transactional-identity.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { refreshTopicActivity } from './discussions.write.js';
import { discussionInvolvedUserIds } from './discussions.admin.js';
import type { DiscussionStatus, DiscussionTargetKind } from './discussions.types.js';

const uuidParam = z.string().uuid();

export type DiscussionOperationalPermission = 'discussion.operate' | 'sanction.hide';

export type DiscussionSanctionOutcome = {
  sanction: Record<string, unknown> | null;
  ownerId: string;
  topicId: string;
  status: DiscussionStatus;
  skipped: 'achieved' | 'deleted' | null;
  activeSanctionId?: string | null;
  activeAuditId?: string | null;
  topicRow: {
    topic_id: string;
    category_id: string;
    is_pinned: boolean;
    is_locked: boolean;
  } | null;
};

type LockedDiscussionTarget = {
  kind: DiscussionTargetKind;
  targetId: string;
  topicId: string;
  topicStatus: DiscussionStatus;
  authorId: string;
  topicRow: {
    topic_id: string;
    category_id: string;
    is_pinned: boolean;
    is_locked: boolean;
  } | null;
};

export function discussionTargetKind(type: string): DiscussionTargetKind | null {
  return type === 'DISCUSSION' || type === 'DISCUSSION_COMMENT' ? type : null;
}

function deletedError(kind: DiscussionTargetKind) {
  return new AppError(
    409,
    kind === 'DISCUSSION' ? 'DISCUSSION_TOPIC_DELETED' : 'DISCUSSION_COMMENT_DELETED',
    'Không thể khôi phục nội dung đã bị xóa.'
  );
}

/**
 * Sanction lock order for forum content: the sanction advisory key first, then
 * the topic row, then the comment row. Every hide/restore path (report resolver,
 * operational routes and appeals) must take locks in this same order.
 */
export async function advisoryDiscussionSanctionLock(
  client: PoolClient,
  kind: DiscussionTargetKind,
  id: string
) {
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [`sanction:${kind}:${id}`]);
}

/**
 * Locks the topic row first, then the comment row, and returns the moderated
 * target. `expectedTopicId` keeps the moderation comment bound to its topic.
 */
export async function lockDiscussionSanctionTarget(
  client: PoolClient,
  kind: DiscussionTargetKind,
  id: string,
  expectedTopicId?: string
): Promise<LockedDiscussionTarget> {
  const boundedId = uuidParam.parse(id);
  if (kind === 'DISCUSSION') {
    const topic: QueryResult<{
      topic_id: string;
      category_id: string;
      author_id: string;
      status: DiscussionStatus;
      is_pinned: boolean;
      is_locked: boolean;
    }> = await client.query(
      `select topic_id,category_id,author_id,status,is_pinned,is_locked
         from discussion_topics where topic_id=$1 for update`,
      [boundedId]
    );
    const row = topic.rows[0];
    if (!row) throw new AppError(404, 'DISCUSSION_TOPIC_001', 'Không tìm thấy chủ đề.');
    return {
      kind,
      targetId: boundedId,
      topicId: row.topic_id,
      topicStatus: row.status,
      authorId: row.author_id,
      topicRow: {
        topic_id: row.topic_id,
        category_id: row.category_id,
        is_pinned: row.is_pinned,
        is_locked: row.is_locked
      }
    };
  }
  const topic: QueryResult<{ topic_id: string; author_id: string }> = await client.query(
    `select t.topic_id,t.author_id
       from discussion_topics t
      where t.topic_id=(select topic_id from discussion_comments where comment_id=$1)
      for update`,
    [boundedId]
  );
  const topicRow = topic.rows[0];
  if (!topicRow) throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
  const comment: QueryResult<{ comment_id: string; topic_id: string; author_id: string; status: DiscussionStatus }> =
    await client.query(
      'select comment_id,topic_id,author_id,status from discussion_comments where comment_id=$1 for update',
      [boundedId]
    );
  const commentRow = comment.rows[0];
  if (!commentRow) throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
  if (expectedTopicId && commentRow.topic_id !== expectedTopicId)
    throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
  return {
    kind,
    targetId: boundedId,
    topicId: commentRow.topic_id,
    topicStatus: commentRow.status,
    authorId: commentRow.author_id,
    topicRow: null
  };
}

async function assertDiscussionSanctionAuthority(
  auth: AuthContext,
  client: PoolClient,
  permission: DiscussionOperationalPermission
) {
  await lockFreshActor(client, auth);
  if (auth.role === 'ADMIN') {
    await assertAdminPermission(auth, 'content', client);
    return;
  }
  assertModeratorOperational(auth, permission);
}

export async function assertDiscussionIndependence(
  auth: AuthContext,
  client: PoolClient,
  kind: DiscussionTargetKind,
  id: string
) {
  assertIndependentActor(auth.userId, await discussionInvolvedUserIds(kind, id, client));
}

export async function findActiveDiscussionSanction(
  client: PoolClient,
  kind: DiscussionTargetKind,
  id: string
) {
  return (
    await client.query(
      "select * from admin_sanctions where target_type=$1 and target_id=$2 and action='HIDE' and active limit 1",
      [kind, id]
    )
  ).rows[0] ?? null;
}

/**
 * Shared HIDE write path for forum targets, reached through applySanction from
 * both the report resolver and the direct moderation routes. One audit row, one
 * sanction, one effect update and one notification job commit together; a
 * target that is already hidden or deleted yields no second sanction.
 */
export async function applyDiscussionSanction(
  client: PoolClient,
  auth: AuthContext,
  input: {
    kind: DiscussionTargetKind;
    id: string;
    reason: string;
    reviewId?: string | null;
    permission: DiscussionOperationalPermission;
    expectedTopicId?: string;
    expectedStatus?: string;
  }
): Promise<DiscussionSanctionOutcome> {
  const reason = requiredReason(input.reason);
  await assertDiscussionSanctionAuthority(auth, client, input.permission);
  await advisoryDiscussionSanctionLock(client, input.kind, input.id);
  const target = await lockDiscussionSanctionTarget(client, input.kind, input.id, input.expectedTopicId);
  // Identity before content state: involved actors may not probe achieved or
  // deleted targets through either operational route.
  await assertDiscussionIndependence(auth, client, input.kind, input.id);
  const active = await findActiveDiscussionSanction(client, input.kind, input.id);
  if (target.topicStatus === 'DELETED')
    return {
      sanction: null,
      ownerId: target.authorId,
      topicId: target.topicId,
      status: 'DELETED',
      skipped: 'deleted',
      activeSanctionId: active?.sanction_id ?? null,
      activeAuditId: active?.audit_id ?? null,
      topicRow: target.topicRow
    };
  if (target.topicStatus === 'HIDDEN')
    return {
      sanction: null,
      ownerId: target.authorId,
      topicId: target.topicId,
      status: 'HIDDEN',
      skipped: 'achieved',
      activeSanctionId: active?.sanction_id ?? null,
      activeAuditId: active?.audit_id ?? null,
      topicRow: target.topicRow
    };
  if (active)
    throw new AppError(
      409,
      'ADMIN_SANCTION_ACTIVE',
      'Đối tượng đã bị hạn chế. Hãy xem quyết định trước đó.'
    );
  if (input.expectedStatus !== undefined && target.topicStatus !== input.expectedStatus) {
    throw new AppError(
      409,
      'DISCUSSION_STATE_CONFLICT',
      'Trạng thái chủ đề đã thay đổi so với giá trị bạn đang xem. Hãy tải lại.'
    );
  }
  const before = { status: target.topicStatus, topicId: target.topicId };
  const event = await audit(client, auth, {
    action: `${input.kind}_HIDE`,
    targetType: input.kind,
    targetId: input.id,
    affectedUserId: target.authorId,
    reason,
    before,
    after: { action: 'HIDE', status: 'HIDDEN', reviewId: input.reviewId ?? null }
  });
  const sanction = (
    await client.query(
      `insert into admin_sanctions(audit_id,review_id,target_type,target_id,owner_id,action,previous_state)
       values($1,$2,$3,$4,$5,'HIDE',$6) returning *`,
      [event, input.reviewId ?? null, input.kind, input.id, target.authorId, before]
    )
  ).rows[0];
  if (input.kind === 'DISCUSSION') {
    await client.query("update discussion_topics set status='HIDDEN' where topic_id=$1", [
      target.targetId
    ]);
  } else {
    await client.query(
      "update discussion_comments set status='HIDDEN', updated_at=now() where comment_id=$1",
      [target.targetId]
    );
  }
  await refreshTopicActivity(client, target.topicId);
  await queueAdminNotification(client, {
    userId: target.authorId,
    type: input.reviewId ? 'DISCUSSION_REMOVED_BY_REPORT' : 'DISCUSSION_CONTENT_HIDDEN',
    title: 'Nội dung thảo luận của bạn đã bị ẩn',
    content: reason,
    payload: {
      sanctionId: sanction.sanction_id,
      auditId: event,
      reviewId: input.reviewId ?? null,
      targetType: input.kind,
      targetId: input.id,
      topicId: target.topicId,
      adminId: auth.userId,
      reason,
      appealsUrl: appealsPath
    }
  });
  return {
    sanction,
    ownerId: target.authorId,
    topicId: target.topicId,
    status: 'HIDDEN',
    skipped: null,
    topicRow: target.topicRow
  };
}

/**
 * Reverts the stored snapshot of one forum sanction. Deleted content keeps its
 * status, and a target that already left HIDDEN is not overwritten.
 */
export async function revertDiscussionSanctionEffect(client: PoolClient, sanction: {
  target_type: string;
  target_id: string;
  previous_state?: { status?: DiscussionStatus } | null;
}) {
  const kind = discussionTargetKind(sanction.target_type);
  if (!kind) return;
  const target = await lockDiscussionSanctionTarget(client, kind, sanction.target_id);
  if (target.topicStatus === 'HIDDEN') {
    const status = sanction.previous_state?.status ?? 'VISIBLE';
    if (kind === 'DISCUSSION') {
      await client.query('update discussion_topics set status=$2 where topic_id=$1', [
        sanction.target_id,
        status
      ]);
    } else {
      await client.query(
        'update discussion_comments set status=$2, updated_at=now() where comment_id=$1',
        [sanction.target_id, status]
      );
    }
    await refreshTopicActivity(client, target.topicId);
  }
}

/**
 * Operational HIDE behind the moderator and legacy admin routes. Keeps the
 * route contract of a status patch: a deleted target is refused, an already
 * hidden target reports its current state without a second sanction.
 */
export async function moderateDiscussionHide(
  auth: AuthContext,
  client: PoolClient,
  input: {
    kind: DiscussionTargetKind;
    id: string;
    reason: string;
    permission: DiscussionOperationalPermission;
    expectedTopicId?: string;
    expectedStatus?: string;
  }
): Promise<DiscussionSanctionOutcome> {
  const outcome = await applyDiscussionSanction(client, auth, { ...input });
  if (outcome.skipped === 'deleted') throw deletedError(input.kind);
  return outcome;
}

/**
 * Restore path behind every operational route. The effective sanction is
 * required first; a legacy hide without a sanction only updates the status,
 * without inferring a snapshot. Self-reversal, appeals and deleted targets stay
 * blocked; the caller is responsible for calling drainAdminJobs after commit.
 */
export async function restoreDiscussionSanction(
  auth: AuthContext,
  client: PoolClient,
  input: {
    kind: DiscussionTargetKind;
    id: string;
    reason: string;
    permission: DiscussionOperationalPermission;
    expectedTopicId?: string;
    expectedStatus?: string;
  }
): Promise<{
  topicId: string;
  status: DiscussionStatus;
  mode: 'achieved' | 'legacy' | 'sanction';
  topicRow: LockedDiscussionTarget['topicRow'];
}> {
  const reason = requiredReason(input.reason);
  await assertDiscussionSanctionAuthority(auth, client, input.permission);
  await advisoryDiscussionSanctionLock(client, input.kind, input.id);
  // Lock order shared with restoreSanction (appeals path): advisory key, then
  // the sanction row, then the topic and comment rows.
  const candidate = await findActiveDiscussionSanction(client, input.kind, input.id);
  let active = null;
  if (candidate) {
    active = (
      await client.query('select * from admin_sanctions where sanction_id=$1 for update', [
        candidate.sanction_id
      ])
    ).rows[0];
    if (!active || active.active !== true) active = null;
  }
  const target = await lockDiscussionSanctionTarget(client, input.kind, input.id, input.expectedTopicId);
  // Identity before content state, ordered like applyDiscussionSanction.
  await assertDiscussionIndependence(auth, client, input.kind, input.id);
  if (target.topicStatus === 'DELETED') throw deletedError(input.kind);
  if (target.topicStatus === 'VISIBLE' && !active)
    return { topicId: target.topicId, status: 'VISIBLE', mode: 'achieved', topicRow: target.topicRow };
  if (input.expectedStatus !== undefined && target.topicStatus !== input.expectedStatus) {
    throw new AppError(
      409,
      'DISCUSSION_STATE_CONFLICT',
      'Trạng thái chủ đề đã thay đổi so với giá trị bạn đang xem. Hãy tải lại.'
    );
  }
  if (target.topicStatus !== 'HIDDEN')
    throw new AppError(
      409,
      'DISCUSSION_STATE_CONFLICT',
      'Nội dung không còn ở trạng thái đã ẩn. Hãy tải lại.'
    );
  if (active) {
    await assertNoOpenAppeal(client, active.sanction_id);
    await assertNotOriginalDecider(client, auth, active.sanction_id);
    await revertDiscussionSanctionEffect(client, active);
    await client.query(
      'update admin_sanctions set active=false,restored_at=now(),restored_by=$2 where sanction_id=$1',
      [active.sanction_id, auth.userId]
    );
    await audit(client, auth, {
      action: 'SANCTION_RESTORED',
      targetType: input.kind,
      targetId: input.id,
      affectedUserId: active.owner_id,
      reason,
      before: active,
      after: { active: false, status: active.previous_state?.status ?? 'VISIBLE' }
    });
    return {
      topicId: target.topicId,
      status: active.previous_state?.status ?? 'VISIBLE',
      mode: 'sanction',
      topicRow: target.topicRow
    };
  }
  // Legacy audit-only hide: no sanctioned snapshot exists, so the operator
  // chooses the replacement status directly instead of restoring a snapshot.
  if (input.kind === 'DISCUSSION') {
    await client.query('update discussion_topics set status=$2 where topic_id=$1', [
      input.id,
      'VISIBLE'
    ]);
  } else {
    await client.query('update discussion_comments set status=$2, updated_at=now() where comment_id=$1', [
      input.id,
      'VISIBLE'
    ]);
  }
  await refreshTopicActivity(client, target.topicId);
  await audit(client, auth, {
    action: input.kind === 'DISCUSSION' ? 'DISCUSSION_TOPIC_MODERATE' : 'DISCUSSION_COMMENT_MODERATE',
    targetType: input.kind,
    targetId: input.id,
    affectedUserId: target.authorId,
    reason,
    before: { status: 'HIDDEN', topicId: target.topicId },
    after: { status: 'VISIBLE', topicId: target.topicId }
  });
  return { topicId: target.topicId, status: 'VISIBLE', mode: 'legacy', topicRow: target.topicRow };
}
