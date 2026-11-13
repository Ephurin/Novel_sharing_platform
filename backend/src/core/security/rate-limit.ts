import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

type Bucket = { count: number; resetAt: number };

const PRUNE_THRESHOLD = 10_000;

const userOrIp = (request: Request) =>
  request.auth?.userId ? `user:${request.auth.userId}` : `ip:${request.ip ?? 'unknown'}`;

// Fixed-window limiter kept in process memory, keyed by the signed-in user (or the client IP) unless the
// route supplies its own key. Release limit: it covers one API instance only and is not a replay defense;
// a multi-instance or public deployment needs the gateway-level limit of SRS payment-wallet-service §1.
export function rateLimit(options: { scope: string; max: number; windowMs: number; key?: (request: Request) => string }): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyOf = options.key ?? userOrIp;

  return (request, response, next) => {
    const now = Date.now();
    const key = keyOf(request);
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
