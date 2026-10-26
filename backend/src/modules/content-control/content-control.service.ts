import type { PoolClient } from 'pg';
import { getAdminReviewTarget } from './admin-target.repository.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import type {
  ContentControlCheckInput,
  CreateReportInput,
  ListReviewsInput,
  ResolveReviewInput
} from './content-control.schemas.js';
import {
  countReportsForReview,
  createModerationReview,
  createReport as createReportRow,
  findOpenReview,
  findReviewById,
  listActiveFilterRules,
  listReviews as listReviewRows,
  listReportsForReview,
  findOpenReportByReporter,
  resolveReportsForReview,
  resolveReview as resolveReviewRow
} from './content-control.repository.js';
import {
  createModerationEvidence,
  findModerationEvidence
} from './moderation-evidence.repository.js';
import type {
  MatchedRule,
  ModerationStatus,
  ModerationTargetType
} from './content-control.types.js';
import {
  findCommentById,
  findCommentRecordById,
  softDeleteComment,
  updateCommentModerationStatus,
  type CommentStatus
} from '../interactions/comments.repository.js';
import { findReadableChapter } from '../reading/reading.repository.js';
import { createNotification } from '../interactions/notifications.repository.js';
import { publishNovel, rejectNovelPublication } from '../novels/novels.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import {
  findChapterById,
  publishChapter,
  rejectChapterPublication
} from '../novels/chapters.repository.js';
import { findDraftChapterByChapterId } from '../novels/draft-chapters.repository.js';

function scanContent(content: string, rules: MatchedRule[]) {
  const normalizedContent = content.toLowerCase();
  return rules.filter((rule) => normalizedContent.includes(rule.pattern.toLowerCase()));
}

function highestSeverity(rules: MatchedRule[]) {
  if (rules.some((rule) => rule.severity === 'HIGH')) {
    return 'HIGH';
  }

  if (rules.some((rule) => rule.severity === 'MEDIUM')) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export async function checkContent(
  input: ContentControlCheckInput & {
    publicationSnapshot?: { title: string; content: string; wordCount: number };
  },
  client?: PoolClient
) {
  const rules = await listActiveFilterRules(client);
  const matchedRules = scanContent(input.content, rules);

  if (!matchedRules.length) {
    return {
      result: 'PASS',
      moderationRequired: false,
      moderationReviewId: null
    } as const;
  }

  const existingReview = await findOpenReview(
    input.targetType,
    input.targetId,
    client,
    'KEYWORD_FILTER'
  );
  if (existingReview) {
    if (input.publicationSnapshot && !existingReview.submitted_content) {
      const attached = await (client ?? getPostgresPool()).query(
        "update moderation_reviews set submitted_content=coalesce(submitted_content,$2::jsonb) where review_id=$1 and status='PENDING' returning submitted_content",
        [existingReview.review_id, input.publicationSnapshot]
      );
      if (!attached.rowCount)
        throw new AppError(409, 'CONTENT_REVIEW_STALE', 'Kết quả duyệt đã thay đổi, hãy gửi lại');
      existingReview.submitted_content = attached.rows[0].submitted_content;
    }
    if (
      input.publicationSnapshot &&
      existingReview.submitted_content &&
      JSON.stringify(existingReview.submitted_content) !== JSON.stringify(input.publicationSnapshot)
    ) {
      const snapshot = existingReview.submitted_content;
      if (
        snapshot.title !== input.publicationSnapshot.title ||
        snapshot.content !== input.publicationSnapshot.content
      )
        throw new AppError(
          409,
          'CONTENT_REVIEW_PENDING',
          'Phiên bản trước đang chờ duyệt. Hãy chờ kết quả trước khi gửi phiên bản mới.'
        );
    }
    return {
      result: 'NEED_ADMIN_REVIEW',
      moderationRequired: true,
      moderationReviewId: existingReview.review_id as string
    } as const;
  }

  const evidenceId = await createModerationEvidence(
    {
      targetType: input.targetType,
      targetId: input.targetId,
      riskLevel: highestSeverity(matchedRules),
      source: 'KEYWORD_FILTER',
      matchedRules,
      summary: `${matchedRules.length} content filter rule(s) matched.`
    },
    client
  );

  const review = await createModerationReview(
    {
      targetType: input.targetType,
      targetId: input.targetId,
      source: 'KEYWORD_FILTER',
      evidenceId,
      submittedContent: input.publicationSnapshot
    },
    client
  );

  return {
    result: 'NEED_ADMIN_REVIEW',
    moderationRequired: true,
    moderationReviewId: review.review_id as string
  } as const;
}

export async function createUserReport(auth: AuthContext, input: CreateReportInput) {
  if (input.targetType === 'COMMENT') {
    const comment = await findCommentRecordById(input.targetId);
    if (!comment) {
      throw new AppError(404, 'CONTENT_001', 'Comment not found');
    }
    if (comment.deletedAt !== null || comment.status !== 'APPROVED') {
      throw new AppError(404, 'CONTENT_001', 'Comment not found');
    }
    if (comment.chapterId) {
      if (!(await findReadableChapter(comment.chapterId))) {
        throw new AppError(404, 'CONTENT_001', 'Content not found');
      }
    } else {
      const novel = await findNovelById(comment.novelId);
      if (!novel || novel.status !== 'PUBLISHED') {
        throw new AppError(404, 'CONTENT_001', 'Content not found');
      }
    }
  }

  try {
    return await withPostgresTransaction(async (client) => {
      const existingOpenReport = await findOpenReportByReporter(
        auth.userId,
        input.targetType,
        input.targetId,
        client
      );
      if (existingOpenReport) {
        throw new AppError(409, 'REPORT_001', 'An open report already exists for this content');
      }

      const existingReview = await findOpenReview(
        input.targetType,
        input.targetId,
        client,
        'USER_REPORT'
      );
      const review =
        existingReview ??
        (await createModerationReview(
          {
            targetType: input.targetType,
            targetId: input.targetId,
            source: 'USER_REPORT'
          },
          client
        ));

      const report = await createReportRow(
        {
          ...input,
          reporterId: auth.userId,
          reviewId: review.review_id
        },
        client
      );

      return {
        reportId: report.report_id,
        moderationReviewId: review.review_id,
        status: 'PENDING'
      };
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error?.code === '23505') {
      throw new AppError(409, 'REPORT_001', 'An open report already exists for this content');
    }
    throw error;
  }
}

export async function listModerationReviews(input: ListReviewsInput) {
  const result = await listReviewRows(input);

  return {
    data: result.items.map((row) => ({
      reviewId: row.review_id,
      targetType: row.target_type,
      targetId: row.target_id,
      source: row.source,
      status: row.status,
      evidenceId: row.evidence_id,
      reportCount: row.report_count,
      createdAt: row.created_at
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / input.limit)
    }
  };
}

export async function getModerationReview(reviewId: string) {
  const review = await findReviewById(reviewId);

  if (!review) {
    throw new AppError(404, 'ADMIN_001', 'Review item not found');
  }

  const [evidence, reportCount, reports, target] = await Promise.all([
    findModerationEvidence(review.evidence_id),
    countReportsForReview(reviewId),
    listReportsForReview(reviewId),
    getAdminReviewTarget(review.target_type, review.target_id)
  ]);
  const reasonCounts = new Map<string, number>();
  for (const report of reports) {
    reasonCounts.set(report.reason, (reasonCounts.get(report.reason) ?? 0) + 1);
  }

  return {
    reviewId: review.review_id,
    targetType: review.target_type,
    targetId: review.target_id,
    status: review.status,
    source: review.source,
    createdAt: review.created_at,
    reason: review.reason,
    reviewedAt: review.reviewed_at,
    target: review.submitted_content
      ? {
          ...target,
          title: review.submitted_content.title,
          content: review.submitted_content.content,
          isSubmittedVersion: true
        }
      : target,
    reportReasons: Array.from(reasonCounts, ([reason, count]) => ({ reason, count })),
    evidenceSummary: {
      matchedRules: evidence?.matchedRules ?? [],
      reportCount,
      summary: evidence?.summary ?? null
    }
  };
}

export async function resolveModerationReview(
  auth: AuthContext,
  reviewId: string,
  input: ResolveReviewInput
) {
  const review = await findReviewById(reviewId);

  if (!review) {
    throw new AppError(404, 'ADMIN_001', 'Review item not found');
  }

  if (review.status !== 'PENDING') {
    throw new AppError(409, 'ADMIN_002', 'Review item already resolved');
  }

  if (input.decision === 'REJECTED' && !input.reason) {
    throw new AppError(422, 'ADMIN_003', 'Rejection reason required');
  }

  if (
    review.target_type === 'CHAPTER' &&
    review.source === 'KEYWORD_FILTER' &&
    input.decision === 'APPROVED'
  ) {
    const chapter = await findChapterById(review.target_id);
    if (!chapter || chapter.status !== 'PENDING_MODERATION')
      throw new AppError(
        409,
        'CONTENT_REVIEW_STALE',
        'Chương không còn chờ duyệt; không thể phát hành phiên bản cũ'
      );
  }
  const resolved = await resolveReviewRow({
    reviewId,
    status: input.decision as ModerationStatus,
    reviewedBy: auth.userId,
    reason: input.reason
  });

  if (!resolved) {
    throw new AppError(409, 'MODERATION_002', 'Invalid moderation transition');
  }

  if (resolved.target_type === 'COMMENT') {
    if (resolved.source === 'USER_REPORT') {
      await resolveCommentUserReport(auth, resolved, input.reason);
    } else {
      const commentStatus: CommentStatus = resolved.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      await updateCommentModerationStatus(
        resolved.target_id,
        commentStatus,
        resolved.review_id,
        resolved.review_id
      );
    }
  }

  if (resolved.target_type === 'NOVEL') {
    if (resolved.status === 'APPROVED') {
      await publishNovel(resolved.target_id);
    } else {
      await rejectNovelPublication(resolved.target_id);
    }
  }

  if (resolved.target_type === 'CHAPTER') {
    if (resolved.status === 'APPROVED') {
      const chapter = await findChapterById(resolved.target_id);
      if (!chapter) {
        throw new AppError(404, 'CONTENT_001', 'Content not found');
      }

      const draft = await findDraftChapterByChapterId(resolved.target_id);
      const content = resolved.submitted_content?.content ?? draft?.content ?? chapter.content;

      if (!content) {
        throw new AppError(409, 'CONTENT_004', 'Invalid content state');
      }

      await publishChapter(resolved.target_id, {
        title: resolved.submitted_content?.title ?? draft?.title ?? chapter.title,
        content,
        wordCount: resolved.submitted_content?.wordCount ?? draft?.wordCount ?? chapter.wordCount
      });
    } else {
      await rejectChapterPublication(resolved.target_id);
    }
  }

  if (resolved.target_type === 'CHAPTER')
    await getPostgresPool().query(
      "update chapter_publication_schedules set status=$2,error=$3,updated_at=now() where moderation_review_id=$1 and status='PENDING_MODERATION'",
      [
        resolved.review_id,
        resolved.status === 'APPROVED' ? 'PUBLISHED' : 'FAILED',
        resolved.status === 'APPROVED' ? null : (input.reason ?? 'Nội dung không được duyệt')
      ]
    );
  return {
    reviewId: resolved.review_id,
    status: resolved.status,
    targetType: resolved.target_type as ModerationTargetType,
    targetId: resolved.target_id
  };
}

async function resolveCommentUserReport(
  auth: AuthContext,
  resolved: {
    review_id: string;
    target_id: string;
    status: ModerationStatus;
  },
  reason?: string
) {
  const comment = await findCommentById(resolved.target_id);
  const reports = await listReportsForReview(resolved.review_id);
  const reportAccepted = resolved.status === 'APPROVED';
  const reportStatus = reportAccepted ? 'RESOLVED' : 'REJECTED';
  const resolution =
    reason ??
    (reportAccepted ? 'Comment report approved by Admin.' : 'Comment report rejected by Admin.');

  await resolveReportsForReview({
    reviewId: resolved.review_id,
    resolvedBy: auth.userId,
    status: reportStatus,
    resolution
  });

  if (reportAccepted && comment) {
    await softDeleteComment(resolved.target_id);
  }

  if (comment) {
    await createNotification({
      userId: comment.userId,
      type: reportAccepted ? 'COMMENT_REMOVED_BY_REPORT' : 'COMMENT_REPORT_REJECTED_OWNER',
      title: reportAccepted ? 'Bình luận của bạn đã bị gỡ' : 'Báo cáo bình luận đã bị từ chối',
      content: reportAccepted
        ? `Bình luận của bạn đã bị gỡ sau khi Admin duyệt báo cáo.${reason ? ` Lý do: ${reason}` : ''}`
        : `Admin đã từ chối báo cáo đối với bình luận của bạn. Bình luận được giữ nguyên.${reason ? ` Lý do: ${reason}` : ''}`,
      payload: {
        reviewId: resolved.review_id,
        commentId: resolved.target_id,
        chapterId: comment.chapterId,
        novelId: comment.novelId,
        decision: resolved.status,
        adminId: auth.userId,
        reason: reason ?? null
      }
    });
  }

  const notifiedUserIds = new Set(comment ? [comment.userId] : []);
  for (const report of reports) {
    const reporterId = report.reporter_id as string;
    if (notifiedUserIds.has(reporterId)) {
      continue;
    }

    notifiedUserIds.add(reporterId);
    await createNotification({
      userId: reporterId,
      type: reportAccepted ? 'COMMENT_REPORT_APPROVED' : 'COMMENT_REPORT_REJECTED',
      title: reportAccepted ? 'Báo cáo bình luận đã được duyệt' : 'Báo cáo bình luận đã bị từ chối',
      content: reportAccepted
        ? `Admin đã duyệt báo cáo của bạn và gỡ bình luận vi phạm.${reason ? ` Lý do: ${reason}` : ''}`
        : `Admin đã từ chối báo cáo của bạn. Bình luận được giữ nguyên.${reason ? ` Lý do: ${reason}` : ''}`,
      payload: {
        reviewId: resolved.review_id,
        reportId: report.report_id,
        commentId: resolved.target_id,
        decision: resolved.status,
        adminId: auth.userId,
        reason: reason ?? null
      }
    });
  }
}
