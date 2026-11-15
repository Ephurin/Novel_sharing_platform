import { Router } from 'express';
import { requireAdminPermission } from '../admin/admin-access.js';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  checkContentController,
  createReportController,
  getReviewController,
  listReviewsController,
  resolveReviewController
} from './content-control.controller.js';
import {
  contentControlCheckSchema,
  createReportSchema,
  listReviewsSchema,
  resolveReviewSchema,
  reviewIdParamSchema
} from './content-control.schemas.js';

export const contentControlRoutes = Router();
export const reportsRoutes = Router();
export const adminModerationRoutes = Router();
adminModerationRoutes.use(requireAuth, requireAdminPermission('content'));

contentControlRoutes.post(
  '/check',
  requireAuth,
  requireRoles(['ADMIN']),
  requireAdminPermission('content'),
  validateRequest(contentControlCheckSchema),
  checkContentController
);

reportsRoutes.post('/', requireAuth, validateRequest(createReportSchema), createReportController);

adminModerationRoutes.get(
  '/reviews',
  requireAuth,
  requireRoles(['ADMIN']),
  validateRequest(listReviewsSchema),
  listReviewsController
);

adminModerationRoutes.get(
  '/reviews/:reviewId',
  requireAuth,
  requireRoles(['ADMIN']),
  validateRequest(reviewIdParamSchema),
  getReviewController
);

adminModerationRoutes.post(
  '/reviews/:reviewId/resolve',
  requireAuth,
  requireRoles(['ADMIN']),
  validateRequest(resolveReviewSchema),
  resolveReviewController
);
