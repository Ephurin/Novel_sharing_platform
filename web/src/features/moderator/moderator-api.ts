import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { getAdminList } from '../admin/admin-api';
import type { ModerationEscalation, ModerationReview, ModerationReviewDetail, Paged } from '../admin/admin-api';

export type ModeratorAccess = { role: 'MODERATOR'; permissions: string[] };

export async function getModeratorAccess() {
  const response = await apiClient.get<ApiEnvelope<ModeratorAccess>>('/moderator/access');
  return response.data.data;
}

export async function listModeratorReviews(
  filters: Record<string, unknown>
): Promise<Paged<ModerationReview>> {
  return getAdminList<ModerationReview>('/moderator/reviews', filters);
}

export async function getModeratorReview(reviewId: string): Promise<ModerationReviewDetail> {
  const response = await apiClient.get<ApiEnvelope<ModerationReviewDetail>>(
    `/moderator/reviews/${reviewId}`
  );
  return response.data.data;
}

export async function proposeModeratorEscalation(
  reviewId: string,
  reason: string,
  proposedAction: ModerationEscalation['proposedAction']
) {
  const response = await apiClient.post<ApiEnvelope<ModerationEscalation>>(
    `/moderator/reviews/${reviewId}/escalations`,
    { reason: reason.trim(), proposedAction }
  );
  return response.data.data;
}

export async function resolveModeratorReview(
  reviewId: string,
  decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED',
  reason?: string,
  action?: string
) {
  const response = await apiClient.post<ApiEnvelope<{ reviewId: string; status: string }>>(
    `/moderator/reviews/${reviewId}/resolve`,
    { decision, action, reason: reason?.trim() || undefined }
  );
  return response.data.data;
}

export type ModeratorDiscussionCategory = {
  categoryId: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  postAdminOnly: boolean;
};

export type ModeratorDiscussionTopic = {
  topicId: string;
  title: string;
  status: 'VISIBLE' | 'HIDDEN' | 'DELETED';
  isPinned: boolean;
  isLocked: boolean;
  categoryId: string;
  categoryName: string | null;
  authorName: string | null;
  createdAt: string;
};

export type ModeratorDiscussionComment = {
  commentId: string;
  body: string;
  status: 'VISIBLE' | 'HIDDEN' | 'DELETED';
  authorName: string | null;
  createdAt: string;
};

export type ModeratorDiscussionPage<T> = { items: T[]; hasNext: boolean };

export async function listModeratorDiscussionCategories() {
  const response = await apiClient.get<ApiEnvelope<ModeratorDiscussionCategory[]>>(
    '/moderator/discussions/categories'
  );
  return response.data.data;
}

export async function listModeratorDiscussionTopics(params: Record<string, unknown>) {
  const response = await apiClient.get<ApiEnvelope<ModeratorDiscussionPage<ModeratorDiscussionTopic>>>(
    '/moderator/discussions/topics',
    { params }
  );
  return response.data.data;
}

export async function listModeratorDiscussionTopicComments(topicId: string, params: Record<string, unknown>) {
  const response = await apiClient.get<ApiEnvelope<ModeratorDiscussionPage<ModeratorDiscussionComment>>>(
    `/moderator/discussions/topics/${topicId}/comments`,
    { params }
  );
  return response.data.data;
}

export type ModeratorTopicChange =
  | { field: 'isPinned' | 'isLocked'; value: boolean; expected: boolean }
  | { field: 'status'; value: 'VISIBLE' | 'HIDDEN'; expected: string }
  | { field: 'destinationCategoryId'; value: string; expected: string };

export async function moderateModeratorDiscussionTopic(
  topicId: string,
  change: ModeratorTopicChange,
  reason: string
) {
  const body =
    change.field === 'isPinned'
      ? { isPinned: change.value, expected: change.expected, reason }
      : change.field === 'isLocked'
        ? { isLocked: change.value, expected: change.expected, reason }
        : change.field === 'status'
          ? { status: change.value, expected: change.expected, reason }
          : { destinationCategoryId: change.value, expected: change.expected, reason };
  const response = await apiClient.patch<ApiEnvelope<ModeratorDiscussionTopic>>(
    `/moderator/discussions/${topicId}/moderation`,
    body
  );
  return response.data.data;
}

export async function moderateModeratorDiscussionComment(
  topicId: string,
  commentId: string,
  status: 'VISIBLE' | 'HIDDEN',
  reason: string
) {
  const response = await apiClient.patch<ApiEnvelope<{ commentId: string; status: string }>>(
    `/moderator/discussions/${topicId}/comments/${commentId}/moderation`,
    { status, reason }
  );
  return response.data.data;
}
