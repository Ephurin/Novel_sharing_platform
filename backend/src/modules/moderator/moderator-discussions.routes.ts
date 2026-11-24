import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { requireModeratorOperational } from './moderator-access.js';
import {
  listDiscussionCategories,
  listDiscussionTopicComments,
  listDiscussionTopics
} from '../discussions/discussions.admin.js';
import {
  moderateDiscussionCommentOperational,
  moderateDiscussionTopicOperational,
  type TopicOperationalPatch
} from '../discussions/discussions.moderation.js';

export const moderatorDiscussionsRoutes = Router();
moderatorDiscussionsRoutes.use(requireAuth);

const requireDiscussionOperator = requireModeratorOperational('discussion.operate');

const listStatusSchema = z.enum(['VISIBLE', 'HIDDEN', 'DELETED']);
const patchStatusSchema = z.enum(['VISIBLE', 'HIDDEN']);
const pageSchema = z.coerce.number().int().min(1).max(1000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const uuidParam = z.string().uuid();

const listTopicsSchema = z.object({
  query: z.object({
    status: listStatusSchema.optional(),
    page: pageSchema,
    limit: limitSchema
  })
});

const listCommentsSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  query: z.object({
    status: listStatusSchema.optional(),
    page: pageSchema,
    limit: limitSchema
  })
});

const topicModerationSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  body: z
    .object({
      status: patchStatusSchema.optional(),
      isPinned: z.boolean().optional(),
      isLocked: z.boolean().optional(),
      destinationCategoryId: uuidParam.optional(),
      reason: z.string().trim().min(1).max(500),
      expected: z.union([z.boolean(), z.string().trim().min(1).max(64)])
    })
    .refine(
      (value) =>
        [value.status, value.isPinned, value.isLocked, value.destinationCategoryId].filter(
          (field) => field !== undefined
        ).length === 1,
      { message: 'Mỗi lần chỉ gửi một thay đổi.', path: ['body'] }
    )
});

const commentModerationSchema = z.object({
  params: z.object({ topicId: uuidParam, commentId: uuidParam }),
  body: z.object({
    status: patchStatusSchema,
    reason: z.string().trim().min(1).max(500)
  })
});

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
  return request.auth as AuthContext;
}

moderatorDiscussionsRoutes.get(
  '/categories',
  requireRoles(['MODERATOR']),
  requireDiscussionOperator,
  async (_request, response, next) => {
    try {
      const data = await listDiscussionCategories();
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

moderatorDiscussionsRoutes.get(
  '/topics',
  requireRoles(['MODERATOR']),
  requireDiscussionOperator,
  validateRequest(listTopicsSchema),
  async (request, response, next) => {
    try {
      const query = request.query as unknown as z.infer<typeof listTopicsSchema>['query'];
      const data = await listDiscussionTopics(query);
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

moderatorDiscussionsRoutes.get(
  '/topics/:topicId/comments',
  requireRoles(['MODERATOR']),
  requireDiscussionOperator,
  validateRequest(listCommentsSchema),
  async (request, response, next) => {
    try {
      const { topicId } = request.params as { topicId: string };
      const query = request.query as unknown as z.infer<typeof listCommentsSchema>['query'];
      const data = await listDiscussionTopicComments(topicId, query);
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

moderatorDiscussionsRoutes.patch(
  '/:topicId/moderation',
  requireRoles(['MODERATOR']),
  requireDiscussionOperator,
  validateRequest(topicModerationSchema),
  async (request, response, next) => {
    try {
      const auth = requireRequestAuth(request);
      const { topicId } = request.params as { topicId: string };
      const body = request.body as z.infer<typeof topicModerationSchema>['body'];
      let patch: TopicOperationalPatch;
      if (body.destinationCategoryId !== undefined) {
        patch = {
          field: 'destinationCategoryId',
          value: body.destinationCategoryId,
          expected: String(body.expected)
        };
      } else if (body.status !== undefined) {
        patch = { field: 'status', value: body.status, expected: String(body.expected) };
      } else if (body.isPinned !== undefined) {
        if (typeof body.expected !== 'boolean')
          throw new AppError(422, 'DISCUSSION_EXPECTED', 'expected cho ghim phải là boolean.');
        patch = { field: 'isPinned', value: body.isPinned, expected: body.expected };
      } else if (body.isLocked !== undefined) {
        if (typeof body.expected !== 'boolean')
          throw new AppError(422, 'DISCUSSION_EXPECTED', 'expected cho khóa phải là boolean.');
        patch = { field: 'isLocked', value: body.isLocked, expected: body.expected };
      } else {
        throw new AppError(422, 'DISCUSSION_PATCH', 'Mỗi lần chỉ gửi một thay đổi.');
      }
      const data = await moderateDiscussionTopicOperational(auth, {
        topicId,
        patch,
        reason: body.reason
      });
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

moderatorDiscussionsRoutes.patch(
  '/:topicId/comments/:commentId/moderation',
  requireRoles(['MODERATOR']),
  requireDiscussionOperator,
  validateRequest(commentModerationSchema),
  async (request, response, next) => {
    try {
      const auth = requireRequestAuth(request);
      const { topicId, commentId } = request.params as { topicId: string; commentId: string };
      const body = request.body as z.infer<typeof commentModerationSchema>['body'];
      const data = await moderateDiscussionCommentOperational(auth, {
        topicId,
        commentId,
        status: body.status,
        reason: body.reason
      });
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);
