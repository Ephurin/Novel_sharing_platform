import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger/logger.js';
import { errorResponse } from '../response/response.js';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response
      .status(error.httpStatus)
      .json(errorResponse(error.code, error.message, error.details));
    return;
  }

  if (error instanceof ZodError) {
    response
      .status(400)
      .json(errorResponse('VALIDATION_001', 'Invalid request payload', error.flatten()));
    return;
  }

  logger.error(error);

  response
    .status(500)
    .json(errorResponse('SYS_001', 'Internal Server Error'));
};
