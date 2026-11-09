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
}

export async function createComment(input: {
  chapterId: string | null;
  novelId: string;
  userId: string;
  parentCommentId?: string | null;
  paragraphOffset?: number | null;
  content: string;
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
  paragraphOffset?: number;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {
    ...(input.allChapters ? {} : { chapterId: input.chapterId }),
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

export async function updateCommentContent(commentId: string, content: string) {
  await collection().updateOne(
    { commentId, deletedAt: null },
    {
      $set: {
        content,
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
