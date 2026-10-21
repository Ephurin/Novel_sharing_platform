import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type { UserRole } from '../../shared/constants/roles.js';
import type { UpdateProfileInput, UpdateSettingsInput } from './users.schemas.js';

export type UserProfile = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  bannerUrl: string | null;
  publishingSchedule: string | null;
  role: UserRole;
  language: string;
  notificationEnabled: boolean;
};

function mapProfile(row: QueryResultRow): UserProfile {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    bannerUrl: row.banner_url,
    publishingSchedule: row.publishing_schedule,
    role: row.role,
    language: row.language,
    notificationEnabled: row.notification_enabled
  };
}

export async function findProfileByUserId(userId: string) {
  const result = await getPostgresPool().query(
    `
      select u.user_id, u.username, u.role, p.display_name, p.avatar_url, p.bio, p.banner_url, p.publishing_schedule, p.language, p.notification_enabled
      from users u
      join user_profiles p on p.user_id = u.user_id
      where u.user_id = $1 and u.deleted_at is null
      limit 1
    `,
    [userId]
  );

  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const result = await getPostgresPool().query(
    `
      update user_profiles
      set
        display_name = coalesce($2, display_name),
        bio = case when $5 then $3 else bio end,
        avatar_url = case when $6 then $4 else avatar_url end,
        banner_url = case when $8 then $7 else banner_url end,
        publishing_schedule = case when $10 then $9 else publishing_schedule end,
        updated_at = now()
      where user_id = $1
      returning *
    `,
    [userId, input.displayName, input.bio ?? null, input.avatarUrl ?? null, input.bio !== undefined, input.avatarUrl !== undefined, input.bannerUrl ?? null, input.bannerUrl !== undefined, input.publishingSchedule ?? null, input.publishingSchedule !== undefined]
  );

  return result.rows[0] ?? null;
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  const result = await getPostgresPool().query(
    `
      update user_profiles
      set
        language = coalesce($2, language),
        notification_enabled = coalesce($3, notification_enabled),
        updated_at = now()
      where user_id = $1
      returning *
    `,
    [userId, input.language, input.notificationEnabled]
  );

  return result.rows[0] ?? null;
}

export async function findAuthorProfileById(authorId: string, viewerId?: string) {
  const profileResult = await getPostgresPool().query(
    `
      select u.user_id, u.username, u.role, u.created_at, p.display_name, p.avatar_url, p.bio, p.banner_url, p.publishing_schedule
      from users u
      join user_profiles p on p.user_id = u.user_id
      where u.user_id = $1
        and u.role in ('AUTHOR', 'ADMIN')
        and u.status = 'ACTIVE'
        and u.deleted_at is null
      limit 1
    `,
    [authorId]
  );

  if (!profileResult.rows[0]) {
    return null;
  }

  const [followersResult, novelsResult, followingResult, totalsResult] = await Promise.all([
    getPostgresPool().query('select count(*)::int as total from follows where author_id = $1', [authorId]),
    getPostgresPool().query(
      `
        select n.novel_id, n.title, n.status, n.likes_count, n.views_count,
               n.chapters_count, n.cover_image_url, n.serial_status, g.name as genre
        from novels n
        left join genres g on g.genre_id = n.genre_id
        where n.author_id = $1
          and n.status = 'PUBLISHED'
          and n.deleted_at is null
        order by n.updated_at desc
      `,
      [authorId]
    ),
    viewerId
      ? getPostgresPool().query('select 1 from follows where follower_id = $1 and author_id = $2', [viewerId, authorId])
      : Promise.resolve({ rowCount: 0 }),
    getPostgresPool().query(
      `select
         (select coalesce(sum(n.views_count), 0)::bigint from novels n
          where n.author_id = $1 and n.status = 'PUBLISHED' and n.deleted_at is null) as total_views,
         (select coalesce(sum(c.word_count), 0)::bigint
          from chapters c join novels n on n.novel_id = c.novel_id
          where n.author_id = $1 and n.status = 'PUBLISHED' and n.deleted_at is null
            and c.status = 'PUBLISHED' and c.deleted_at is null) as total_words`,
      [authorId]
    )
  ]);

  const profile = profileResult.rows[0];

  return {
    authorId: profile.user_id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    bannerUrl: profile.banner_url,
    publishingSchedule: profile.publishing_schedule,
    joinedAt: profile.created_at,
    totalViews: Number(totalsResult.rows[0]?.total_views ?? 0),
    totalWords: Number(totalsResult.rows[0]?.total_words ?? 0),
    followersCount: followersResult.rows[0]?.total ?? 0,
    isFollowing: Boolean(followingResult.rowCount),
    novels: novelsResult.rows.map((row) => ({
      novelId: row.novel_id,
      title: row.title,
      status: row.status,
      likesCount: row.likes_count,
      viewsCount: row.views_count,
      chaptersCount: row.chapters_count,
      coverImageUrl: row.cover_image_url,
      serialStatus: row.serial_status,
      genre: row.genre
    }))
  };
}
