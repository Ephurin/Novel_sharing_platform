import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type NovelStatistics = {
  novelId: string;
  totalWords: number;
  followersCount: number;
  ratingAverage: number | null;
  ratingsCount: number;
  isFollowing: boolean;
  myRating: number | null;
  myReview: string | null;
};

export async function getNovelStatistics(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<NovelStatistics>>(`/novels/${novelId}/statistics`);
  return response.data.data;
}

export async function followNovel(novelId: string, following: boolean) {
  const url = `/novels/${novelId}/follow`;
  const response = following
    ? await apiClient.put<ApiEnvelope<NovelStatistics>>(url)
    : await apiClient.delete<ApiEnvelope<NovelStatistics>>(url);
  return response.data.data;
}

export async function rateNovel(novelId: string, score: number | null, review?: string | null) {
  const url = `/novels/${novelId}/rating`;
  const response = score === null
    ? await apiClient.delete<ApiEnvelope<NovelStatistics>>(url)
    : await apiClient.put<ApiEnvelope<NovelStatistics>>(url, { score, review });
  return response.data.data;
}

export type NovelReview = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  review: string;
  createdAt: string;
  updatedAt: string;
};

export async function listNovelReviews(novelId: string, page = 1) {
  const response = await apiClient.get<ApiEnvelope<NovelReview[]>>(`/novels/${novelId}/reviews`, { params: { page, limit: 5 } });
  return { items: response.data.data, totalItems: Number(response.data.meta.totalItems ?? 0), totalPages: Number(response.data.meta.totalPages ?? 0) };
}
