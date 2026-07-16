import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema): RequestHandler {
  return (request, _response, next) => {
    request.body = schema.parse(request.body);
    next();
  };
}
