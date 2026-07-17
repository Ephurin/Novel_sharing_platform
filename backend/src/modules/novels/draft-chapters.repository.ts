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
  return collection().findOne({ chapterId });
}
