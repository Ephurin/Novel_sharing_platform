import { z } from 'zod';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const RAW_HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;

export const uuidParam = z.string().uuid();

export const topicTitleSchema = z
  .string()
  .trim()
  .min(3, 'TITLE_TOO_SHORT')
  .max(200, 'TITLE_TOO_LONG')
  .refine((value) => !CONTROL_CHARS.test(value), 'TITLE_CONTROL_CHARS')
  .refine((value) => !RAW_HTML_TAG.test(value), 'TITLE_RAW_HTML');

export const topicBodySchema = z
  .string()
  .trim()
  .min(1, 'BODY_REQUIRED')
  .max(20000, 'BODY_TOO_LONG')
  .refine((value) => !CONTROL_CHARS.test(value), 'BODY_CONTROL_CHARS')
  .refine((value) => !RAW_HTML_TAG.test(value), 'BODY_RAW_HTML');

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, 'COMMENT_REQUIRED')
  .max(10000, 'COMMENT_TOO_LONG')
  .refine((value) => !CONTROL_CHARS.test(value), 'COMMENT_CONTROL_CHARS')
  .refine((value) => !RAW_HTML_TAG.test(value), 'COMMENT_RAW_HTML');

export const cursorSchema = z.string().trim().min(1).max(1536);
export const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
export const topicSortSchema = z.enum(['activity', 'newest', 'replies']).default('activity');

const categorySlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, 'INVALID_SLUG');

export const listCategoriesSchema = z.object({});

export const listTopicsSchema = z.object({
  query: z.object({
    category: categorySlugSchema.optional(),

    q: z.string().trim().min(1).max(120).optional(),
    sort: topicSortSchema,
    cursor: cursorSchema.optional(),
    limit: limitSchema
  })
});

export const topicIdParamsSchema = z.object({
  params: z.object({ topicId: uuidParam })
});

export const createTopicSchema = z.object({
  body: z.object({
    title: topicTitleSchema,
    body: topicBodySchema,
    categoryId: uuidParam


  })
});

export const updateTopicSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  body: z
    .object({
      title: topicTitleSchema.optional(),
      body: topicBodySchema.optional(),
      categoryId: uuidParam.optional()


    })
    .refine((value) => Object.keys(value).length > 0, 'EMPTY_PATCH')
});

export const listOwnTopicsSchema = z.object({
  query: z.object({
    cursor: cursorSchema.optional(),
    limit: limitSchema
  })
});

export const listCommentsSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  query: z.object({
    rootId: uuidParam.optional(),
    cursor: cursorSchema.optional(),
    limit: limitSchema
  })
});

export const commentParamsSchema = z.object({
  params: z.object({ topicId: uuidParam, commentId: uuidParam })
});

export const createCommentSchema = z.object({
  params: z.object({ topicId: uuidParam }),
  body: z.object({
    body: commentBodySchema,
    replyToId: uuidParam.optional()
  })
});

export const updateCommentSchema = z.object({
  params: z.object({ topicId: uuidParam, commentId: uuidParam }),
  body: z.object({ body: commentBodySchema })
});

export const topicReactionSchema = z.object({
  params: z.object({ topicId: uuidParam })
});

export const commentReactionSchema = z.object({
  params: z.object({ topicId: uuidParam, commentId: uuidParam })
});

export const recordViewSchema = z.object({
  params: z.object({ topicId: uuidParam })
});

export type ListTopicsInput = z.infer<typeof listTopicsSchema>['query'];
export type CreateTopicInput = z.infer<typeof createTopicSchema>['body'];
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>['body'];
export type CreateCommentInput = z.infer<typeof createCommentSchema>['body'];
export type TopicSort = z.infer<typeof topicSortSchema>;
