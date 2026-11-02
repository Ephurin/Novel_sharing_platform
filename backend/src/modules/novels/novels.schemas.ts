import { z } from 'zod';

export const novelIdParamSchema = z.object({
  params: z.object({
    novelId: z.string().uuid()
  })
});

export const listNovelsSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    status: z.enum(['DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

// SRS novel-chapter-service §1: title < 255 characters, synopsis >= 500 characters.
export const NOVEL_TITLE_MAX = 254;
export const NOVEL_SYNOPSIS_MIN = 500;

export const createNovelSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(NOVEL_TITLE_MAX),
    synopsis: z.string().trim().min(NOVEL_SYNOPSIS_MIN),
    authorNote: z.string().trim().max(5000).nullable().optional(),
    genres: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
    genre: z.string().max(100).optional(),
    tags: z.array(z.string().min(1).max(100)).default([]),
    coverImageUrl: z.string().url().nullable().optional()
  })
});

export const updateNovelSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    title: z.string().trim().min(1).max(NOVEL_TITLE_MAX).optional(),
    synopsis: z.string().trim().min(NOVEL_SYNOPSIS_MIN).optional(),
    authorNote: z.string().trim().max(5000).nullable().optional(),
    genres: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
    genre: z.string().max(100).nullable().optional(),
    tags: z.array(z.string().min(1).max(100)).optional(),
    coverImageUrl: z.string().url().nullable().optional()
  })
});

export type ListNovelsInput = z.infer<typeof listNovelsSchema>['query'];
export type CreateNovelInput = z.infer<typeof createNovelSchema>['body'];
export type UpdateNovelInput = z.infer<typeof updateNovelSchema>['body'];
