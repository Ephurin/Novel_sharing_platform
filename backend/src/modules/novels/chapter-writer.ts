import pg from 'pg';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

// Dedicated admission pool: waiting writers must not exhaust the business pool
// needed by metadata/revision transactions. Advisory locks work across processes.
const writerPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4,
  connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000, allowExitOnIdle: true });
const leases = new WeakSet<object>();
export type ChapterWriterLease = { readonly chapterId: string };

export async function withChapterWriter<T>(chapterId: string,
  work: (lease: ChapterWriterLease) => Promise<T>, parent?: ChapterWriterLease): Promise<T> {
  if (parent && parent.chapterId === chapterId && leases.has(parent)) return work(parent);
  const client = await writerPool.connect();
  let acquired = false;
  let destroy = false;
  const lease = { chapterId };
  try {
    const result = await client.query('select pg_try_advisory_lock(hashtextextended($1, 71923)) as acquired', [chapterId]);
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) throw new AppError(409, 'DRAFT_CONFLICT', 'Chapter save in progress; reload before retrying');
    leases.add(lease);
    return await work(lease);
  } finally {
    leases.delete(lease);
    if (acquired) {
      try { await client.query('select pg_advisory_unlock(hashtextextended($1, 71923))', [chapterId]); }
      catch { destroy = true; }
    }
    client.release(destroy);
  }
}

export async function disconnectChapterWriter(): Promise<void> {
  await writerPool.end();
}
