import type { Filter } from 'mongodb';
import { getPostgresPool } from '../../core/database/postgres.js';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { isContentAdmin } from '../../core/security/auth-context.js';
import { findReadableChapter } from '../reading/reading.repository.js';
import { assertChapterAccess } from '../reading/reading.service.js';
import { findNovelById } from '../novels/novels.repository.js';
import type { ParagraphAnchor } from '../reading/paragraph-anchors.js';
import { findCommentById, isCommentApproved, type CommentDocument } from './comments.repository.js';

export type Audience = 'PUBLIC' | 'FRIENDS_ALL' | 'FRIENDS_SELECTED' | 'AUTHOR_PRIVATE';
export type Mention = { userId: string; start: number; end: number };
export type PrivacyFields = { audience?: Audience; recipientUserIds?: string[]; anchor?: ParagraphAnchor; mentions?: Mention[] };
export const privateComment = (comment: PrivacyFields) => Boolean(comment.audience && comment.audience !== 'PUBLIC');
export function unavailable(): never { throw new AppError(404, 'CONTENT_001', 'Comment not found'); }
export async function mutualIds(userId: string) {
  const result = await getPostgresPool().query(`select f.author_id from follows f join users u on u.user_id=f.author_id
    where f.follower_id=$1 and u.status='ACTIVE' and u.deleted_at is null
    and exists(select 1 from follows r where r.author_id=$1 and r.follower_id=f.author_id)`, [userId]);
  return result.rows.map(row => row.author_id as string);
}
export async function validateMentions(userId: string, content: string, mentions: Mention[] = []) {
  const mutual = new Set(await mutualIds(userId));
  const profiles = mentions.length ? (await getPostgresPool().query('select user_id,username from users where user_id=any($1::uuid[])', [mentions.map(m=>m.userId)])).rows : [];
  const names = new Map(profiles.map(p=>[p.user_id,p.username]));
  let end = 0;
  for (const mention of [...mentions].sort((a,b)=>a.start-b.start)) {
    if (!mutual.has(mention.userId) || mention.start < end || content.slice(mention.start,mention.end) !== '@'+names.get(mention.userId))
      throw new AppError(400, 'COMMENT_MENTION_INVALID', 'Select a mutual account from suggestions');
    end = mention.end;
  }
  return mentions;
}
export async function privateTarget(novelId: string, chapterId: string | null, auth: AuthContext) {
  await assertActiveAccount(auth);
  const novel = await findNovelById(novelId);
  if (!novel || novel.status !== 'PUBLISHED') return unavailable();
  const chapter = chapterId ? await findReadableChapter(chapterId) : null;
  if (chapterId) {
    if (!chapter || chapter.novelId !== novelId) return unavailable();
    try { await assertChapterAccess(chapter, auth); } catch (error) {
      if (error instanceof AppError) return unavailable();
      throw error;
    }
  }
  return { novel, chapter };
}
export async function authorizeComment(comment: CommentDocument | null, auth?: AuthContext, approvedOnly=false) {
  if (!comment || comment.deletedAt) return unavailable();
  const root = comment.parentCommentId ? await findCommentById(comment.parentCommentId) : comment;
  if (!root || root.parentCommentId || root.novelId !== comment.novelId || root.chapterId !== comment.chapterId) return unavailable();
  if (privateComment(root)) {
    if (!auth) return unavailable();
    const { novel } = await privateTarget(root.novelId, root.chapterId, auth);
    if (root.userId !== auth.userId) {
      if (root.audience === 'AUTHOR_PRIVATE') { if (novel.authorId !== auth.userId) return unavailable(); }
      else if (!root.recipientUserIds?.includes(auth.userId) || !(await mutualIds(auth.userId)).includes(root.userId)) return unavailable();
    }
  }
  if ((!isCommentApproved(root) && (approvedOnly || root.userId !== auth?.userId)) ||
      (!isCommentApproved(comment) && (approvedOnly || comment.userId !== auth?.userId))) return unavailable();
  return root;
}

// Precompute eligible SQL targets and mutual authors once, then filter BEFORE Mongo pagination/count.
export async function privateRootFilter(auth: AuthContext, audience?: Audience): Promise<Filter<CommentDocument>> {
  await assertActiveAccount(auth);
  const pool = getPostgresPool();
  const [novels, chapters, mutual] = await Promise.all([
    pool.query("select novel_id,author_id from novels where status='PUBLISHED' and deleted_at is null"),
    pool.query(`select c.chapter_id from chapters c join novels n on n.novel_id=c.novel_id
      where c.status='PUBLISHED' and c.deleted_at is null and n.status='PUBLISHED' and n.deleted_at is null
        and (not c.is_vip or n.author_id=$1 or $2::boolean or exists(select 1 from chapter_unlocks x where x.chapter_id=c.chapter_id and x.user_id=$1))`, [auth.userId,isContentAdmin(auth)]),
    mutualIds(auth.userId)
  ]);
  const owned = novels.rows.filter(n=>n.author_id===auth.userId).map(n=>n.novel_id);
  return { $and: [
    { parentCommentId: null, deletedAt: null, novelId: { $in: novels.rows.map(n=>n.novel_id) }, chapterId: { $in: [null,...chapters.rows.map(c=>c.chapter_id)] } },
    { audience: audience ?? { $in: ['FRIENDS_ALL','FRIENDS_SELECTED','AUTHOR_PRIVATE'] } },
    { $or: [{ userId: auth.userId }, { audience: 'AUTHOR_PRIVATE', novelId: { $in: owned } },
      { audience: { $in: ['FRIENDS_ALL','FRIENDS_SELECTED'] }, recipientUserIds: auth.userId, userId: { $in: mutual } }] },
    { $or: [{ status: 'APPROVED' }, { userId: auth.userId, status: { $in: ['PENDING_MODERATION','REJECTED'] } }] }
  ] };
}
export function privateCollection() { return getMongoDatabase().collection<CommentDocument>('comments'); }
