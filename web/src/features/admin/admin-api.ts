import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { PageMeta } from './AdminShared';

export type Paged<T> = { items: T[]; meta: PageMeta };
export async function getAdminList<T>(
  path: string,
  params: Record<string, unknown>
): Promise<Paged<T>> {
  const response = await apiClient.get<ApiEnvelope<T[]>>(path, {
    params: Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined)
    )
  });
  return { items: response.data.data, meta: response.data.meta as PageMeta };
}

export type DashboardStats = {
  totalUsers: number;
  totalNovels: number;
  pendingModerationItems: number;
  mockRevenueCoins: number;
  totalDepositedCoins: number;
  newUsers7Days: number;
  newNovels7Days: number;
  pendingReports: number;
  pendingWithdraws: number;
  activity: Array<{ date: string; users: number; novels: number }>;
  generatedAt: string;
};

export type AdminUser = {
  userId: string;
  email: string;
  username: string;
  role: 'READER' | 'AUTHOR' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED' | 'DELETED';
  displayName?: string | null;
};

export type ModerationReview = {
  reportCount?: number;
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
  sanctions?: Array<{ sanction_id: string; action: string; active: boolean; pending: boolean }>;
  reportDescriptions?: Array<{ reason: string; description: string | null }>;
  reviewedAt?: string | null;
  target?: {
    gifId?: string | null;
    title?: string;
    content?: string | null;
    username?: string;
    novelTitle?: string;
    chapterTitle?: string;
    novelId?: string;
    chapterId?: string;
    status?: string;
    deletedAt?: string | null;
    isSubmittedVersion?: boolean;
  } | null;
  reportReasons?: Array<{ reason: string; count: number }>;
  evidenceSummary: {
    matchedRules: string[];
    reportCount: number;
    summary: string | null;
  };
};

export type WithdrawRequest = {
  bankAccountLabel?: string;
  rejectionReason?: string | null;
  withdrawRequestId: string;
  userId: string;
  username: string;
  amountCoins: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
};

export type AdminNovelChapter = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  status: string;
  isVip: boolean;
  priceCoins: number;
  wordCount: number;
  publishedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type AdminNovel = {
  coverImageUrl?: string | null;
  genres?: Array<{ genreId: string; name: string }>;
  novelId: string;
  authorId: string;
  authorUsername: string;
  authorEmail: string;
  title: string;
  slug: string;
  synopsis: string;
  status: string;
  serialStatus: string;
  ageRating: string;
  likesCount: number;
  viewsCount: number;
  chaptersCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AdminNovelDetail = AdminNovel & {
  chapters: AdminNovelChapter[];
};

export async function getDashboardStats() {
  const response = await apiClient.get<ApiEnvelope<DashboardStats>>('/admin/dashboard/stats');
  return response.data.data;
}

export async function listAdminUsers(q = '') {
  const response = await apiClient.get<ApiEnvelope<AdminUser[]>>('/admin/users', {
    params: { q: q || undefined, page: 1, limit: 20 }
  });
  return response.data.data;
}

export async function lockUser(userId: string, reason?: string) {
  const response = await apiClient.patch<ApiEnvelope<AdminUser>>(`/admin/users/${userId}/lock`, {
    reason
  });
  return response.data.data;
}

export async function unlockUser(userId: string, reason?: string) {
  const response = await apiClient.patch<ApiEnvelope<AdminUser>>(`/admin/users/${userId}/unlock`, {
    reason
  });
  return response.data.data;
}

export async function listAdminNovels(
  input: {
    q?: string;
    status?: string;
    includeDeleted?: boolean;
  } = {}
) {
  const response = await apiClient.get<ApiEnvelope<AdminNovel[]>>('/admin/novels', {
    params: {
      q: input.q || undefined,
      status: input.status || undefined,
      includeDeleted: input.includeDeleted,
      page: 1,
      limit: 50
    }
  });
  return response.data.data;
}

export async function getAdminNovel(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<AdminNovelDetail>>(`/admin/novels/${novelId}`);
  return response.data.data;
}

export async function removeAdminNovel(novelId: string, input: { reason?: string }) {
  await apiClient.delete(`/admin/novels/${novelId}`, {
    data: {
      confirm: true,
      reason: input.reason || undefined
    }
  });
}

export async function restoreAdminNovel(novelId: string, input: { reason?: string }) {
  await apiClient.post(`/admin/novels/${novelId}/restore`, {
    reason: input.reason || undefined
  });
}

export async function getTaxonomy() {
  const response = await apiClient.get<
    ApiEnvelope<{
      genres: Array<{ genreId: string; name: string; description?: string; usageCount: number }>;
      tags: Array<{ tagId: string; name: string; usageCount: number }>;
    }>
  >('/admin/taxonomy');
  return response.data.data;
}

export async function createGenre(name: string) {
  const response = await apiClient.post<
    ApiEnvelope<{ genreId: string; name: string; description?: string; usageCount: number }>
  >('/admin/taxonomy/genres', { name });
  return response.data.data;
}

export async function createTag(name: string) {
  const response = await apiClient.post<
    ApiEnvelope<{ tagId: string; name: string; usageCount: number }>
  >('/admin/taxonomy/tags', { name });
  return response.data.data;
}

export async function listModerationReviews(filters: ModerationReviewFilters = {}) {
  const response = await apiClient.get<ApiEnvelope<ModerationReview[]>>(
    '/admin/moderation/reviews',
    {
      params: {
        targetType: filters.targetType || undefined,
        status: filters.status || undefined,
        source: filters.source || undefined,
        page: 1,
        limit: 20
      }
    }
  );
  return response.data.data;
}

export async function getModerationReview(reviewId: string) {
  const response = await apiClient.get<ApiEnvelope<ModerationReviewDetail>>(
    `/admin/moderation/reviews/${reviewId}`
  );
  return response.data.data;
}

export async function resolveModerationReview(
  reviewId: string,
  decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED',
  reason?: string,
  action?: string
) {
  const response = await apiClient.post<ApiEnvelope<{ reviewId: string; status: string }>>(
    `/admin/moderation/reviews/${reviewId}/resolve`,
    {
      decision,
      action,
      reason: reason?.trim() || undefined
    }
  );
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

export async function rejectWithdrawRequest(withdrawRequestId: string, reason: string) {
  const response = await apiClient.post<ApiEnvelope<{ withdrawRequestId: string; status: string }>>(
    `/admin/withdraw-requests/${withdrawRequestId}/reject`,
    {
      reason: reason.trim()
    }
  );
  return response.data.data;
}
