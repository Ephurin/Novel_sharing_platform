import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  addToLibraryController,
  getHistoryForNovelController,
  getPreferencesController,
  getReaderChapterController,
  getReaderNovelController,
  listHistoryController,
  listLibraryController,
  removeFromLibraryController,
  savePreferencesController,
  searchNovelsController,
  syncHistoryController
} from './reading.controller.js';
import {
  addLibraryItemSchema,
  chapterIdParamSchema,
  historyListSchema,
  novelIdParamSchema,
  readingPreferencesSchema,
  searchNovelsSchema,
  syncReadingHistorySchema
} from './reading.schemas.js';

export const readingRoutes = Router();

readingRoutes.get('/preferences/me', requireAuth, getPreferencesController);
readingRoutes.put('/preferences/me', requireAuth, validateRequest(readingPreferencesSchema), savePreferencesController);
readingRoutes.get('/search', validateRequest(searchNovelsSchema), searchNovelsController);
readingRoutes.get('/novels/:novelId', validateRequest(novelIdParamSchema), getReaderNovelController);
readingRoutes.get('/chapters/:chapterId', optionalAuth, validateRequest(chapterIdParamSchema), getReaderChapterController);
readingRoutes.put('/history/me', requireAuth, validateRequest(syncReadingHistorySchema), syncHistoryController);
readingRoutes.get('/history/me', requireAuth, validateRequest(historyListSchema), listHistoryController);
readingRoutes.get('/history/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), getHistoryForNovelController);
readingRoutes.get('/library/me', requireAuth, validateRequest(historyListSchema), listLibraryController);
readingRoutes.post('/library/me', requireAuth, validateRequest(addLibraryItemSchema), addToLibraryController);
readingRoutes.delete('/library/me/:novelId', requireAuth, validateRequest(novelIdParamSchema), removeFromLibraryController);
