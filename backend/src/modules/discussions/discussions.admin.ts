import { Router } from 'express';
import type { PoolClient, QueryResult } from 'pg';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { validateRequest } from '../../core/validation/validate.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { successResponse } from '../../core/response/response.js';
import {
  assertAdminPermission,
  audit,
  requiredReason,
  requireAdminPermission
} from '../admin/admin-access.js';
import { drainAdminJobsSafely } from '../admin/admin-jobs.js';
import { isPublicDiscussionTarget } from './discussions.read.js';
import { refreshTopicActivity } from './discussions.write.js';
import { moderateDiscussionHide, restoreDiscussionSanction } from './discussions.sanctions.js';
import type { DiscussionStatus, DiscussionTargetKind } from './discussions.types.js';

export const discussionAdminRoutes = Router();

const COMMUNITY_ANNOUNCEMENT_SLUG = 'thong-bao-cong-dong';
const EXCERPT_MAX = 300;
const TEXT_LIMIT = 20000;

const statusSchema = z.enum(['VISIBLE', 'HIDDEN', 'DELETED']);
const pageSchema = z.coerce.number().int().min(1).max(1000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const uuidParam = z.string().uuid();
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'INVALID_SLUG');
const nameSchema = z.string().trim().min(1).max(120);
const sortOrderSchema = z.coerce.number().int().min(0).max(100000);

const listCategoriesSchema = z.object({});

const createCategorySchema = z.object({
  body: z.object({
    slug: slugSchema,
    name: nameSchema,
    sortOrder: sortOrderSchema.optional(),
    postAdminOnly: z.boolean().optional()
  })
});

const updateCategorySchema = z.object({
  params: z.object({ categoryId: uuidParam }),
  body: z
    .object({
      name: nameSchema.optional(),
      sortOrder: sortOrderSchema.optional(),
      isActive: z.boolean().optional(),
      postAdminOnly: z.boolean().optional(),
      reason: z.string().trim().min(1).max(500).optional()
    })
    .refine((value) => Object.keys(value).some((key) => key !== 'reason'), 'EMPTY_PATCH')
});

const listAdminTopicsSchema = z.object({
  query: z.object({
    q: z.string().trim().max(500).optional(),
    status: statusSchema.optional(),
    page: pageSchema,
    limit: limitSchema
  })
});

const topicModerationSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  body: z
    .object({
      status: statusSchema.optional(),
      isPinned: z.boolean().optional(),
      isLocked: z.boolean().optional(),
      reason: z.string().trim().min(1).max(500).optional()
    })
    .refine(
      (value) =>
        value.status !== undefined || value.isPinned !== undefined || value.isLocked !== undefined,
      'EMPTY_PATCH'
    )
});

const commentModerationSchema = z.object({
  params: z.object({ topicId: uuidParam, commentId: uuidParam }),
  body: z.object({
    status: statusSchema,
    reason: z.string().trim().min(1).max(500).optional()
  })
});

const listAdminCommentsSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  query: z.object({
    status: statusSchema.optional(),
    page: pageSchema,
    limit: limitSchema
  })
});

type CategoryRow = {
  category_id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  post_admin_only: boolean;
};

type TopicModerationRow = {
  topic_id: string;
  category_id: string;
  author_id: string;
  title: string;
  status: DiscussionStatus;
  is_pinned: boolean;
  is_locked: boolean;
};

type CommentModerationRow = {
  comment_id: string;
  topic_id: string;
  author_id: string;
  body: string;
  status: DiscussionStatus;
};

function mapCategory(row: CategoryRow) {
  return {
    categoryId: row.category_id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    postAdminOnly: row.post_admin_only
  };
}

export function isDiscussionTarget(type: string): type is DiscussionTargetKind {
  return type === 'DISCUSSION' || type === 'DISCUSSION_COMMENT';
}

function excerpt(body: string) {
  const trimmed = body.trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX)}…` : trimmed;
}

function isSlugConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

/** Community announcements stay admin-authored: enforce postAdminOnly for that slug. */
function enforceAnnouncementSlug(slug: string, postAdminOnly: boolean) {
  return slug === COMMUNITY_ANNOUNCEMENT_SLUG ? true : postAdminOnly;
}

async function lockTopic(client: PoolClient, topicId: string): Promise<TopicModerationRow> {
  const result: QueryResult<TopicModerationRow> = await client.query(
    `select topic_id,category_id,author_id,title,status,is_pinned,is_locked
       from discussion_topics where topic_id=$1 for update`,
    [topicId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'DISCUSSION_TOPIC_001', 'Không tìm thấy chủ đề.');
  return row;
}

discussionAdminRoutes.use(
  '/admin/discussions',
  requireAuth,
  requireAdminPermission('content')
);

export async function listDiscussionCategories() {
  return withPostgresTransaction(async (client) => {
    const rows: QueryResult<CategoryRow> = await client.query(
      `select category_id,slug,name,sort_order,is_active,post_admin_only
         from discussion_categories
        order by sort_order asc, name asc
        limit 200`
    );
    return rows.rows.map(mapCategory);
  });
}

export type DiscussionTopicSummary = {
  topicId: string;
  title: string;
  status: DiscussionStatus;
  isPinned: boolean;
  isLocked: boolean;
  categoryId: string;
  categoryName: string | null;
  authorName: string | null;
  createdAt: string;
};

export async function listDiscussionTopics(query: {
  q?: string;
  status?: DiscussionStatus;
  page: number;
  limit: number;
}): Promise<{
  items: DiscussionTopicSummary[];
  hasNext: boolean;
  meta: { page: number; limit: number; totalItems: number; totalPages: number };
}> {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  return withPostgresTransaction(async (client) => {
    // UI-12: accent-insensitive title search before paging.
    const where = `where ($1::text is null or t.status=$1::discussion_topic_status)
                      and ($2::text is null or strpos(lower(f_unaccent(t.title)), lower(f_unaccent($2))) > 0)`;
    const filters = [query.status ?? null, query.q || null];
    const rows: QueryResult<{
      topic_id: string;
      title: string;
      status: DiscussionStatus;
      is_pinned: boolean;
      is_locked: boolean;
      category_id: string;
      category_name: string | null;
      author_name: string | null;
      created_at: Date;
    }> = await client.query(
      `select t.topic_id,t.title,t.status,t.is_pinned,t.is_locked,t.category_id,
              c.name as category_name,
              coalesce(nullif(p.display_name, ''), u.username, 'Người dùng') as author_name,
              t.created_at
         from discussion_topics t
         left join discussion_categories c on c.category_id=t.category_id
         left join users u on u.user_id=t.author_id
         left join user_profiles p on p.user_id = u.user_id
        ${where}
        order by t.is_pinned desc, t.last_activity_at desc, t.topic_id desc
        limit $3 offset $4`,
      [...filters, limit + 1, offset]
    );
    const items = rows.rows.slice(0, limit).map((row) => ({
      topicId: row.topic_id,
      title: row.title,
      status: row.status,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      categoryId: row.category_id,
      categoryName: row.category_name,
      authorName: row.author_name,
      createdAt: new Date(row.created_at).toISOString()
    }));
    const count = await client.query<{ total: string }>(
      `select count(*) as total from discussion_topics t ${where}`,
      filters
    );
    const totalItems = Number(count.rows[0].total);
    return {
      items,
      hasNext: rows.rows.length > limit,
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
    };
  });
}

export type DiscussionCommentSummary = {
  commentId: string;
  body: string;
  status: DiscussionStatus;
  authorName: string | null;
  createdAt: string;
};

export async function listDiscussionTopicComments(
  topicId: string,
  query: { status?: DiscussionStatus; page: number; limit: number }
): Promise<{ items: DiscussionCommentSummary[]; hasNext: boolean }> {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  return withPostgresTransaction(async (client) => {
    const rows: QueryResult<{
      comment_id: string;
      body: string;
      status: DiscussionStatus;
      author_name: string | null;
      created_at: Date;
    }> = await client.query(
      `select m.comment_id,left(m.body,$4) as body,m.status,
              coalesce(nullif(p.display_name, ''), u.username, 'Người dùng') as author_name,
              m.created_at
         from discussion_comments m
         left join users u on u.user_id=m.author_id
         left join user_profiles p on p.user_id = u.user_id
        where m.topic_id=$1 and ($2::text is null or m.status=$2::discussion_comment_status)
        order by m.created_at asc, m.comment_id asc
        limit $3 offset $5`,
      [topicId, query.status ?? null, limit + 1, EXCERPT_MAX + 1, offset]
    );
    const items = rows.rows.slice(0, limit).map((row) => ({
      commentId: row.comment_id,
      body: excerpt(row.body),
      status: row.status,
      authorName: row.author_name,
      createdAt: new Date(row.created_at).toISOString()
    }));
    return { items, hasNext: rows.rows.length > limit };
  });
}

discussionAdminRoutes.get(
  '/admin/discussions/categories',
  validateRequest(listCategoriesSchema),
  async (_request, response, next) => {
    try {
      const data = await listDiscussionCategories();
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.post(
  '/admin/discussions/categories',
  validateRequest(createCategorySchema),
  async (request, response, next) => {
    try {
      const auth = request.auth as AuthContext;
      const body = request.body as z.infer<typeof createCategorySchema>['body'];
      const data = await withPostgresTransaction(async (client) => {
        await assertAdminPermission(auth, 'content', client);
        const postAdminOnly = enforceAnnouncementSlug(body.slug, body.postAdminOnly ?? false);
        let inserted: QueryResult<CategoryRow>;
        try {
          inserted = await client.query<CategoryRow>(
            `insert into discussion_categories(slug,name,sort_order,is_active,post_admin_only)
             values($1,$2,coalesce($3,(select coalesce(max(sort_order),0)+1 from discussion_categories)),true,$4)
             returning category_id,slug,name,sort_order,is_active,post_admin_only`,
            [body.slug, body.name, body.sortOrder ?? null, postAdminOnly]
          );
        } catch (error) {
          if (isSlugConflict(error))
            throw new AppError(409, 'DISCUSSION_CATEGORY_DUPLICATE', 'Slug danh mục đã tồn tại.');
          throw error;
        }
        const row = inserted.rows[0];
        await audit(client, auth, {
          action: 'DISCUSSION_CATEGORY_CREATE',
          targetType: 'DISCUSSION_CATEGORY',
          targetId: row.category_id,
          reason: body.name,
          after: mapCategory(row)
        });
        return mapCategory(row);
      });
      response.status(201).json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.patch(
  '/admin/discussions/categories/:categoryId',
  validateRequest(updateCategorySchema),
  async (request, response, next) => {
    try {
      const auth = request.auth as AuthContext;
      const { categoryId } = request.params as { categoryId: string };
      const body = request.body as z.infer<typeof updateCategorySchema>['body'];
      const data = await withPostgresTransaction(async (client) => {
        await assertAdminPermission(auth, 'content', client);
        const locked: QueryResult<CategoryRow> = await client.query(
          `select category_id,slug,name,sort_order,is_active,post_admin_only
             from discussion_categories where category_id=$1 for update`,
          [categoryId]
        );
        const before = locked.rows[0];
        if (!before)
          throw new AppError(404, 'DISCUSSION_CATEGORY_001', 'Không tìm thấy danh mục.');
        if (body.isActive === true && ['thao-luan-truyen', 'gop-y-tac-pham'].includes(before.slug)) {
          throw new AppError(409, 'DISCUSSION_CATEGORY_RETIRED', 'Chuyên mục này đã được sáp nhập vào Thảo luận chung.');
        }
        const nextPostAdminOnly =
          before.slug === COMMUNITY_ANNOUNCEMENT_SLUG
            ? true
            : body.postAdminOnly ?? before.post_admin_only;
        const updated: QueryResult<CategoryRow> = await client.query(
          `update discussion_categories
              set name=coalesce($2,name),
                  sort_order=coalesce($3,sort_order),
                  is_active=coalesce($4,is_active),
                  post_admin_only=$5
            where category_id=$1
            returning category_id,slug,name,sort_order,is_active,post_admin_only`,
          [
            categoryId,
            body.name ?? null,
            body.sortOrder ?? null,
            body.isActive ?? null,
            nextPostAdminOnly
          ]
        );
        const row = updated.rows[0];
        await audit(client, auth, {
          action: 'DISCUSSION_CATEGORY_UPDATE',
          targetType: 'DISCUSSION_CATEGORY',
          targetId: categoryId,
          reason: requiredReason(body.reason),
          before: mapCategory(before),
          after: mapCategory(row)
        });
        return mapCategory(row);
      });
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.get(
  '/admin/discussions/topics',
  validateRequest(listAdminTopicsSchema),
  async (request, response, next) => {
    try {
      const query = request.query as unknown as z.infer<typeof listAdminTopicsSchema>['query'];
      const data = await listDiscussionTopics(query);
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.get(
  '/admin/discussions/topics/:topicId/comments',
  validateRequest(listAdminCommentsSchema),
  async (request, response, next) => {
    try {
      const { topicId } = request.params as { topicId: string };
      const query = request.query as unknown as z.infer<typeof listAdminCommentsSchema>['query'];
      const data = await listDiscussionTopicComments(topicId, query);
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.patch(
  '/admin/discussions/:topicId/moderation',
  validateRequest(topicModerationSchema),
  async (request, response, next) => {
    try {
      const auth = request.auth as AuthContext;
      const { topicId } = request.params as { topicId: string };
      const body = request.body as z.infer<typeof topicModerationSchema>['body'];
      let jobsQueued = false;
      const data = await withPostgresTransaction(async (client) => {
        await assertAdminPermission(auth, 'content', client);
        // The legacy route shares the reversible HIDE/RESTORE sanction workflow.
        if (body.status === 'HIDDEN' || body.status === 'VISIBLE') {
          if (body.status === 'HIDDEN') {
            const outcome = await moderateDiscussionHide(auth, client, {
              kind: 'DISCUSSION',
              id: topicId,
              reason: body.reason ?? '',
              permission: 'discussion.operate'
            });
            jobsQueued = outcome.skipped === null;
          } else {
            await restoreDiscussionSanction(auth, client, {
              kind: 'DISCUSSION',
              id: topicId,
              reason: body.reason ?? '',
              permission: 'discussion.operate'
            });
          }
        }
        const before = await lockTopic(client, topicId);
        if (before.status === 'DELETED' && body.status !== undefined && body.status !== 'DELETED')
          throw new AppError(
            409,
            'DISCUSSION_TOPIC_DELETED',
            'Không thể khôi phục chủ đề đã bị xóa.'
          );
        if (body.status === 'DELETED' || body.isPinned !== undefined || body.isLocked !== undefined) {
          const updated: QueryResult<TopicModerationRow> = await client.query(
            `update discussion_topics
                set status=coalesce($2,status),
                    is_pinned=coalesce($3,is_pinned),
                    is_locked=coalesce($4,is_locked)
              where topic_id=$1
              returning topic_id,category_id,author_id,title,status,is_pinned,is_locked`,
            [topicId, body.status === 'DELETED' ? body.status : null, body.isPinned ?? null, body.isLocked ?? null]
          );
          const row = updated.rows[0];
          if (
            row.status !== before.status ||
            row.is_pinned !== before.is_pinned ||
            row.is_locked !== before.is_locked
          )
            await refreshTopicActivity(client, topicId);
          await audit(client, auth, {
            action: 'DISCUSSION_TOPIC_MODERATE',
            targetType: 'DISCUSSION',
            targetId: topicId,
            affectedUserId: before.author_id,
            reason: requiredReason(body.reason),
            before: { status: before.status, isPinned: before.is_pinned, isLocked: before.is_locked },
            after: { status: row.status, isPinned: row.is_pinned, isLocked: row.is_locked }
          });
        }
        const row = await lockTopic(client, topicId);
        return {
          topicId: row.topic_id,
          status: row.status,
          isPinned: row.is_pinned,
          isLocked: row.is_locked
        };
      });
      if (jobsQueued) await drainAdminJobsSafely();
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

discussionAdminRoutes.patch(
  '/admin/discussions/:topicId/comments/:commentId/moderation',
  validateRequest(commentModerationSchema),
  async (request, response, next) => {
    try {
      const auth = request.auth as AuthContext;
      const { topicId, commentId } = request.params as { topicId: string; commentId: string };
      const body = request.body as z.infer<typeof commentModerationSchema>['body'];
      let jobsQueued = false;
      const data = await withPostgresTransaction(async (client) => {
        await assertAdminPermission(auth, 'content', client);
        if (body.status === 'HIDDEN' || body.status === 'VISIBLE') {
          // The legacy route shares the reversible HIDE/RESTORE sanction workflow.
          if (body.status === 'HIDDEN') {
            const outcome = await moderateDiscussionHide(auth, client, {
              kind: 'DISCUSSION_COMMENT',
              id: commentId,
              reason: body.reason ?? '',
              expectedTopicId: topicId,
              permission: 'discussion.operate'
            });
            jobsQueued = outcome.skipped === null;
          } else {
            await restoreDiscussionSanction(auth, client, {
              kind: 'DISCUSSION_COMMENT',
              id: commentId,
              reason: body.reason ?? '',
              expectedTopicId: topicId,
              permission: 'discussion.operate'
            });
          }
          const row = await client.query<{ comment_id: string; topic_id: string; status: DiscussionStatus }>(
            'select comment_id,topic_id,status from discussion_comments where comment_id=$1',
            [commentId]
          );
          return { commentId, topicId, status: row.rows[0].status };
        }
        const topic = await lockTopic(client, topicId);
        const locked: QueryResult<CommentModerationRow> = await client.query(
          `select comment_id,topic_id,author_id,body,status
             from discussion_comments where comment_id=$1 and topic_id=$2 for update`,
          [commentId, topicId]
        );
        const before = locked.rows[0];
        if (!before) throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
        if (before.status === 'DELETED' && body.status !== 'DELETED')
          throw new AppError(
            409,
            'DISCUSSION_COMMENT_DELETED',
            'Không thể khôi phục bình luận đã bị xóa.'
          );
        const updated: QueryResult<CommentModerationRow> = await client.query(
          `update discussion_comments set status=$2, updated_at=now() where comment_id=$1
            returning comment_id,topic_id,author_id,body,status`,
          [commentId, body.status]
        );
        if (body.status !== before.status) await refreshTopicActivity(client, topic.topic_id);
        await audit(client, auth, {
          action: 'DISCUSSION_COMMENT_MODERATE',
          targetType: 'DISCUSSION_COMMENT',
          targetId: commentId,
          affectedUserId: before.author_id,
          reason: requiredReason(body.reason),
          before: { status: before.status, topicId: topic.topic_id },
          after: { status: updated.rows[0].status, topicId: topic.topic_id }
        });
        return { commentId, topicId, status: updated.rows[0].status };
      });
      if (jobsQueued) await drainAdminJobsSafely();
      response.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  }
);

export type DiscussionReviewTarget = {
  title: string;
  content: string;
  username: string | null;
  status: DiscussionStatus;
  topicId: string;
  authorId: string;
};

/** Admin-only review snapshot, including hidden and deleted rows. */
export async function getDiscussionReviewTarget(
  kind: DiscussionTargetKind,
  id: string
): Promise<DiscussionReviewTarget> {
  const boundedId = uuidParam.parse(id);
  return withPostgresTransaction(async (client) => {
    if (kind === 'DISCUSSION') {
      const result: QueryResult<{
        topic_id: string;
        title: string;
        body: string;
        status: DiscussionStatus;
        author_id: string;
        username: string | null;
      }> = await client.query(
        `select t.topic_id,t.title,left(t.body,$2) as body,t.status,t.author_id,u.username
           from discussion_topics t left join users u on u.user_id=t.author_id
          where t.topic_id=$1`,
        [boundedId, TEXT_LIMIT]
      );
      const row = result.rows[0];
      if (!row) throw new AppError(404, 'DISCUSSION_TOPIC_001', 'Không tìm thấy chủ đề.');
      return {
        title: row.title,
        content: row.body,
        username: row.username,
        status: row.status,
        topicId: row.topic_id,
        authorId: row.author_id
      };
    }
    const result: QueryResult<{
      topic_id: string;
      title: string;
      body: string;
      status: DiscussionStatus;
      author_id: string;
      username: string | null;
    }> = await client.query(
      `select m.topic_id,t.title,left(m.body,$2) as body,m.status,m.author_id,u.username
         from discussion_comments m
         join discussion_topics t on t.topic_id=m.topic_id
         left join users u on u.user_id=m.author_id
        where m.comment_id=$1`,
      [boundedId, TEXT_LIMIT]
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
    return {
      title: row.title,
      content: row.body,
      username: row.username,
      status: row.status,
      topicId: row.topic_id,
      authorId: row.author_id
    };
  });
}

/**
 * Independence subjects of a discussion report: the comment author, the topic author and the
 * author of a novel attached to the topic. Runs on the caller's client because decision
 * transactions read it under their lock; opening a second pooled connection there deadlocks
 * the write path under load.
 */
export async function discussionInvolvedUserIds(
  kind: DiscussionTargetKind,
  id: string,
  client?: PoolClient
): Promise<string[]> {
  const boundedId = uuidParam.parse(id);
  const query = (text: string, params: unknown[]) =>
    (client ?? getPostgresPool()).query(text, params);
  type InvolvedRow = { comment_author?: string | null; topic_author: string; novel_author: string | null };
  const rows: Array<InvolvedRow> =
    kind === 'DISCUSSION'
      ? (await query(
          `select t.author_id as topic_author, n.author_id as novel_author
             from discussion_topics t
             left join novels n on n.novel_id = t.novel_id
            where t.topic_id = $1`,
          [boundedId]
        )).rows
      : (await query(
          `select m.author_id as comment_author, t.author_id as topic_author, n.author_id as novel_author
             from discussion_comments m
             join discussion_topics t on t.topic_id = m.topic_id
             left join novels n on n.novel_id = t.novel_id
            where m.comment_id = $1`,
          [boundedId]
        )).rows;
  return Array.from(
    new Set(
      rows
        .flatMap((row) => [row.comment_author ?? null, row.topic_author, row.novel_author])
        .filter((userId): userId is string => Boolean(userId))
    )
  );
}

/** Reporters may only flag visible targets they do not own. */
export async function assertDiscussionReportable(
  client: PoolClient,
  kind: DiscussionTargetKind,
  id: string,
  reporterId: string
): Promise<void> {
  if (!(await isPublicDiscussionTarget(kind, id, client))) {
    throw new AppError(404, 'DISCUSSION_TARGET_HIDDEN', 'Nội dung không còn khả dụng để báo cáo.');
  }
  const sql = kind === 'DISCUSSION'
    ? 'select author_id from discussion_topics where topic_id = $1'
    : 'select author_id from discussion_comments where comment_id = $1';
  const { rows } = await client.query<{ author_id: string }>(sql, [id]);
  if (rows[0]?.author_id === reporterId) {
    throw new AppError(409, 'DISCUSSION_SELF_REPORT', 'Bạn không thể báo cáo nội dung của chính mình.');
  }
}
