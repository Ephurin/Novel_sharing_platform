import { z } from 'zod';

const contextSourceSchema = z.enum(['AUTHOR_MANUAL', 'AICOPILOT_SUGGESTION']).default('AUTHOR_MANUAL');
const characterRoleSchema = z.enum(['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR']);
const plotSummaryScopeSchema = z.enum(['NOVEL', 'ARC', 'CHAPTER']);

export const novelIdParamSchema = z.object({
  params: z.object({
    novelId: z.string().uuid()
  })
});

export const characterIdParamSchema = z.object({
  params: z.object({
    characterId: z.string().uuid()
  })
});

export const relationshipIdParamSchema = z.object({
  params: z.object({
    relationshipId: z.string().uuid()
  })
});

export const timelineEventIdParamSchema = z.object({
  params: z.object({
    eventId: z.string().uuid()
  })
});

export const plotSummaryIdParamSchema = z.object({
  params: z.object({
    summaryId: z.string().uuid()
  })
});

export const createCharacterSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    name: z.string().min(1).max(120),
    role: characterRoleSchema,
    personality: z.string().max(5000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    source: contextSourceSchema
  })
});

export const updateCharacterSchema = z.object({
  params: characterIdParamSchema.shape.params,
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      role: characterRoleSchema.optional(),
      personality: z.string().max(5000).nullable().optional(),
      description: z.string().max(5000).nullable().optional(),
      notes: z.string().max(5000).nullable().optional()
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' })
});

export const createRelationshipSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    sourceCharacterId: z.string().uuid(),
    targetCharacterId: z.string().uuid(),
    relationshipType: z.string().min(1).max(80),
    description: z.string().max(5000).nullable().optional()
  })
});

export const updateRelationshipSchema = z.object({
  params: relationshipIdParamSchema.shape.params,
  body: z
    .object({
      sourceCharacterId: z.string().uuid().optional(),
      targetCharacterId: z.string().uuid().optional(),
      relationshipType: z.string().min(1).max(80).optional(),
      description: z.string().max(5000).nullable().optional()
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' })
});

export const createTimelineEventSchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    title: z.string().min(1).max(255),
    eventOrder: z.coerce.number().int(),
    chapterId: z.string().uuid().nullable().optional(),
    summary: z.string().min(1).max(10000),
    source: contextSourceSchema
  })
});

export const updateTimelineEventSchema = z.object({
  params: timelineEventIdParamSchema.shape.params,
  body: z
    .object({
      title: z.string().min(1).max(255).optional(),
      eventOrder: z.coerce.number().int().optional(),
      chapterId: z.string().uuid().nullable().optional(),
      summary: z.string().min(1).max(10000).optional()
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' })
});

export const createPlotSummarySchema = z.object({
  params: novelIdParamSchema.shape.params,
  body: z.object({
    scope: plotSummaryScopeSchema,
    arcName: z.string().min(1).max(120).nullable().optional(),
    chapterId: z.string().uuid().nullable().optional(),
    startChapterNumber: z.coerce.number().int().positive().nullable().optional(),
    endChapterNumber: z.coerce.number().int().positive().nullable().optional(),
    summary: z.string().min(1).max(20000),
    source: contextSourceSchema
  })
});

export const updatePlotSummarySchema = z.object({
  params: plotSummaryIdParamSchema.shape.params,
  body: z
    .object({
      scope: plotSummaryScopeSchema.optional(),
      arcName: z.string().min(1).max(120).nullable().optional(),
      chapterId: z.string().uuid().nullable().optional(),
      startChapterNumber: z.coerce.number().int().positive().nullable().optional(),
      endChapterNumber: z.coerce.number().int().positive().nullable().optional(),
      summary: z.string().min(1).max(20000).optional()
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' })
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>['body'];
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>['body'];
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>['body'];
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>['body'];
export type CreateTimelineEventInput = z.infer<typeof createTimelineEventSchema>['body'];
export type UpdateTimelineEventInput = z.infer<typeof updateTimelineEventSchema>['body'];
export type CreatePlotSummaryInput = z.infer<typeof createPlotSummarySchema>['body'];
export type UpdatePlotSummaryInput = z.infer<typeof updatePlotSummarySchema>['body'];
