import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { createCopilotSuggestionController, getLlmHealthController } from './ai-copilot.controller.js';
import { copilotSuggestionSchema } from './ai-copilot.schemas.js';

export const aiCopilotRoutes = Router();

aiCopilotRoutes.get('/health', getLlmHealthController);

aiCopilotRoutes.post(
  '/copilot/suggestions',
  requireAuth,
  requireRoles(['AUTHOR', 'ADMIN']),
  validateRequest(copilotSuggestionSchema),
  createCopilotSuggestionController
);
