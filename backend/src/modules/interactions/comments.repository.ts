import { randomUUID } from 'node:crypto';
import { getMongoDatabase } from '../../core/database/mongo.js';

const collectionName = 'comments';

export type CommentStatus = 'PENDING_MODERATION' | 'APPROVED' | 'REJECTED' | 'DELETED';

export type CommentDocument = {
  commentId: string;
  chapterId: string | null;
  novelId: string;
  userId: string;
  parentCommentId?: string | null;
  paragraphOffset: number | null;
  content: string;
  isSpoiler?: boolean;
  imageUrl?: string | null;
  gifId?: string | null;
  status: CommentStatus;
  moderationReviewId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function collection() {
  return getMongoDatabase().collection<CommentDocument>(collectionName);
}

export async function ensureCommentIndexes() {
  await collection().createIndex({ commentId: 1 }, { unique: true });
  await collection().createIndex({ chapterId: 1, status: 1, paragraphOffset: 1 });
  await collection().createIndex({ novelId: 1, chapterId: 1, status: 1, createdAt: -1, commentId: 1 });
  await collection().createIndex({ parentCommentId: 1, status: 1, createdAt: 1, commentId: 1 });
  await collection().createIndex({ userId: 1, createdAt: -1 });
  await collection().createIndex({ status: 1, createdAt: -1 });
  await reactions().createIndex({ commentId: 1, userId: 1 }, { unique: true });
}

export async function createComment(input: {
  chapterId: string | null;
  novelId: string;
  userId: string;
  parentCommentId?: string | null;
  paragraphOffset?: number | null;
  content: string;
  isSpoiler?: boolean;
  imageUrl?: string | null;
  gifId?: string | null;
}) {
  const now = new Date();
  const comment: CommentDocument = {
    commentId: randomUUID(),
    chapterId: input.chapterId,
    novelId: input.novelId,
    userId: input.userId,
    parentCommentId: input.parentCommentId ?? null,
    paragraphOffset: input.paragraphOffset ?? null,
    content: input.content,
    isSpoiler: input.isSpoiler ?? false,
    imageUrl: input.imageUrl ?? null,
    gifId: input.gifId ?? null,
    status: 'PENDING_MODERATION',
    moderationReviewId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };

  await collection().insertOne(comment);
  return comment;
}

export async function updateCommentModerationStatus(
  commentId: string,
  status: CommentStatus,
  moderationReviewId: string | null,
  expectedReviewId?: string
) {
  await collection().updateOne(
    { commentId, deletedAt: null, ...(expectedReviewId ? { moderationReviewId: expectedReviewId, status: 'PENDING_MODERATION' as const } : {}) },
    {
      $set: {
        status,
        moderationReviewId,
        notificationPending: status === 'APPROVED',
        updatedAt: new Date()
      }
    }
  );

  return findCommentById(commentId);
}

export async function listApprovedComments(input: {
  chapterId: string | null;
  novelId: string;
  viewerId?: string;
  parentCommentId?: string;
  allChapters?: boolean;
  visibleChapterIds?: string[];
  paragraphOffset?: number;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {
    ...(input.allChapters ? {} : { chapterId: input.chapterId }),
    ...(input.visibleChapterIds ? { chapterId: { $in: [null, ...input.visibleChapterIds] } } : {}),
    parentCommentId: input.parentCommentId ?? null,
    novelId: input.novelId,
    $or: [{ status: 'APPROVED' }, ...(input.viewerId ? [{ userId: input.viewerId, status: { $in: ['PENDING_MODERATION', 'REJECTED'] } }] : [])],
    deletedAt: null
  };

  if (input.paragraphOffset !== undefined) {
    filter.paragraphOffset = input.paragraphOffset;
  }

  const skip = (input.page - 1) * input.limit;
  const [items, totalItems] = await Promise.all([
    collection().find(filter).sort({ createdAt: input.parentCommentId ? 1 : -1, commentId: 1 }).skip(skip).limit(input.limit).toArray(),
    collection().countDocuments(filter)
  ]);

  return { items, totalItems };
}

export async function findCommentById(commentId: string) {
  return collection().findOne({ commentId, deletedAt: null });
}

export async function findCommentRecordById(commentId: string) {
  return collection().findOne({ commentId });
}

export async function updateCommentContent(commentId: string, content: string, options: { isSpoiler?: boolean; imageUrl?: string | null; gifId?: string | null } = {}) {
  await collection().updateOne(
    { commentId, deletedAt: null },
    {
      $set: {
        content,
        ...(options.isSpoiler !== undefined ? { isSpoiler: options.isSpoiler } : {}),
        ...(options.imageUrl !== undefined ? { imageUrl: options.imageUrl } : {}),
        ...(options.gifId !== undefined ? { gifId: options.gifId } : {}),
        status: 'PENDING_MODERATION',
        moderationReviewId: null,
        updatedAt: new Date()
      }
    }
  );

  return findCommentById(commentId);
}

export async function softDeleteComment(commentId: string) {
  await collection().updateMany(
    { $or: [{ commentId }, { parentCommentId: commentId }], deletedAt: null },
    {
      $set: {
        status: 'DELETED',
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    }
  );
}

export async function countVisibleReplies(parentIds: string[], viewerId?: string) {
  return collection().aggregate<{ _id: string; total: number }>([
    { $match: { parentCommentId: { $in: parentIds }, deletedAt: null,
      $or: [{ status: 'APPROVED' }, ...(viewerId ? [{ userId: viewerId, status: { $in: ['PENDING_MODERATION', 'REJECTED'] } }] : [])] } },
    { $group: { _id: '$parentCommentId', total: { $sum: 1 } } }
  ]).toArray();
}

export type CommentReaction = 'LIKE' | 'DISLIKE';
type ReactionDocument = { commentId: string; userId: string; reaction: CommentReaction; updatedAt: Date };
function reactions() {
  return getMongoDatabase().collection<ReactionDocument>('comment_reactions');
}

export async function setCommentReaction(commentId: string, userId: string, reaction: CommentReaction | null) {
  if (!reaction) {
    await reactions().deleteOne({ commentId, userId });
    return;
  }
  const update = { $set: { reaction, updatedAt: new Date() } };
  try {
    await reactions().updateOne({ commentId, userId }, update, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await reactions().updateOne({ commentId, userId }, update);
  }
}

export async function commentReactionCounts(commentIds: string[], viewerId?: string) {
  if (!commentIds.length) return [];
  return reactions().aggregate<{ _id: string; likesCount: number; dislikesCount: number; myReaction: CommentReaction | null }>([
    { $match: { commentId: { $in: commentIds } } },
    { $group: {
      _id: '$commentId',
      likesCount: { $sum: { $cond: [{ $eq: ['$reaction', 'LIKE'] }, 1, 0] } },
      dislikesCount: { $sum: { $cond: [{ $eq: ['$reaction', 'DISLIKE'] }, 1, 0] } },
      myReaction: { $max: { $cond: [{ $eq: ['$userId', viewerId ?? ''] }, '$reaction', null] } }
    } }
  ]).toArray();
}
