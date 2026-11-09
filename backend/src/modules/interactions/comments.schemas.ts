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

export const createCommentSchema = z.object({
  params: chapterIdParamSchema.shape.params,
  body: z.object({
    content: z.string().trim().min(1).max(2000),
    paragraphOffset: z.number().int().min(0).nullable().optional()
  })
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
  body: z.object({
    content: z.string().trim().min(1).max(2000)
  })
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>['body'];
export type ListCommentsInput = z.infer<typeof listCommentsSchema>['query'];
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>['body'];

export const novelCommentIdParamSchema = z.object({ params: z.object({ novelId: z.string().uuid() }) });
export const createNovelCommentSchema = createCommentSchema.extend({ params: novelCommentIdParamSchema.shape.params });
export const listNovelCommentsSchema = listCommentsSchema.extend({ params: novelCommentIdParamSchema.shape.params });

export const createReplySchema = updateCommentSchema;
export const listRepliesSchema = listCommentsSchema.extend({ params: commentIdParamSchema.shape.params });
export const authorCommentsSchema = listNovelCommentsSchema.extend({ query: listCommentsSchema.shape.query.extend({ scope: z.enum(['ALL', 'NOVEL', 'CHAPTER']).default('ALL'), chapterId: z.string().uuid().optional() }) });
