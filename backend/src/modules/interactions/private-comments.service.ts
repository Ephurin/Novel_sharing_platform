import type { Filter } from 'mongodb';
import type { AuthContext } from '../../core/security/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { makeAnchor, resolveAnchor } from '../reading/paragraph-anchors.js';
import { authorizeComment, mutualIds, privateCollection, privateRootFilter, privateTarget, unavailable, type Audience } from './comment-privacy.js';
import { createComment, findCommentById, isCommentApproved, softDeleteComment, updateCommentContent, withCommentWriteLock, type CommentDocument } from './comments.repository.js';
import type { CreateCommentInput, ListCommentsInput } from './comments.schemas.js';
import { moderateComment, present } from './comments.service.js';

export function validatePrivateText(input: CreateCommentInput) {
  if (!input.content.trim() || input.imageUrl || input.gifId || input.mentions?.length ||
    /<\s*\/?\s*(?:img|video|audio|iframe|object|embed|svg|picture)\b|!\[|data:|\[img\]|https?:\/\/\S+\.(?:gif|png|jpe?g|webp|mp4)(?:\b|\?)/i.test(input.content))
    throw new AppError(400,'COMMENT_PRIVATE_TEXT_ONLY','Private comments support text only');
}
function immutable(input: CreateCommentInput) {
  if (input.audience !== undefined || input.anchor !== undefined || input.recipientUserIds !== undefined || input.paragraphOffset !== undefined)
    throw new AppError(400,'COMMENT_SCOPE_IMMUTABLE','Reply/edit cannot change audience or anchor');
}
export async function createPrivate(auth: AuthContext, novelId: string, chapterId: string | null, input: CreateCommentInput, replyToId?: string) {
  let root: CommentDocument | undefined;
  let target: CommentDocument | null = null;
  if (replyToId) {
    immutable(input);
    target = await findCommentById(replyToId);
    root = await authorizeComment(target, auth, true);
  }
  if (!env.PRIVATE_COMMENTS_ENABLED) throw new AppError(503,'PRIVATE_COMMENTS_DISABLED','Private comment creation is disabled');
  validatePrivateText(input);
  const { chapter } = await privateTarget(novelId,chapterId,auth);
  const audience = root?.audience ?? input.audience!;
  if (!['FRIENDS_ALL','FRIENDS_SELECTED','AUTHOR_PRIVATE'].includes(audience)) throw new AppError(400,'COMMENT_AUDIENCE','Invalid private audience');
  let recipientUserIds = root?.recipientUserIds;
  if (!root && audience.startsWith('FRIENDS_')) {
    if (!chapter || !input.anchor) throw new AppError(400,'COMMENT_ANCHOR_REQUIRED','Friends comments require a chapter paragraph');
    const mutual = await mutualIds(auth.userId);
    recipientUserIds = audience === 'FRIENDS_ALL' ? mutual : [...new Set(input.recipientUserIds ?? [])];
    if (audience === 'FRIENDS_ALL' && input.recipientUserIds !== undefined) throw new AppError(400,'COMMENT_RECIPIENTS','ALL recipients are set by server');
    if (!recipientUserIds.length || recipientUserIds.some(id=>!mutual.includes(id))) throw new AppError(400,'COMMENT_RECIPIENTS','Choose mutual recipients');
  } else if (!root && input.recipientUserIds !== undefined) throw new AppError(400,'COMMENT_RECIPIENTS','Author feedback has no custom recipients');
  if (input.anchor && !chapter) throw new AppError(400,'COMMENT_ANCHOR_REQUIRED','Anchor requires a chapter');
  const anchor = root?.anchor ?? (input.anchor ? makeAnchor(chapter!.content,input.anchor) : undefined);
  const comment = await createComment({ novelId, chapterId, userId:auth.userId, content:input.content, isSpoiler:input.isSpoiler,
    audience, recipientUserIds, anchor, parentCommentId:root?.commentId, replyToCommentId:target?.commentId, replyToUserId:target?.userId });
  try {
    const moderated = await withCommentWriteLock(comment.commentId, client=>moderateComment(comment,auth.userId,client));
    return { commentId:comment.commentId, parentCommentId:root?.commentId ?? null, novelId, chapterId, audience, moderationReviewId:moderated?.moderationReviewId ?? null, status:moderated?.status };
  } catch (error) { await softDeleteComment(comment.commentId); throw error; }
}
export async function updatePrivate(auth: AuthContext, comment: CommentDocument, input: CreateCommentInput) {
  await authorizeComment(comment,auth);
  if (comment.userId !== auth.userId) throw new AppError(403,'AUTH_008','Only the writer can edit');
  immutable(input); validatePrivateText(input);
  return withCommentWriteLock(comment.commentId,async client=> {
    await authorizeComment(await findCommentById(comment.commentId),auth);
    await client.query("update moderation_reviews set status='REVISION_REQUIRED', reviewed_at=now() where target_type='COMMENT' and target_id=$1 and source='KEYWORD_FILTER' and status='PENDING'",[comment.commentId]);
    const updated = await updateCommentContent(comment.commentId,input.content,{isSpoiler:input.isSpoiler});
    if (!updated) return unavailable();
    const result = await moderateComment(updated,auth.userId,client);
    return {commentId:comment.commentId,status:result?.status};
  });
}
export async function presentPrivate(items: CommentDocument[], totalItems: number, input: {page:number;limit:number}, auth: AuthContext) {
  const data = [];
  for (const item of items) {
    const {novel,chapter} = await privateTarget(item.novelId,item.chapterId,auth);
    const rendered = await present({items:[item],totalItems:1},input,auth,novel);
    data.push({...rendered.data[0],audience:item.audience,canDelete:item.userId===auth.userId,
      canReply:isCommentApproved(item),status:item.status,
      anchor:item.anchor && chapter ? resolveAnchor(chapter.content,item.anchor) : null});
  }
  return {data,meta:{page:input.page,limit:input.limit,totalItems,totalPages:Math.ceil(totalItems/input.limit)}};
}
export async function listPrivate(auth: AuthContext | undefined, input: ListCommentsInput, filter: Filter<CommentDocument> = {}) {
  if (!auth) throw new AppError(401,'AUTH_002','Authentication required');
  const scope = await privateRootFilter(auth,input.channel as Audience | undefined);
  const query: Filter<CommentDocument> = {$and:[scope,filter,...(input.paragraphId ? [{'anchor.paragraphId':input.paragraphId}] : [])]};
  const col=privateCollection();
  const [items,total] = await Promise.all([col.find(query).sort({createdAt:-1,commentId:1}).skip((input.page-1)*input.limit).limit(input.limit).toArray(),col.countDocuments(query)]);
  return presentPrivate(items,total,input,auth);
}
export async function privateReplies(rootId:string,input:{page:number;limit:number},auth?:AuthContext) {
  const root=await findCommentById(rootId); await authorizeComment(root,auth);
  if (!auth || !root || root.parentCommentId) return unavailable();
  const filter: Filter<CommentDocument>={parentCommentId:rootId,deletedAt:null,$or:[{status:'APPROVED'},{userId:auth.userId,status:{$in:['PENDING_MODERATION','REJECTED']}}]};
  const col=privateCollection();
  const [items,total]=await Promise.all([col.find(filter).sort({createdAt:1,commentId:1}).skip((input.page-1)*input.limit).limit(input.limit).toArray(),col.countDocuments(filter)]);
  return presentPrivate(items,total,input,auth);
}
