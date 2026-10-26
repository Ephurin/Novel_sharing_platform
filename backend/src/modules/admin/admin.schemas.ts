import { z } from 'zod';

export const listAdminUsersSchema = z.object({
  query: z.object({
    role: z.enum(['READER', 'AUTHOR', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'LOCKED', 'DELETED']).optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const listAdminNovelsSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    authorId: z.string().uuid().optional(),
    status: z.enum(['DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED']).optional(),
    serialStatus: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']).optional(),
    includeDeleted: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean()).default(false),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const novelIdParamSchema = z.object({
  params: z.object({
    novelId: z.string().uuid()
  })
});

export const removeNovelSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    confirm: z.literal(true),
    reason: z.string().max(1000).optional()
  })
});

export const restoreNovelSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    reason: z.string().max(1000).optional()
  })
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().uuid()
  })
});

export const lockUserSchema = z.object({
  params: userIdParamSchema.shape.params,
  body: z.object({
    reason: z.string().max(500).optional()
  })
});

export const taxonomyNameSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional()
  })
});

export const listWithdrawRequestsSchema = z.object({
  query: z.object({
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const withdrawRequestIdParamSchema = z.object({
  params: z.object({
    withdrawRequestId: z.string().uuid()
  })
});

export const rejectWithdrawRequestSchema = z.object({
  params: withdrawRequestIdParamSchema.shape.params,
  body: z.object({
    reason: z.string().min(1).max(1000)
  })
});

export type ListAdminUsersInput = z.infer<typeof listAdminUsersSchema>['query'];
export type ListAdminNovelsInput = z.infer<typeof listAdminNovelsSchema>['query'];
export type TaxonomyNameInput = z.infer<typeof taxonomyNameSchema>['body'];
export type ListWithdrawRequestsInput = z.infer<typeof listWithdrawRequestsSchema>['query'];
export type RemoveNovelInput = z.infer<typeof removeNovelSchema>['body'];
export type RestoreNovelInput = z.infer<typeof restoreNovelSchema>['body'];
