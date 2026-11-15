import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { readerFollowingSql } from './reader-following.sql.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import type {
  HistoryListInput,
  ReadingPreferencesInput,
  SearchNovelsInput,
  SyncReadingHistoryInput,
  ReadingBookmarkInput
} from './reading.schemas.js';

function mapPreference(row: QueryResultRow) {
  return {
    fontFamily: row.font_family,
    fontSize: row.font_size,
    background: row.background,
    lineHeight: Number(row.line_height),
    margin: row.margin_size ?? 24,
    textAlign: row.text_align ?? 'LEFT'
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
    latestChapter: row.latest_chapter ?? null,
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
    readChapterIds: (row.read_chapter_ids ?? []) as string[],
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
      insert into reading_preferences (user_id, font_family, font_size, background, line_height, margin_size, text_align)
      values ($1, $2, $3, $4, $5, coalesce($6, 24), coalesce($7, 'LEFT'))
      on conflict (user_id) do update
      set font_family = excluded.font_family,
          font_size = excluded.font_size,
          background = excluded.background,
          line_height = excluded.line_height,
          margin_size = coalesce($6, reading_preferences.margin_size),
          text_align = coalesce($7, reading_preferences.text_align),
          updated_at = now()
      returning *
    `,
    [userId, input.fontFamily ?? null, input.fontSize, input.background, input.lineHeight, input.margin ?? null, input.textAlign ?? null]
  );

  return mapPreference(result.rows[0]);
}

export async function findReadingBookmark(userId: string, novelId: string) {
  const result = await getPostgresPool().query(`
    select b.* from reading_position_bookmarks b
    join novels n on n.novel_id = b.novel_id
    join chapters c on c.chapter_id = b.chapter_id and c.novel_id = b.novel_id
    where b.user_id = $1 and b.novel_id = $2
      and n.status = 'PUBLISHED' and n.deleted_at is null
      and c.status = 'PUBLISHED' and c.deleted_at is null
  `, [userId, novelId]);
  const row = result.rows[0];
  return row ? {
    novelId: row.novel_id as string,
    chapterId: row.chapter_id as string,
    paragraphIndex: Number(row.paragraph_index),
    pageOffset: Number(row.page_offset),
    updatedAt: row.updated_at as Date
  } : null;
}

export async function upsertReadingBookmark(userId: string, novelId: string, input: ReadingBookmarkInput) {
  await getPostgresPool().query(`
    insert into reading_position_bookmarks (user_id, novel_id, chapter_id, paragraph_index, page_offset)
    values ($1, $2, $3, $4, $5)
    on conflict (user_id, novel_id) do update set
      chapter_id = excluded.chapter_id,
      paragraph_index = excluded.paragraph_index,
      page_offset = excluded.page_offset,
      updated_at = now()
  `, [userId, novelId, input.chapterId, input.paragraphIndex, input.pageOffset]);
  return findReadingBookmark(userId, novelId);
}

export async function deleteReadingBookmark(userId: string, novelId: string) {
  const result = await getPostgresPool().query('delete from reading_position_bookmarks where user_id = $1 and novel_id = $2', [userId, novelId]);
  return { removed: Boolean(result.rowCount) };
}

export async function listReadingFilters() {
  const result = await getPostgresPool().query(`
    select
      coalesce((select json_agg(name order by name) from genres), '[]'::json) as genres,
      coalesce((select json_agg(name order by name) from tags), '[]'::json) as tags
  `);
  return result.rows[0] as { genres: string[]; tags: string[] };
}

export async function searchPublishedNovels(input: SearchNovelsInput) {
  const offset = (input.page - 1) * input.limit;
  const search = input.q ? `%${input.q}%` : null;
  const genres = [...new Set([input.genre, ...(input.genres ?? [])].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase()))];
  const tags = [...new Set([input.tag, ...(input.tags ?? [])].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase()))];
  const orderDirection = input.order === 'asc' ? 'asc' : 'desc';
  const sortExpression =
    input.sort === 'views'
      ? 'n.views_count'
      : input.sort === 'likes'
        ? 'n.likes_count'
        : input.sort === 'title'
          ? 'lower(n.title)'
          : input.sort === 'wordCount'
            ? `(select coalesce(sum(c.word_count), 0) from chapters c
                where c.novel_id = n.novel_id and c.status = 'PUBLISHED' and c.deleted_at is null)`
            : 'n.updated_at';

  const dataResult = await getPostgresPool().query(
    `
      select
        n.*,
        coalesce(up.display_name, u.username) as author_name,
        g.name as genre_name,
        (select json_build_object(
          'chapterId', c.chapter_id, 'chapterNumber', c.chapter_number,
          'title', c.title, 'publishedAt', c.published_at
        ) from chapters c
          where c.novel_id = n.novel_id and c.status = 'PUBLISHED' and c.deleted_at is null
          order by c.published_at desc nulls last, c.chapter_number desc
          limit 1) as latest_chapter,
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
        and not exists (select 1 from unnest($2::text[]) as selected(value) where not (coalesce(lower(g.slug) = selected.value or lower(g.name) = selected.value, false) or exists (
          select 1 from novel_genres ng join genres gg on gg.genre_id = ng.genre_id
          where ng.novel_id = n.novel_id and (lower(gg.slug) = selected.value or lower(gg.name) = selected.value))))
        and not exists (select 1 from unnest($3::text[]) as selected(value) where not exists (
          select 1 from novel_tags ntf join tags tf on tf.tag_id = ntf.tag_id
          where ntf.novel_id = n.novel_id and (lower(tf.slug) = selected.value or lower(tf.name) = selected.value)))
        and ($4::novel_serial_status is null or n.serial_status = $4)
      group by n.novel_id, up.display_name, u.username, g.name
      order by ${sortExpression} ${orderDirection}, n.novel_id asc
      limit $5 offset $6
    `,
    [search, genres, tags, input.status ?? null, input.limit, offset]
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
        and not exists (select 1 from unnest($2::text[]) as selected(value) where not (coalesce(lower(g.slug) = selected.value or lower(g.name) = selected.value, false) or exists (
          select 1 from novel_genres ng join genres gg on gg.genre_id = ng.genre_id
          where ng.novel_id = n.novel_id and (lower(gg.slug) = selected.value or lower(gg.name) = selected.value))))
        and not exists (select 1 from unnest($3::text[]) as selected(value) where not exists (
          select 1 from novel_tags ntf join tags tf on tf.tag_id = ntf.tag_id
          where ntf.novel_id = n.novel_id and (lower(tf.slug) = selected.value or lower(tf.name) = selected.value)))
        and ($4::novel_serial_status is null or n.serial_status = $4)
    `,
    [search, genres, tags, input.status ?? null]
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
        (select array_agg(gg.name order by (ng.genre_id = n.genre_id) desc, gg.name)
          from novel_genres ng join genres gg on gg.genre_id = ng.genre_id
          where ng.novel_id = n.novel_id) as genres,
        (select max(c.updated_at) from chapters c
          where c.novel_id = n.novel_id and c.status = 'PUBLISHED' and c.deleted_at is null) as last_updated_at,
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

  const row = result.rows[0];
  return row ? {
    ...mapNovelSummary(row),
    genres: row.genres?.length ? row.genres as string[] : row.genre_name ? [row.genre_name as string] : [],
    authorNote: (row.author_note as string | null) ?? null,
    lastUpdatedAt: row.last_updated_at ?? row.published_at ?? row.created_at
  } : null;
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
      select c.*, n.status as novel_status, n.author_id
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
        content: result.rows[0].content,
        authorId: result.rows[0].author_id as string
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
      select rh.*, n.title as novel_title, n.cover_image_url, c.title as chapter_title, c.chapter_number,
        array(select cr.chapter_id from chapter_reads cr
          where cr.user_id = rh.user_id and cr.novel_id = rh.novel_id and cr.verified_at is not null) as read_chapter_ids
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

  return result.rows[0] ? { ...mapHistory(result.rows[0]), readChapterIds: await listReadChapterIds(userId, novelId) } : null;
}

export async function recordChapterRead(userId: string, novelId: string, chapterId: string) {
  await getPostgresPool().query(
    `insert into chapter_reads (user_id, novel_id, chapter_id, verified_at) values ($1, $2, $3, now())
      on conflict (user_id, chapter_id) do update set verified_at = excluded.verified_at`,
    [userId, novelId, chapterId]
  );
}

export async function listReadChapterIds(userId: string, novelId: string): Promise<string[]> {
  const result = await getPostgresPool().query('select chapter_id from chapter_reads where user_id = $1 and novel_id = $2 and verified_at is not null order by chapter_id', [userId, novelId]);
  return result.rows.map(row => row.chapter_id as string);
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
  return withPostgresTransaction(async client => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [novelId, userId]);
    const follow = await client.query('delete from novel_follows where novel_id = $1 and user_id = $2', [novelId, userId]);
    const bookmark = await client.query('delete from bookmarks where novel_id = $1 and user_id = $2', [novelId, userId]);
    const like = await client.query('delete from likes where novel_id = $1 and user_id = $2 returning novel_id', [novelId, userId]);
    if (like.rowCount) await client.query('update novels set likes_count = greatest(likes_count - 1, 0) where novel_id = $1', [novelId]);
    return Boolean(follow.rowCount || bookmark.rowCount || like.rowCount);
  });
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
      from (${readerFollowingSql}) b
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
      order by b.created_at desc, n.novel_id asc
      limit $2 offset $3
    `,
    [userId, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from (${readerFollowingSql}) b
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
