import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { checkContent } from '../content-control/content-control.service.js';
import type { CreateCommentInput, ListCommentsInput, UpdateCommentInput } from './comments.schemas.js';
import {
  createComment as createCommentRow,
  findCommentById,
  listApprovedComments,
  softDeleteComment,
  updateCommentContent,
  updateCommentModerationStatus
} from './comments.repository.js';

function assertCanMutateComment(auth: AuthContext, comment: { userId: string }) {
  if (auth.role === 'ADMIN') {
    return;
  }

  if (comment.userId !== auth.userId) {
    throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  }
}

async function moderateComment(input: {
  commentId: string;
  content: string;
  userId: string;
}) {
  const result = await checkContent({
    targetType: 'COMMENT',
    targetId: input.commentId,
    content: input.content,
    submittedBy: input.userId
  });

  if (result.moderationRequired) {
    return updateCommentModerationStatus(input.commentId, 'PENDING_MODERATION', result.moderationReviewId);
  }

  return updateCommentModerationStatus(input.commentId, 'APPROVED', null);
}

export async function createComment(auth: AuthContext, chapterId: string, input: CreateCommentInput) {
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const comment = await createCommentRow({
    chapterId,
    novelId: chapter.novelId,
    userId: auth.userId,
    paragraphOffset: input.paragraphOffset,
    content: input.content
  });

  const moderatedComment = await moderateComment({
    commentId: comment.commentId,
    content: input.content,
    userId: auth.userId
  });

  return {
    commentId: comment.commentId,
    chapterId,
    status: moderatedComment?.status ?? 'PENDING_MODERATION',
    moderationReviewId: moderatedComment?.moderationReviewId ?? null
  };
}

export async function listComments(chapterId: string, input: ListCommentsInput) {
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const result = await listApprovedComments({
    chapterId,
    paragraphOffset: input.paragraphOffset,
    page: input.page,
    limit: input.limit
  });

  return {
    data: result.items.map((comment) => ({
      commentId: comment.commentId,
      chapterId: comment.chapterId,
      userId: comment.userId,
      paragraphOffset: comment.paragraphOffset,
      content: comment.content,
      status: comment.status,
      createdAt: comment.createdAt
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / input.limit)
    }
  };
}

export async function updateComment(auth: AuthContext, commentId: string, input: UpdateCommentInput) {
  const comment = await findCommentById(commentId);

  if (!comment) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  assertCanMutateComment(auth, comment);
  await updateCommentContent(commentId, input.content);
  const moderatedComment = await moderateComment({
    commentId,
    content: input.content,
    userId: auth.userId
  });

  return {
    commentId,
    status: moderatedComment?.status ?? 'PENDING_MODERATION',
    moderationReviewId: moderatedComment?.moderationReviewId ?? null
  };
}

export async function deleteComment(auth: AuthContext, commentId: string) {
  const comment = await findCommentById(commentId);

  if (!comment) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  assertCanMutateComment(auth, comment);
  await softDeleteComment(commentId);
}
