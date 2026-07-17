import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema): RequestHandler {
  return (request, _response, next) => {
    request.body = schema.parse(request.body);
    next();
  };
}

export function validateRequest(schema: ZodSchema): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.parse({
      body: request.body,
      params: request.params,
      query: request.query
    });

    if (typeof parsed === 'object' && parsed !== null) {
      if ('body' in parsed) {
        request.body = parsed.body;
      }

      if ('params' in parsed) {
        request.params = parsed.params;
      }

      if ('query' in parsed) {
        request.query = parsed.query;
      }
    }

    next();
  };
}
