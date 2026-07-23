import { ObjectId } from 'mongodb';
import { getMongoDatabase } from '../../core/database/mongo.js';

const collectionName = 'draft_chapters';

export type DraftChapterDocument = {
  _id?: ObjectId;
  chapterId: string;
  novelId: string;
  authorId: string;
  title: string;
  content: string;
  wordCount: number;
  version: number;
  autosave: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletionReason?: string | null;
  restoredAt?: Date | null;
};

function collection() {
  return getMongoDatabase().collection<DraftChapterDocument>(collectionName);
}

export async function ensureDraftChapterIndexes() {
  await collection().createIndex({ chapterId: 1, updatedAt: -1 });
  await collection().createIndex({ novelId: 1, authorId: 1 });
  await collection().createIndex({ chapterId: 1 }, { unique: true });
}

export async function upsertDraftChapter(input: {
  chapterId: string;
  novelId: string;
  authorId: string;
  title: string;
  content: string;
  wordCount: number;
  autosave: boolean;
}) {
  const now = new Date();

  await collection().updateOne(
    { chapterId: input.chapterId },
    {
      $set: {
        novelId: input.novelId,
        authorId: input.authorId,
        title: input.title,
        content: input.content,
        wordCount: input.wordCount,
        autosave: input.autosave,
        deletedAt: null,
        deletionReason: null,
        updatedAt: now
      },
      $setOnInsert: {
        chapterId: input.chapterId,
        createdAt: now
      },
      $inc: {
        version: 1
      }
    },
    { upsert: true }
  );

  return findDraftChapterByChapterId(input.chapterId);
}

export async function findDraftChapterByChapterId(chapterId: string) {
  return collection().findOne({ chapterId, deletedAt: null });
}

export async function markDraftChaptersDeletedByNovelId(novelId: string, reason: string | undefined) {
  const now = new Date();
  return collection().updateMany(
    { novelId, deletedAt: null },
    {
      $set: {
        deletedAt: now,
        deletionReason: reason ?? null,
        updatedAt: now
      }
    }
  );
}

export async function restoreDraftChaptersByNovelId(novelId: string) {
  const now = new Date();
  return collection().updateMany(
    { novelId, deletedAt: { $ne: null } },
    {
      $set: {
        deletedAt: null,
        deletionReason: null,
        restoredAt: now,
        updatedAt: now
      }
    }
  );
}
