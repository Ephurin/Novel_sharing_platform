import { z } from 'zod';

export const moderationTargetTypeSchema = z.enum(['NOVEL', 'CHAPTER', 'COMMENT', 'USER']);

export const contentControlCheckSchema = z.object({
  body: z.object({
    targetType: moderationTargetTypeSchema,
    targetId: z.string().min(1),
    content: z.string().min(1),
    submittedBy: z.string().uuid()
  })
});

export const createReportSchema = z.object({
  body: z.object({
    targetType: moderationTargetTypeSchema,
    targetId: z.string().min(1),
    reason: z.string().min(1).max(100),
    description: z.string().max(2000).optional()
  })
});

export const listReviewsSchema = z.object({
  query: z.object({
    targetType: moderationTargetTypeSchema.optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED']).optional(),
    source: z.enum(['KEYWORD_FILTER', 'USER_REPORT']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const reviewIdParamSchema = z.object({
  params: z.object({
    reviewId: z.string().uuid()
  })
});

export const resolveReviewSchema = z.object({
  params: reviewIdParamSchema.shape.params,
  body: z.object({
    decision: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUIRED']),
    reason: z.string().max(2000).optional(),
    action: z.string().max(100).optional()
  })
});

export type ContentControlCheckInput = z.infer<typeof contentControlCheckSchema>['body'];
export type CreateReportInput = z.infer<typeof createReportSchema>['body'];
export type ListReviewsInput = z.infer<typeof listReviewsSchema>['query'];
export type ResolveReviewInput = z.infer<typeof resolveReviewSchema>['body'];
