import { Router } from 'express';
import { connectionsRoutes } from './connections.routes.js';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  getMyProfileController,
  getMySettingsController,
  getAuthorProfileController,
  getPublicProfileController,
  getProfileLocatorController,
  updateMyProfileController,
  updateMySettingsController
} from './users.controller.js';
import { authorIdParamSchema, profileKeyParamSchema, updateProfileSchema, updateSettingsSchema, userIdParamSchema } from './users.schemas.js';

export const usersRoutes = Router();
export const authorsRoutes = Router();
usersRoutes.use(connectionsRoutes);

usersRoutes.get('/me/profile', requireAuth, getMyProfileController);
usersRoutes.patch('/me/profile', requireAuth, validateRequest(updateProfileSchema), updateMyProfileController);
usersRoutes.get('/me/settings', requireAuth, getMySettingsController);
usersRoutes.patch('/me/settings', requireAuth, validateRequest(updateSettingsSchema), updateMySettingsController);
usersRoutes.get('/by-key/:publicKey/locator', optionalAuth, validateRequest(profileKeyParamSchema), getProfileLocatorController(false));
usersRoutes.get('/:userId/profile', optionalAuth, validateRequest(userIdParamSchema), getPublicProfileController);

authorsRoutes.get('/authors/by-key/:publicKey/locator', optionalAuth, validateRequest(profileKeyParamSchema), getProfileLocatorController(true));
authorsRoutes.get('/authors/:authorId/profile', optionalAuth, validateRequest(authorIdParamSchema), getAuthorProfileController);
