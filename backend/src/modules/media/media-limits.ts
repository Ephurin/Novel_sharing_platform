import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';

const windowMs = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
let nextCleanup = 0;

function consumeAttempt(key: string, limit: number) {
  const now = Date.now();
  if (now >= nextCleanup) {
    for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
    nextCleanup = now + 60_000;
  }
  const current = attempts.get(key);
  const attempt = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  if (attempt.count >= limit || (!current && attempts.size >= 10_000)) return Math.ceil((attempt.resetAt - now) / 1000);
  attempt.count++;
  attempts.set(key, attempt);
  return null;
}

export const limitMediaUploads: RequestHandler = (req, res, next) => {
  const retryAfter = consumeAttempt('upload:' + req.auth!.userId, 20);
  if (retryAfter !== null) {
    res.setHeader('Retry-After', retryAfter);
    next(new AppError(429, 'MEDIA_RATE_LIMIT', 'Tối đa 20 lượt tải ảnh mỗi 10 phút.'));
    return;
  }
  next();
};

export function limitGiphyLookups(userId: string) {
  if (consumeAttempt('giphy:' + userId, 60) !== null) {
    throw new AppError(429, 'GIPHY_RATE_LIMIT', 'Tối đa 60 lượt xác thực GIF mỗi 10 phút.');
  }
}
