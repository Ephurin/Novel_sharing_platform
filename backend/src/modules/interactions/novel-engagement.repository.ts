import { randomUUID } from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { enqueueNotification } from './notification-events.js';
import { getPostgresPool } from '../../core/database/postgres.js';

export async function getNovelStatistics(novelId: string, viewerId?: string, includeDrafts = false) {
  const result = await getPostgresPool().query(`
    select
      (select coalesce(sum(c.word_count), 0)::bigint from chapters c
       where c.novel_id = $1 and c.deleted_at is null and ($3 or c.status = 'PUBLISHED')) as total_words,
      (select count(*)::int from novel_follows f join users u on u.user_id = f.user_id
       where f.novel_id = $1 and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null) as followers_count,
      (select json_build_object('average', avg(r.score)::float8, 'count', count(*)::int)
       from novel_ratings r join users u on u.user_id = r.user_id
       where r.novel_id = $1 and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null) as rating,
      exists(select 1 from novel_follows where novel_id = $1 and user_id = $2::uuid) as is_following,
      (select score from novel_ratings where novel_id = $1 and user_id = $2::uuid) as my_rating,
      (select review_text from novel_ratings where novel_id = $1 and user_id = $2::uuid) as my_review
  `, [novelId, viewerId ?? null, includeDrafts]);
  const row = result.rows[0];
  return {
    novelId,
    totalWords: Number(row.total_words),
    followersCount: row.followers_count as number,
    ratingAverage: row.rating.average as number | null,
    ratingsCount: row.rating.count as number,
    isFollowing: row.is_following as boolean,
    myRating: row.my_rating as number | null,
    myReview: row.my_review as string | null
  };
}

export async function setNovelFollow(novelId: string, userId: string, following: boolean) {
  if (following) {
    await withPostgresTransaction(async client => {
      const inserted = await client.query('insert into novel_follows (novel_id, user_id) values ($1, $2) on conflict do nothing returning novel_id', [novelId, userId]);
      if (inserted.rowCount) {
        const novel = (await client.query('select author_id,title from novels where novel_id=$1', [novelId])).rows[0];
        await enqueueNotification(client, { eventKey: 'novel-follow:' + randomUUID(), userId: novel.author_id, type: 'NOVEL_FOLLOW', title: 'Có độc giả theo dõi tác phẩm', content: novel.title, payload: { href: '/author/novels/' + novelId } });
      }
    });
  } else {
    await getPostgresPool().query('delete from novel_follows where novel_id = $1 and user_id = $2', [novelId, userId]);
  }
}

export async function setNovelRating(novelId: string, userId: string, score: number | null, review?: string | null) {
  if (score === null) {
    await getPostgresPool().query('delete from novel_ratings where novel_id = $1 and user_id = $2', [novelId, userId]);
  } else {
    await withPostgresTransaction(async client => {
    const changed = await client.query(`insert into novel_ratings (novel_id, user_id, score, review_text) values ($1, $2, $3, $5)
      on conflict (novel_id, user_id) do update set score = excluded.score,
        review_text = case when $4 then excluded.review_text else novel_ratings.review_text end,
        updated_at = now()
      where novel_ratings.score is distinct from excluded.score or ($4 and novel_ratings.review_text is distinct from excluded.review_text)
      returning novel_id`, [novelId, userId, score, review !== undefined, review ?? null]);
    if (changed.rowCount) {
      const novel = (await client.query('select author_id,title from novels where novel_id=$1', [novelId])).rows[0];
      await enqueueNotification(client, { eventKey: 'rating:' + randomUUID(), userId: novel.author_id, type: 'READER_REVIEW', title: 'Tác phẩm có đánh giá mới', content: novel.title + ' · ' + score + '/10', payload: { href: '/author/novels/' + novelId + '/reviews' } });
    }
    });
  }
}

export async function isActiveReader(userId: string) {
  const result = await getPostgresPool().query(`select 1 from users
    where user_id = $1 and role = 'READER' and status = 'ACTIVE' and deleted_at is null`, [userId]);
  return result.rowCount === 1;
}

export type ReviewSort = 'newest' | 'oldest' | 'highest' | 'lowest';
const reviewOrder: Record<ReviewSort, string> = {
  newest: 'r.updated_at desc, r.user_id asc',
  oldest: 'r.updated_at asc, r.user_id asc',
  highest: 'r.score desc, r.updated_at desc, r.user_id asc',
  lowest: 'r.score asc, r.updated_at desc, r.user_id asc'
};

export async function listNovelReviews(novelId: string, page: number, limit: number, sort: ReviewSort = 'newest') {
  const [data, count] = await Promise.all([
    getPostgresPool().query(`select r.user_id, r.score, r.review_text, r.created_at, r.updated_at,
        coalesce(p.display_name, u.username) as display_name, p.avatar_url
      from novel_ratings r join users u on u.user_id = r.user_id
      left join user_profiles p on p.user_id = u.user_id
      where r.novel_id = $1 and r.review_text is not null
        and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null
      order by ${reviewOrder[sort]} limit $2 offset $3`, [novelId, limit, (page - 1) * limit]),
    getPostgresPool().query(`select count(*)::int as total, avg(r.score)::float8 as average from novel_ratings r
      join users u on u.user_id = r.user_id where r.novel_id = $1 and r.review_text is not null
        and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null`, [novelId])
  ]);
  return {
    items: data.rows.map(row => ({ userId: row.user_id as string, displayName: row.display_name as string,
      avatarUrl: row.avatar_url as string | null, score: row.score as number,
      review: row.review_text as string, createdAt: row.created_at, updatedAt: row.updated_at })),
    totalItems: count.rows[0].total as number,
    ratingAverage: count.rows[0].average as number | null
  };
}
