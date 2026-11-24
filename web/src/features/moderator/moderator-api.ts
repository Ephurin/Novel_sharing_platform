import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { getAdminList } from '../admin/admin-api';
import type { ModerationReview, ModerationReviewDetail, Paged } from '../admin/admin-api';

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
