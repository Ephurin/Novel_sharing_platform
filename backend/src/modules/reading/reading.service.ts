import { isContentAdmin } from '../../core/security/auth-context.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import type {
  AddLibraryItemInput,
  HistoryListInput,
  ReadingPreferencesInput,
  SearchNovelsInput,
  SyncReadingHistoryInput
} from './reading.schemas.js';
import {
  addBookmark,
  findOrCreateReadingPreference,
  findPublishedNovelDetail,
  findReadableChapter,
  findReadingHistory,
  incrementNovelViews,
  listBookmarks,
  listPublishedChaptersForNovel,
  listReadingHistories,
  listReadingFilters,
  removeBookmark,
  searchPublishedNovels,
  updateReadingPreference,
  upsertReadingHistory,
  recordChapterRead
} from './reading.repository.js';
import { userHasChapterUnlock } from '../wallet/wallet.repository.js';

function buildMeta(totalItems: number, page: number, limit: number) {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit)
  };
}

export async function getPreferences(auth: AuthContext) {
  return findOrCreateReadingPreference(auth.userId);
}

export async function savePreferences(auth: AuthContext, input: ReadingPreferencesInput) {
  return updateReadingPreference(auth.userId, input);
}

export async function getReadingFilters() {
  return listReadingFilters();
}

export async function searchNovels(input: SearchNovelsInput) {
  const result = await searchPublishedNovels(input);

  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function getReaderNovel(novelId: string) {
  const novel = await findPublishedNovelDetail(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const chapters = await listPublishedChaptersForNovel(novelId);

  return {
    ...novel,
    chapters
  };
}

export async function getReaderChapter(chapterId: string, auth?: AuthContext) {
  const chapter = await findReadableChapter(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const owner = await assertChapterAccess(chapter, auth);

  if (auth) await recordChapterRead(auth.userId, chapter.novelId, chapterId);

  if (!owner) await incrementNovelViews(chapter.novelId);
  const { authorId: _authorId, ...readable } = chapter;
  return readable;
}

/** History writes must satisfy the same access policy as content reads. */
async function assertChapterAccess(chapter: { chapterId: string; authorId: string; isVip: boolean }, auth?: AuthContext) {
  const owner = Boolean(auth && (auth.userId === chapter.authorId || isContentAdmin(auth)));
  if (auth) await assertActiveAccount(auth);
  if (chapter.isVip && !owner && (!auth || !(await userHasChapterUnlock(auth.userId, chapter.chapterId)))) {
    throw new AppError(402, 'PAYMENT_002', 'Chapter unlock required');
  }
  return owner;
}

export async function syncHistory(auth: AuthContext, input: SyncReadingHistoryInput) {
  const novel = await findPublishedNovelDetail(input.novelId);
  const chapter = await findReadableChapter(input.chapterId);

  if (!novel || !chapter || chapter.novelId !== input.novelId) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertChapterAccess(chapter, auth);
  await upsertReadingHistory(auth.userId, input);

  return {
    synced: true,
    cached: false
  };
}

export async function listHistory(auth: AuthContext, input: HistoryListInput) {
  const result = await listReadingHistories(auth.userId, input);

  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function getHistoryForNovel(auth: AuthContext, novelId: string) {
  const history = await findReadingHistory(auth.userId, novelId);

  if (!history) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return history;
}

export async function listLibrary(auth: AuthContext, input: HistoryListInput) {
  const result = await listBookmarks(auth.userId, input);

  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function addToLibrary(auth: AuthContext, input: AddLibraryItemInput) {
  const novel = await findPublishedNovelDetail(input.novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const inserted = await addBookmark(auth.userId, input.novelId);
  if (!inserted) {
    throw new AppError(409, 'INTERACTION_001', 'Interaction already exists');
  }

  return {
    novelId: input.novelId,
    bookmarked: true
  };
}

export async function removeFromLibrary(auth: AuthContext, novelId: string) {
  const deleted = await removeBookmark(auth.userId, novelId);

  if (!deleted) {
    throw new AppError(404, 'INTERACTION_002', 'Interaction not found');
  }
}
