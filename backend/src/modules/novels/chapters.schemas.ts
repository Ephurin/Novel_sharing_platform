import { z } from 'zod';

export const novelIdParamSchema = z.object({
  params: z.object({
    novelId: z.string().uuid()
  })
});

export const chapterIdParamSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  })
});

export const createChapterSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    title: z.string().min(1).max(100),
    content: z.string().default(''),
    isVip: z.boolean().default(false),
    priceCoins: z.number().int().min(0).default(0)
  })
});

export const updateChapterSchema = z.object({
  params: chapterIdParamSchema.shape.params,
  body: z.object({
    title: z.string().min(1).max(100).optional(),
    content: z.string().optional(),
    isVip: z.boolean().optional(),
    priceCoins: z.number().int().min(0).optional(),
    autosave: z.boolean().default(false)
  })
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>['body'];
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>['body'];
