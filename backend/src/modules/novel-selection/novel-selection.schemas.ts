import { z } from 'zod';

export const selectionStatuses = ['PENDING', 'NEEDS_INFO', 'SELECTED', 'RECHECK', 'REJECTED', 'REVOKED'] as const;
export const selectionDecisions = ['APPROVE', 'REQUEST_INFO', 'REJECT', 'CONFIRM_MINOR_CHANGE', 'REOPEN', 'REVOKE'] as const;
const uuid = z.string().uuid();
const notes = z.string().trim().min(1).max(2000);
const expectedVersion = z.number().int().positive();
export const nominationKey = z.string().trim().min(1).max(128);
export const nominationBody = z.object({ reason: z.string().trim().min(50).max(2000) });
export const novelParams = z.object({ novelId: uuid });
export const caseParams = z.object({ caseId: uuid });
export const supplementParams = novelParams.extend(caseParams.shape);
export const supplementBody = z.object({ notes, expectedVersion });
export const selectionCriteria = z.object({
  content: z.boolean(), readability: z.boolean(), consistency: z.boolean(), completeness: z.boolean()
});
export const decisionBody = z.object({
  decision: z.enum(selectionDecisions), reason: notes, expectedVersion,
  criteria: selectionCriteria.optional(), shortStoryVerified: z.boolean().optional()
});
export const pageQuery = z.object({
  page: z.coerce.number().int().positive().max(10000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  view: z.enum(['queue', 'selected']).default('queue')
});

export type SelectionStatus = (typeof selectionStatuses)[number];
export type SelectionDecision = z.infer<typeof decisionBody>;
export type SelectionPage = z.infer<typeof pageQuery>;
