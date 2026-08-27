import { z } from 'zod';

export const novelIdParamSchema = z.object({
  params: z.object({
    novelId: z.string().uuid()
  })
});

export const authorIdParamSchema = z.object({
  params: z.object({
    authorId: z.string().uuid()
  })
});
