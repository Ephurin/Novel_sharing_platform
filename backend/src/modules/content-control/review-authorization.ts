import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  assertIndependentActor,
  type ModeratorPermission
} from '../../core/security/moderation-policy.js';
import { assertAdminPermission, lockAdminAccess } from '../admin/admin-access.js';
import { lockFreshActor } from '../../core/security/transactional-identity.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { findCommentRecordById } from '../interactions/comments.repository.js';
import { discussionInvolvedUserIds, isDiscussionTarget } from '../discussions/discussions.admin.js';

export type ResolvedReviewRow = {
  review_id: string;
  target_type: string;
  target_id: string;
  source: string;
  status: string;
};

export function reviewPermissionFor(review: { source: string; target_type: string }): ModeratorPermission {
  if (review.source === 'USER_REPORT') return 'report.review';
  return review.target_type === 'COMMENT' ? 'comment.review' : 'publication.review';
}

// Admins keep the legacy entitlement gate; Moderators take the operational permission of the review variant.
export async function assertResolverAccess(
  auth: AuthContext,
  review: { source: string; target_type: string },
  client?: PoolClient
): Promise<'ADMIN' | 'MODERATOR'> {
  if (auth.role === 'ADMIN') {
    await assertAdminPermission(auth, 'content', client);
    return 'ADMIN';
  }
  if (auth.role === 'MODERATOR') {
    assertModeratorOperational(auth, reviewPermissionFor(review));
    return 'MODERATOR';
  }
  throw new AppError(403, 'AUTH_008', 'Chỉ quản trị hoặc điều hành viên xử lý hồ sơ này.');
}

// Account sanctions share the access-management lock. Take it before the
// actor or review lock, even when the eventual report decision is a dismissal.
export async function lockReportDecisionActor(client: PoolClient, auth: AuthContext, reviewId: string) {
  const { rows: [review] } = await client.query<{ target_type: string }>(
    "select target_type from moderation_reviews where review_id=$1 and source='USER_REPORT'", [reviewId]
  );
  if (!review) throw new AppError(404, 'ADMIN_001', 'Không tìm thấy báo cáo.');
  if (review.target_type === 'USER') await lockAdminAccess(client);
  await lockFreshActor(client, auth);
}

// Subjects trace back to the owning author: comment novel, chapter novel, forum target author.
// An unresolvable target stops the decision for reconciliation instead of resolving silently.
export async function reviewInvolvedUserIds(
  review: { target_type: string; target_id: string },
  client?: PoolClient
): Promise<string[]> {
  const query = (text: string, params: unknown[]) =>
    (client ?? getPostgresPool()).query(text, params);
  const assertResolvable = (userIds: string[]) => {
    if (!userIds.length) {
      throw new AppError(
        422,
        'MOD_SUBJECT_UNRESOLVED',
        'Không xác định được chủ thể hồ sơ. Hãy đối soát trước khi xử lý.'
      );
    }
    return userIds;
  };
  if (review.target_type === 'NOVEL') {
    const result = await query('select author_id from novels where novel_id=$1', [review.target_id]);
    return assertResolvable(result.rows[0] ? [result.rows[0].author_id] : []);
  }
  if (review.target_type === 'CHAPTER') {
    const result = await query(
      'select n.author_id from chapters c join novels n on n.novel_id=c.novel_id where c.chapter_id=$1',
      [review.target_id]
    );
    return assertResolvable(result.rows[0] ? [result.rows[0].author_id] : []);
  }
  if (review.target_type === 'COMMENT') {
    const comment = await findCommentRecordById(review.target_id);
    if (!comment) return assertResolvable([]);
    const novel = await query('select author_id from novels where novel_id=$1', [comment.novelId]);
    return assertResolvable(novel.rows[0] ? [comment.userId, novel.rows[0].author_id] : []);
  }
  if (review.target_type === 'USER') return [review.target_id];
  if (isDiscussionTarget(review.target_type)) {
    return assertResolvable(await discussionInvolvedUserIds(review.target_type, review.target_id, client));
  }
  return assertResolvable([]);
}

export async function assertIndependentResolver(
  auth: AuthContext,
  review: { target_type: string; target_id: string; source: string },
  client: PoolClient
) {
  assertIndependentActor(auth.userId, await reviewInvolvedUserIds(review, client));
}

// Executable moderator actions need their sanction permission. LOCK and privileged targets go to Admin.
export async function assertReportModeratorConstraints(
  auth: AuthContext,
  client: PoolClient,
  review: { target_type: string; target_id: string },
  input: { accepted: boolean; action: string }
) {
  if (review.target_type === 'USER') {
    const subject = (await client.query('select role from users where user_id=$1', [review.target_id])).rows[0];
    if (subject && (subject.role === 'ADMIN' || subject.role === 'MODERATOR')) {
      throw new AppError(
        403,
        'MOD_PRIVILEGED_TARGET',
        'Báo cáo nhắm tài khoản đặc quyền phải được chuyển cấp cho Admin.'
      );
    }
  }
  if (!input.accepted) return;
  const actionPermission: ModeratorPermission | null =
    input.action === 'WARN' ? 'sanction.warn' : input.action === 'HIDE' ? 'sanction.hide' : null;
  if (!actionPermission) {
    throw new AppError(403, 'MOD_LOCK_ADMIN', 'Chỉ quản trị được khóa tài khoản. Hãy chuyển hồ sơ lên Admin.');
  }
  assertModeratorOperational(auth, actionPermission);
}
