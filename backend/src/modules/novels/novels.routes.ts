import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { createChapterController, listChaptersController } from './chapters.controller.js';
import { createChapterSchema, novelIdParamSchema as chapterNovelIdParamSchema } from './chapters.schemas.js';
import {
  createNovelController,
  deleteNovelController,
  getNovelController,
  listMyNovelsController,
  listNovelsController,
  submitNovelPublishController,
  updateNovelController
} from './novels.controller.js';
import {
  createNovelSchema,
  listNovelsSchema,
  novelIdParamSchema,
  updateNovelSchema
} from './novels.schemas.js';

export const novelsRoutes = Router();

const requireAuthor = [requireAuth, requireRoles(['AUTHOR', 'ADMIN'])];

novelsRoutes.get('/', validateRequest(listNovelsSchema), listNovelsController);
novelsRoutes.get('/me', ...requireAuthor, validateRequest(listNovelsSchema), listMyNovelsController);
novelsRoutes.post('/', ...requireAuthor, validateRequest(createNovelSchema), createNovelController);
novelsRoutes.get('/:novelId/chapters', ...requireAuthor, validateRequest(chapterNovelIdParamSchema), listChaptersController);
novelsRoutes.post('/:novelId/chapters', ...requireAuthor, validateRequest(createChapterSchema), createChapterController);
novelsRoutes.get('/:novelId', validateRequest(novelIdParamSchema), getNovelController);
novelsRoutes.patch('/:novelId', ...requireAuthor, validateRequest(updateNovelSchema), updateNovelController);
novelsRoutes.delete('/:novelId', ...requireAuthor, validateRequest(novelIdParamSchema), deleteNovelController);
novelsRoutes.post(
  '/:novelId/submit-publish',
  ...requireAuthor,
  validateRequest(novelIdParamSchema),
  submitNovelPublishController
);
