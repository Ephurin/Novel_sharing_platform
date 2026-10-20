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
    await getPostgresPool().query('insert into novel_follows (novel_id, user_id) values ($1, $2) on conflict do nothing', [novelId, userId]);
  } else {
    await getPostgresPool().query('delete from novel_follows where novel_id = $1 and user_id = $2', [novelId, userId]);
  }
}

export async function setNovelRating(novelId: string, userId: string, score: number | null, review?: string | null) {
  if (score === null) {
    await getPostgresPool().query('delete from novel_ratings where novel_id = $1 and user_id = $2', [novelId, userId]);
  } else {
    await getPostgresPool().query(`insert into novel_ratings (novel_id, user_id, score, review_text) values ($1, $2, $3, $5)
      on conflict (novel_id, user_id) do update set score = excluded.score,
        review_text = case when $4 then excluded.review_text else novel_ratings.review_text end,
        updated_at = now()`, [novelId, userId, score, review !== undefined, review ?? null]);
  }
}

export async function isActiveReader(userId: string) {
  const result = await getPostgresPool().query(`select 1 from users
    where user_id = $1 and role = 'READER' and status = 'ACTIVE' and deleted_at is null`, [userId]);
  return result.rowCount === 1;
}

export async function listNovelReviews(novelId: string, page: number, limit: number) {
  const [data, count] = await Promise.all([
    getPostgresPool().query(`select r.user_id, r.score, r.review_text, r.created_at, r.updated_at,
        coalesce(p.display_name, u.username) as display_name, p.avatar_url
      from novel_ratings r join users u on u.user_id = r.user_id
      left join user_profiles p on p.user_id = u.user_id
      where r.novel_id = $1 and r.review_text is not null
        and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null
      order by r.updated_at desc, r.user_id asc limit $2 offset $3`, [novelId, limit, (page - 1) * limit]),
    getPostgresPool().query(`select count(*)::int as total from novel_ratings r
      join users u on u.user_id = r.user_id where r.novel_id = $1 and r.review_text is not null
        and u.role = 'READER' and u.status = 'ACTIVE' and u.deleted_at is null`, [novelId])
  ]);
  return {
    items: data.rows.map(row => ({ userId: row.user_id as string, displayName: row.display_name as string,
      avatarUrl: row.avatar_url as string | null, score: row.score as number,
      review: row.review_text as string, createdAt: row.created_at, updatedAt: row.updated_at })),
    totalItems: count.rows[0].total as number
  };
}
