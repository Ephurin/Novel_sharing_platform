import { Router } from 'express';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  createCommentController,
  deleteCommentController,
  listCommentsController,
  updateCommentController
} from './comments.controller.js';
import {
  commentIdParamSchema,
  createCommentSchema,
  listCommentsSchema,
  updateCommentSchema
} from './comments.schemas.js';

export const commentsRoutes = Router();

commentsRoutes.post('/chapters/:chapterId/comments', requireAuth, validateRequest(createCommentSchema), createCommentController);
commentsRoutes.get('/chapters/:chapterId/comments', validateRequest(listCommentsSchema), listCommentsController);
commentsRoutes.patch('/comments/:commentId', requireAuth, validateRequest(updateCommentSchema), updateCommentController);
commentsRoutes.delete('/comments/:commentId', requireAuth, validateRequest(commentIdParamSchema), deleteCommentController);
