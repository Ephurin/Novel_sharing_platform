
import type { PoolClient } from 'pg';
import { logger } from '../logger/logger.js';

const BACKFILL_LOCK = 'storycraft:url-identifier-backfill';
const RETRYABLE = new Set(['40001', '40P01', '55P03']);

const chapterBatch = `
  with batch as (
    select chapter_id from chapters where slug is null order by chapter_id limit $1 for update
  )
  update chapters c set slug = allocate_url_identifier('chapter', c.novel_id, chapter_url_base(c.chapter_number, c.title))
  from batch where c.chapter_id = batch.chapter_id and c.slug is null
`;

const topicBatch = `
  with batch as (
    select topic_id from discussion_topics where slug is null order by topic_id limit $1 for update
  )
  update discussion_topics t set slug = allocate_url_identifier('topic', null, t.title)
  from batch where t.topic_id = batch.topic_id and t.slug is null
`;

const bareProfileBatch = `
  with usernames as (
    select user_id, created_at, url_segment(username) as base
    from users where public_key is null
  ), first_users as (
    select distinct on (base) user_id, base from usernames
    where base <> '' order by base, created_at, user_id
  ), batch as (
    select u.user_id
    from first_users first join users u on u.user_id = first.user_id
    where u.public_key is null and not exists(select 1 from users taken where taken.public_key = first.base)
    order by first.base limit $1 for update of u
  )
  update users u set public_key = allocate_url_identifier('profile', null, u.username, true, true)
  from batch where u.user_id = batch.user_id and u.public_key is null
`;

const remainingProfileBatch = `
  with batch as (
    select user_id from users where public_key is null order by user_id limit $1 for update
  )
  update users u set public_key = allocate_url_identifier('profile', null, u.username)
  from batch where u.user_id = batch.user_id and u.public_key is null
`;

const novelBatch = `
  with batch as (
    select novel_id, slug from novels where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    order by novel_id limit $1 for update
  )
  update novels n set slug = allocate_url_identifier('novel', null, batch.slug, true)
  from batch where n.novel_id = batch.novel_id and n.slug = batch.slug
  returning n.novel_id, batch.slug as old_slug, n.slug as new_slug
`;

async function runBatch(client: PoolClient, sql: string, batchSize: number) {
  for (let attempt = 0; ; attempt++) {
    await client.query('begin');
    try {
      await client.query("set local lock_timeout = '5s'");
      const result = await client.query(sql, [batchSize]);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (attempt >= 3 || !RETRYABLE.has(code)) throw error;
    }
  }
}

export async function backfillUrlIdentifiers(client: PoolClient, batchSize = 200) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('URL backfill batch size must be a positive integer');

  await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [BACKFILL_LOCK]);
  try {
    for (const [resource, sql] of [
      ['chapters', chapterBatch],
      ['discussion topics', topicBatch],
      ['profiles (bare keys)', bareProfileBatch],
      ['profiles (remaining keys)', remainingProfileBatch],
      ['novels (invalid slugs)', novelBatch]
    ]) {
      for (;;) {
        const batch = await runBatch(client, sql, batchSize);
        if (!batch.rowCount) break;
        logger.info({ resource, updated: batch.rowCount }, 'Backfilled URL identifiers');
        if (sql === novelBatch) logger.info({ mappings: batch.rows }, 'Replaced invalid legacy novel slugs');
      }
    }
    const pending = await client.query<{ exists: boolean }>(`
      select exists(select 1 from chapters where slug is null)
        or exists(select 1 from discussion_topics where slug is null)
        or exists(select 1 from users where public_key is null)
        or exists(select 1 from novels where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') as exists
    `);
    if (pending.rows[0]?.exists) throw new Error('URL identifier backfill has pending rows');
  } finally {
    await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [BACKFILL_LOCK]);
  }
}
