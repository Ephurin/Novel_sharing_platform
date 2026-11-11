import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { CommentInput, ReaderComment } from './reader-api';
export type CommentTarget = { kind: 'chapter' | 'novel'; id: string };
const url = (target: CommentTarget) => `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
export async function listTargetComments(target: CommentTarget, page: number) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(url(target), { params: { page, limit: 10, scope: target.kind === 'novel' ? 'ALL' : undefined } });
  return { items: response.data.data, totalItems: Number(response.data.meta.totalItems), totalPages: Number(response.data.meta.totalPages) };
}
export async function createTargetComment(target: CommentTarget, input: string | CommentInput) {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(url(target), typeof input === 'string' ? { content: input } : input);
  return response.data.data;
}

export async function listAuthorComments(novelId: string, page: number, scope: 'ALL' | 'NOVEL' | 'CHAPTER', chapterId?: string) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(`/novels/${novelId}/comments/manage`, { params: { page, limit: 10, scope, chapterId } });
  return { items: response.data.data, totalItems: Number(response.data.meta.totalItems), totalPages: Number(response.data.meta.totalPages) };
}
export async function listCommentReplies(commentId: string, page: number) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(`/comments/${commentId}/replies`, { params: { page, limit: 5 } });
  return { items: response.data.data, totalItems: Number(response.data.meta.totalItems), totalPages: Number(response.data.meta.totalPages) };
}
export async function replyToComment(commentId: string, input: string | CommentInput) {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(`/comments/${commentId}/replies`, typeof input === 'string' ? { content: input } : input);
  return response.data.data;
}

export async function reactToComment(commentId: string, reaction: 'LIKE' | 'DISLIKE' | null) {
  const response = await apiClient.put<ApiEnvelope<{ likesCount: number; dislikesCount: number; myReaction: 'LIKE' | 'DISLIKE' | null }>>(`/comments/${commentId}/reaction`, { reaction });
  return response.data.data;
}
