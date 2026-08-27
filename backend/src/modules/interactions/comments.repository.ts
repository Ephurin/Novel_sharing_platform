import { randomUUID } from 'node:crypto';
import { getMongoDatabase } from '../../core/database/mongo.js';

const collectionName = 'comments';

export type CommentStatus = 'PENDING_MODERATION' | 'APPROVED' | 'REJECTED' | 'DELETED';

export type CommentDocument = {
  commentId: string;
  chapterId: string;
  novelId: string;
  userId: string;
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
  await collection().createIndex({ userId: 1, createdAt: -1 });
  await collection().createIndex({ status: 1, createdAt: -1 });
}

export async function createComment(input: {
  chapterId: string;
  novelId: string;
  userId: string;
  paragraphOffset?: number | null;
  content: string;
}) {
  const now = new Date();
  const comment: CommentDocument = {
    commentId: randomUUID(),
    chapterId: input.chapterId,
    novelId: input.novelId,
    userId: input.userId,
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
  moderationReviewId: string | null
) {
  await collection().updateOne(
    { commentId },
    {
      $set: {
        status,
        moderationReviewId,
        updatedAt: new Date()
      }
    }
  );

  return findCommentById(commentId);
}

export async function listApprovedComments(input: {
  chapterId: string;
  paragraphOffset?: number;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {
    chapterId: input.chapterId,
    status: 'APPROVED',
    deletedAt: null
  };

  if (input.paragraphOffset !== undefined) {
    filter.paragraphOffset = input.paragraphOffset;
  }

  const skip = (input.page - 1) * input.limit;
  const [items, totalItems] = await Promise.all([
    collection().find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).toArray(),
    collection().countDocuments(filter)
  ]);

  return { items, totalItems };
}

export async function findCommentById(commentId: string) {
  return collection().findOne({ commentId, deletedAt: null });
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
  await collection().updateOne(
    { commentId, deletedAt: null },
    {
      $set: {
        status: 'DELETED',
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    }
  );
}
