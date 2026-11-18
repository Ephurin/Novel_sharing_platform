import { Router } from 'express';
import { successResponse } from '../../core/response/response.js';
import { listReadingBookmarkEntries, removeReadingBookmarkEntry, saveReadingBookmarkEntry } from './reading.service.js';
import { bookmarkEntriesSchema, bookmarkEntryIdSchema, bookmarkEntrySchema } from './reading.schemas.js';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  addToLibraryController,
  getHistoryForNovelController,
  getPreferencesController,
  getReaderChapterController,
  getReaderNovelController,
  getReadingFiltersController,
  listHistoryController,
  listLibraryController,
  removeFromLibraryController,
  savePreferencesController,
  searchNovelsController,
  syncHistoryController,
  getReadingBookmarkController,
  saveReadingBookmarkController,
  removeReadingBookmarkController
} from './reading.controller.js';
import {
  addLibraryItemSchema,
  chapterIdParamSchema,
  historyListSchema,
  novelIdParamSchema,
  readingPreferencesSchema,
  searchNovelsSchema,
  syncReadingHistorySchema,
  readingBookmarkSchema
} from './reading.schemas.js';

export const readingRoutes = Router();

readingRoutes.get('/bookmark-entries/me', requireAuth, validateRequest(bookmarkEntriesSchema), async (request, response, next) => {
  try { const result = await listReadingBookmarkEntries(request.auth!, request.query as never); response.json(successResponse(result.data, result.meta)); } catch (error) { next(error); }
});
readingRoutes.post('/bookmark-entries/me', requireAuth, validateRequest(bookmarkEntrySchema), async (request, response, next) => {
  try { response.status(201).json(successResponse(await saveReadingBookmarkEntry(request.auth!, request.body))); } catch (error) { next(error); }
});
readingRoutes.delete('/bookmark-entries/me/:bookmarkId', requireAuth, validateRequest(bookmarkEntryIdSchema), async (request, response, next) => {
  try { await removeReadingBookmarkEntry(request.auth!, String(request.params.bookmarkId)); response.status(204).send(); } catch (error) { next(error); }
});

readingRoutes.get('/preferences/me', requireAuth, getPreferencesController);
readingRoutes.put('/preferences/me', requireAuth, validateRequest(readingPreferencesSchema), savePreferencesController);
readingRoutes.get('/bookmarks/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), getReadingBookmarkController);
readingRoutes.put('/bookmarks/me/:novelId', requireAuth, validateRequest(readingBookmarkSchema), saveReadingBookmarkController);
readingRoutes.delete('/bookmarks/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), removeReadingBookmarkController);
readingRoutes.get('/search', validateRequest(searchNovelsSchema), searchNovelsController);
readingRoutes.get('/filters', getReadingFiltersController);
readingRoutes.get('/novels/:novelId', validateRequest(novelIdParamSchema), getReaderNovelController);
readingRoutes.get('/chapters/:chapterId', optionalAuth, validateRequest(chapterIdParamSchema), getReaderChapterController);
readingRoutes.put('/history/me', requireAuth, validateRequest(syncReadingHistorySchema), syncHistoryController);
readingRoutes.get('/history/me', requireAuth, validateRequest(historyListSchema), listHistoryController);
readingRoutes.get('/history/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), getHistoryForNovelController);
readingRoutes.get('/library/me', requireAuth, validateRequest(historyListSchema), listLibraryController);
readingRoutes.post('/library/me', requireAuth, validateRequest(addLibraryItemSchema), addToLibraryController);
readingRoutes.delete('/library/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), removeFromLibraryController);
