import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type ReaderNovel = {
  novelId: string;
  authorId: string;
  title: string;
  synopsis?: string;
  status?: string;
  serialStatus?: string;
  likesCount?: number;
  viewsCount?: number;
  chaptersCount?: number;
};

export type ReaderChapter = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  content: string | null;
  isVip: boolean;
  priceCoins: number;
  status: string;
};

export async function searchPublishedNovels(q: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/search', {
    params: { q: q || undefined, page: 1, limit: 20, sort: 'updatedAt', order: 'desc' }
  });
  return response.data.data;
}

export async function getReaderNovel(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel & { chapters?: ReaderChapter[] }>>(`/reading/novels/${novelId}`);
  return response.data.data;
}

export async function getReaderChapter(chapterId: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderChapter>>(`/reading/chapters/${chapterId}`);
  return response.data.data;
}

export async function addToLibrary(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ saved: boolean; novelId: string }>>('/reading/library/me', { novelId });
  return response.data.data;
}

export async function listLibrary() {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/library/me', { params: { page: 1, limit: 20 } });
  return response.data.data;
}

export async function listHistory() {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/history/me', { params: { page: 1, limit: 20 } });
  return response.data.data;
}

export async function syncHistory(input: { novelId: string; chapterId: string }) {
  const response = await apiClient.put<ApiEnvelope<{ synced: boolean }>>('/reading/history/me', {
    novelId: input.novelId,
    chapterId: input.chapterId,
    paragraphIndex: 0,
    pageOffset: 0
  });
  return response.data.data;
}

export async function likeNovel(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ liked: boolean; likesCount?: number }>>(`/novels/${novelId}/likes`);
  return response.data.data;
}

export async function followAuthor(authorId: string) {
  const response = await apiClient.post<ApiEnvelope<{ followed: boolean; followersCount?: number }>>(`/authors/${authorId}/follow`);
  return response.data.data;
}

export async function reportContent(input: { targetType: 'NOVEL' | 'CHAPTER' | 'COMMENT' | 'USER'; targetId: string; reason: string }) {
  const response = await apiClient.post<ApiEnvelope<{ reportId: string; status: string }>>('/reports', input);
  return response.data.data;
}
