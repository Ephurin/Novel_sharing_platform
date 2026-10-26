import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  getAdminChapterController,
  approveWithdrawController,
  createGenreController,
  createTagController,
  dashboardStatsController,
  getAdminNovelController,
  listAdminNovelsController,
  listAdminUsersController,
  listWithdrawRequestsController,
  lockUserController,
  rejectWithdrawController,
  removeAdminNovelController,
  restoreAdminNovelController,
  taxonomyController,
  unlockUserController
} from './admin.controller.js';
import {
  chapterIdParamSchema,
  listAdminNovelsSchema,
  listAdminUsersSchema,
  listWithdrawRequestsSchema,
  lockUserSchema,
  novelIdParamSchema,
  rejectWithdrawRequestSchema,
  removeNovelSchema,
  restoreNovelSchema,
  taxonomyNameSchema,
  userIdParamSchema,
  withdrawRequestIdParamSchema
} from './admin.schemas.js';

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRoles(['ADMIN']));
adminRoutes.get(
  '/chapters/:chapterId',
  validateRequest(chapterIdParamSchema),
  getAdminChapterController
);
adminRoutes.get('/users', validateRequest(listAdminUsersSchema), listAdminUsersController);
adminRoutes.patch('/users/:userId/lock', validateRequest(lockUserSchema), lockUserController);
adminRoutes.patch(
  '/users/:userId/unlock',
  validateRequest(userIdParamSchema),
  unlockUserController
);
adminRoutes.get('/novels', validateRequest(listAdminNovelsSchema), listAdminNovelsController);
adminRoutes.get('/novels/:novelId', validateRequest(novelIdParamSchema), getAdminNovelController);
adminRoutes.delete(
  '/novels/:novelId',
  validateRequest(removeNovelSchema),
  removeAdminNovelController
);
adminRoutes.post(
  '/novels/:novelId/restore',
  validateRequest(restoreNovelSchema),
  restoreAdminNovelController
);
adminRoutes.get('/taxonomy', taxonomyController);
adminRoutes.post('/taxonomy/genres', validateRequest(taxonomyNameSchema), createGenreController);
adminRoutes.post('/taxonomy/tags', validateRequest(taxonomyNameSchema), createTagController);
adminRoutes.get(
  '/withdraw-requests',
  validateRequest(listWithdrawRequestsSchema),
  listWithdrawRequestsController
);
adminRoutes.post(
  '/withdraw-requests/:withdrawRequestId/approve',
  validateRequest(withdrawRequestIdParamSchema),
  approveWithdrawController
);
adminRoutes.post(
  '/withdraw-requests/:withdrawRequestId/reject',
  validateRequest(rejectWithdrawRequestSchema),
  rejectWithdrawController
);
adminRoutes.get('/dashboard/stats', dashboardStatsController);
