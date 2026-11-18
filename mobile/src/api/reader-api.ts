import { apiClient, type ApiEnvelope } from './api-client';
import type { ReaderChapter, ReaderComment, ReaderNovel, ReadingHistoryItem, ReadingPreferences } from './types';

export async function searchPublishedNovels(
  input: {
    q?: string;
    genre?: string;
    tag?: string;
    status?: string;
    sort?: 'updatedAt' | 'views' | 'likes' | 'relevance';
    order?: 'asc' | 'desc';
  },
  signal?: AbortSignal
) {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/search', {
    signal,
    params: {
      q: input.q || undefined,
      genre: input.genre || undefined,
      tag: input.tag || undefined,
      status: input.status || undefined,
      page: 1,
      limit: 30,
      sort: input.sort ?? 'updatedAt',
      order: input.order ?? 'desc'
    }
  });
  return response.data.data;
}

export async function getReaderNovel(novelId: string, signal?: AbortSignal) {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel & { chapters?: ReaderChapter[] }>>(
    `/reading/novels/${novelId}`,
    signal ? { signal } : undefined
  );
  return response.data.data;
}

export async function getReaderChapter(chapterId: string, signal?: AbortSignal) {
  const response = await apiClient.get<ApiEnvelope<ReaderChapter>>(
    `/reading/chapters/${chapterId}`,
    signal ? { signal } : undefined
  );
  return response.data.data;
}

export async function getReadingPreferences(signal?: AbortSignal) {
  const response = await apiClient.get<ApiEnvelope<ReadingPreferences>>(
    '/reading/preferences/me',
    signal ? { signal } : undefined
  );
  return response.data.data;
}

export async function saveReadingPreferences(input: ReadingPreferences) {
  const normalizedFont = input.fontFamily?.trim() ? input.fontFamily.trim() : null;
  const payload: ReadingPreferences = {
    fontFamily: normalizedFont,
    fontSize: input.fontSize,
    background: input.background,
    lineHeight: input.lineHeight,
    ...(input.margin !== undefined ? { margin: input.margin } : {}),
    ...(input.textAlign !== undefined ? { textAlign: input.textAlign } : {})
  };
  const response = await apiClient.put<ApiEnvelope<ReadingPreferences>>('/reading/preferences/me', payload);
  return response.data.data;
}

export async function listHistory(signal?: AbortSignal) {
  const response = await apiClient.get<ApiEnvelope<ReadingHistoryItem[]>>('/reading/history/me', {
    signal,
    params: { page: 1, limit: 20 }
  });
  return response.data.data;
}

export async function syncHistory(
  input: { novelId: string; chapterId: string; paragraphIndex?: number; pageOffset?: number },
  signal?: AbortSignal
) {
  const response = await apiClient.put<ApiEnvelope<{ synced: boolean }>>(
    '/reading/history/me',
    {
      novelId: input.novelId,
      chapterId: input.chapterId,
      paragraphIndex: input.paragraphIndex ?? 0,
      pageOffset: input.pageOffset ?? 0
    },
    signal ? { signal } : undefined
  );
  return response.data.data;
}

export async function listLibrary() {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/library/me', { params: { page: 1, limit: 20 } });
  return response.data.data;
}

export async function addToLibrary(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ bookmarked?: boolean; saved?: boolean; novelId: string }>>('/reading/library/me', { novelId });
  return response.data.data;
}

export async function removeFromLibrary(novelId: string) {
  await apiClient.delete(`/reading/library/me/${novelId}`);
}

export async function likeNovel(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ liked: boolean; likesCount?: number }>>(`/novels/${novelId}/likes`);
  return response.data.data;
}

export async function followAuthor(authorId: string) {
  const response = await apiClient.post<ApiEnvelope<{ followed: boolean; followersCount?: number }>>(`/authors/${authorId}/follow`);
  return response.data.data;
}

export async function listComments(chapterId: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(`/chapters/${chapterId}/comments`, {
    params: { page: 1, limit: 30 }
  });
  return response.data.data;
}

export async function createComment(chapterId: string, content: string) {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string; status: string; moderationReviewId?: string | null }>>(
    `/chapters/${chapterId}/comments`,
    { content, paragraphOffset: null }
  );
  return response.data.data;
}

export async function reportContent(input: {
  targetType: 'NOVEL' | 'CHAPTER' | 'COMMENT' | 'USER';
  targetId: string;
  reason: string;
  description?: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ reportId: string; status: string }>>('/reports', input);
  return response.data.data;
}
