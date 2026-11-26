import { createHash } from 'node:crypto';
import { getPostgresPool } from '../database/postgres.js';
import { AppError } from '../errors/app-error.js';

export const appealGoogleWindowMs = 15 * 60 * 1000;
const maxAttempts = 10;

type AppealGoogleRateLimitScope = 'appeal-google-challenge' | 'appeal-google-exchange' | 'appeal-google-subject';

export async function consumeAppealGoogleRateLimit(scope: AppealGoogleRateLimitScope, key: string) {
  const bucketKey = createHash('sha256').update(key).digest('hex');
  const { rows: [result] } = await getPostgresPool().query<{ retry_after_seconds: number | null }>(
    `insert into appeal_google_rate_limits as bucket (scope, bucket_key, attempt_count, reset_at)
     values ($1, $2, 1, statement_timestamp() + $3::integer * interval '1 millisecond')
     on conflict (scope, bucket_key) do update set
       attempt_count = case when bucket.reset_at <= statement_timestamp() then 1
         else least(bucket.attempt_count + 1, $4::integer + 1) end,
       reset_at = case when bucket.reset_at <= statement_timestamp() then excluded.reset_at
         else bucket.reset_at end
     returning case when attempt_count > $4::integer
       then greatest(1, ceil(extract(epoch from reset_at - statement_timestamp()))::integer)
       end as retry_after_seconds`,
    [scope, bucketKey, appealGoogleWindowMs, maxAttempts]
  );

  return result.retry_after_seconds;
}

export function appealGoogleRateLimitError(scope: AppealGoogleRateLimitScope, retryAfterSeconds: number) {
  return new AppError(429, 'RATE_LIMIT_001', 'Too many requests, please retry later', { scope, retryAfterSeconds });
}

export async function pruneExpiredAppealGoogleRateLimits() {
  await getPostgresPool().query('delete from appeal_google_rate_limits where reset_at <= statement_timestamp()');
}
