import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type ReaderNovel = {
  novelId: string;
  authorId: string;
  authorName?: string;
  title: string;
  synopsis?: string;
  coverImageUrl?: string | null;
  genre?: string | null;
  genres?: string[];
  authorNote?: string | null;
  lastUpdatedAt?: string | null;
  tags?: string[];
  status?: string;
  serialStatus?: string;
  likesCount?: number;
  viewsCount?: number;
  chaptersCount?: number;
  updatedAt?: string;
  latestChapter?: { chapterId: string; chapterNumber: number; title: string; publishedAt: string | null } | null;
};

export type ReaderChapter = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  content: string | null;
  isVip: boolean;
  priceCoins: number;
  status?: string;
  wordCount?: number;
  publishedAt?: string;
};

export type ReadingHistoryItem = {
  novelId: string;
  chapterId: string;
  paragraphIndex: number;
  pageOffset: number | null;
  readAt: string;
  novel: {
    title: string;
    coverImageUrl: string | null;
  };
  chapter: {
    title: string;
    chapterNumber: number;
  };
};

export type ReadingPreferences = {
  fontFamily: string | null;
  fontSize: number;
  background: 'LIGHT' | 'DARK' | 'SEPIA';
  lineHeight: number;
};

export type ReaderComment = {
  parentCommentId: string | null;
  repliesCount: number;
  isAuthor: boolean;
  canDelete: boolean;
  canReply: boolean;
  chapterTitle: string | null;
  chapterNumber: number | null;
  commentId: string;
  chapterId: string | null;
  novelId: string;
  displayName: string;
  avatarUrl: string | null;
  updatedAt: string;
  userId: string;
  paragraphOffset: number | null;
  content: string;
  status: string;
  createdAt: string;
};

export type SearchPublishedNovelsInput = {
  q?: string;
  genre?: string;
  tag?: string;
  status?: 'ONGOING' | 'COMPLETED' | 'HIATUS' | '';
  sort?: 'relevance' | 'views' | 'likes' | 'updatedAt' | 'wordCount' | 'title';
  order?: 'asc' | 'desc';
};

export async function getReadingFilters() {
  const response = await apiClient.get<ApiEnvelope<{ genres: string[]; tags: string[] }>>('/reading/filters');
  return response.data.data;
}

export async function searchPublishedNovels(input: SearchPublishedNovelsInput) {
  const response = await apiClient.get<ApiEnvelope<ReaderNovel[]>>('/reading/search', {
    params: {
      q: input.q || undefined,
      genre: input.genre || undefined,
      tag: input.tag || undefined,
      status: input.status || undefined,
      page: 1,
      limit: 20,
      sort: input.sort ?? 'updatedAt',
      order: input.order ?? 'desc'
    }
  });
  return response.data.data;
}

export async function getReadingPreferences() {
  const response = await apiClient.get<ApiEnvelope<ReadingPreferences>>('/reading/preferences/me');
  return response.data.data;
}

export async function saveReadingPreferences(input: ReadingPreferences) {
  const response = await apiClient.put<ApiEnvelope<ReadingPreferences>>('/reading/preferences/me', input);
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

export async function removeFromLibrary(novelId: string) {
  await apiClient.delete(`/reading/library/me/${novelId}`);
}

export async function listHistory() {
  const response = await apiClient.get<ApiEnvelope<ReadingHistoryItem[]>>('/reading/history/me', { params: { page: 1, limit: 20 } });
  return response.data.data;
}

export async function getHistoryForNovel(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<ReadingHistoryItem>>(`/reading/history/me/${novelId}`);
  return response.data.data;
}

export async function syncHistory(input: { novelId: string; chapterId: string; paragraphIndex?: number; pageOffset?: number }) {
  const response = await apiClient.put<ApiEnvelope<{ synced: boolean }>>('/reading/history/me', {
    novelId: input.novelId,
    chapterId: input.chapterId,
    paragraphIndex: input.paragraphIndex ?? 0,
    pageOffset: input.pageOffset ?? 0
  });
  return response.data.data;
}

export async function likeNovel(novelId: string) {
  const response = await apiClient.post<ApiEnvelope<{ liked: boolean; likesCount?: number }>>(`/novels/${novelId}/likes`);
  return response.data.data;
}

export async function unlikeNovel(novelId: string) {
  const response = await apiClient.delete<ApiEnvelope<{ liked: boolean; likesCount?: number }>>(`/novels/${novelId}/likes/me`);
  return response.data.data;
}

export async function followAuthor(authorId: string) {
  const response = await apiClient.post<ApiEnvelope<{ followed: boolean; followersCount?: number }>>(`/authors/${authorId}/follow`);
  return response.data.data;
}

export async function unfollowAuthor(authorId: string) {
  const response = await apiClient.delete<ApiEnvelope<{ followed: boolean; followersCount?: number }>>(`/authors/${authorId}/follow`);
  return response.data.data;
}

export async function listComments(chapterId: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(`/chapters/${chapterId}/comments`, {
    params: { page: 1, limit: 20 }
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

export async function updateComment(input: { commentId: string; content: string }) {
  const response = await apiClient.patch<ApiEnvelope<{ commentId: string; status: string; moderationReviewId?: string | null }>>(
    `/comments/${input.commentId}`,
    { content: input.content }
  );
  return response.data.data;
}

export async function deleteComment(commentId: string) {
  await apiClient.delete(`/comments/${commentId}`);
}

export async function unlockVipChapter(chapterId: string) {
  const response = await apiClient.post<ApiEnvelope<{ unlocked: boolean; transactionId?: string }>>(`/chapters/${chapterId}/unlock`);
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
