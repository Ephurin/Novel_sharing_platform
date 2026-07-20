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
export type TaxonomyNameInput = z.infer<typeof taxonomyNameSchema>['body'];
export type ListWithdrawRequestsInput = z.infer<typeof listWithdrawRequestsSchema>['query'];
