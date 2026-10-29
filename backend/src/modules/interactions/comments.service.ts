import { isContentAdmin } from '../../core/security/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { findAuthUserById } from '../auth/auth.repository.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import { checkContent } from '../content-control/content-control.service.js';
import type { CreateCommentInput, ListCommentsInput, UpdateCommentInput } from './comments.schemas.js';
import { type CommentDocument, countVisibleReplies, createComment as createCommentRow, findCommentById, listApprovedComments, softDeleteComment, updateCommentContent, updateCommentModerationStatus } from './comments.repository.js';

type Target = { chapterId: string | null; novelId: string };
async function activeAccount(auth: AuthContext) {
  const account = await findAuthUserById(auth.userId);
  if (!account || account.status !== 'ACTIVE' || account.role !== auth.role) throw new AppError(403, 'AUTH_008', 'Tài khoản không được phép bình luận');
  return account;
}
async function publishedTarget(id: string, kind: 'chapter' | 'novel'): Promise<Target> {
  const chapter = kind === 'chapter' ? await findChapterById(id) : null;
  const novel = await findNovelById(kind === 'novel' ? id : chapter?.novelId ?? '00000000-0000-0000-0000-000000000000');
  if (!novel || novel.status !== 'PUBLISHED' || (kind === 'chapter' && (!chapter || chapter.status !== 'PUBLISHED'))) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }
  return { novelId: novel.novelId, chapterId: chapter?.chapterId ?? null };
}
async function moderateComment(commentId: string, content: string, userId: string) {
  const result = await checkContent({ targetType: 'COMMENT', targetId: commentId, content, submittedBy: userId });
  return updateCommentModerationStatus(commentId, result.moderationRequired ? 'PENDING_MODERATION' : 'APPROVED', result.moderationReviewId);
}
async function create(auth: AuthContext, id: string, kind: 'chapter' | 'novel', input: CreateCommentInput) {
  await activeAccount(auth);
  const target = await publishedTarget(id, kind);
  const comment = await createCommentRow({ ...target, userId: auth.userId, paragraphOffset: kind === 'chapter' ? input.paragraphOffset : null, content: input.content });
  const moderated = await moderateComment(comment.commentId, input.content, auth.userId);
  return { commentId: comment.commentId, ...target, status: moderated?.status ?? 'PENDING_MODERATION', moderationReviewId: moderated?.moderationReviewId ?? null };
}
export function createComment(auth: AuthContext, chapterId: string, input: CreateCommentInput) { return create(auth, chapterId, 'chapter', input); }
export function createNovelComment(auth: AuthContext, novelId: string, input: CreateCommentInput) { return create(auth, novelId, 'novel', input); }

async function list(id: string, kind: 'chapter' | 'novel', input: ListCommentsInput, auth?: AuthContext) {
  const target = await publishedTarget(id, kind);
  const viewer = auth ? await findAuthUserById(auth.userId) : null;
  const result = await listApprovedComments({ ...target, viewerId: viewer?.status === 'ACTIVE' ? viewer.userId : undefined, paragraphOffset: input.paragraphOffset, page: input.page, limit: input.limit });
  const novel = await findNovelById(target.novelId);
  return present(result, input, viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth : undefined, novel!);

}
export function listComments(chapterId: string, input: ListCommentsInput, auth?: AuthContext) { return list(chapterId, 'chapter', input, auth); }
export function listNovelComments(novelId: string, input: ListCommentsInput, auth?: AuthContext) { return list(novelId, 'novel', input, auth); }

async function present(result: { items: CommentDocument[]; totalItems: number }, input: { page: number; limit: number }, auth: AuthContext | undefined, novel: { authorId: string; status: string }) {
  const ids = [...new Set(result.items.map(comment => comment.userId))];
  const chapterIds = [...new Set(result.items.map(comment => comment.chapterId).filter((id): id is string => Boolean(id)))];
  const [profiles, chapters, counts] = await Promise.all([
    ids.length ? getPostgresPool().query(`select u.user_id, coalesce(p.display_name, u.username) as display_name, p.avatar_url from users u left join user_profiles p on p.user_id=u.user_id where u.user_id=any($1::uuid[]) and u.deleted_at is null`, [ids]) : { rows: [] },
    chapterIds.length ? getPostgresPool().query('select chapter_id, title, chapter_number, status, deleted_at from chapters where chapter_id=any($1::uuid[])', [chapterIds]) : { rows: [] },
    countVisibleReplies(result.items.map(item => item.commentId), auth?.userId)
  ]);
  const byId = new Map(profiles.rows.map(row => [row.user_id, row]));
  const byChapter = new Map(chapters.rows.map(row => [row.chapter_id, row]));
  const replyCounts = new Map(counts.map(row => [row._id, row.total]));
  const manager = Boolean(auth && (isContentAdmin(auth) || (auth.role === 'AUTHOR' && auth.userId === novel.authorId)));
  return {
    data: result.items.map(comment => {
      const chapter = comment.chapterId ? byChapter.get(comment.chapterId) : null;
      return { commentId: comment.commentId, chapterId: comment.chapterId, novelId: comment.novelId, userId: comment.userId,
        parentCommentId: comment.parentCommentId ?? null, repliesCount: replyCounts.get(comment.commentId) ?? 0,
        isAuthor: comment.userId === novel.authorId,
        canDelete: Boolean(auth && (auth.userId === comment.userId || manager)),
        canReply: manager && !comment.parentCommentId && comment.status === 'APPROVED' && novel.status === 'PUBLISHED' && (!comment.chapterId || (chapter?.status === 'PUBLISHED' && !chapter.deleted_at)),
        chapterTitle: chapter?.title ?? null, chapterNumber: chapter?.chapter_number ?? null,
        paragraphOffset: comment.paragraphOffset, content: comment.content, status: comment.status,
        createdAt: comment.createdAt, updatedAt: comment.updatedAt,
        displayName: byId.get(comment.userId)?.display_name ?? 'Tài khoản đã xóa', avatarUrl: byId.get(comment.userId)?.avatar_url ?? null };
    }),
    meta: { page: input.page, limit: input.limit, totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / input.limit) }
  };
}

export async function listAuthorComments(auth: AuthContext, novelId: string, input: { scope: 'ALL' | 'NOVEL' | 'CHAPTER'; chapterId?: string; page: number; limit: number }) {
  await activeAccount(auth);
  const novel = await findNovelById(novelId);
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (!isContentAdmin(auth) && (auth.role !== 'AUTHOR' || novel.authorId !== auth.userId)) throw new AppError(403, 'AUTH_008', 'Chỉ quản lý bình luận thuộc tác phẩm của mình');
  if (input.scope === 'CHAPTER' && !input.chapterId) throw new AppError(400, 'VALIDATION_001', 'Chọn chương cần xem');
  if (input.chapterId) {
    const chapter = await findChapterById(input.chapterId);
    if (!chapter || chapter.novelId !== novelId) throw new AppError(404, 'CONTENT_001', 'Content not found');
  }
  const result = await listApprovedComments({ novelId, chapterId: input.scope === 'CHAPTER' ? input.chapterId! : null, allChapters: input.scope === 'ALL', viewerId: auth.userId, page: input.page, limit: input.limit });
  return present(result, input, auth, novel);
}

export async function createCommentReply(auth: AuthContext, parentId: string, input: UpdateCommentInput) {
  await activeAccount(auth);
  const parent = await findCommentById(parentId);
  if (!parent || parent.parentCommentId || parent.status !== 'APPROVED') throw new AppError(404, 'CONTENT_001', 'Comment not found');
  await publishedTarget(parent.chapterId ?? parent.novelId, parent.chapterId ? 'chapter' : 'novel');
  const novel = await findNovelById(parent.novelId);
  if (!isContentAdmin(auth) && (auth.role !== 'AUTHOR' || novel?.authorId !== auth.userId)) throw new AppError(403, 'AUTH_008', 'Chỉ tác giả của tác phẩm được trả lời tại đây');
  const reply = await createCommentRow({ novelId: parent.novelId, chapterId: parent.chapterId, parentCommentId: parentId, userId: auth.userId, content: input.content });
  if (!await findCommentById(parentId)) { await softDeleteComment(reply.commentId); throw new AppError(404, 'CONTENT_001', 'Comment not found'); }
  const moderated = await moderateComment(reply.commentId, input.content, auth.userId);
  return { commentId: reply.commentId, parentCommentId: parentId, status: moderated?.status ?? 'PENDING_MODERATION' };
}

export async function listCommentReplies(parentId: string, input: ListCommentsInput, auth?: AuthContext) {
  const parent = await findCommentById(parentId);
  if (!parent || parent.parentCommentId) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  const viewer = auth ? await findAuthUserById(auth.userId) : null;
  const viewerAuth = viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth : undefined;
  const novel = await findNovelById(parent.novelId);
  const manager = viewerAuth && (isContentAdmin(viewerAuth) || (viewerAuth.role === 'AUTHOR' && novel?.authorId === viewerAuth.userId));
  if (!manager) await publishedTarget(parent.chapterId ?? parent.novelId, parent.chapterId ? 'chapter' : 'novel');
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (parent.status !== 'APPROVED' && parent.userId !== viewerAuth?.userId) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  const result = await listApprovedComments({ novelId: parent.novelId, chapterId: parent.chapterId, parentCommentId: parentId, viewerId: viewerAuth?.userId, page: input.page, limit: input.limit });
  return present(result, input, viewerAuth, novel);
}

export async function updateComment(auth: AuthContext, commentId: string, input: UpdateCommentInput) {
  await activeAccount(auth);
  const comment = await findCommentById(commentId);
  if (!comment) throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (comment.userId !== auth.userId) throw new AppError(403, 'AUTH_008', 'Chỉ được sửa bình luận của chính mình');
  await publishedTarget(comment.chapterId ?? comment.novelId, comment.chapterId ? 'chapter' : 'novel');
  await updateCommentContent(commentId, input.content);
  const moderated = await moderateComment(commentId, input.content, auth.userId);
  return { commentId, status: moderated?.status ?? 'PENDING_MODERATION', moderationReviewId: moderated?.moderationReviewId ?? null };
}
export async function deleteComment(auth: AuthContext, commentId: string) {
  await activeAccount(auth);
  const comment = await findCommentById(commentId);
  if (!comment) throw new AppError(404, 'CONTENT_001', 'Content not found');
  const novel = await findNovelById(comment.novelId);
  const ownsNovel = auth.role === 'AUTHOR' && novel?.authorId === auth.userId;
  if (comment.userId !== auth.userId && !isContentAdmin(auth) && !ownsNovel) throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  await softDeleteComment(commentId);
}
