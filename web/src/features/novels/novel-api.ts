import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { Chapter, Novel } from './novel-types';

export async function listGenres() {
  const response = await apiClient.get<ApiEnvelope<string[]>>('/novels/genres');
  return response.data.data;
}

export async function listMyNovels(input: { searchQuery?: string; status?: Novel['status'] | 'ALL' } = {}) {
  const novels: Novel[] = [];
  let page = 1;
  while (true) {
    const response = await apiClient.get<ApiEnvelope<Novel[]>>('/novels/me', {
      params: {
        q: input.searchQuery || undefined,
        status: input.status && input.status !== 'ALL' ? input.status : undefined,
        page,
        limit: 100
      }
    });
    novels.push(...response.data.data);
    if (page >= Number(response.data.meta.totalPages ?? 1)) return novels;
    page += 1;
  }
}

export async function getNovel(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<Novel>>(`/novels/${novelId}`);
  return response.data.data;
}

export async function getNovelEarnings(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<{ unlockCoins: number }>>(`/novels/${novelId}/earnings`);
  return response.data.data;
}

export async function createNovel(input: {
  title: string;
  synopsis: string;
  genre?: string;
  genres?: string[];
  authorNote?: string | null;
  tags?: string[];
  coverImageUrl?: string | null;
}) {
  const response = await apiClient.post<ApiEnvelope<Novel>>('/novels', input);
  return response.data.data;
}

export async function updateNovel(novelId: string, input: {
  genre?: string | null;
  genres?: string[];
  authorNote?: string | null;
  title?: string;
  synopsis?: string;
  coverImageUrl?: string | null;
}) {
  const response = await apiClient.patch<ApiEnvelope<Novel>>(`/novels/${novelId}`, input);
  return response.data.data;
}

export async function submitNovelPublish(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ novelId: string; status: Novel['status']; moderationRequired: boolean }>>(
    `/novels/${novelId}/submit-publish`
  );
  return response.data.data;
}

export async function listChapters(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<Chapter[]>>(`/novels/${novelId}/chapters`);
  return response.data.data;
}

export async function getChapter(chapterId: string, signal?: AbortSignal) {
  const response = await apiClient.get<ApiEnvelope<Chapter>>(`/chapters/${chapterId}`, { signal });
  return response.data.data;
}

export async function createChapter(novelId: string, input: {
  title: string;
  content: string;
  isVip?: boolean;
  priceCoins?: number;
}) {
  const response = await apiClient.post<ApiEnvelope<Chapter>>(`/novels/${novelId}/chapters`, input);
  return response.data.data;
}

export async function updateChapter(chapterId: string, input: {
  title?: string;
  content?: string;
  isVip?: boolean;
  priceCoins?: number;
  autosave?: boolean;
  expectedVersion?: number;
}) {
  const response = await apiClient.patch<ApiEnvelope<Chapter>>(`/chapters/${chapterId}`, input);
  return response.data.data;
}

export async function submitChapterPublish(chapterId: string) {
  const response = await apiClient.post<ApiEnvelope<{ chapterId: string; status: Chapter['status']; moderationRequired: boolean }>>(
    `/chapters/${chapterId}/submit-publish`
  );
  return response.data.data;
}
