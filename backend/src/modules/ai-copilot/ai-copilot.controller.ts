import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { createCopilotSuggestion } from './ai-copilot.service.js';
import { checkLlmProviderHealth } from './llm-provider.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const createCopilotSuggestionController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await createCopilotSuggestion(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};

export const getLlmHealthController: RequestHandler = async (_request, response, next) => {
  try {
    const result = await checkLlmProviderHealth();
    response.status(result.ready ? 200 : 503).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
