import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { ReaderComment } from './reader-api';
export type CommentTarget = { kind: 'chapter' | 'novel'; id: string };
const url = (target: CommentTarget) => `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
export async function listTargetComments(target: CommentTarget, page: number) {
  const response = await apiClient.get<ApiEnvelope<ReaderComment[]>>(url(target), { params: { page, limit: 10 } });
  return { items: response.data.data, totalItems: Number(response.data.meta.totalItems), totalPages: Number(response.data.meta.totalPages) };
}
export async function createTargetComment(target: CommentTarget, content: string) {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(url(target), { content });
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
export async function replyToComment(commentId: string, content: string) {
  const response = await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(`/comments/${commentId}/replies`, { content });
  return response.data.data;
}
