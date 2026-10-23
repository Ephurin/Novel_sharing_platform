import { randomUUID } from 'node:crypto';
import { enqueueNotification } from './notification-events.js';
import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';

type DbClient = Pick<PoolClient, 'query'>;

export async function findPublishedNovel(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select novel_id, likes_count
      from novels
      where novel_id = $1
        and deleted_at is null
        and status = 'PUBLISHED'
      limit 1
    `,
    [novelId]
  );

  return result.rows[0] ?? null;
}

export async function findActiveAuthor(authorId: string) {
  const result = await getPostgresPool().query(
    `
      select user_id
      from users
      where user_id = $1
        and role in ('AUTHOR', 'ADMIN')
        and status = 'ACTIVE'
        and deleted_at is null
      limit 1
    `,
    [authorId]
  );

  return result.rows[0] ?? null;
}

export async function likeNovel(userId: string, novelId: string) {
  return withPostgresTransaction(async (client: DbClient) => {
    const insertResult = await client.query(
      `
        insert into likes (user_id, novel_id)
        values ($1, $2)
        on conflict do nothing
        returning novel_id
      `,
      [userId, novelId]
    );

    if (insertResult.rowCount !== 1) {
      return null;
    }

    const countResult = await client.query(
      `
        update novels
        set likes_count = likes_count + 1,
            updated_at = now()
        where novel_id = $1
        returning likes_count
      `,
      [novelId]
    );

    return countResult.rows[0]?.likes_count as number;
  });
}

export async function unlikeNovel(userId: string, novelId: string) {
  return withPostgresTransaction(async (client: DbClient) => {
    const deleteResult = await client.query(
      'delete from likes where user_id = $1 and novel_id = $2',
      [userId, novelId]
    );

    if (deleteResult.rowCount !== 1) {
      return null;
    }

    const countResult = await client.query(
      `
        update novels
        set likes_count = greatest(likes_count - 1, 0),
            updated_at = now()
        where novel_id = $1
        returning likes_count
      `,
      [novelId]
    );

    return countResult.rows[0]?.likes_count as number;
  });
}

export async function followAuthor(followerId: string, authorId: string) {
  return withPostgresTransaction(async client => {
  const result = await client.query(
    `
      insert into follows (follower_id, author_id)
      values ($1, $2)
      on conflict do nothing
      returning *
    `,
    [followerId, authorId]
  );

  if (result.rowCount === 1) await enqueueNotification(client, { eventKey: 'author-follow:' + randomUUID(), userId: authorId, type: 'AUTHOR_FOLLOW', title: 'Bạn có người theo dõi mới', content: 'Một độc giả vừa theo dõi trang tác giả của bạn.', payload: { href: '/author/profile' } });
  return result.rowCount === 1;
  });
}

export async function unfollowAuthor(followerId: string, authorId: string) {
  const result = await getPostgresPool().query(
    'delete from follows where follower_id = $1 and author_id = $2',
    [followerId, authorId]
  );

  return result.rowCount === 1;
}

export async function countFollowers(authorId: string) {
  const result = await getPostgresPool().query(
    'select count(*)::int as total from follows where author_id = $1',
    [authorId]
  );

  return result.rows[0]?.total ?? 0;
}
