import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';

type DbClient = Pick<PoolClient, 'query'>;

export type ChapterStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';

export type ChapterRecord = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  content: string | null;
  wordCount: number;
  isVip: boolean;
  priceCoins: number;
  status: ChapterStatus;
};

function mapChapter(row: QueryResultRow): ChapterRecord {
  return {
    chapterId: row.chapter_id,
    novelId: row.novel_id,
    title: row.title,
    chapterNumber: row.chapter_number,
    content: row.content,
    wordCount: row.word_count,
    isVip: row.is_vip,
    priceCoins: row.price_coins,
    status: row.status
  };
}

export async function getNextChapterNumber(client: DbClient, novelId: string) {
  const result = await client.query(
    'select coalesce(max(chapter_number), 0) + 1 as next_number from chapters where novel_id = $1 and deleted_at is null',
    [novelId]
  );

  return Number(result.rows[0].next_number);
}

export async function createChapter(
  client: DbClient,
  input: {
    novelId: string;
    title: string;
    chapterNumber: number;
    wordCount: number;
    isVip: boolean;
    priceCoins: number;
  }
) {
  const result = await client.query(
    `
      insert into chapters (novel_id, title, chapter_number, word_count, is_vip, price_coins)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [input.novelId, input.title, input.chapterNumber, input.wordCount, input.isVip, input.priceCoins]
  );

  await client.query(
    'update novels set chapters_count = chapters_count + 1, updated_at = now() where novel_id = $1',
    [input.novelId]
  );

  return mapChapter(result.rows[0]);
}

export async function findChapterById(chapterId: string) {
  const result = await getPostgresPool().query(
    'select * from chapters where chapter_id = $1 and deleted_at is null limit 1',
    [chapterId]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}

export async function listChaptersByNovelId(novelId: string) {
  const result = await getPostgresPool().query(
    'select * from chapters where novel_id = $1 and deleted_at is null order by chapter_number asc',
    [novelId]
  );

  return result.rows.map(mapChapter);
}

export async function updateChapterMetadata(
  chapterId: string,
  input: {
    title?: string;
    wordCount?: number;
    isVip?: boolean;
    priceCoins?: number;
  }
) {
  const result = await getPostgresPool().query(
    `
      update chapters
      set
        title = coalesce($2, title),
        word_count = coalesce($3, word_count),
        is_vip = coalesce($4, is_vip),
        price_coins = coalesce($5, price_coins),
        updated_at = now()
      where chapter_id = $1 and deleted_at is null and status in ('DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED')
      returning *
    `,
    [chapterId, input.title, input.wordCount, input.isVip, input.priceCoins]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}

export async function updateChapterPricing(
  chapterId: string,
  input: {
    isVip: boolean;
    priceCoins: number;
  }
) {
  const result = await getPostgresPool().query(
    `
      update chapters
      set
        is_vip = $2,
        price_coins = $3,
        updated_at = now()
      where chapter_id = $1 and deleted_at is null and status = 'PUBLISHED'
      returning *
    `,
    [chapterId, input.isVip, input.priceCoins]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}

export async function submitChapterForPublish(chapterId: string) {
  const result = await getPostgresPool().query(
    `
      update chapters
      set status = 'PENDING_MODERATION', updated_at = now()
      where chapter_id = $1 and deleted_at is null and status in ('DRAFT', 'REJECTED', 'PUBLISHED')
      returning *
    `,
    [chapterId]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}

export async function publishChapter(
  chapterId: string,
  input: {
    title: string;
    content: string;
    wordCount: number;
  }
) {
  const result = await getPostgresPool().query(
    `
      update chapters
      set
        title = $2,
        content = $3,
        word_count = $4,
        status = 'PUBLISHED',
        published_at = coalesce(published_at, now()),
        updated_at = now()
      where chapter_id = $1 and deleted_at is null and status in ('DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED')
      returning *
    `,
    [chapterId, input.title, input.content, input.wordCount]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}

export async function rejectChapterPublication(chapterId: string) {
  const result = await getPostgresPool().query(
    `
      update chapters
      set status = 'REJECTED', updated_at = now()
      where chapter_id = $1 and deleted_at is null and status = 'PENDING_MODERATION'
      returning *
    `,
    [chapterId]
  );

  return result.rows[0] ? mapChapter(result.rows[0]) : null;
}
