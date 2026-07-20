import { Router } from 'express';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  followAuthorController,
  followerCountController,
  likeNovelController,
  unfollowAuthorController,
  unlikeNovelController
} from './social.controller.js';
import { authorIdParamSchema, novelIdParamSchema } from './social.schemas.js';

export const socialRoutes = Router();

socialRoutes.post('/novels/:novelId/likes', requireAuth, validateRequest(novelIdParamSchema), likeNovelController);
socialRoutes.delete('/novels/:novelId/likes/me', requireAuth, validateRequest(novelIdParamSchema), unlikeNovelController);
socialRoutes.post('/authors/:authorId/follow', requireAuth, validateRequest(authorIdParamSchema), followAuthorController);
socialRoutes.delete('/authors/:authorId/follow', requireAuth, validateRequest(authorIdParamSchema), unfollowAuthorController);
socialRoutes.get('/authors/:authorId/followers/count', validateRequest(authorIdParamSchema), followerCountController);
