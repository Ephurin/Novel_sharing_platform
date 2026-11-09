import { z } from 'zod';

export const chapterIdParamSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  })
});

export const commentIdParamSchema = z.object({
  params: z.object({
    commentId: z.string().uuid()
  })
});

const imageUrlSchema = z.string().regex(/^\/api\/v1\/media\/[a-f0-9-]{36}\.gif$/, 'Chọn GIF đã tải lên').nullable().optional();
const commentBodySchema = z.object({
  content: z.string().trim().max(2000),
  isSpoiler: z.boolean().optional(),
  imageUrl: imageUrlSchema,
  paragraphOffset: z.number().int().min(0).nullable().optional()
}).refine(value => value.content.length > 0 || Boolean(value.imageUrl), { message: 'Nhập nội dung hoặc chọn GIF', path: ['content'] });

export const createCommentSchema = z.object({
  params: chapterIdParamSchema.shape.params,
  body: commentBodySchema
});

export const listCommentsSchema = z.object({
  params: chapterIdParamSchema.shape.params,
  query: z.object({
    paragraphOffset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const updateCommentSchema = z.object({
  params: commentIdParamSchema.shape.params,
  body: commentBodySchema
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>['body'];
export type ListCommentsInput = z.infer<typeof listCommentsSchema>['query'];
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>['body'];

export const novelCommentIdParamSchema = z.object({ params: z.object({ novelId: z.string().uuid() }) });
export const createNovelCommentSchema = createCommentSchema.extend({ params: novelCommentIdParamSchema.shape.params });
export const listNovelCommentsSchema = listCommentsSchema.extend({
  params: novelCommentIdParamSchema.shape.params,
  query: listCommentsSchema.shape.query.extend({ scope: z.enum(['NOVEL', 'ALL']).default('NOVEL') })
});

export const commentReactionSchema = z.object({
  params: commentIdParamSchema.shape.params,
  body: z.object({ reaction: z.enum(['LIKE', 'DISLIKE']).nullable() })
});

export const createReplySchema = updateCommentSchema;
export const listRepliesSchema = listCommentsSchema.extend({ params: commentIdParamSchema.shape.params });
export const authorCommentsSchema = listNovelCommentsSchema.extend({ query: listCommentsSchema.shape.query.extend({ scope: z.enum(['ALL', 'NOVEL', 'CHAPTER']).default('ALL'), chapterId: z.string().uuid().optional() }) });
