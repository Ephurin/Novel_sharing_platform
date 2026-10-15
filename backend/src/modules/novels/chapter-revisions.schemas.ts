import { z } from 'zod';

export const snapshotSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  }),
  body: z.object({
    content: z.string().optional(),
    purpose: z.enum(['AUTHOR_SNAPSHOT', 'MANUSCRIPT_BOOTSTRAP']).optional().default('AUTHOR_SNAPSHOT')
  }).default({})
});

export const acceptDraftSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  }),
  body: z.object({
    generationId: z.string().min(1)
  })
});

export const listRevisionsSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid()
  }),
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).default(50)
  }).default({})
});

export const getRevisionSchema = z.object({
  params: z.object({
    chapterId: z.string().uuid(),
    revisionId: z.string().uuid()
  })
});

export const internalRevisionSchema = z.object({
  params: z.object({
    revisionId: z.string().uuid()
  })
});
