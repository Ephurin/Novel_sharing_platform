import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { getPostgresPool } from '../../core/database/postgres.js';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { moderatorPermissions, moderatorPermissionsFor } from '../../core/security/moderation-policy.js';
import { requireModeratorOperational } from './moderator-access.js';
import {
  listReviewsSchema,
  proposeEscalationSchema,
  resolveReviewSchema,
  reviewIdParamSchema
} from '../content-control/content-control.schemas.js';
import {
  getModerationReview,
  listModerationReviews,
  resolveModerationReview
} from '../content-control/content-control.service.js';
import { proposeModerationEscalation } from '../content-control/moderation-escalations.js';

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
  '/history',
  requireRoles(['MODERATOR']),
  requireModeratorOperational(...moderatorPermissions),
  validateRequest(
    z.object({
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        action: z.string().max(100).optional(),
        targetId: z.string().max(200).optional(),
        q: z.string().max(200).optional()
      })
    })
  ),
  async (request, response, next) => {
    try {
      const filters = request.query as unknown as {
        page: number;
        limit: number;
        action?: string;
        targetId?: string;
        q?: string;
      };
      const values = [
        requireRequestAuth(request).userId,
        filters.action || null,
        filters.targetId || null,
        filters.q ? `%${filters.q}%` : null
      ];
      const where =
        'where a.actor_id=$1 and ($2::text is null or a.action=$2) and ($3::text is null or a.target_id=$3) and ($4::text is null or a.reason ilike $4 or a.target_id ilike $4)';
      const count = (
        await getPostgresPool().query(
          `select count(*)::int as total from admin_audit a ${where}`,
          values
        )
      ).rows[0].total;
      const rows = await getPostgresPool().query(
        `select a.audit_id,a.action,a.target_type,a.target_id,a.affected_user_id,a.reason,a.before_state,a.after_state,a.created_at,u.username as actor_username
         from admin_audit a left join users u on u.user_id=a.actor_id
         ${where}
         order by a.created_at desc,a.audit_id limit $5 offset $6`,
        [...values, filters.limit, (filters.page - 1) * filters.limit]
      );
      response.json(
        successResponse(rows.rows, {
          page: filters.page,
          limit: filters.limit,
          totalItems: count,
          totalPages: Math.ceil(count / filters.limit)
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

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

moderatorRoutes.post(
  '/reviews/:reviewId/escalations',
  requireRoles(['MODERATOR']),
  requireReviewer,
  requireModeratorOperational('escalation.submit'),
  validateRequest(proposeEscalationSchema),
  async (request, response, next) => {
    try {
      const result = await proposeModerationEscalation(
        requireRequestAuth(request),
        String(request.params.reviewId),
        request.body
      );
      response.status(result.created ? 201 : 200).json(successResponse(result.escalation));
    } catch (error) {
      next(error);
    }
  }
);
