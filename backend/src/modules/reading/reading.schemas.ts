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

export const readingPreferencesSchema = z.object({
  body: z.object({
    fontFamily: z.string().min(1).max(80).nullable().optional(),
    fontSize: z.number().int().min(10).max(40),
    background: z.enum(['LIGHT', 'DARK', 'SEPIA']),
    lineHeight: z.number().min(1).max(3)
  })
});

export const searchNovelsSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    genre: z.string().optional(),
    tag: z.string().optional(),
    status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']).optional(),
    sort: z.enum(['relevance', 'views', 'likes', 'updatedAt', 'wordCount', 'title']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const syncReadingHistorySchema = z.object({
  body: z.object({
    novelId: z.string().uuid(),
    chapterId: z.string().uuid(),
    paragraphIndex: z.number().int().min(0).default(0),
    pageOffset: z.number().min(0).max(1).nullable().optional()
  })
});

export const historyListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const addLibraryItemSchema = z.object({
  body: z.object({
    novelId: z.string().uuid()
  })
});

export type ReadingPreferencesInput = z.infer<typeof readingPreferencesSchema>['body'];
export type SearchNovelsInput = z.infer<typeof searchNovelsSchema>['query'];
export type SyncReadingHistoryInput = z.infer<typeof syncReadingHistorySchema>['body'];
export type HistoryListInput = z.infer<typeof historyListSchema>['query'];
export type AddLibraryItemInput = z.infer<typeof addLibraryItemSchema>['body'];
