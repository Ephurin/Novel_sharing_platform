import { authorizeComment, privateComment, validateMentions } from './comment-privacy.js';
import { createPrivate, updatePrivate, listPrivate, privateReplies } from './private-comments.service.js';
import { isContentAdmin } from '../../core/security/auth-context.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { findAuthUserById } from '../auth/auth.repository.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import { checkContent } from '../content-control/content-control.service.js';
import { validateGiphyGif } from '../media/giphy.service.js';
import { isCommentPublic, withCommentWriteLock } from './comments.repository.js';
import type { PoolClient } from 'pg';
import type { CommentLocationInput, CreateCommentInput, ListCommentsInput, UpdateCommentInput } from './comments.schemas.js';
import { commentPage } from './comments.repository.js';
import { type CommentDocument, type CommentReaction, commentReactionCounts, setCommentReaction, countVisibleReplies, createComment as createCommentRow, findCommentById, listApprovedComments, softDeleteComment, updateCommentContent, updateCommentModerationStatus } from './comments.repository.js';

type Target = { chapterId: string | null; novelId: string };
// Approved policy: the ownership exception is an Author/Moderator workspace right; platform Admins moderate only through isContentAdmin.
function canManageOwnedNovelComments(role: AuthContext['role']) {
  return role === 'AUTHOR' || role === 'MODERATOR';
}
async function activeAccount(auth: AuthContext) {
  const account = await findAuthUserById(auth.userId);
  if (!account || account.status !== 'ACTIVE' || account.role !== auth.role) throw new AppError(403, 'AUTH_008', 'Tài khoản không được phép bình luận');
  return account;
}
async function publishedTarget(id: string, kind: 'chapter' | 'novel', client?: PoolClient): Promise<Target> {
  const chapter = kind === 'chapter' ? await findChapterById(id, client) : null;
  const novel = await findNovelById(kind === 'novel' ? id : chapter?.novelId ?? '00000000-0000-0000-0000-000000000000', client);
  if (!novel || novel.status !== 'PUBLISHED' || (kind === 'chapter' && (!chapter || chapter.status !== 'PUBLISHED'))) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }
  return { novelId: novel.novelId, chapterId: chapter?.chapterId ?? null };
}
async function validateAttachment(input: { imageUrl?: string | null; gifId?: string | null }, userId: string) {
  if (input.imageUrl) throw new AppError(400, 'GIF_UPLOAD_DISABLED', 'Tạm ngưng GIF cá nhân. Hãy bỏ tệp và chọn GIF từ kho GIPHY.');
  if (input.gifId) await validateGiphyGif(input.gifId, userId);
}
export async function moderateComment(comment: CommentDocument, userId: string, client: PoolClient) {
  const result = await checkContent({ targetType: 'COMMENT', targetId: comment.commentId, content: comment.content, submittedBy: userId,
    forceReview: Boolean(comment.gifId),
    publicationSnapshot: comment.gifId ? { title: 'Bình luận kèm GIF', content: comment.content, wordCount: 0, gifId: comment.gifId } : undefined
  }, client);
  return updateCommentModerationStatus(comment.commentId, result.moderationRequired ? 'PENDING_MODERATION' : 'APPROVED', result.moderationReviewId);
}
async function create(auth: AuthContext, id: string, kind: 'chapter' | 'novel', input: CreateCommentInput) {
  await activeAccount(auth);
  const target = await publishedTarget(id, kind);
  if (input.audience && input.audience !== 'PUBLIC') return createPrivate(auth,target.novelId,target.chapterId,input);
  if (input.anchor || input.recipientUserIds) throw new AppError(400,'COMMENT_SCOPE','Public comments cannot carry private scope');
  const mentions = await validateMentions(auth.userId,input.content,input.mentions);
  await validateAttachment(input, auth.userId);
  const comment = await createCommentRow({ ...target, userId: auth.userId, paragraphOffset: kind === 'chapter' ? input.paragraphOffset : null,
    content: input.content, mentions, isSpoiler: input.isSpoiler, imageUrl: input.imageUrl, gifId: input.gifId });
  let moderated;
  try {
    moderated = await withCommentWriteLock(comment.commentId, client => moderateComment(comment, auth.userId, client));
  } catch (error) {
    await softDeleteComment(comment.commentId);
    throw error;
  }
  return { commentId: comment.commentId, ...target, status: moderated?.status ?? 'PENDING_MODERATION', moderationReviewId: moderated?.moderationReviewId ?? null };
}
export function createComment(auth: AuthContext, chapterId: string, input: CreateCommentInput) { return create(auth, chapterId, 'chapter', input); }
export function createNovelComment(auth: AuthContext, novelId: string, input: CreateCommentInput) { return create(auth, novelId, 'novel', input); }

async function list(id: string, kind: 'chapter' | 'novel', input: ListCommentsInput & { scope?: 'NOVEL' | 'ALL' }, auth?: AuthContext) {
  const target = await publishedTarget(id, kind);
  if (input.channel && input.channel !== 'PUBLIC') return listPrivate(auth,input,{novelId:target.novelId,...(kind==='chapter'?{chapterId:target.chapterId}:{})});
  const viewer = auth ? await findAuthUserById(auth.userId) : null;
  const allChapters = kind === 'novel' && input.scope === 'ALL';
  const published = allChapters ? await getPostgresPool().query("select chapter_id from chapters where novel_id = $1 and status = 'PUBLISHED' and deleted_at is null", [target.novelId]) : null;
  const viewerAuth = viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth : undefined;
  const result = await listApprovedComments({ ...target, allChapters, visibleChapterIds: published?.rows.map(row => row.chapter_id as string),
    viewerId: viewerAuth?.userId, paragraphOffset: input.paragraphOffset, page: input.page, limit: input.limit });
  const novel = await findNovelById(target.novelId);
  return present(result, input, viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth : undefined, novel!);

}
export function listComments(chapterId: string, input: ListCommentsInput, auth?: AuthContext) { return list(chapterId, 'chapter', input, auth); }
export function listNovelComments(novelId: string, input: ListCommentsInput & { scope?: 'NOVEL' | 'ALL' }, auth?: AuthContext) { return list(novelId, 'novel', input, auth); }

export async function present(result: { items: CommentDocument[]; totalItems: number }, input: { page: number; limit: number }, auth: AuthContext | undefined, novel: { authorId: string; status: string }) {
  const ids = [...new Set(result.items.flatMap(comment => [comment.userId, ...(comment.replyToUserId ? [comment.replyToUserId] : [])]))];
  const chapterIds = [...new Set(result.items.map(comment => comment.chapterId).filter((id): id is string => Boolean(id)))];
  const [profiles, chapters, counts, reactions] = await Promise.all([
    ids.length ? getPostgresPool().query(`select u.user_id, coalesce(p.display_name, u.username) as display_name, p.avatar_url from users u left join user_profiles p on p.user_id=u.user_id where u.user_id=any($1::uuid[]) and u.deleted_at is null`, [ids]) : { rows: [] },
    chapterIds.length ? getPostgresPool().query('select chapter_id, title, chapter_number, status, deleted_at from chapters where chapter_id=any($1::uuid[])', [chapterIds]) : { rows: [] },
    countVisibleReplies(result.items.map(item => item.commentId), auth?.userId),
    commentReactionCounts(result.items.map(item => item.commentId), auth?.userId)
  ]);
  const byId = new Map(profiles.rows.map(row => [row.user_id, row]));
  const byChapter = new Map(chapters.rows.map(row => [row.chapter_id, row]));
  const replyCounts = new Map(counts.map(row => [row._id, row.total]));
  const reactionCounts = new Map(reactions.map(row => [row._id, row]));
  const manager = Boolean(auth && (isContentAdmin(auth) || (auth.userId === novel.authorId && canManageOwnedNovelComments(auth.role))));
  return {
    data: result.items.map(comment => {
      const chapter = comment.chapterId ? byChapter.get(comment.chapterId) : null;
      return { audience: comment.audience ?? 'PUBLIC', mentions: comment.mentions ?? [], commentId: comment.commentId, chapterId: comment.chapterId, novelId: comment.novelId, userId: comment.userId,
        parentCommentId: comment.parentCommentId ?? null, repliesCount: replyCounts.get(comment.commentId) ?? 0,
        replyToCommentId: comment.replyToCommentId ?? null,
        replyToUserId: comment.replyToUserId ?? null,
        replyToDisplayName: comment.replyToUserId ? byId.get(comment.replyToUserId)?.display_name ?? 'Tài khoản đã xóa' : null,
        isAuthor: comment.userId === novel.authorId,
        canDelete: Boolean(auth && (auth.userId === comment.userId || (manager && !(auth.role === 'MODERATOR' && comment.userId !== auth.userId)))),
        canReply: Boolean(auth) && isCommentPublic(comment) && novel.status === 'PUBLISHED' && (!comment.chapterId || (chapter?.status === 'PUBLISHED' && !chapter.deleted_at)),
        chapterTitle: chapter?.title ?? null, chapterNumber: chapter?.chapter_number ?? null,
        paragraphOffset: comment.paragraphOffset, content: comment.content, status: comment.status === 'APPROVED' && !isCommentPublic(comment) ? 'PENDING_MODERATION' : comment.status,
        isSpoiler: comment.isSpoiler ?? false, imageUrl: comment.imageUrl ?? null, gifId: comment.gifId ?? null,
        likesCount: reactionCounts.get(comment.commentId)?.likesCount ?? 0,
        dislikesCount: reactionCounts.get(comment.commentId)?.dislikesCount ?? 0,
        myReaction: reactionCounts.get(comment.commentId)?.myReaction ?? null,
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
  if (!isContentAdmin(auth) && !(auth.userId === novel.authorId && canManageOwnedNovelComments(auth.role))) throw new AppError(403, 'AUTH_008', 'Chỉ quản lý bình luận thuộc tác phẩm của mình');
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
  const target = await findCommentById(parentId);
  if (target && privateComment(target)) return createPrivate(auth,target.novelId,target.chapterId,input,target.commentId);
  if (input.audience !== undefined || input.recipientUserIds !== undefined || input.anchor !== undefined) throw new AppError(400,'COMMENT_SCOPE_IMMUTABLE','Reply inherits scope');
  await validateMentions(auth.userId,input.content,input.mentions);
  if (!target || !isCommentPublic(target)) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  const parent = target.parentCommentId ? await findCommentById(target.parentCommentId) : target;
  if (!parent || parent.parentCommentId || !isCommentPublic(parent) || parent.novelId !== target.novelId || parent.chapterId !== target.chapterId) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  await publishedTarget(parent.chapterId ?? parent.novelId, parent.chapterId ? 'chapter' : 'novel');
  await validateAttachment(input, auth.userId);
  const reply = await createCommentRow({ novelId: parent.novelId, chapterId: parent.chapterId, parentCommentId: parent.commentId, userId: auth.userId,
    replyToCommentId: target.commentId, replyToUserId: target.userId,
    content: input.content, mentions: input.mentions, imageUrl: input.imageUrl, gifId: input.gifId, isSpoiler: Boolean(parent.isSpoiler || target.isSpoiler || input.isSpoiler) });
  if (!await findCommentById(parent.commentId) || !await findCommentById(target.commentId)) { await softDeleteComment(reply.commentId); throw new AppError(404, 'CONTENT_001', 'Comment not found'); }
  let moderated;
  try {
    moderated = await withCommentWriteLock(reply.commentId, client => moderateComment(reply, auth.userId, client));
  } catch (error) {
    await softDeleteComment(reply.commentId);
    throw error;
  }
  return { commentId: reply.commentId, parentCommentId: parent.commentId, status: moderated?.status ?? 'PENDING_MODERATION' };
}

export async function listCommentReplies(parentId: string, input: ListCommentsInput, auth?: AuthContext, focus?: CommentDocument) {
  const parent = await findCommentById(parentId);
  if (parent && privateComment(parent)) return privateReplies(parentId,input,auth,focus);
  if (!parent || parent.parentCommentId) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  const viewer = auth ? await findAuthUserById(auth.userId) : null;
  const viewerAuth = viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth : undefined;
  const novel = await findNovelById(parent.novelId);
  const manager = viewerAuth && (isContentAdmin(viewerAuth) || (viewerAuth.userId === novel?.authorId && canManageOwnedNovelComments(viewerAuth.role)));
  if (!manager) await publishedTarget(parent.chapterId ?? parent.novelId, parent.chapterId ? 'chapter' : 'novel');
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (!isCommentPublic(parent) && parent.userId !== viewerAuth?.userId) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  const filter = { novelId: parent.novelId, chapterId: parent.chapterId, parentCommentId: parentId, viewerId: viewerAuth?.userId, page: input.page, limit: input.limit };
  if (focus) filter.page = await commentPage(focus, filter);
  const result = await listApprovedComments(filter);
  if (focus && !result.items.some(item => item.commentId === focus.commentId)) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  return present(result, filter, viewerAuth, novel);
}

export async function locateComment(commentId: string, input: CommentLocationInput, auth?: AuthContext) {
  const target = await publishedTarget(input.targetId, input.kind);
  const viewer = auth ? await findAuthUserById(auth.userId) : null;
  const viewerId = viewer?.status === 'ACTIVE' && viewer.role === auth?.role ? auth?.userId : undefined;
  const visible = (comment: CommentDocument | null) => comment && (isCommentPublic(comment) || comment.userId === viewerId);
  const comment = await findCommentById(commentId);
  if (comment && privateComment(comment)) throw new AppError(404,'CONTENT_001','Use the authenticated thread endpoint');
  if (!visible(comment) || !comment || comment.novelId !== target.novelId || (input.kind === 'chapter' && comment.chapterId !== target.chapterId)) {
    throw new AppError(404, 'CONTENT_001', 'Bình luận không còn hiển thị.');
  }
  await publishedTarget(comment.chapterId ?? comment.novelId, comment.chapterId ? 'chapter' : 'novel');
  const root = comment.parentCommentId ? await findCommentById(comment.parentCommentId) : comment;
  if (!root || !visible(root) || root.parentCommentId || root.novelId !== comment.novelId || root.chapterId !== comment.chapterId) {
    throw new AppError(404, 'CONTENT_001', 'Bình luận không còn hiển thị.');
  }
  const published = input.kind === 'novel'
    ? await getPostgresPool().query("select chapter_id from chapters where novel_id=$1 and status='PUBLISHED' and deleted_at is null", [target.novelId]) : null;
  const [page, replyPage] = await Promise.all([
    commentPage(root, { ...target, allChapters: input.kind === 'novel', visibleChapterIds: published?.rows.map(row => row.chapter_id as string), viewerId, page: 1, limit: input.limit }),
    comment.parentCommentId ? commentPage(comment, { novelId: root.novelId, chapterId: root.chapterId, parentCommentId: root.commentId, viewerId, page: 1, limit: input.replyLimit }) : 1
  ]);
  return { rootCommentId: root.commentId, page, replyPage };
}

export async function updateComment(auth: AuthContext, commentId: string, input: UpdateCommentInput) {
  await activeAccount(auth);
  const existing = await findCommentById(commentId);
  if (existing && privateComment(existing)) return updatePrivate(auth,existing,input);
  if (input.audience !== undefined || input.recipientUserIds !== undefined || input.anchor !== undefined) throw new AppError(400,'COMMENT_SCOPE_IMMUTABLE','Cannot change scope');
  await validateMentions(auth.userId,input.content,input.mentions);
  return withCommentWriteLock(commentId, async client => {
    const comment = await findCommentById(commentId);
    if (!comment) throw new AppError(404, 'CONTENT_001', 'Content not found');
    if (comment.userId !== auth.userId) throw new AppError(403, 'AUTH_008', 'Chỉ được sửa bình luận của chính mình');
    await publishedTarget(comment.chapterId ?? comment.novelId, comment.chapterId ? 'chapter' : 'novel', client);
    const changes = { ...input };
    if (input.imageUrl) changes.gifId = null;
    if (input.gifId) changes.imageUrl = null;
    await validateAttachment({ ...comment, ...changes }, auth.userId);
    { // Every edit supersedes pending review evidence, including text-only mentions.
      await client.query("update moderation_reviews set status='REVISION_REQUIRED',reason='Superseded by an edited comment',reviewed_at=now() where target_type='COMMENT' and target_id=$1 and source='KEYWORD_FILTER' and status='PENDING'", [commentId]);
    }
    const updated = await updateCommentContent(commentId, input.content, changes);
    if (!updated) throw new AppError(404, 'CONTENT_001', 'Comment not found');
    const moderated = await moderateComment(updated, auth.userId, client);
    return { commentId, status: moderated?.status ?? 'PENDING_MODERATION', moderationReviewId: moderated?.moderationReviewId ?? null };
  });
}
export async function deleteComment(auth: AuthContext, commentId: string) {
  await activeAccount(auth);
  const comment = await findCommentById(commentId);
  if (!comment) throw new AppError(404, 'CONTENT_001', 'Content not found');
  if (privateComment(comment)) {
    await authorizeComment(comment,auth);
    if (comment.userId !== auth.userId) throw new AppError(403,'AUTH_008','Only the writer can delete');
    await softDeleteComment(commentId); return;
  }
  const novel = await findNovelById(comment.novelId);
  const ownsNovel = Boolean(novel && novel.authorId === auth.userId && canManageOwnedNovelComments(auth.role));
  if (comment.userId !== auth.userId && !isContentAdmin(auth) && !ownsNovel) throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  // A Moderator reachable through the owner exception is never independent from their own novel.
  if (comment.userId !== auth.userId && ownsNovel && auth.role === 'MODERATOR') assertIndependentActor(auth.userId, [novel!.authorId]);
  await softDeleteComment(commentId);
}

export async function reactToComment(auth: AuthContext, commentId: string, reaction: CommentReaction | null) {
  await activeAccount(auth);
  const comment = await findCommentById(commentId);
  if (comment && privateComment(comment)) {
    await authorizeComment(comment,auth,true);
    await setCommentReaction(commentId,auth.userId,reaction);
    const [counts] = await commentReactionCounts([commentId],auth.userId);
    return {likesCount:counts?.likesCount??0,dislikesCount:counts?.dislikesCount??0,myReaction:counts?.myReaction??null};
  }
  if (!comment || !isCommentPublic(comment)) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  if (comment.parentCommentId) {
    const parent = await findCommentById(comment.parentCommentId);
    if (!parent || !isCommentPublic(parent)) throw new AppError(404, 'CONTENT_001', 'Comment not found');
  }
  await publishedTarget(comment.chapterId ?? comment.novelId, comment.chapterId ? 'chapter' : 'novel');
  await setCommentReaction(commentId, auth.userId, reaction);
  const [counts] = await commentReactionCounts([commentId], auth.userId);
  return { likesCount: counts?.likesCount ?? 0, dislikesCount: counts?.dislikesCount ?? 0, myReaction: counts?.myReaction ?? null };
}
