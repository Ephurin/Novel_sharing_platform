import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

type Bucket = { count: number; resetAt: number };

const PRUNE_THRESHOLD = 10_000;

// Fixed-window limiter kept in process memory, keyed by the signed-in user (or the client IP for
// unauthenticated callbacks). It covers a single API instance; a multi-instance deployment still needs
// the gateway-level limit described in SRS payment-wallet-service §1.
export function rateLimit(options: { scope: string; max: number; windowMs: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.auth?.userId ? `user:${request.auth.userId}` : `ip:${request.ip ?? 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= PRUNE_THRESHOLD) {
        for (const [storedKey, stored] of buckets) if (stored.resetAt <= now) buckets.delete(storedKey);
      }
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      next(new AppError(429, 'RATE_LIMIT_001', 'Too many requests, please retry later', { scope: options.scope, retryAfterSeconds }));
      return;
    }

    next();
  };
}
