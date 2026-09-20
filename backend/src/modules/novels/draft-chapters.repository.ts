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
  lastAcceptedRevisionId?: string | null;
  lastAcceptedAt?: Date | null;
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
  lastAcceptedRevisionId?: string | null;
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
        ...(input.lastAcceptedRevisionId !== undefined
          ? { lastAcceptedRevisionId: input.lastAcceptedRevisionId, lastAcceptedAt: now }
          : {}),
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

export async function syncDraftFromRevisionConditional(input: {
  chapterId: string;
  revisionId: string;
  title?: string;
  content: string;
  wordCount: number;
  acceptTimestamp: Date;
  novelId?: string;
}): Promise<{ status: 'synced' | 'skipped_newer_draft'; draft?: DraftChapterDocument | null }> {
  const now = new Date();
  const existing = await collection().findOne({ chapterId: input.chapterId, deletedAt: null });
  if (existing) {
    if (existing.updatedAt && existing.updatedAt > input.acceptTimestamp) {
      return { status: 'skipped_newer_draft', draft: existing };
    }
  } else {
    // If draft does not exist yet, atomically create it
    const newDraft: DraftChapterDocument = {
      novelId: input.novelId ?? '',
      chapterId: input.chapterId,
      authorId: '',
      title: input.title ?? 'Chương mới',
      content: input.content,
      wordCount: input.wordCount,
      version: 1,
      autosave: false,
      lastAcceptedRevisionId: input.revisionId,
      lastAcceptedAt: input.acceptTimestamp,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await collection().insertOne(newDraft as any);
    return { status: 'synced', draft: newDraft };
  }

  const result = await collection().updateOne(
    {
      chapterId: input.chapterId,
      $or: [
        { updatedAt: { $lte: input.acceptTimestamp } },
        { updatedAt: { $exists: false } }
      ]
    },
    {
      $set: {
        ...(input.title ? { title: input.title } : {}),
        content: input.content,
        wordCount: input.wordCount,
        lastAcceptedRevisionId: input.revisionId,
        lastAcceptedAt: input.acceptTimestamp,
        updatedAt: now
      },
      $inc: { version: 1 }
    }
  );

  if (result.matchedCount === 0 && existing) {
    return { status: 'skipped_newer_draft', draft: existing };
  }

  const updated = await findDraftChapterByChapterId(input.chapterId);
  return { status: 'synced', draft: updated };
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
