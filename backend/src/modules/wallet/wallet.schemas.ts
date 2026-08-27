import { z } from 'zod';

export const walletTransactionsSchema = z.object({
  query: z.object({
    type: z.enum(['DEPOSIT', 'WITHDRAW', 'UNLOCK', 'DONATE']).optional(),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const createDepositSessionSchema = z.object({
  body: z.object({
    packageCode: z.enum(['COIN_100', 'COIN_500', 'COIN_1000', 'COIN_5000'])
  })
});

export const mockDepositSuccessSchema = z.object({
  body: z.object({
    depositSessionId: z.string().uuid(),
    mockResult: z.enum(['SUCCESS'])
  })
});

export const chapterIdParamSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  })
});

export const authorIdParamSchema = z.object({
  params: z.object({
    authorId: z.string().uuid()
  })
});

export const donateSchema = z.object({
  params: authorIdParamSchema.shape.params,
  body: z.object({
    amountCoins: z.number().int().positive().max(100000),
    message: z.string().max(500).optional()
  })
});

export const createWithdrawRequestSchema = z.object({
  body: z.object({
    amountCoins: z.number().int().min(100),
    bankAccountLabel: z.string().min(3).max(255)
  })
});

export type WalletTransactionsInput = z.infer<typeof walletTransactionsSchema>['query'];
export type CreateDepositSessionInput = z.infer<typeof createDepositSessionSchema>['body'];
export type MockDepositSuccessInput = z.infer<typeof mockDepositSuccessSchema>['body'];
export type DonateInput = z.infer<typeof donateSchema>['body'];
export type CreateWithdrawRequestInput = z.infer<typeof createWithdrawRequestSchema>['body'];
