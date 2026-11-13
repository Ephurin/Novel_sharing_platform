import { z } from 'zod';

/**
 * Array schema that rejects oversized input before any element is validated.
 *
 * SEC-01 / GHSA-mrhx-c7xc-m3w5: zod 3 validates every element and keeps one issue per
 * failing element even when `.max()` is set, so a 1 MB body of invalid items allocates
 * ~150 MB of issue objects. The length check here is fatal and runs first; the inner
 * array schema (with the same `.max`) only sees bounded input. Remove once zod >= 4.6.6.
 */
export function boundedArray<T extends z.ZodTypeAny>(item: T, max: number, options: { min?: number } = {}) {
  const inner = options.min === undefined ? z.array(item).max(max) : z.array(item).min(options.min).max(max);
  return z
    .unknown()
    .superRefine((value, ctx) => {
      if (Array.isArray(value) && value.length > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          type: 'array',
          maximum: max,
          inclusive: true,
          exact: false,
          message: `Array must contain at most ${max} element(s)`,
          fatal: true
        });
      }
    })
    .pipe(inner);
}
