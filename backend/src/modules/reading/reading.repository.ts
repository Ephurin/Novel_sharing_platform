import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type {
  HistoryListInput,
  ReadingPreferencesInput,
  SearchNovelsInput,
  SyncReadingHistoryInput
} from './reading.schemas.js';

function mapPreference(row: QueryResultRow) {
  return {
    fontFamily: row.font_family,
    fontSize: row.font_size,
    background: row.background,
    lineHeight: Number(row.line_height)
  };
}

function mapNovelSummary(row: QueryResultRow) {
  return {
    novelId: row.novel_id,
    title: row.title,
    authorId: row.author_id,
    authorName: row.author_name,
    synopsis: row.synopsis,
    coverImageUrl: row.cover_image_url,
    genre: row.genre_name,
    tags: row.tags ?? [],
    status: row.serial_status,
    likesCount: row.likes_count,
    viewsCount: row.views_count,
    chaptersCount: row.chapters_count,
    updatedAt: row.updated_at
  };
}

function mapChapterSummary(row: QueryResultRow) {
  return {
    chapterId: row.chapter_id,
    novelId: row.novel_id,
    title: row.title,
    chapterNumber: row.chapter_number,
    wordCount: row.word_count,
    isVip: row.is_vip,
    priceCoins: row.price_coins,
    publishedAt: row.published_at
  };
}

function mapHistory(row: QueryResultRow) {
  return {
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    paragraphIndex: row.paragraph_index,
    pageOffset: row.page_offset === null ? null : Number(row.page_offset),
    readAt: row.read_at,
    novel: {
      title: row.novel_title,
      coverImageUrl: row.cover_image_url
    },
    chapter: {
      title: row.chapter_title,
      chapterNumber: row.chapter_number
    }
  };
}

export async function findOrCreateReadingPreference(userId: string) {
  const result = await getPostgresPool().query(
    `
      insert into reading_preferences (user_id)
      values ($1)
      on conflict (user_id) do update set user_id = excluded.user_id
      returning *
    `,
    [userId]
  );

  return mapPreference(result.rows[0]);
}

export async function updateReadingPreference(userId: string, input: ReadingPreferencesInput) {
  const result = await getPostgresPool().query(
    `
      insert into reading_preferences (user_id, font_family, font_size, background, line_height)
      values ($1, $2, $3, $4, $5)
      on conflict (user_id) do update
      set font_family = excluded.font_family,
          font_size = excluded.font_size,
          background = excluded.background,
          line_height = excluded.line_height,
          updated_at = now()
      returning *
    `,
    [userId, input.fontFamily ?? null, input.fontSize, input.background, input.lineHeight]
  );

  return mapPreference(result.rows[0]);
}

export async function searchPublishedNovels(input: SearchNovelsInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;
  const genre = input.genre ? input.genre.toLowerCase() : null;
  const tag = input.tag ? input.tag.toLowerCase() : null;
  const orderDirection = input.order === 'asc' ? 'asc' : 'desc';
  const sortExpression =
    input.sort === 'views'
      ? 'n.views_count'
      : input.sort === 'likes'
        ? 'n.likes_count'
        : 'n.updated_at';

  const dataResult = await getPostgresPool().query(
    `
      select
        n.*,
        coalesce(up.display_name, u.username) as author_name,
        g.name as genre_name,
        coalesce(
          json_agg(t.name order by t.name) filter (where t.tag_id is not null),
          '[]'::json
        ) as tags
      from novels n
      join users u on u.user_id = n.author_id
      left join user_profiles up on up.user_id = u.user_id
      left join genres g on g.genre_id = n.genre_id
      left join novel_tags nt on nt.novel_id = n.novel_id
      left join tags t on t.tag_id = nt.tag_id
      where n.deleted_at is null
        and n.status = 'PUBLISHED'
        and ($1::text is null or n.title ilike $1 or n.synopsis ilike $1)
        and ($2::text is null or lower(g.slug) = $2 or lower(g.name) = $2)
        and ($3::text is null or lower(t.slug) = $3 or lower(t.name) = $3)
        and ($4::novel_serial_status is null or n.serial_status = $4)
      group by n.novel_id, up.display_name, u.username, g.name
      order by ${sortExpression} ${orderDirection}, n.novel_id asc
      limit $5 offset $6
    `,
    [search, genre, tag, input.status ?? null, input.limit, offset]
  );

  const countResult = await getPostgresPool().query(
    `
      select count(distinct n.novel_id)::int as total
      from novels n
      left join genres g on g.genre_id = n.genre_id
      left join novel_tags nt on nt.novel_id = n.novel_id
      left join tags t on t.tag_id = nt.tag_id
      where n.deleted_at is null
        and n.status = 'PUBLISHED'
        and ($1::text is null or n.title ilike $1 or n.synopsis ilike $1)
        and ($2::text is null or lower(g.slug) = $2 or lower(g.name) = $2)
        and ($3::text is null or lower(t.slug) = $3 or lower(t.name) = $3)
        and ($4::novel_serial_status is null or n.serial_status = $4)
    `,
    [search, genre, tag, input.status ?? null]
  );

  return {
    items: dataResult.rows.map(mapNovelSummary),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function findPublishedNovelDetail(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select
        n.*,
        coalesce(up.display_name, u.username) as author_name,
        g.name as genre_name,
        coalesce(
          json_agg(distinct t.name) filter (where t.tag_id is not null),
          '[]'::json
        ) as tags
      from novels n
      join users u on u.user_id = n.author_id
      left join user_profiles up on up.user_id = u.user_id
      left join genres g on g.genre_id = n.genre_id
      left join novel_tags nt on nt.novel_id = n.novel_id
      left join tags t on t.tag_id = nt.tag_id
      where n.novel_id = $1
        and n.deleted_at is null
        and n.status = 'PUBLISHED'
      group by n.novel_id, up.display_name, u.username, g.name
      limit 1
    `,
    [novelId]
  );

  return result.rows[0] ? mapNovelSummary(result.rows[0]) : null;
}

export async function listPublishedChaptersForNovel(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select *
      from chapters
      where novel_id = $1
        and deleted_at is null
        and status = 'PUBLISHED'
      order by chapter_number asc
    `,
    [novelId]
  );

  return result.rows.map(mapChapterSummary);
}

export async function findReadableChapter(chapterId: string) {
  const result = await getPostgresPool().query(
    `
      select c.*, n.status as novel_status
      from chapters c
      join novels n on n.novel_id = c.novel_id
      where c.chapter_id = $1
        and c.deleted_at is null
        and c.status = 'PUBLISHED'
        and n.deleted_at is null
        and n.status = 'PUBLISHED'
      limit 1
    `,
    [chapterId]
  );

  return result.rows[0]
    ? {
        ...mapChapterSummary(result.rows[0]),
        content: result.rows[0].content
      }
    : null;
}

export async function incrementNovelViews(novelId: string) {
  await getPostgresPool().query(
    'update novels set views_count = views_count + 1, updated_at = now() where novel_id = $1',
    [novelId]
  );
}

export async function upsertReadingHistory(userId: string, input: SyncReadingHistoryInput) {
  await getPostgresPool().query(
    `
      insert into reading_histories (user_id, novel_id, chapter_id, paragraph_index, page_offset, read_at, updated_at)
      values ($1, $2, $3, $4, $5, now(), now())
      on conflict (user_id, novel_id) do update
      set chapter_id = excluded.chapter_id,
          paragraph_index = excluded.paragraph_index,
          page_offset = excluded.page_offset,
          read_at = now(),
          updated_at = now()
    `,
    [userId, input.novelId, input.chapterId, input.paragraphIndex, input.pageOffset ?? null]
  );
}

export async function listReadingHistories(userId: string, input: HistoryListInput) {
  const offset = (input.page - 1) * input.limit;
  const dataResult = await getPostgresPool().query(
    `
      select rh.*, n.title as novel_title, n.cover_image_url, c.title as chapter_title, c.chapter_number
      from reading_histories rh
      join novels n on n.novel_id = rh.novel_id
      join chapters c on c.chapter_id = rh.chapter_id
      where rh.user_id = $1
      order by rh.updated_at desc
      limit $2 offset $3
    `,
    [userId, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    'select count(*)::int as total from reading_histories where user_id = $1',
    [userId]
  );

  return {
    items: dataResult.rows.map(mapHistory),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function findReadingHistory(userId: string, novelId: string) {
  const result = await getPostgresPool().query(
    `
      select rh.*, n.title as novel_title, n.cover_image_url, c.title as chapter_title, c.chapter_number
      from reading_histories rh
      join novels n on n.novel_id = rh.novel_id
      join chapters c on c.chapter_id = rh.chapter_id
      where rh.user_id = $1 and rh.novel_id = $2
      limit 1
    `,
    [userId, novelId]
  );

  return result.rows[0] ? mapHistory(result.rows[0]) : null;
}

export async function addBookmark(userId: string, novelId: string) {
  const result = await getPostgresPool().query(
    `
      insert into bookmarks (user_id, novel_id)
      values ($1, $2)
      on conflict do nothing
      returning *
    `,
    [userId, novelId]
  );

  return result.rowCount === 1;
}

export async function removeBookmark(userId: string, novelId: string) {
  const result = await getPostgresPool().query(
    'delete from bookmarks where user_id = $1 and novel_id = $2',
    [userId, novelId]
  );

  return result.rowCount === 1;
}

export async function listBookmarks(userId: string, input: HistoryListInput) {
  const offset = (input.page - 1) * input.limit;
  const dataResult = await getPostgresPool().query(
    `
      select
        n.*,
        coalesce(up.display_name, u.username) as author_name,
        g.name as genre_name,
        coalesce(
          json_agg(t.name order by t.name) filter (where t.tag_id is not null),
          '[]'::json
        ) as tags,
        b.created_at as bookmarked_at
      from bookmarks b
      join novels n on n.novel_id = b.novel_id
      join users u on u.user_id = n.author_id
      left join user_profiles up on up.user_id = u.user_id
      left join genres g on g.genre_id = n.genre_id
      left join novel_tags nt on nt.novel_id = n.novel_id
      left join tags t on t.tag_id = nt.tag_id
      where b.user_id = $1
        and n.deleted_at is null
        and n.status = 'PUBLISHED'
      group by n.novel_id, up.display_name, u.username, g.name, b.created_at
      order by b.created_at desc
      limit $2 offset $3
    `,
    [userId, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from bookmarks b
      join novels n on n.novel_id = b.novel_id
      where b.user_id = $1
        and n.deleted_at is null
        and n.status = 'PUBLISHED'
    `,
    [userId]
  );

  return {
    items: dataResult.rows.map((row) => ({
      ...mapNovelSummary(row),
      bookmarkedAt: row.bookmarked_at
    })),
    totalItems: countResult.rows[0]?.total ?? 0
  };
}
