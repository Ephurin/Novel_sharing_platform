import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  getChapterController,
  submitChapterPublishController,
  updateChapterController
} from './chapters.controller.js';
import { chapterIdParamSchema, updateChapterSchema } from './chapters.schemas.js';

export const chaptersRoutes = Router();

const requireAuthor = [requireAuth, requireRoles(['AUTHOR', 'ADMIN'])];

chaptersRoutes.get('/:chapterId', validateRequest(chapterIdParamSchema), getChapterController);
chaptersRoutes.patch('/:chapterId', ...requireAuthor, validateRequest(updateChapterSchema), updateChapterController);
chaptersRoutes.post(
  '/:chapterId/submit-publish',
  ...requireAuthor,
  validateRequest(chapterIdParamSchema),
  submitChapterPublishController
);
