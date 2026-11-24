import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { moderatorPermissionsFor } from '../../core/security/moderation-policy.js';
import { requireModeratorOperational } from './moderator-access.js';
import {
  listReviewsSchema,
  resolveReviewSchema,
  reviewIdParamSchema
} from '../content-control/content-control.schemas.js';
import {
  getModerationReview,
  listModerationReviews,
  resolveModerationReview
} from '../content-control/content-control.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
  return request.auth;
}

export const moderatorRoutes = Router();
moderatorRoutes.use(requireAuth);

const requireReviewer = requireModeratorOperational(
  'publication.review',
  'comment.review',
  'report.review'
);

moderatorRoutes.get('/access', requireRoles(['MODERATOR']), (request, response, next) => {
  try {
    response.json(successResponse({
      role: 'MODERATOR',
      permissions: moderatorPermissionsFor(request.auth!.role)
    }));
  } catch (error) {
    next(error);
  }
});

moderatorRoutes.get(
  '/reviews',
  requireRoles(['MODERATOR']),
  requireReviewer,
  validateRequest(listReviewsSchema),
  async (request, response, next) => {
    try {
      const result = await listModerationReviews(request.query as never);
      response.json(successResponse(result.data, result.meta));
    } catch (error) {
      next(error);
    }
  }
);

moderatorRoutes.get(
  '/reviews/:reviewId',
  requireRoles(['MODERATOR']),
  requireReviewer,
  validateRequest(reviewIdParamSchema),
  async (request, response, next) => {
    try {
      const result = await getModerationReview(String(request.params.reviewId), requireRequestAuth(request));
      response.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  }
);

moderatorRoutes.post(
  '/reviews/:reviewId/resolve',
  requireRoles(['MODERATOR']),
  requireReviewer,
  validateRequest(resolveReviewSchema),
  async (request, response, next) => {
    try {
      const result = await resolveModerationReview(
        requireRequestAuth(request),
        String(request.params.reviewId),
        request.body
      );
      response.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  }
);
