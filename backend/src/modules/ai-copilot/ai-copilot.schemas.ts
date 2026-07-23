import { z } from 'zod';

export const copilotSuggestionSchema = z.object({
  body: z.object({
    novelId: z.string().uuid(),
    chapterId: z.string().uuid().optional().nullable(),
    instruction: z.string().trim().min(1).max(2000),
    recentText: z.string().max(50000).optional().default('')
  })
});

export type CopilotSuggestionInput = z.infer<typeof copilotSuggestionSchema>['body'];
