import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { slugify } from '../../core/utils/slug.js';
import type { CreateNovelInput, ListNovelsInput, UpdateNovelInput } from './novels.schemas.js';

type DbClient = Pick<PoolClient, 'query'>;

const genresProjection = `(select array_agg(gg.name order by (ng.genre_id = n.genre_id) desc, gg.name)
  from novel_genres ng join genres gg on gg.genre_id = ng.genre_id where ng.novel_id = n.novel_id)`;

export type NovelStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED';

export type NovelRecord = {
  novelId: string;
  authorId: string;
  title: string;
  slug: string;
  synopsis: string;
  authorNote: string | null;
  genres: string[];
  coverImageUrl: string | null;
  status: NovelStatus;
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  likesCount: number;
  viewsCount: number;
  chaptersCount: number;
  genreId: string | null;
  genre: string | null;
  latestChapter?: {
    chapterId: string;
    chapterNumber: number;
    title: string;
    status: string;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

function mapNovel(row: QueryResultRow): NovelRecord {
  return {
    novelId: row.novel_id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    synopsis: row.synopsis,
    authorNote: row.author_note ?? null,
    genres: row.genres?.length ? row.genres : row.genre ? [row.genre] : [],
    coverImageUrl: row.cover_image_url,
    status: row.status,
    serialStatus: row.serial_status,
    ageRating: row.age_rating,
    likesCount: row.likes_count,
    viewsCount: row.views_count,
    chaptersCount: row.chapters_count,
    genreId: row.genre_id ?? null,
    genre: row.genre ?? null,
    ...(row.latest_chapter !== undefined ? { latestChapter: row.latest_chapter } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listGenres() {
  const result = await getPostgresPool().query('select name from genres order by name asc');
  return result.rows.map((row) => row.name as string);
}

export async function getNovelUnlockEarnings(novelId: string) {
  const result = await getPostgresPool().query(
    `select coalesce(sum(tx.amount_coins), 0)::bigint as total
     from transactions tx
     join chapters c on c.chapter_id = tx.reference_id
     join novels n on n.novel_id = c.novel_id
     join wallets w on w.user_id = n.author_id and w.wallet_id = tx.counterparty_wallet_id
     where c.novel_id = $1 and tx.type = 'UNLOCK' and tx.status = 'SUCCESS'
       and tx.reference_type = 'CHAPTER' and tx.wallet_id <> w.wallet_id`,
    [novelId]
  );
  return Number(result.rows[0]?.total ?? 0);
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
      insert into novels (author_id, title, slug, synopsis, cover_image_url, genre_id, author_note)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning *
    `,
    [input.authorId, input.title, input.slug, input.synopsis, input.coverImageUrl ?? null, input.genreId, input.authorNote ?? null]
  );

  const names = input.genres ?? (input.genre ? [input.genre] : []);
  const metadata = await writeNovelGenres(client, result.rows[0].novel_id, names);
  return { ...mapNovel(result.rows[0]), genre: metadata.genres[0] ?? null, genres: metadata.genres };
}

export async function findNovelById(novelId: string, client?: PoolClient) {
  const result = await (client ?? getPostgresPool()).query(
    `
      select n.*, g.name as genre, ${genresProjection} as genres
      from novels n
      left join genres g on g.genre_id = n.genre_id
      where n.novel_id = $1 and n.deleted_at is null
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
      select n.*, g.name as genre, ${genresProjection} as genres
      from novels n
      left join genres g on g.genre_id = n.genre_id
      where n.deleted_at is null
        and n.status = $1
        and ($2::text is null or n.title ilike $2 or n.synopsis ilike $2)
      order by n.updated_at desc
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
      select n.*, g.name as genre, ${genresProjection} as genres, recent.latest_chapter
      from novels n
      left join genres g on g.genre_id = n.genre_id
      left join lateral (
        select json_build_object(
          'chapterId', c.chapter_id, 'chapterNumber', c.chapter_number,
          'title', c.title, 'status', c.status, 'updatedAt', c.updated_at
        ) as latest_chapter
        from chapters c
        where c.novel_id = n.novel_id and c.deleted_at is null
        order by c.updated_at desc, c.chapter_id desc
        limit 1
      ) recent on true
      where n.deleted_at is null
        and n.author_id = $1
        and ($2::novel_status is null or n.status = $2)
        and ($3::text is null or n.title ilike $3 or n.synopsis ilike $3)
      order by n.updated_at desc
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
  return withPostgresTransaction(async (client) => {
    const existing = await client.query('select novel_id from novels where novel_id = $1 and deleted_at is null for update', [novelId]);
    if (!existing.rows[0]) return null;
    const changingGenres = input.genres !== undefined || input.genre !== undefined;
    const names = input.genres ?? (input.genre ? [input.genre] : []);
    const metadata = changingGenres ? await writeNovelGenres(client, novelId, names) : null;
    const result = await client.query(
      `
        update novels
        set title = coalesce($2, title), synopsis = coalesce($3, synopsis),
            cover_image_url = case when $5 then $4 else cover_image_url end,
            genre_id = case when $7 then $6::uuid else genre_id end,
            author_note = case when $9 then $8 else author_note end,
            updated_at = now()
        where novel_id = $1 and deleted_at is null
        returning novel_id
      `,
      [novelId, input.title, input.synopsis, input.coverImageUrl ?? null,
        input.coverImageUrl !== undefined, metadata?.genreId ?? null, changingGenres,
        input.authorNote?.trim() || null, input.authorNote !== undefined]
    );
    if (!result.rows[0]) return null;
    const updated = await client.query(`select n.*, g.name as genre, ${genresProjection} as genres
      from novels n left join genres g on g.genre_id = n.genre_id where n.novel_id = $1`, [novelId]);
    return mapNovel(updated.rows[0]);
  });
}

async function writeNovelGenres(client: DbClient, novelId: string, values: string[]) {
  const names = [...new Map(values.map(name => [slugify(name.trim()), name.trim()])).values()];
  const genreIds: string[] = [];
  for (const name of names) {
    const id = await upsertGenre(client, name);
    if (id && !genreIds.includes(id)) genreIds.push(id);
  }
  await client.query('delete from novel_genres where novel_id = $1', [novelId]);
  if (genreIds.length) {
    await client.query('insert into novel_genres (novel_id, genre_id) select $1, unnest($2::uuid[]) on conflict do nothing', [novelId, genreIds]);
  }
  return { genreId: genreIds[0] ?? null, genres: names };
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
  const name = genreName?.trim();
  if (!name) {
    return null;
  }

  const slug = slugify(name);
  // Seeded/admin genres may have a slug different from the name's current slug.
  // Reuse their identity without renaming taxonomy as a side effect of authoring.
  const findExisting = () => client.query(
    'select genre_id from genres where name = $1 or slug = $2 order by (name = $1) desc limit 1',
    [name, slug]
  );
  const existing = await findExisting();
  if (existing.rows[0]) return existing.rows[0].genre_id as string;
  const result = await client.query(
    `
      insert into genres (name, slug)
      values ($1, $2)
      on conflict do nothing
      returning genre_id
    `,
    [name, slug]
  );

  // A concurrent request can insert either the name or slug while we wait.
  // Read again in a fresh statement snapshot after ON CONFLICT has completed.
  const row = result.rows[0] ?? (await findExisting()).rows[0];
  if (!row) throw new Error('Không tìm thấy thể loại vừa tạo. Vui lòng thử lại.');
  return row.genre_id as string;
}
