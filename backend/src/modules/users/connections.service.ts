import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { followAuthor, unfollowAuthor } from '../interactions/social.repository.js';

export async function requireActiveTarget(userId: string) {
  const result = await getPostgresPool().query("select role from users where user_id=$1 and status='ACTIVE' and deleted_at is null", [userId]);
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  return result.rows[0];
}

export async function relationship(targetUserId: string, viewerId?: string) {
  const result = await getPostgresPool().query(`select
    exists(select 1 from follows where follower_id=$2 and author_id=$1) as following,
    exists(select 1 from follows where follower_id=$1 and author_id=$2) as "followedBy"`, [targetUserId, viewerId ?? null]);
  const { following, followedBy } = result.rows[0];
  return { following, followedBy, mutual: following && followedBy };
}

export async function connectionCounts(userId: string) {
  const result = await getPostgresPool().query(`select
    (select count(*)::int from follows where author_id=$1) as "followersCount",
    (select count(*)::int from follows where follower_id=$1) as "followingCount",
    (select count(*)::int from follows f join users u on u.user_id=f.author_id
      where f.follower_id=$1 and u.status='ACTIVE' and u.deleted_at is null
      and exists(select 1 from follows r where r.follower_id=f.author_id and r.author_id=$1)) as "mutualCount"`, [userId]);
  return result.rows[0];
}

export async function changeUserFollow(auth: AuthContext, targetUserId: string, following: boolean) {
  await assertActiveAccount(auth);
  await requireActiveTarget(targetUserId);
  if (auth.userId === targetUserId) throw new AppError(409, 'INTERACTION_001', 'Cannot follow yourself');
  const changed = following ? await followAuthor(auth.userId, targetUserId) : await unfollowAuthor(auth.userId, targetUserId);
  if (!changed) throw new AppError(following ? 409 : 404, following ? 'INTERACTION_001' : 'INTERACTION_002', following ? 'Interaction already exists' : 'Interaction not found');
  return { targetUserId, ...await relationship(targetUserId, auth.userId) };
}

export type ConnectionQuery = { page: number; limit: number; q: string; type?: 'FOLLOWING' | 'FOLLOWERS' | 'MUTUAL' };

export async function listAccounts(query: ConnectionQuery, viewerId?: string) {
  // A single statement keeps count and page on the same snapshot, including empty pages.
  const result = await getPostgresPool().query(`with candidates as (
    select u.user_id as "userId", u.public_key as "publicKey", u.username, u.role, p.display_name as "displayName", p.avatar_url as "avatarUrl",
      exists(select 1 from follows where follower_id=$1 and author_id=u.user_id) as following,
      exists(select 1 from follows where follower_id=u.user_id and author_id=$1) as "followedBy"
    from users u left join user_profiles p on p.user_id=u.user_id
    where u.status='ACTIVE' and u.deleted_at is null
      and (strpos(lower(u.username),lower($2))>0 or strpos(lower(coalesce(p.display_name,'')),lower($2))>0)
  ), filtered as (
    select *, (following and "followedBy") as mutual from candidates
    where $3::text is null or ($3='FOLLOWING' and following) or ($3='FOLLOWERS' and "followedBy")
      or ($3='MUTUAL' and following and "followedBy")
  ), page as (select * from filtered order by lower(username), "userId" limit $4 offset $5)
  select (select count(*)::int from filtered) as total,
    coalesce((select json_agg(page order by lower(username), "userId") from page),'[]'::json) as items`,
  [viewerId ?? null, query.q, query.type ?? null, query.limit, (query.page - 1) * query.limit]);
  return { items: result.rows[0].items, meta: { page: query.page, limit: query.limit, totalItems: result.rows[0].total, totalPages: Math.ceil(result.rows[0].total / query.limit) } };
}
