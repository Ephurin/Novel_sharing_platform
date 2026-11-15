import type { ReviewSort } from './novel-engagement.repository.js';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import { novelIdParamSchema } from './social.schemas.js';
import { readNovelReviews, readNovelStatistics, updateNovelEngagement } from './novel-engagement.service.js';

export const novelRatingSchema = novelIdParamSchema.extend({ body: z.object({
  score: z.number().int().min(1).max(10),
  review: z.string().trim().min(1).max(2000).nullable().optional()
}) });
export const listReviewsSchema = novelIdParamSchema.extend({ query: z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest')
}) });
export const novelNotificationsSchema = novelIdParamSchema.extend({ body: z.object({ enabled: z.boolean() }) });
export const novelEngagementRoutes = Router();

const read: RequestHandler = async (request, response, next) => {
  try { response.json(successResponse(await readNovelStatistics(String(request.params.novelId), request.auth))); }
  catch (error) { next(error); }
};
const change: RequestHandler = async (request, response, next) => {
  try {
    const removing = request.method === 'DELETE';
    const input = request.path.endsWith('/follow') ? { following: !removing } : request.path.endsWith('/notifications') ? { notificationsEnabled: request.body.enabled as boolean } : { score: removing ? null : request.body.score, review: request.body?.review };
    response.json(successResponse(await updateNovelEngagement(request.auth!, String(request.params.novelId), input)));
  } catch (error) { next(error); }
};

novelEngagementRoutes.get('/novels/:novelId/statistics', optionalAuth, validateRequest(novelIdParamSchema), read);
novelEngagementRoutes.get('/novels/:novelId/reviews', optionalAuth, validateRequest(listReviewsSchema), async (request, response, next) => {
  try {
    const { page, limit, sort } = request.query as unknown as { page: number; limit: number; sort: ReviewSort };
    const result = await readNovelReviews(String(request.params.novelId), page, limit, request.auth, sort);
    response.json(successResponse(result.data, result.meta));
  } catch (error) { next(error); }
});
const requireReader = [requireAuth, requireRoles(['READER'])];
novelEngagementRoutes.put('/novels/:novelId/follow', ...requireReader, validateRequest(novelIdParamSchema), change);
novelEngagementRoutes.delete('/novels/:novelId/follow', ...requireReader, validateRequest(novelIdParamSchema), change);
novelEngagementRoutes.put('/novels/:novelId/notifications', ...requireReader, validateRequest(novelNotificationsSchema), change);
novelEngagementRoutes.put('/novels/:novelId/rating', ...requireReader, validateRequest(novelRatingSchema), change);
novelEngagementRoutes.delete('/novels/:novelId/rating', ...requireReader, validateRequest(novelIdParamSchema), change);
