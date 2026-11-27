import { randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { rateLimit } from '../../core/security/rate-limit.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import {
  getCommunityOverview,
  getTopic,
  getTopicLocator,
  listCategories,
  listComments,
  listOwnTopics,
  listTopics,
  locateComment
} from './discussions.read.js';
import {
  createComment,
  createTopic,
  deleteComment,
  deleteTopic,
  recordView,
  setLike,
  updateComment,
  updateTopic
} from './discussions.write.js';
import {
  commentParamsSchema,
  commentReactionSchema,
  createCommentSchema,
  createTopicSchema,
  listCategoriesSchema,
  listCommentsSchema,
  listOwnTopicsSchema,
  listTopicsSchema,
  recordViewSchema,
  topicIdParamsSchema,
  topicSlugParamsSchema,
  topicReactionSchema,
  updateCommentSchema,
  updateTopicSchema,
  type CreateCommentInput,
  type CreateTopicInput,
  type ListTopicsInput,
  type TopicSort,
  type UpdateTopicInput
} from './discussions.schemas.js';

export const discussionsRoutes = Router();

const VIEWER_COOKIE = 'dv';
const VIEWER_COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

type Handler<TRequest extends Request = Request> = (
  request: TRequest,
  response: Response
) => Promise<unknown>;

function route<TRequest extends Request = Request>(handler: Handler<TRequest>): RequestHandler {
  return async (request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store');
      const data = await handler(request as TRequest, response);
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  };
}

const viewerIdOf = (request: Request): string | undefined => request.auth?.userId ?? undefined;

const ownTopics = (request: Request) =>
  listOwnTopics(viewerIdOf(request)!, ...cursorPage(request));

const cursorPage = (request: Request) => {
  const { cursor, limit } = request.query as unknown as { cursor?: string; limit?: number };
  return [cursor, limit] as const;
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VIEWER_COOKIE_MAX_AGE_MS
});

const readViewerCookie = (request: Request): string | undefined => {
  const raw = request.headers.cookie;
  if (!raw) return undefined;

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== VIEWER_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  }

  return undefined;
};

// Authenticated viewers are keyed by user id; guests by a server-issued cookie UUID. No IP is persisted.
const viewKey = (request: Request, response: Response): string => {
  const userId = viewerIdOf(request);
  if (userId) return `u:${userId}`;

  const stored = readViewerCookie(request);
  if (stored) return `g:${stored}`;

  const issued = randomUUID();
  response.cookie(VIEWER_COOKIE, issued, cookieOptions());
  return `g:${issued}`;
};

// The same key `recordView` persists, but read-only: listing topics must not mint
// a guest cookie just to decide whether to show an unread marker.
const storedViewKey = (request: Request): string | undefined => {
  const userId = viewerIdOf(request);
  if (userId) return `u:${userId}`;
  const stored = readViewerCookie(request);
  return stored ? `g:${stored}` : undefined;
};

const viewRateLimit = rateLimit({
  scope: 'discussions.view',
  max: 60,
  windowMs: 60_000,
  key: (request) => request.auth?.userId ?? request.ip ?? 'unknown'
});

const createTopicRateLimit = rateLimit({ scope: 'discussions.create', max: 5, windowMs: 3_600_000 });
const writeRateLimit = rateLimit({ scope: 'discussions.write', max: 20, windowMs: 60_000 });
const commentRateLimit = rateLimit({ scope: 'discussions.comment', max: 30, windowMs: 60_000 });

discussionsRoutes.get(
  '/discussions/categories',
  optionalAuth,
  validateRequest(listCategoriesSchema),
  route(async () => listCategories())
);

// Public aggregate counters + busiest topics for the community sidebar. Read-only,
// no viewer state, so guests and members see the same numbers.
discussionsRoutes.get(
  '/discussions/community',
  optionalAuth,
  route(async () => getCommunityOverview())
);

discussionsRoutes.get(
  '/discussions',
  optionalAuth,
  validateRequest(listTopicsSchema),
  route(async (request: Request) =>
    listTopics(request.query as unknown as ListTopicsInput, viewerIdOf(request), storedViewKey(request))
  )
);

discussionsRoutes.get(
  '/discussions/me/topics',
  requireAuth,
  validateRequest(listOwnTopicsSchema),
  route(ownTopics)
);

discussionsRoutes.get(
  '/discussions/:topicId/comments/:commentId/location',
  optionalAuth,
  validateRequest(commentParamsSchema),
  route(async (request: Request) =>
    locateComment(String(request.params.topicId), String(request.params.commentId), viewerIdOf(request))
  )
);

discussionsRoutes.get(
  '/discussions/:topicId/comments',
  optionalAuth,
  validateRequest(listCommentsSchema),
  route(async (request: Request) => {
    const { rootId, cursor, limit } = request.query as unknown as {
      rootId?: string;
      cursor?: string;
      limit: number;
    };
    return listComments(String(request.params.topicId), { rootId, cursor, limit }, viewerIdOf(request));
  })
);

discussionsRoutes.get(
  '/discussions/by-slug/:topicSlug/locator',
  optionalAuth,
  validateRequest(topicSlugParamsSchema),
  route(async (request) => getTopicLocator({ topicSlug: String(request.params.topicSlug) }))
);
discussionsRoutes.get(
  '/discussions/:topicId/locator',
  optionalAuth,
  validateRequest(topicIdParamsSchema),
  route(async (request) => getTopicLocator({ topicId: String(request.params.topicId) }))
);

discussionsRoutes.get(
  '/discussions/:topicId',
  optionalAuth,
  validateRequest(topicIdParamsSchema),
  route(async (request: Request) => getTopic(String(request.params.topicId), viewerIdOf(request)))
);

discussionsRoutes.post(
  '/discussions',
  requireAuth,
  createTopicRateLimit,
  validateRequest(createTopicSchema),
  route(async (request: Request) => createTopic(request.auth!, request.body as CreateTopicInput))
);

discussionsRoutes.patch(
  '/discussions/:topicId',
  requireAuth,
  writeRateLimit,
  validateRequest(updateTopicSchema),
  route(async (request: Request) => {
    await updateTopic(request.auth!, String(request.params.topicId), request.body as UpdateTopicInput);
    return { ok: true } as const;
  })
);

discussionsRoutes.delete(
  '/discussions/:topicId',
  requireAuth,
  writeRateLimit,
  validateRequest(topicIdParamsSchema),
  route(async (request: Request) => {
    await deleteTopic(request.auth!, String(request.params.topicId));
    return { ok: true } as const;
  })
);

discussionsRoutes.post(
  '/discussions/:topicId/comments',
  requireAuth,
  commentRateLimit,
  validateRequest(createCommentSchema),
  route(async (request: Request) => ({
    commentId: await createComment(
      request.auth!,
      String(request.params.topicId),
      request.body as CreateCommentInput
    )
  }))
);

discussionsRoutes.patch(
  '/discussions/:topicId/comments/:commentId',
  requireAuth,
  commentRateLimit,
  validateRequest(updateCommentSchema),
  route(async (request: Request) => {
    await updateComment(
      request.auth!,
      String(request.params.topicId),
      String(request.params.commentId),
      String(request.body.body)
    );
    return { ok: true } as const;
  })
);

discussionsRoutes.delete(
  '/discussions/:topicId/comments/:commentId',
  requireAuth,
  commentRateLimit,
  validateRequest(commentParamsSchema),
  route(async (request: Request) => {
    await deleteComment(request.auth!, String(request.params.topicId), String(request.params.commentId));
    return { ok: true } as const;
  })
);

discussionsRoutes.put(
  '/discussions/:topicId/reaction',
  requireAuth,
  writeRateLimit,
  validateRequest(topicReactionSchema),
  route(async (request: Request) => {
    await setLike(request.auth!, String(request.params.topicId), null, true);
    return { ok: true } as const;
  })
);

discussionsRoutes.delete(
  '/discussions/:topicId/reaction',
  requireAuth,
  writeRateLimit,
  validateRequest(topicIdParamsSchema),
  route(async (request: Request) => {
    await setLike(request.auth!, String(request.params.topicId), null, false);
    return { ok: true } as const;
  })
);

discussionsRoutes.put(
  '/discussions/:topicId/comments/:commentId/reaction',
  requireAuth,
  commentRateLimit,
  validateRequest(commentReactionSchema),
  route(async (request: Request) => {
    await setLike(
      request.auth!,
      String(request.params.topicId),
      String(request.params.commentId),
      true
    );
    return { ok: true } as const;
  })
);

discussionsRoutes.delete(
  '/discussions/:topicId/comments/:commentId/reaction',
  requireAuth,
  commentRateLimit,
  validateRequest(commentParamsSchema),
  route(async (request: Request) => {
    await setLike(request.auth!, String(request.params.topicId), String(request.params.commentId), false);
    return { ok: true } as const;
  })
);

discussionsRoutes.post(
  '/discussions/:topicId/views',
  optionalAuth,
  viewRateLimit,
  validateRequest(recordViewSchema),
  route(async (request: Request, response: Response) => {
    await recordView(String(request.params.topicId), viewKey(request, response));
    return { ok: true } as const;
  })
);

export type { TopicSort };
