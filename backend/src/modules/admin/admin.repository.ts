import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { slugify } from '../../core/utils/slug.js';
import type { ListAdminNovelsInput, ListAdminUsersInput, TaxonomyNameInput } from './admin.schemas.js';

type DbClient = Pick<PoolClient, 'query'>;

function mapAdminUser(row: QueryResultRow) {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAdminNovel(row: QueryResultRow) {
  return {
    novelId: row.novel_id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    authorEmail: row.author_email,
    title: row.title,
    slug: row.slug,
    synopsis: row.synopsis,
    status: row.status,
    serialStatus: row.serial_status,
    ageRating: row.age_rating,
    likesCount: row.likes_count,
    viewsCount: row.views_count,
    chaptersCount: row.chapters_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapAdminChapter(row: QueryResultRow) {
  return {
    chapterId: row.chapter_id,
    novelId: row.novel_id,
    title: row.title,
    chapterNumber: row.chapter_number,
    status: row.status,
    isVip: row.is_vip,
    priceCoins: row.price_coins,
    wordCount: row.word_count,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export async function listAdminUsers(input: ListAdminUsersInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;
  const dataResult = await getPostgresPool().query(
    `
      select u.*, p.display_name
      from users u
      left join user_profiles p on p.user_id = u.user_id
      where u.deleted_at is null
        and ($1::user_role is null or u.role = $1)
        and ($2::user_status is null or u.status = $2)
        and ($3::text is null or u.email ilike $3 or u.username ilike $3 or p.display_name ilike $3)
      order by u.created_at desc
      limit $4 offset $5
    `,
    [input.role ?? null, input.status ?? null, search, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from users u
      left join user_profiles p on p.user_id = u.user_id
      where u.deleted_at is null
        and ($1::user_role is null or u.role = $1)
        and ($2::user_status is null or u.status = $2)
        and ($3::text is null or u.email ilike $3 or u.username ilike $3 or p.display_name ilike $3)
    `,
    [input.role ?? null, input.status ?? null, search]
  );

  return {
    items: dataResult.rows.map(mapAdminUser),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function listAdminNovels(input: ListAdminNovelsInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;
  const dataResult = await getPostgresPool().query(
    `
      select
        n.*,
        u.username as author_username,
        u.email as author_email
      from novels n
      join users u on u.user_id = n.author_id
      where ($1::boolean = true or n.deleted_at is null)
        and ($2::uuid is null or n.author_id = $2)
        and ($3::novel_status is null or n.status = $3)
        and (
          $4::text is null
          or n.title ilike $4
          or n.synopsis ilike $4
          or u.username ilike $4
          or u.email ilike $4
        )
      order by n.updated_at desc
      limit $5 offset $6
    `,
    [input.includeDeleted, input.authorId ?? null, input.status ?? null, search, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from novels n
      join users u on u.user_id = n.author_id
      where ($1::boolean = true or n.deleted_at is null)
        and ($2::uuid is null or n.author_id = $2)
        and ($3::novel_status is null or n.status = $3)
        and (
          $4::text is null
          or n.title ilike $4
          or n.synopsis ilike $4
          or u.username ilike $4
          or u.email ilike $4
        )
    `,
    [input.includeDeleted, input.authorId ?? null, input.status ?? null, search]
  );

  return {
    items: dataResult.rows.map(mapAdminNovel),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function findAdminNovelById(novelId: string, includeDeleted = false) {
  const novelResult = await getPostgresPool().query(
    `
      select
        n.*,
        u.username as author_username,
        u.email as author_email
      from novels n
      join users u on u.user_id = n.author_id
      where n.novel_id = $1
        and ($2::boolean = true or n.deleted_at is null)
      limit 1
    `,
    [novelId, includeDeleted]
  );

  if (!novelResult.rows[0]) return null;

  const chaptersResult = await getPostgresPool().query(
    `
      select *
      from chapters
      where novel_id = $1
      order by chapter_number asc
    `,
    [novelId]
  );

  return {
    ...mapAdminNovel(novelResult.rows[0]),
    chapters: chaptersResult.rows.map(mapAdminChapter)
  };
}

export async function softRemoveNovelAggregate(client: DbClient, novelId: string) {
  const novelResult = await client.query(
    `
      update novels
      set deleted_at = coalesce(deleted_at, now()), updated_at = now()
      where novel_id = $1
      returning *
    `,
    [novelId]
  );

  if (!novelResult.rows[0]) return null;

  await client.query(
    `
      update chapters
      set deleted_at = coalesce(deleted_at, now()), updated_at = now()
      where novel_id = $1
    `,
    [novelId]
  );

  return mapAdminNovel(novelResult.rows[0]);
}

export async function restoreNovelAggregate(client: DbClient, novelId: string) {
  const novelResult = await client.query(
    `
      update novels
      set deleted_at = null, updated_at = now()
      where novel_id = $1
      returning *
    `,
    [novelId]
  );

  if (!novelResult.rows[0]) return null;

  await client.query(
    `
      update chapters
      set deleted_at = null, updated_at = now()
      where novel_id = $1
    `,
    [novelId]
  );

  return mapAdminNovel(novelResult.rows[0]);
}

export async function updateUserStatus(userId: string, status: 'ACTIVE' | 'LOCKED') {
  const result = await getPostgresPool().query(
    `
      update users
      set status = $2,
          updated_at = now()
      where user_id = $1
        and deleted_at is null
      returning *
    `,
    [userId, status]
  );

  return result.rows[0] ? mapAdminUser(result.rows[0]) : null;
}

export async function listTaxonomy() {
  const [genres, tags] = await Promise.all([
    getPostgresPool().query('select genre_id, name, slug, description, created_at from genres order by name asc'),
    getPostgresPool().query('select tag_id, name, slug, created_at from tags order by name asc')
  ]);

  return {
    genres: genres.rows.map((row) => ({
      genreId: row.genre_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      createdAt: row.created_at
    })),
    tags: tags.rows.map((row) => ({
      tagId: row.tag_id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at
    }))
  };
}

export async function createGenre(input: TaxonomyNameInput) {
  const slug = slugify(input.name);
  const result = await getPostgresPool().query(
    `
      insert into genres (name, slug, description)
      values ($1, $2, $3)
      on conflict (slug) do update
      set name = excluded.name,
          description = excluded.description
      returning genre_id, name, slug, description, created_at
    `,
    [input.name, slug, input.description ?? null]
  );

  return {
    genreId: result.rows[0].genre_id,
    name: result.rows[0].name,
    slug: result.rows[0].slug,
    description: result.rows[0].description,
    createdAt: result.rows[0].created_at
  };
}

export async function createTag(input: TaxonomyNameInput) {
  const slug = slugify(input.name);
  const result = await getPostgresPool().query(
    `
      insert into tags (name, slug)
      values ($1, $2)
      on conflict (slug) do update
      set name = excluded.name
      returning tag_id, name, slug, created_at
    `,
    [input.name, slug]
  );

  return {
    tagId: result.rows[0].tag_id,
    name: result.rows[0].name,
    slug: result.rows[0].slug,
    createdAt: result.rows[0].created_at
  };
}

export async function getDashboardStats() {
  const result = await getPostgresPool().query(`
    select
      (select count(*)::int from users where deleted_at is null) as users,
      (select count(*)::int from novels where deleted_at is null) as novels,
      (select count(*)::int from moderation_reviews where status='PENDING') as moderation,
      (select count(*)::int from moderation_reviews where status='PENDING' and source='USER_REPORT') as reports,
      (select count(*)::int from withdraw_requests where status='PENDING') as withdraws,
      (select coalesce(sum(amount_coins),0)::float8 from transactions where type='DEPOSIT' and status='SUCCESS') as deposited
  `);
  const activity = await getPostgresPool().query(`
    select to_char(d.day,'YYYY-MM-DD') as date,
      (select count(*)::int from users where deleted_at is null and (created_at at time zone 'Asia/Bangkok')::date=d.day::date) as users,
      (select count(*)::int from novels where deleted_at is null and (created_at at time zone 'Asia/Bangkok')::date=d.day::date) as novels
    from generate_series((now() at time zone 'Asia/Bangkok')::date-6, (now() at time zone 'Asia/Bangkok')::date, interval '1 day') d(day)
    order by d.day
  `);
  const row = result.rows[0];
  return { totalUsers:row.users, totalNovels:row.novels, pendingModerationItems:row.moderation,
    mockRevenueCoins:row.deposited, totalDepositedCoins:row.deposited, pendingReports:row.reports,
    pendingWithdraws:row.withdraws, activity:activity.rows,
    newUsers7Days:activity.rows.reduce((sum,r) => sum+r.users,0),
    newNovels7Days:activity.rows.reduce((sum,r) => sum+r.novels,0), generatedAt:new Date().toISOString() };
}
