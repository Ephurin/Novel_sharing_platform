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

// SRS novel-chapter-service §1: chapter title < 100 characters, content >= 500 characters.
// Content length is enforced when a chapter is published, so drafts and autosave never block writing.
export const CHAPTER_TITLE_MAX = 99;
export const CHAPTER_CONTENT_MIN = 500;

export const createChapterSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    title: z.string().min(1).max(CHAPTER_TITLE_MAX),
    content: z.string().default(''),
    clientRequestId: z.string().min(1).max(128).optional(),
    isVip: z.boolean().default(false),
    priceCoins: z.number().int().min(0).default(0)
  })
});

export const updateChapterSchema = z.object({
  params: chapterIdParamSchema.shape.params,
  body: z.object({
    title: z.string().min(1).max(CHAPTER_TITLE_MAX).optional(),
    content: z.string().optional(),
    isVip: z.boolean().optional(),
    priceCoins: z.number().int().min(0).optional(),
    expectedVersion: z.number().int().min(0).optional(),
    autosave: z.boolean().default(false)
  })
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>['body'];
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>['body'];
