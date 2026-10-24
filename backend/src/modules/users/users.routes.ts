import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  getMyProfileController,
  getMySettingsController,
  getAuthorProfileController,
  getPublicProfileController,
  updateMyProfileController,
  updateMySettingsController
} from './users.controller.js';
import { authorIdParamSchema, updateProfileSchema, updateSettingsSchema, userIdParamSchema } from './users.schemas.js';

export const usersRoutes = Router();
export const authorsRoutes = Router();

usersRoutes.get('/me/profile', requireAuth, getMyProfileController);
usersRoutes.patch('/me/profile', requireAuth, validateRequest(updateProfileSchema), updateMyProfileController);
usersRoutes.get('/me/settings', requireAuth, getMySettingsController);
usersRoutes.patch('/me/settings', requireAuth, validateRequest(updateSettingsSchema), updateMySettingsController);
usersRoutes.get('/:userId/profile', validateRequest(userIdParamSchema), getPublicProfileController);

authorsRoutes.get('/authors/:authorId/profile', optionalAuth, validateRequest(authorIdParamSchema), getAuthorProfileController);
