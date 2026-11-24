import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  assertIndependentActor,
  type ModeratorPermission
} from '../../core/security/moderation-policy.js';
import { assertAdminPermission } from '../admin/admin-access.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { findCommentRecordById } from '../interactions/comments.repository.js';
import {
  getDiscussionReviewTarget,
  isDiscussionTarget
} from '../discussions/discussions.admin.js';

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

// Subjects trace back to the owning author: comment novel, chapter novel, forum target author.
export async function reviewInvolvedUserIds(
  review: { target_type: string; target_id: string },
  client?: PoolClient
): Promise<string[]> {
  const query = (text: string, params: unknown[]) =>
    (client ?? getPostgresPool()).query(text, params);
  if (review.target_type === 'NOVEL') {
    const result = await query('select author_id from novels where novel_id=$1', [review.target_id]);
    return result.rows[0] ? [result.rows[0].author_id] : [];
  }
  if (review.target_type === 'CHAPTER') {
    const result = await query(
      'select n.author_id from chapters c join novels n on n.novel_id=c.novel_id where c.chapter_id=$1',
      [review.target_id]
    );
    return result.rows[0] ? [result.rows[0].author_id] : [];
  }
  if (review.target_type === 'COMMENT') {
    const comment = await findCommentRecordById(review.target_id);
    if (!comment) return [];
    const novel = await query('select author_id from novels where novel_id=$1', [comment.novelId]);
    return [comment.userId, ...(novel.rows[0] ? [novel.rows[0].author_id] : [])];
  }
  if (review.target_type === 'USER') return [review.target_id];
  if (isDiscussionTarget(review.target_type)) {
    const target = await getDiscussionReviewTarget(review.target_type, review.target_id);
    return [target.authorId];
  }
  return [];
}

// Operational commands re-verify role and access version under the decision lock,
// so a role that changed after the request started cannot finish its own decision.
export function assertFreshIdentityUnderLock(auth: AuthContext, row: { role: string; access_version: number | string } | undefined) {
  if (!row || row.role !== auth.role || Number(row.access_version) !== (auth.accessVersion ?? 0)) {
    throw new AppError(401, 'AUTH_009', 'Phiên đã đổi quyền trong lúc thao tác. Hãy đăng nhập lại.');
  }
}

// An independent Moderator decides every operational case; Admin supervision stays on the legacy contract.
export async function assertIndependentResolver(
  auth: AuthContext,
  review: { target_type: string; target_id: string; source: string },
  client?: PoolClient
) {
  if (auth.role !== 'MODERATOR') return;
  assertIndependentActor(auth.userId, await reviewInvolvedUserIds(review, client));
}

// Report-specific moderator limits: reporters never decide their own report,
// executable actions need their sanction permission, LOCK and privileged targets go to Admin.
export async function assertReportModeratorConstraints(
  auth: AuthContext,
  client: PoolClient,
  review: { target_type: string; target_id: string },
  input: { accepted: boolean; action: string; reporters: Array<{ reporter_id: string }> }
) {
  assertIndependentActor(auth.userId, input.reporters.map((report) => report.reporter_id));
  if (!input.accepted) return;
  const actionPermission: ModeratorPermission | null =
    input.action === 'WARN' ? 'sanction.warn' : input.action === 'HIDE' ? 'sanction.hide' : null;
  if (!actionPermission) {
    throw new AppError(403, 'MOD_LOCK_ADMIN', 'Chỉ quản trị được khóa tài khoản. Hãy chuyển hồ sơ lên Admin.');
  }
  assertModeratorOperational(auth, actionPermission);
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
}
