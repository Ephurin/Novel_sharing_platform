import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { slugify } from '../../core/utils/slug.js';
import type { ListAdminUsersInput, TaxonomyNameInput } from './admin.schemas.js';

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
  const [users, novels, pendingModeration, mockRevenue] = await Promise.all([
    getPostgresPool().query("select count(*)::int as total from users where deleted_at is null"),
    getPostgresPool().query("select count(*)::int as total from novels where deleted_at is null"),
    getPostgresPool().query("select count(*)::int as total from moderation_reviews where status = 'PENDING'"),
    getPostgresPool().query("select coalesce(sum(amount_coins), 0)::int as total from transactions where type = 'DEPOSIT' and status = 'SUCCESS'")
  ]);

  return {
    totalUsers: users.rows[0]?.total ?? 0,
    totalNovels: novels.rows[0]?.total ?? 0,
    pendingModerationItems: pendingModeration.rows[0]?.total ?? 0,
    mockRevenueCoins: mockRevenue.rows[0]?.total ?? 0
  };
}
