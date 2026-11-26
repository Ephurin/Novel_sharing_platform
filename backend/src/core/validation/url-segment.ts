
import { z } from 'zod';

export const urlSegmentSchema = z.string().max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
