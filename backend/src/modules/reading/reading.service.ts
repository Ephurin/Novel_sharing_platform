import { isContentAdmin } from '../../core/security/auth-context.js';
import { chapterParagraphs } from './paragraph-anchors.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import type {
  AddLibraryItemInput,
  HistoryListInput,
  LatestChaptersInput,
  ReadingPreferencesInput,
  SearchNovelsInput,
  SyncReadingHistoryInput,
  ReadingBookmarkInput
} from './reading.schemas.js';
import {
  addBookmark,
  findOrCreateReadingPreference,
  findPublishedNovelDetail,
  findRandomPublishedNovel,
  findReadableChapter,
  findReadingHistory,
  incrementNovelViews,
  listBookmarks,
  listLatestPublishedChapters,
  listPublishedChaptersForNovel,
  listReadingHistories,
  listReadingFilters,
  removeBookmark,
  searchPublishedNovels,
  updateReadingPreference,
  upsertReadingHistory,
  recordChapterRead,
  findReadingBookmark,
  upsertReadingBookmark,
  deleteReadingBookmark
} from './reading.repository.js';
import { userHasChapterUnlock } from '../wallet/wallet.repository.js';
import { deletePositionBookmark, listPositionBookmarks, savePositionBookmark } from './reading.repository.js';
import type { BookmarkEntriesInput, BookmarkEntryInput } from './reading.schemas.js';

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

export async function getLatestPublishedChapters(input: LatestChaptersInput) {
  return listLatestPublishedChapters(input.limit);
}

export async function getRandomPublishedNovel() {
  return findRandomPublishedNovel();
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
  const { authorId: _authorId, novelTitle: _novelTitle, ...readable } = chapter;
  return { ...readable, ...chapterParagraphs(readable.content) };
}

/** History writes must satisfy the same access policy as content reads. */
export async function assertChapterAccess(chapter: { chapterId: string; authorId: string; isVip: boolean; priceCoins?: number; novelId?: string; novelTitle?: string; chapterNumber?: number; title?: string }, auth?: AuthContext) {
  const owner = Boolean(auth && (auth.userId === chapter.authorId || isContentAdmin(auth)));
  if (auth) await assertActiveAccount(auth);
  if (chapter.isVip && !owner && (!auth || !(await userHasChapterUnlock(auth.userId, chapter.chapterId)))) {
    // UAT 2026-11-20 (BUG-001): the reader must see the price before unlocking.
    // UI-02: name the novel and chapter so the reader can check what they are about to unlock.
    throw new AppError(402, 'PAYMENT_002', 'Chapter unlock required', {
      priceCoins: chapter.priceCoins ?? null,
      novelId: chapter.novelId ?? null,
      novelTitle: chapter.novelTitle ?? null,
      chapterNumber: chapter.chapterNumber ?? null,
      chapterTitle: chapter.title ?? null
    });
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

export async function getReadingBookmark(auth: AuthContext, novelId: string) {
  await assertActiveAccount(auth);
  return findReadingBookmark(auth.userId, novelId);
}

export async function saveReadingBookmark(auth: AuthContext, novelId: string, input: ReadingBookmarkInput) {
  const chapter = await findReadableChapter(input.chapterId);
  if (!chapter || chapter.novelId !== novelId) throw new AppError(404, 'CONTENT_001', 'Content not found');
  await assertChapterAccess(chapter, auth);
  return upsertReadingBookmark(auth.userId, novelId, input);
}

export async function removeReadingBookmark(auth: AuthContext, novelId: string) {
  await assertActiveAccount(auth);
  return deleteReadingBookmark(auth.userId, novelId);
}

export async function listReadingBookmarkEntries(auth: AuthContext, input: BookmarkEntriesInput) {
  await assertActiveAccount(auth);
  const result = await listPositionBookmarks(auth.userId, input, isContentAdmin(auth));
  return { data: result.items, meta: buildMeta(result.totalItems, input.page, input.limit) };
}

export async function saveReadingBookmarkEntry(auth: AuthContext, input: BookmarkEntryInput) {
  const chapter = await findReadableChapter(input.chapterId);
  if (!chapter || chapter.novelId !== input.novelId) throw new AppError(404, 'CONTENT_001', 'Content not found');
  await assertChapterAccess(chapter, auth);
  return savePositionBookmark(auth.userId, input);
}

export async function removeReadingBookmarkEntry(auth: AuthContext, bookmarkId: string) {
  await assertActiveAccount(auth);
  if (!await deletePositionBookmark(auth.userId, bookmarkId)) throw new AppError(404, 'CONTENT_001', 'Không tìm thấy dấu đã lưu.');
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
