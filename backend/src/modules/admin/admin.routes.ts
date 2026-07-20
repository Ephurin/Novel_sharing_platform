import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  approveWithdrawController,
  createGenreController,
  createTagController,
  dashboardStatsController,
  listAdminUsersController,
  listWithdrawRequestsController,
  lockUserController,
  rejectWithdrawController,
  taxonomyController,
  unlockUserController
} from './admin.controller.js';
import {
  listAdminUsersSchema,
  listWithdrawRequestsSchema,
  lockUserSchema,
  rejectWithdrawRequestSchema,
  taxonomyNameSchema,
  userIdParamSchema,
  withdrawRequestIdParamSchema
} from './admin.schemas.js';

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRoles(['ADMIN']));
adminRoutes.get('/users', validateRequest(listAdminUsersSchema), listAdminUsersController);
adminRoutes.patch('/users/:userId/lock', validateRequest(lockUserSchema), lockUserController);
adminRoutes.patch('/users/:userId/unlock', validateRequest(userIdParamSchema), unlockUserController);
adminRoutes.get('/taxonomy', taxonomyController);
adminRoutes.post('/taxonomy/genres', validateRequest(taxonomyNameSchema), createGenreController);
adminRoutes.post('/taxonomy/tags', validateRequest(taxonomyNameSchema), createTagController);
adminRoutes.get('/withdraw-requests', validateRequest(listWithdrawRequestsSchema), listWithdrawRequestsController);
adminRoutes.post('/withdraw-requests/:withdrawRequestId/approve', validateRequest(withdrawRequestIdParamSchema), approveWithdrawController);
adminRoutes.post('/withdraw-requests/:withdrawRequestId/reject', validateRequest(rejectWithdrawRequestSchema), rejectWithdrawController);
adminRoutes.get('/dashboard/stats', dashboardStatsController);
