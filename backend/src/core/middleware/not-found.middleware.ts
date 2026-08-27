import type { RequestHandler } from 'express';
import { errorResponse } from '../response/response.js';

export const notFoundMiddleware: RequestHandler = (request, response) => {
  response
    .status(404)
    .json(errorResponse('NOT_FOUND_001', `Route not found: ${request.method} ${request.path}`));
};
