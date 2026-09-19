import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  getChapterController,
  submitChapterPublishController,
  updateChapterController
} from './chapters.controller.js';
import { chapterIdParamSchema, updateChapterSchema } from './chapters.schemas.js';
import {
  acceptDraftController,
  getRevisionController,
  listRevisionsController,
  snapshotChapterController
} from './chapter-revisions.controller.js';
import {
  acceptDraftSchema,
  getRevisionSchema,
  listRevisionsSchema,
  snapshotSchema
} from './chapter-revisions.schemas.js';

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

// Chapter Revisions (P6 Writing Loop)
chaptersRoutes.post(
  '/:chapterId/revisions/snapshot',
  ...requireAuthor,
  validateRequest(snapshotSchema),
  snapshotChapterController
);
chaptersRoutes.post(
  '/:chapterId/revisions/accept-draft',
  ...requireAuthor,
  validateRequest(acceptDraftSchema),
  acceptDraftController
);
chaptersRoutes.get(
  '/:chapterId/revisions',
  ...requireAuthor,
  validateRequest(listRevisionsSchema),
  listRevisionsController
);
chaptersRoutes.get(
  '/:chapterId/revisions/:revisionId',
  ...requireAuthor,
  validateRequest(getRevisionSchema),
  getRevisionController
);

