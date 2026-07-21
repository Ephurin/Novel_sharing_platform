import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type AdminUser = {
  userId: string;
  email: string;
  username: string;
  role: 'READER' | 'AUTHOR' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED' | 'DELETED';
  displayName?: string | null;
};

export type ModerationReview = {
  reviewId: string;
  targetType: string;
  targetId: string;
  status: string;
  source: string;
  evidenceId?: string | null;
  reason?: string;
  createdAt: string;
};

export type ModerationReviewFilters = {
  targetType?: 'NOVEL' | 'CHAPTER' | 'COMMENT' | 'USER' | '';
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED' | '';
  source?: 'KEYWORD_FILTER' | 'USER_REPORT' | '';
};

export type ModerationReviewDetail = ModerationReview & {
  evidenceSummary: {
    matchedRules: string[];
    reportCount: number;
    summary: string | null;
  };
};

export type WithdrawRequest = {
  withdrawRequestId: string;
  userId: string;
  username: string;
  amountCoins: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
};

export async function getDashboardStats() {
  const response = await apiClient.get<ApiEnvelope<{
    totalUsers: number;
    totalNovels: number;
    pendingModerationItems: number;
    mockRevenueCoins: number;
  }>>('/admin/dashboard/stats');
  return response.data.data;
}

export async function listAdminUsers(q = '') {
  const response = await apiClient.get<ApiEnvelope<AdminUser[]>>('/admin/users', {
    params: { q: q || undefined, page: 1, limit: 20 }
  });
  return response.data.data;
}

export async function lockUser(userId: string) {
  const response = await apiClient.patch<ApiEnvelope<AdminUser>>(`/admin/users/${userId}/lock`, {
    reason: 'Locked from Phase 8 web UI'
  });
  return response.data.data;
}

export async function unlockUser(userId: string) {
  const response = await apiClient.patch<ApiEnvelope<AdminUser>>(`/admin/users/${userId}/unlock`);
  return response.data.data;
}

export async function getTaxonomy() {
  const response = await apiClient.get<ApiEnvelope<{ genres: Array<{ genreId: string; name: string }>; tags: Array<{ tagId: string; name: string }> }>>(
    '/admin/taxonomy'
  );
  return response.data.data;
}

export async function createGenre(name: string) {
  const response = await apiClient.post<ApiEnvelope<{ genreId: string; name: string }>>('/admin/taxonomy/genres', { name });
  return response.data.data;
}

export async function createTag(name: string) {
  const response = await apiClient.post<ApiEnvelope<{ tagId: string; name: string }>>('/admin/taxonomy/tags', { name });
  return response.data.data;
}

export async function listModerationReviews(filters: ModerationReviewFilters = {}) {
  const response = await apiClient.get<ApiEnvelope<ModerationReview[]>>('/admin/moderation/reviews', {
    params: {
      targetType: filters.targetType || undefined,
      status: filters.status || undefined,
      source: filters.source || undefined,
      page: 1,
      limit: 20
    }
  });
  return response.data.data;
}

export async function getModerationReview(reviewId: string) {
  const response = await apiClient.get<ApiEnvelope<ModerationReviewDetail>>(`/admin/moderation/reviews/${reviewId}`);
  return response.data.data;
}

export async function resolveModerationReview(reviewId: string, decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED') {
  const response = await apiClient.post<ApiEnvelope<{ reviewId: string; status: string }>>(`/admin/moderation/reviews/${reviewId}/resolve`, {
    decision,
    reason: `Resolved as ${decision} from Phase 8 web UI`
  });
  return response.data.data;
}

export async function listWithdrawRequests(status?: 'PENDING' | 'SUCCESS' | 'FAILED') {
  const response = await apiClient.get<ApiEnvelope<WithdrawRequest[]>>('/admin/withdraw-requests', {
    params: { status, page: 1, limit: 20 }
  });
  return response.data.data;
}

export async function approveWithdrawRequest(withdrawRequestId: string) {
  const response = await apiClient.post<ApiEnvelope<{ withdrawRequestId: string; status: string }>>(
    `/admin/withdraw-requests/${withdrawRequestId}/approve`
  );
  return response.data.data;
}

export async function rejectWithdrawRequest(withdrawRequestId: string) {
  const response = await apiClient.post<ApiEnvelope<{ withdrawRequestId: string; status: string }>>(
    `/admin/withdraw-requests/${withdrawRequestId}/reject`,
    { reason: 'Rejected from Phase 8 web UI' }
  );
  return response.data.data;
}
