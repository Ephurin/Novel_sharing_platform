import { z } from 'zod';
import { boundedArray } from '../../core/validation/bounded-array.js';

// SEC-01: bound tags before element validation (zod 3 memory amplification, GHSA-mrhx-c7xc-m3w5).
export const MAX_NOVEL_TAGS = 20;

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

// SRS novel-chapter-service §1 (product-owner decision D3, 2026-11-09): title < 255 characters and a synopsis of
// at least 50 characters. The synopsis is a short introduction; story setup lives in the Story Bible.
export const NOVEL_TITLE_MAX = 254;
export const NOVEL_SYNOPSIS_MIN = 50;

export const createNovelSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(NOVEL_TITLE_MAX),
    synopsis: z.string().trim().min(NOVEL_SYNOPSIS_MIN),
    authorNote: z.string().trim().max(5000).nullable().optional(),
    genres: boundedArray(z.string().trim().min(1).max(100), 5).optional(),
    genre: z.string().max(100).optional(),
    tags: boundedArray(z.string().min(1).max(100), MAX_NOVEL_TAGS).default([]),
    coverImageUrl: z.string().url().nullable().optional()
  })
});

export const updateNovelSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    title: z.string().trim().min(1).max(NOVEL_TITLE_MAX).optional(),
    // Length is checked in updateNovel against the stored synopsis: an unchanged legacy synopsis is accepted.
    synopsis: z.string().trim().optional(),
    authorNote: z.string().trim().max(5000).nullable().optional(),
    genres: boundedArray(z.string().trim().min(1).max(100), 5).optional(),
    genre: z.string().max(100).nullable().optional(),
    tags: boundedArray(z.string().min(1).max(100), MAX_NOVEL_TAGS).optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    // UAT 2026-11-20 (BUG-003): the author sets the age rating.
    ageRating: z.enum(['EVERYONE', 'TEEN', 'MATURE']).optional()
  })
});

export type ListNovelsInput = z.infer<typeof listNovelsSchema>['query'];
export type CreateNovelInput = z.infer<typeof createNovelSchema>['body'];
export type UpdateNovelInput = z.infer<typeof updateNovelSchema>['body'];
