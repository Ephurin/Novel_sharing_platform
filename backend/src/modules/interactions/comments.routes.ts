import { commentThreadsRoutes } from './comment-threads.routes.js';
import { createCommentReply, listAuthorComments, listCommentReplies, locateComment, reactToComment } from './comments.service.js';
import { createReplySchema, listRepliesSchema, authorCommentsSchema, commentReactionSchema, commentLocationSchema } from './comments.schemas.js';
import { successResponse } from '../../core/response/response.js';
import { createNovelCommentSchema, listNovelCommentsSchema } from './comments.schemas.js';
import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
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
commentsRoutes.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
commentsRoutes.use(commentThreadsRoutes);

commentsRoutes.get('/comments/:commentId/location', optionalAuth, validateRequest(commentLocationSchema), async (request, response, next) => {
  try { response.json(successResponse(await locateComment(String(request.params.commentId), request.query as never, request.auth))); } catch (error) { next(error); }
});

commentsRoutes.post('/chapters/:chapterId/comments', requireAuth, validateRequest(createCommentSchema), createCommentController);
commentsRoutes.get('/chapters/:chapterId/comments', optionalAuth, validateRequest(listCommentsSchema), listCommentsController);
commentsRoutes.patch('/comments/:commentId', requireAuth, validateRequest(updateCommentSchema), updateCommentController);
commentsRoutes.delete('/comments/:commentId', requireAuth, validateRequest(commentIdParamSchema), deleteCommentController);
commentsRoutes.put('/comments/:commentId/reaction', requireAuth, validateRequest(commentReactionSchema), async (request, response, next) => {
  try { response.json(successResponse(await reactToComment(request.auth!, String(request.params.commentId), request.body.reaction))); } catch (error) { next(error); }
});

commentsRoutes.post('/novels/:novelId/comments', requireAuth, validateRequest(createNovelCommentSchema), createCommentController);
commentsRoutes.get('/novels/:novelId/comments', optionalAuth, validateRequest(listNovelCommentsSchema), listCommentsController);

commentsRoutes.get('/novels/:novelId/comments/manage', requireAuth, validateRequest(authorCommentsSchema), async (request, response, next) => {
  try { const result = await listAuthorComments(request.auth!, String(request.params.novelId), request.query as never); response.json(successResponse(result.data, result.meta)); } catch (error) { next(error); }
});
commentsRoutes.post('/comments/:commentId/replies', requireAuth, validateRequest(createReplySchema), async (request, response, next) => {
  try { response.status(201).json(successResponse(await createCommentReply(request.auth!, String(request.params.commentId), request.body))); } catch (error) { next(error); }
});
commentsRoutes.get('/comments/:commentId/replies', optionalAuth, validateRequest(listRepliesSchema), async (request, response, next) => {
  try { const result = await listCommentReplies(String(request.params.commentId), request.query as never, request.auth); response.json(successResponse(result.data, result.meta)); } catch (error) { next(error); }
});
