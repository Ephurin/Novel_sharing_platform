import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type { CreateNovelInput, ListNovelsInput, UpdateNovelInput } from './novels.schemas.js';

type DbClient = Pick<PoolClient, 'query'>;

export type NovelStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED';

export type NovelRecord = {
  novelId: string;
  authorId: string;
  title: string;
  slug: string;
  synopsis: string;
  coverImageUrl: string | null;
  status: NovelStatus;
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  likesCount: number;
  viewsCount: number;
  chaptersCount: number;
};

function mapNovel(row: QueryResultRow): NovelRecord {
  return {
    novelId: row.novel_id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    synopsis: row.synopsis,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    serialStatus: row.serial_status,
    ageRating: row.age_rating,
    likesCount: row.likes_count,
    viewsCount: row.views_count,
    chaptersCount: row.chapters_count
  };
}

export async function createNovel(
  client: DbClient,
  input: CreateNovelInput & {
    authorId: string;
    slug: string;
    genreId: string | null;
  }
) {
  const result = await client.query(
    `
      insert into novels (author_id, title, slug, synopsis, cover_image_url, genre_id)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [input.authorId, input.title, input.slug, input.synopsis, input.coverImageUrl ?? null, input.genreId]
  );

  return mapNovel(result.rows[0]);
}

export async function findNovelById(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select *
      from novels
      where novel_id = $1 and deleted_at is null
      limit 1
    `,
    [novelId]
  );

  return result.rows[0] ? mapNovel(result.rows[0]) : null;
}

export async function listNovels(input: ListNovelsInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;
  const status = input.status ?? 'PUBLISHED';

  const dataResult = await getPostgresPool().query(
    `
      select *
      from novels
      where deleted_at is null
        and status = $1
        and ($2::text is null or title ilike $2 or synopsis ilike $2)
      order by updated_at desc
      limit $3 offset $4
    `,
    [status, search, input.limit, offset]
  );

  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from novels
      where deleted_at is null
        and status = $1
        and ($2::text is null or title ilike $2 or synopsis ilike $2)
    `,
    [status, search]
  );

  return {
    items: dataResult.rows.map(mapNovel),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function listNovelsByAuthor(authorId: string, input: ListNovelsInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;

  const dataResult = await getPostgresPool().query(
    `
      select *
      from novels
      where deleted_at is null
        and author_id = $1
        and ($2::novel_status is null or status = $2)
        and ($3::text is null or title ilike $3 or synopsis ilike $3)
      order by updated_at desc
      limit $4 offset $5
    `,
    [authorId, input.status ?? null, search, input.limit, offset]
  );

  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from novels
      where deleted_at is null
        and author_id = $1
        and ($2::novel_status is null or status = $2)
        and ($3::text is null or title ilike $3 or synopsis ilike $3)
    `,
    [authorId, input.status ?? null, search]
  );

  return {
    items: dataResult.rows.map(mapNovel),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function updateNovel(novelId: string, input: UpdateNovelInput) {
  const result = await getPostgresPool().query(
    `
      update novels
      set
        title = coalesce($2, title),
        synopsis = coalesce($3, synopsis),
        cover_image_url = coalesce($4, cover_image_url),
        updated_at = now()
      where novel_id = $1 and deleted_at is null
      returning *
    `,
    [novelId, input.title, input.synopsis, input.coverImageUrl]
  );

  return result.rows[0] ? mapNovel(result.rows[0]) : null;
}

export async function softDeleteNovel(novelId: string) {
  await getPostgresPool().query(
    `
      update novels
      set deleted_at = now(), updated_at = now()
      where novel_id = $1 and deleted_at is null
    `,
    [novelId]
  );
}

export async function submitNovelForPublish(novelId: string) {
  const result = await getPostgresPool().query(
    `
      update novels
      set status = 'PENDING_MODERATION', updated_at = now()
      where novel_id = $1 and deleted_at is null and status in ('DRAFT', 'REJECTED')
      returning *
    `,
    [novelId]
  );

  return result.rows[0] ? mapNovel(result.rows[0]) : null;
}

export async function publishNovel(novelId: string) {
  const result = await getPostgresPool().query(
    `
      update novels
      set
        status = 'PUBLISHED',
        published_at = coalesce(published_at, now()),
        updated_at = now()
      where novel_id = $1 and deleted_at is null and status in ('DRAFT', 'REJECTED', 'PENDING_MODERATION')
      returning *
    `,
    [novelId]
  );

  return result.rows[0] ? mapNovel(result.rows[0]) : null;
}

export async function rejectNovelPublication(novelId: string) {
  const result = await getPostgresPool().query(
    `
      update novels
      set status = 'REJECTED', updated_at = now()
      where novel_id = $1 and deleted_at is null and status = 'PENDING_MODERATION'
      returning *
    `,
    [novelId]
  );

  return result.rows[0] ? mapNovel(result.rows[0]) : null;
}

export async function upsertGenre(client: DbClient, genreName: string | undefined) {
  if (!genreName) {
    return null;
  }

  const slug = genreName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const result = await client.query(
    `
      insert into genres (name, slug)
      values ($1, $2)
      on conflict (slug) do update set name = excluded.name
      returning genre_id
    `,
    [genreName, slug]
  );

  return result.rows[0].genre_id as string;
}
