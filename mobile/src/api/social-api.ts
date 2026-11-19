import { apiClient, type ApiEnvelope } from './api-client';
import type { ReaderComment } from './types';
export type Audience = 'PUBLIC' | 'FRIENDS_ALL' | 'FRIENDS_SELECTED' | 'AUTHOR_PRIVATE';
export type CommentTarget = { kind: 'chapter' | 'novel'; id: string };
export type AnchorInput = { contentVersion: string; paragraphId: string };
export type Mention = { userId: string; start: number; end: number };
export type CommentInput = { content: string; isSpoiler?: boolean; mentions?: Mention[]; audience?: Audience; anchor?: AnchorInput; recipientUserIds?: string[] };
export type Person = { userId: string; username: string; displayName: string; avatarUrl: string | null; bio?: string; following: boolean; followedBy: boolean; mutual: boolean; followersCount?: number; followingCount?: number };
export type Page<T> = { items: T[]; page: number; pages: number; total: number };
export async function listPage<T>(url: string, params: Record<string, unknown> = {}): Promise<Page<T>> {
  const { data } = await apiClient.get<ApiEnvelope<T[]>>(url, { params: { limit: 20, ...params } });
  return { items: data.data, page: Number(data.meta.page) || 1, pages: Number(data.meta.totalPages) || 1, total: Number(data.meta.totalItems) || 0 };
}
export const listPeople = (type: string, q: string, page = 1) => listPage<Person>(type === 'SEARCH' ? '/users/search' : '/users/me/connections', { type: type === 'SEARCH' ? undefined : type, q, page });
export async function getPerson(id: string) { return (await apiClient.get<ApiEnvelope<Person>>(`/users/${encodeURIComponent(id)}/profile`)).data.data; }
export async function changeFollow(id: string, following: boolean) { if (following) await apiClient.delete(`/users/${id}/follow`); else await apiClient.post(`/users/${id}/follow`); }
const targetUrl = (target: CommentTarget) => `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
export async function listSocialComments(target: CommentTarget, channel: Audience, page: number, paragraphId?: string): Promise<Page<ReaderComment>> {
  const url = targetUrl(target);
  const limit = 10;
  if (!paragraphId || channel === 'PUBLIC') return listPage<ReaderComment>(url, { channel, page, limit });

  const matching: ReaderComment[] = [];
  let pages = 1;
  for (let sourcePage = 1; sourcePage <= pages; sourcePage++) {
    const result = await listPage<ReaderComment>(url, { channel, page: sourcePage, limit: 100 });
    pages = result.pages;
    matching.push(...result.items.filter(comment => !comment.anchor?.detached && comment.anchor?.currentParagraphId === paragraphId));
  }
  const start = (page - 1) * limit;
  return { items: matching.slice(start, start + limit), total: matching.length, page, pages: Math.max(1, Math.ceil(matching.length / limit)) };
}
export async function postComment(target: CommentTarget, input: CommentInput) { return (await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(targetUrl(target), input)).data.data; }
export async function postReply(id: string, input: CommentInput) { return (await apiClient.post<ApiEnvelope<{ commentId: string; status: string }>>(`/comments/${id}/replies`, input)).data.data; }
export async function getThread(id: string, page = 1) {
  const { data } = await apiClient.get<ApiEnvelope<{ root: ReaderComment; replies: ReaderComment[]; rootCommentId: string; focusCommentId: string }>>(`/comments/${id}/thread`, { params: { page, limit: 5 } });
  return { ...data.data, page: Number(data.meta.page) || 1, pages: Number(data.meta.totalPages) || 1 };
}
export const listFeedback = (box: 'sent' | 'received', page: number) => listPage<ReaderComment>('/author-feedback', { box, page });
export async function paragraphCounts(chapterId: string) {
  const counts: Record<string, number> = {};
  for (const channel of ['FRIENDS_ALL', 'FRIENDS_SELECTED', 'AUTHOR_PRIVATE'] as const) {
    let page = 1, pages = 1;
    do {
      const result = await listSocialComments({ kind: 'chapter', id: chapterId }, channel, page); pages = result.pages;
      for (const comment of result.items) if (comment.anchor?.currentParagraphId && !comment.anchor.detached) counts[comment.anchor.currentParagraphId] = (counts[comment.anchor.currentParagraphId] ?? 0) + 1;
    } while (++page <= pages);
  }
  return counts;
}
