import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import { changeUserFollow, listAccounts } from './connections.service.js';
import { userIdParamSchema } from './users.schemas.js';

const querySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
const connectionsSchema = querySchema.extend({ type: z.enum(['FOLLOWING', 'FOLLOWERS', 'MUTUAL']) });
export const connectionsRoutes = Router();
connectionsRoutes.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const result = await listAccounts(querySchema.parse(req.query), req.auth?.userId);
    res.json(successResponse(result.items, result.meta));
  } catch (error) { next(error); }
});
connectionsRoutes.get('/me/connections', requireAuth, async (req, res, next) => {
  try {
    const result = await listAccounts(connectionsSchema.parse(req.query), req.auth!.userId);
    res.json(successResponse(result.items, result.meta));
  } catch (error) { next(error); }
});
for (const method of ['post', 'delete'] as const) {
  connectionsRoutes[method]('/:userId/follow', requireAuth, validateRequest(userIdParamSchema), async (req, res, next) => {
    try { res.json(successResponse(await changeUserFollow(req.auth!, String(req.params.userId), method === 'post'))); }
    catch (error) { next(error); }
  });
}
