import type { AuthContext } from '../../core/security/auth-context.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertAdminPermission, audit, requiredReason } from '../admin/admin-access.js';
import { applySanction } from '../admin/admin-sanctions.js';
import { drainAdminJobs, queueAdminNotification } from '../admin/admin-jobs.js';
import { findCommentRecordById } from '../interactions/comments.repository.js';
import type { ResolveReviewInput } from './content-control.schemas.js';

// User reports address violations. They must never publish/reject publication snapshots.
export async function resolveUserReport(
  auth: AuthContext,
  reviewId: string,
  input: ResolveReviewInput
) {
  const result = await withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'content', client);
    const review = (
      await client.query('select * from moderation_reviews where review_id=$1 for update', [
        reviewId
      ])
    ).rows[0];
    if (!review || review.source !== 'USER_REPORT')
      throw new AppError(404, 'ADMIN_001', 'Không tìm thấy báo cáo.');
    if (review.status !== 'PENDING') throw new AppError(409, 'ADMIN_002', 'Báo cáo đã được xử lý.');
    if (input.decision === 'REVISION_REQUIRED')
      throw new AppError(422, 'REPORT_DECISION', 'Chọn tiếp nhận hoặc bác báo cáo.');
    const accepted = input.decision === 'APPROVED';
    const action = accepted
      ? (input.action ?? (review.target_type === 'COMMENT' ? 'HIDE' : 'WARN'))
      : 'DISMISS';
    const allowed = review.target_type === 'USER' ? ['WARN', 'LOCK'] : ['WARN', 'HIDE'];
    if (accepted && !allowed.includes(action))
      throw new AppError(422, 'REPORT_ACTION', 'Hành động không phù hợp với đối tượng.');
    const reason = requiredReason(input.reason);
    const comment =
      review.target_type === 'COMMENT' ? await findCommentRecordById(review.target_id) : null;
    const reports = (
      await client.query('select * from reports where review_id=$1 order by created_at', [reviewId])
    ).rows;
    const sanction = accepted
      ? await applySanction(client, auth, {
          targetType: review.target_type,
          targetId: review.target_id,
          action: action as 'WARN' | 'HIDE' | 'LOCK',
          reason,
          reviewId
        })
      : null;
    await client.query(
      'update moderation_reviews set status=$2,reason=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now(),notification_pending=false where review_id=$1',
      [reviewId, input.decision, reason, auth.userId]
    );
    await client.query(
      "update reports set status=$2,resolution=$3,resolved_by=$4,resolved_at=now(),updated_at=now() where review_id=$1 and status='OPEN'",
      [reviewId, accepted ? 'RESOLVED' : 'REJECTED', reason, auth.userId]
    );
    await audit(client, auth, {
      action: `REPORT_${accepted ? 'ACCEPTED' : 'DISMISSED'}`,
      targetType: review.target_type,
      targetId: review.target_id,
      affectedUserId: sanction?.owner_id,
      reason,
      before: { status: 'PENDING', reviewId },
      after: { status: input.decision, action }
    });
    if (comment)
      await queueAdminNotification(client, {
        userId: comment.userId,
        type:
          accepted && action === 'HIDE'
            ? 'COMMENT_REMOVED_BY_REPORT'
            : accepted
              ? 'COMMENT_WARNING_BY_REPORT'
              : 'COMMENT_REPORT_REJECTED_OWNER',
        title: accepted
          ? action === 'HIDE'
            ? 'Bình luận của bạn đã bị gỡ'
            : 'Cảnh báo về bình luận'
          : 'Báo cáo bình luận đã bị từ chối',
        content: reason,
        payload: {
          reviewId,
          commentId: review.target_id,
          chapterId: comment.chapterId,
          novelId: comment.novelId,
          decision: input.decision,
          adminId: auth.userId,
          reason
        }
      });
    const notified = new Set<string>(comment ? [comment.userId] : []);
    for (const report of reports) {
      if (notified.has(report.reporter_id)) continue;
      notified.add(report.reporter_id);
      await queueAdminNotification(client, {
        userId: report.reporter_id,
        type:
          review.target_type === 'COMMENT'
            ? accepted
              ? 'COMMENT_REPORT_APPROVED'
              : 'COMMENT_REPORT_REJECTED'
            : 'REPORT_RESOLVED',
        title: accepted ? 'Báo cáo đã được tiếp nhận' : 'Báo cáo đã được bác',
        content: reason,
        payload: {
          reviewId,
          reportId: report.report_id,
          commentId: comment ? review.target_id : undefined,
          targetType: review.target_type,
          targetId: review.target_id,
          decision: input.decision,
          action,
          adminId: auth.userId,
          reason
        }
      });
    }
    return {
      reviewId,
      status: input.decision,
      targetType: review.target_type,
      targetId: review.target_id,
      action
    };
  });
  // SQL decision + jobs are committed together; Mongo effects retry safely after failure/restart.
  await drainAdminJobs();
  return result;
}
