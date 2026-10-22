import { withChapterWriter, type ChapterWriterLease } from './chapter-writer.js';
import { findLatestRevisionByChapterId } from './chapter-revisions.repository.js';
import { ObjectId } from 'mongodb';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';

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
  expectedVersion?: number;
}) {
  const now = new Date();

  let saved;
  try {
    saved = await collection().findOneAndUpdate(
    { chapterId: input.chapterId, ...(input.expectedVersion !== undefined ? { version: input.expectedVersion } : {}) },
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
    { upsert: input.expectedVersion === undefined || input.expectedVersion === 0, returnDocument: 'after' }
  );
  } catch (error: any) {
    if (error?.code !== 11000 || input.expectedVersion === undefined) throw error;
  }
  if (saved) return saved;
  const current = await findDraftChapterByChapterId(input.chapterId);
  // A retry of the same successful body/title must not create another version.
  if (current && input.expectedVersion !== undefined && current.version > input.expectedVersion &&
      current.authorId === input.authorId && current.novelId === input.novelId &&
      current.title === input.title && current.content === input.content) return current;
  throw new AppError(409, 'DRAFT_CONFLICT', 'Draft changed or another save is in progress; reload before retrying');
}

export async function syncDraftFromRevisionConditional(input: {
  chapterId: string;
  revisionId: string;
  title?: string;
  content: string;
  wordCount: number;
  acceptTimestamp: Date;
  novelId?: string;
  authorId?: string;
}, parent?: ChapterWriterLease): Promise<{ status: 'synced' | 'skipped_newer_draft'; draft?: DraftChapterDocument | null }> {
  return withChapterWriter(input.chapterId, async () => {
    const latest = await findLatestRevisionByChapterId(undefined, input.chapterId);
    if (latest && latest.revisionId !== input.revisionId) return { status: 'skipped_newer_draft' as const };
    return syncDraftUnderLease(input);
  }, parent);
}
async function syncDraftUnderLease(input: Parameters<typeof syncDraftFromRevisionConditional>[0]): Promise<{ status: 'synced' | 'skipped_newer_draft'; draft?: DraftChapterDocument | null }> {
  const now = new Date();
  const existing = await collection().findOne({ chapterId: input.chapterId, deletedAt: null });
  if (existing) {
    if (existing.updatedAt && existing.updatedAt > input.acceptTimestamp) {
      return { status: 'skipped_newer_draft', draft: existing };
    }
  } else {
    // If draft does not exist yet, atomically create it with trusted ownership
    const newDraft: DraftChapterDocument = {
      novelId: input.novelId ?? '',
      chapterId: input.chapterId,
      authorId: input.authorId ?? '',
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
    try {
      await collection().insertOne(newDraft as any);
      return { status: 'synced', draft: newDraft };
    } catch (err: any) {
      if (err?.code === 11000 || String(err?.message).includes('E11000')) {
        const found = await collection().findOne({ chapterId: input.chapterId, deletedAt: null });
        if (found && found.updatedAt && found.updatedAt > input.acceptTimestamp) {
          return { status: 'skipped_newer_draft', draft: found };
        }
      } else {
        throw err;
      }
    }
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
        ...(input.novelId ? { novelId: input.novelId } : {}),
        ...(input.authorId ? { authorId: input.authorId } : {}),
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
