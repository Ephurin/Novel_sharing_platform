import { AppError } from '../../core/errors/app-error.js';
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
  resolveReview as resolveReviewRow
} from './content-control.repository.js';
import { createModerationEvidence, findModerationEvidence } from './moderation-evidence.repository.js';
import type { MatchedRule, ModerationStatus, ModerationTargetType } from './content-control.types.js';
import { updateCommentModerationStatus, type CommentStatus } from '../interactions/comments.repository.js';
import { publishNovel, rejectNovelPublication } from '../novels/novels.repository.js';
import { findChapterById, publishChapter, rejectChapterPublication } from '../novels/chapters.repository.js';
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

export async function checkContent(input: ContentControlCheckInput) {
  const rules = await listActiveFilterRules();
  const matchedRules = scanContent(input.content, rules);

  if (!matchedRules.length) {
    return {
      result: 'PASS',
      moderationRequired: false,
      moderationReviewId: null
    } as const;
  }

  const existingReview = await findOpenReview(input.targetType, input.targetId);
  if (existingReview) {
    return {
      result: 'NEED_ADMIN_REVIEW',
      moderationRequired: true,
      moderationReviewId: existingReview.review_id as string
    } as const;
  }

  const evidenceId = await createModerationEvidence({
    targetType: input.targetType,
    targetId: input.targetId,
    riskLevel: highestSeverity(matchedRules),
    source: 'KEYWORD_FILTER',
    matchedRules,
    summary: `${matchedRules.length} content filter rule(s) matched.`
  });

  const review = await createModerationReview({
    targetType: input.targetType,
    targetId: input.targetId,
    source: 'KEYWORD_FILTER',
    evidenceId
  });

  return {
    result: 'NEED_ADMIN_REVIEW',
    moderationRequired: true,
    moderationReviewId: review.review_id as string
  } as const;
}

export async function createUserReport(auth: AuthContext, input: CreateReportInput) {
  const existingReview = await findOpenReview(input.targetType, input.targetId);
  const review =
    existingReview ??
    (await createModerationReview({
      targetType: input.targetType,
      targetId: input.targetId,
      source: 'USER_REPORT'
    }));

  const report = await createReportRow({
    ...input,
    reporterId: auth.userId,
    reviewId: review.review_id
  });

  return {
    reportId: report.report_id,
    moderationReviewId: review.review_id,
    status: 'PENDING'
  };
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

  const [evidence, reportCount] = await Promise.all([
    findModerationEvidence(review.evidence_id),
    countReportsForReview(reviewId)
  ]);

  return {
    reviewId: review.review_id,
    targetType: review.target_type,
    targetId: review.target_id,
    status: review.status,
    source: review.source,
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
    const commentStatus: CommentStatus = resolved.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await updateCommentModerationStatus(resolved.target_id, commentStatus, resolved.review_id);
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
      const content = draft?.content ?? chapter.content;

      if (!content) {
        throw new AppError(409, 'CONTENT_004', 'Invalid content state');
      }

      await publishChapter(resolved.target_id, {
        title: draft?.title ?? chapter.title,
        content,
        wordCount: draft?.wordCount ?? chapter.wordCount
      });
    } else {
      await rejectChapterPublication(resolved.target_id);
    }
  }

  return {
    reviewId: resolved.review_id,
    status: resolved.status,
    targetType: resolved.target_type as ModerationTargetType,
    targetId: resolved.target_id
  };
}
