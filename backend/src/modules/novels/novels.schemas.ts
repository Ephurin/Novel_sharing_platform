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

export const createNovelSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255),
    synopsis: z.string().min(10),
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
    title: z.string().min(1).max(255).optional(),
    synopsis: z.string().min(10).optional(),
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
