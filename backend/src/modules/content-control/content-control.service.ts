import { authorizeComment, privateComment } from '../interactions/comment-privacy.js';
import { assertAdminPermission, audit } from '../admin/admin-access.js';
import { resolveUserReport } from './report-resolution.js';
import {
  assertFreshIdentityUnderLock,
  assertIndependentResolver,
  assertResolverAccess,
  reviewInvolvedUserIds,
  reviewPermissionFor
} from './review-authorization.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import type { PoolClient } from 'pg';
import { getAdminReviewTarget } from './admin-target.repository.js';
import { assertDiscussionReportable, isDiscussionTarget } from '../discussions/discussions.admin.js';
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
  resolveReview as resolveReviewRow,
  type ResolvedModerationReview
} from './content-control.repository.js';
import {
  createModerationEvidence,
  findModerationEvidence
} from './moderation-evidence.repository.js';
import type {
  ContentControlResult,
  MatchedRule,
  ModerationSnapshot
} from './content-control.types.js';
import {
  findCommentRecordById,
  updateCommentModerationStatus,
  withCommentWriteLock,
  type CommentStatus
} from '../interactions/comments.repository.js';
import { findReadableChapter } from '../reading/reading.repository.js';
import { findNovelById, publishNovel, rejectNovelPublication } from '../novels/novels.repository.js';
import { assertNovelReadyForPublication } from '../novels/novel-publication-eligibility.js';
import {
  findChapterById,
  publishChapter,
  rejectChapterPublication
} from '../novels/chapters.repository.js';
import { findDraftChapterByChapterId } from '../novels/draft-chapters.repository.js';
import { notifyFollowersOfPublishedChapter } from '../interactions/new-chapter-notifications.js';
import { validateGiphyGif } from '../media/giphy.service.js';
import { blockingRules, builtInFilterRules, highestSeverity, scanContent } from './content-filter.js';

const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

async function listOwnerViolations(review: { target_type: string; target_id: string }) {
  // Read-only supporting panel: a failed lookup must not break the detail view,
  // but it stays visible in logs so an empty panel is never mistaken for clean data.
  const involved = await reviewInvolvedUserIds(review).catch((error) => {
    console.error('moderation: owner violation history unavailable', error);
    return [] as string[];
  });
  if (!involved.length) return [];
  const violations = await getPostgresPool().query(
    `select s.sanction_id, s.action, s.active, s.created_at, a.reason
       from admin_sanctions s join admin_audit a using(audit_id)
      where s.owner_id = any($1::uuid[])
      order by s.created_at desc
      limit 10`,
    [involved]
  );
  return violations.rows;
}

export async function checkContent(
  input: ContentControlCheckInput & {
    publicationSnapshot?: ModerationSnapshot;
    forceReview?: boolean;
    publicationRequest?: boolean;
  },
  client?: PoolClient
): Promise<ContentControlResult> {
  const publicationTarget = input.targetType === 'NOVEL' || input.targetType === 'CHAPTER';
  // The standalone admin check shares the same target lock as author submission.
  if (!client && publicationTarget && uuidPattern.test(input.targetId)) {
    return withPostgresTransaction(async transaction => {
      await transaction.query(input.targetType === 'NOVEL'
        ? 'select novel_id from novels where novel_id=$1 for update'
        : 'select chapter_id from chapters where chapter_id=$1 for update', [input.targetId]);
      return checkContent(input, transaction);
    });
  }

  const rules = [...(await listActiveFilterRules(client)), ...builtInFilterRules];
  const matchedRules = scanContent(input.content, rules);
  const blocking = blockingRules(matchedRules);

  if (!blocking.length && !input.forceReview && !input.publicationRequest) {
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
    publicationTarget ? ['KEYWORD_FILTER', 'PUBLICATION_REQUEST']
      : ['KEYWORD_FILTER']
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
    const snapshot = existingReview.submitted_content;
    if (input.publicationSnapshot && snapshot &&
        (snapshot.title !== input.publicationSnapshot.title || snapshot.content !== input.publicationSnapshot.content)) {
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

  const source = input.publicationRequest && !blocking.length ? 'PUBLICATION_REQUEST' : 'KEYWORD_FILTER';
  const evidenceId = await createModerationEvidence(
    {
      targetType: input.targetType,
      targetId: input.targetId,
      riskLevel: highestSeverity(matchedRules),
      source,
      matchedRules,
      summary: source === 'PUBLICATION_REQUEST'
        ? 'Bộ lọc tự động không phát hiện vi phạm. Nội dung đang chờ quản trị viên duyệt xuất bản.' +
          (matchedRules.length ? ` Có ${matchedRules.length} từ lóng nhẹ (mức LOW), không tính là vi phạm.` : '')
        : input.forceReview
          ? 'GIF đính kèm cần quản trị viên kiểm duyệt.'
          : `${matchedRules.length} content filter rule(s) matched.`
    },
    client
  );

  const review = await createModerationReview(
    {
      targetType: input.targetType,
      targetId: input.targetId,
      source,
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
  if (
    input.targetType !== 'COMMENT' &&
    !uuidPattern.test(input.targetId)
  )
    throw new AppError(422, 'REPORT_TARGET', 'Mã đối tượng không hợp lệ.');
  if (input.targetType === 'NOVEL') {
    const novel = await findNovelById(input.targetId);
    if (!novel || novel.status !== 'PUBLISHED')
      throw new AppError(404, 'CONTENT_001', 'Không tìm thấy truyện đang xuất bản.');
  } else if (input.targetType === 'CHAPTER') {
    if (!(await findReadableChapter(input.targetId)))
      throw new AppError(404, 'CONTENT_001', 'Không tìm thấy chương đang xuất bản.');
  } else if (input.targetType === 'USER') {
    const user = await getPostgresPool().query(
      "select 1 from users where user_id::text=$1 and deleted_at is null and status<>'DELETED'",
      [input.targetId]
    );
    if (!user.rowCount) throw new AppError(404, 'USER_001', 'Không tìm thấy tài khoản.');
  }
  if (input.targetType === 'COMMENT') {
    const comment = await findCommentRecordById(input.targetId);
    if (!comment) {
      throw new AppError(404, 'CONTENT_001', 'Comment not found');
    }
    await authorizeComment(comment,auth,true);
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
        ['USER_REPORT']
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

      const lockedReview = (
        await client.query('select status from moderation_reviews where review_id=$1 for update', [
          review.review_id
        ])
      ).rows[0];
      if (lockedReview.status !== 'PENDING')
        throw new AppError(409, 'REPORT_RETRY', 'Review was resolved. Please submit again.');
      if (isDiscussionTarget(input.targetType)) {
        await assertDiscussionReportable(client, input.targetType, input.targetId, auth.userId);
      }
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
      targetTitle: row.submitted_content?.title ?? null,
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

export async function getModerationReview(reviewId: string, auth?: AuthContext) {
  const review = await findReviewById(reviewId);

  if (!review) {
    throw new AppError(404, 'ADMIN_001', 'Review item not found');
  }

  if (auth?.role === 'MODERATOR') {
    assertModeratorOperational(auth, reviewPermissionFor(review));
    // The moderator workspace serves target evidence and bounded violation history,
    // so each detail reading keeps an access-log row next to the decision audit trail.
    await withPostgresTransaction((client) =>
      audit(client, auth, {
        action: 'REVIEW_DETAIL_VIEW',
        targetType: review.target_type,
        targetId: review.target_id
      })
    );
  }

  if (review.target_type === 'COMMENT') {
    const comment = await findCommentRecordById(review.target_id);
    if (comment && privateComment(comment)) {
      if (!auth) throw new AppError(403,'ADMIN_PERMISSION','Content review permission required');
      if (auth.role === 'MODERATOR') {
        assertModeratorOperational(auth, 'comment.review');
      } else {
        await assertAdminPermission(auth,'content');
      }
      await withPostgresTransaction(client=>audit(client,auth,{action:'PRIVATE_COMMENT_REVIEW_VIEW',targetType:'COMMENT',targetId:review.target_id}));
    }
  }
  const [evidence, reportCount, reports, target, ownerViolations] = await Promise.all([
    findModerationEvidence(review.evidence_id),
    countReportsForReview(reviewId),
    listReportsForReview(reviewId),
    getAdminReviewTarget(review.target_type, review.target_id),
    listOwnerViolations(review)
  ]);
  const submitted = review.submitted_content ??
    (review.target_type === 'CHAPTER' && review.source === 'KEYWORD_FILTER' &&
      review.status === 'PENDING' && target?.status === 'PENDING_MODERATION'
      ? await findDraftChapterByChapterId(review.target_id)
      : null);
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
    target: target && submitted
      ? {
          ...target,
          title: submitted.title,
          content: submitted.content,
          ...(review.target_type === 'COMMENT' ? { gifId: submitted.gifId ?? null } : {}),
          isSubmittedVersion: true
        }
      : target,
    sanctions: (
      await getPostgresPool().query(
        "select s.sanction_id,s.action,s.active,exists(select 1 from admin_jobs j where j.kind='COMMENT_SYNC' and j.status='PENDING' and j.payload->>'sanctionId'=s.sanction_id::text) as pending from admin_sanctions s where s.review_id=$1 order by s.created_at",
        [reviewId]
      )
    ).rows,
    reportDescriptions: reports.map((r) => ({ reason: r.reason, description: r.description })),
    reportReasons: Array.from(reasonCounts, ([reason, count]) => ({ reason, count })),
    evidenceSummary: {
      matchedRules: evidence?.matchedRules ?? [],
      reportCount,
      summary: evidence?.summary ?? null
    },
    ownerViolations
  };
}

// PostgreSQL is the durable decision record. A retry may finish its MongoDB
// projection only while the comment still carries that exact review/version.
async function recoverResolvedCommentReview(
  auth: AuthContext,
  reviewId: string,
  commentId: string,
  decision: ResolveReviewInput['decision']
) {
  return withCommentWriteLock(commentId, async (client) => {
    const identity = (
      await client.query(
        'select role, status, access_version from users where user_id=$1 and deleted_at is null',
        [auth.userId]
      )
    ).rows[0];
    assertFreshIdentityUnderLock(auth, identity);
    const review = await findReviewById(reviewId, client);
    if (
      !review || review.source !== 'KEYWORD_FILTER' || review.target_type !== 'COMMENT' ||
      review.target_id !== commentId || !review.reviewed_by || review.status !== decision
    ) {
      throw new AppError(409, 'ADMIN_002', 'Review item already resolved');
    }
    const comment = await findCommentRecordById(commentId);
    if (!comment || comment.deletedAt !== null || comment.moderationReviewId !== reviewId) {
      throw new AppError(409, 'CONTENT_REVIEW_STALE', 'Comment no longer matches the reviewed version');
    }
    const commentStatus: CommentStatus = review.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const result = {
      reviewId: review.review_id,
      status: review.status,
      targetType: 'COMMENT' as const,
      targetId: commentId
    };
    if (
      comment.status === commentStatus &&
      (commentStatus !== 'APPROVED' || (!comment.imageUrl && (!comment.gifId || comment.mediaApproved === true)))
    ) return result; // Already applied: preserve timestamps and notification state.
    if (comment.status !== 'PENDING_MODERATION') {
      throw new AppError(409, 'CONTENT_REVIEW_STALE', 'Comment no longer awaits this decision');
    }
    if (commentStatus === 'APPROVED') {
      if (comment.imageUrl) throw new AppError(409, 'GIF_UPLOAD_DISABLED', 'Remove the uploaded GIF before review.');
      if (comment.gifId) await validateGiphyGif(comment.gifId, auth.userId);
    }
    const applied = await updateCommentModerationStatus(commentId, commentStatus, reviewId, reviewId);
    if (!applied || applied.status !== commentStatus || applied.moderationReviewId !== reviewId) {
      throw new AppError(409, 'CONTENT_REVIEW_STALE', 'Comment changed while applying this decision');
    }
    return result;
  });
}

function stalePublicationReview() {
  return new AppError(409, 'CONTENT_REVIEW_STALE', 'Nội dung không còn ở trạng thái có thể duyệt xuất bản.');
}

async function lockPublicationTarget(client: PoolClient, targetType: string, targetId: string, approved: boolean) {
  if (targetType === 'NOVEL') {
    await client.query('select novel_id from novels where novel_id=$1 for update', [targetId]);
  } else if (targetType === 'CHAPTER') {
    // Lock the novel first, matching archive and novel submission operations.
    const novel = await client.query(
      `select n.novel_id from novels n join chapters c on c.novel_id=n.novel_id
       where c.chapter_id=$1 and n.deleted_at is null for share of n`,
      [targetId]
    );
    if (approved && !novel.rowCount) throw stalePublicationReview();
    await client.query('select chapter_id from chapters where chapter_id=$1 for update', [targetId]);
  }
}

async function applyPublicationDecision(
  client: PoolClient,
  review: ResolvedModerationReview,
  reason?: string
) {
  const approved = review.status === 'APPROVED';
  const targetId = review.target_id;
  if (review.target_type === 'NOVEL') {
    const novel = await findNovelById(targetId, client);
    if (novel?.status !== 'PENDING_MODERATION') {
      if (approved) throw stalePublicationReview();
      return;
    }
    if (approved) {
      const submitted = review.submitted_content;
      if (submitted) {
        if (submitted.title !== novel.title || submitted.content !== novel.synopsis) throw stalePublicationReview();
        await assertNovelReadyForPublication(client, targetId);
      }
      await publishNovel(targetId, client);
    } else {
      await rejectNovelPublication(targetId, client);
    }
    return;
  }

  if (review.target_type !== 'CHAPTER') return;
  const chapter = await findChapterById(targetId, client);
  const revision = chapter?.status === 'PUBLISHED' && Boolean(review.submitted_content);
  if (approved) {
    if (!chapter || (chapter.status !== 'PENDING_MODERATION' && !revision)) throw stalePublicationReview();
    const submitted = review.submitted_content;
    const draft = submitted ? null : await findDraftChapterByChapterId(targetId);
    const content = submitted?.content ?? draft?.content ?? chapter.content;
    if (!content) throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    await publishChapter(targetId, {
      title: submitted?.title ?? draft?.title ?? chapter.title,
      content,
      wordCount: submitted?.wordCount ?? draft?.wordCount ?? chapter.wordCount
    }, client);
    if (!revision) await notifyFollowersOfPublishedChapter(client, targetId);
  } else if (chapter?.status === 'PENDING_MODERATION') {
    await rejectChapterPublication(targetId, client);
  }

  await client.query(
    "update chapter_publication_schedules set status=$2,error=$3,updated_at=now() where moderation_review_id=$1 and status='PENDING_MODERATION'",
    [review.review_id, approved ? 'PUBLISHED' : 'FAILED', approved ? null : (reason ?? 'Nội dung không được duyệt')]
  );
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

  await assertResolverAccess(auth, review);
  // Each variant carries its own decision set: revision decisions exist only for
  // publication requests of novels and chapters.
  if (
    input.decision === 'REVISION_REQUIRED' &&
    !(review.source === 'PUBLICATION_REQUEST' &&
      (review.target_type === 'NOVEL' || review.target_type === 'CHAPTER'))
  ) {
    throw new AppError(422, 'VARIANT_DECISION', 'Hồ sơ này không nhận quyết định yêu cầu sửa. Chọn duyệt hoặc từ chối.');
  }
  if (review.source === 'USER_REPORT') return resolveUserReport(auth, reviewId, input);

  if (review.status !== 'PENDING') {
    if (review.target_type === 'COMMENT' && review.source === 'KEYWORD_FILTER' && review.status === input.decision) {
      return recoverResolvedCommentReview(auth, reviewId, review.target_id, input.decision);
    }
    throw new AppError(409, 'ADMIN_002', 'Review item already resolved');
  }

  if ((input.decision === 'REJECTED' || input.decision === 'REVISION_REQUIRED') && !input.reason) {
    throw new AppError(422, 'ADMIN_003', 'Rejection reason required');
  }

  const resolved = await withPostgresTransaction(async (client) => {
    await lockPublicationTarget(client, review.target_type, review.target_id, input.decision === 'APPROVED');
    if (auth.role === 'MODERATOR') {
      const identity = (
        await client.query(
          'select role, status, access_version from users where user_id=$1 and deleted_at is null',
          [auth.userId]
        )
      ).rows[0];
      assertFreshIdentityUnderLock(auth, identity);
      await assertResolverAccess(auth, review, client);
      await assertIndependentResolver(auth, review, client);
    }
    if (review.target_type === 'COMMENT') {
      await client.query("select pg_advisory_xact_lock(hashtextextended('comment:' || $1, 0))", [review.target_id]);
      const comment = await findCommentRecordById(review.target_id);
      if (comment?.status === 'PENDING_MODERATION' && comment.moderationReviewId === reviewId && input.decision === 'APPROVED') {
        if (comment.imageUrl) throw new AppError(409, 'GIF_UPLOAD_DISABLED', 'Remove the uploaded GIF before review.');
        if (comment.gifId) await validateGiphyGif(comment.gifId, auth.userId);
      }
    }
    const row = await resolveReviewRow(
      {
        reviewId,
        status: input.decision,
        reviewedBy: auth.userId,
        reason: input.reason
      },
      client
    );
    if (row) {
      await applyPublicationDecision(client, row, input.reason);
      await audit(client, auth, {
        action: `PUBLICATION_${input.decision}`,
        targetType: review.target_type,
        targetId: review.target_id,
        reason: input.reason,
        before: { status: review.status },
        after: { status: row.status, reviewId }
      });
    }
    return row;
  });

  if (!resolved) {
    throw new AppError(409, 'MODERATION_002', 'Invalid moderation transition');
  }

  if (resolved.target_type === 'COMMENT') {
    {
      const commentStatus: CommentStatus = resolved.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      await updateCommentModerationStatus(
        resolved.target_id,
        commentStatus,
        resolved.review_id,
        resolved.review_id
      );
    }
  }

  return {
    reviewId: resolved.review_id,
    status: resolved.status,
    targetType: resolved.target_type,
    targetId: resolved.target_id
  };
}
