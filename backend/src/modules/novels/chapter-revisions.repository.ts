import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';

type DbClient = Pick<PoolClient, 'query'>;

export type RevisionSourceType = 'AUTHOR_MANUAL' | 'AI_DRAFT_ACCEPT' | 'BOOTSTRAP';

export type ChapterRevisionRecord = {
  revisionId: string;
  novelId: string;
  chapterId: string;
  parentRevisionId: string | null;
  contentHash: string;
  content: string;
  wordCount: number;
  sourceType: RevisionSourceType;
  sourceGenerationId: string | null;
  createdBy: string | null;
  createdAt: Date;
};

function mapRevision(row: QueryResultRow): ChapterRevisionRecord {
  return {
    revisionId: row.revision_id,
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    parentRevisionId: row.parent_revision_id,
    contentHash: row.content_hash,
    content: row.content,
    wordCount: row.word_count,
    sourceType: row.source_type,
    sourceGenerationId: row.source_generation_id,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function insertRevision(
  client: DbClient,
  input: {
    novelId: string;
    chapterId: string;
    parentRevisionId?: string | null;
    contentHash: string;
    content: string;
    wordCount: number;
    sourceType: RevisionSourceType;
    sourceGenerationId?: string | null;
    createdBy?: string | null;
  }
): Promise<ChapterRevisionRecord> {
  const result = await client.query(
    `
      insert into chapter_revisions (
        novel_id,
        chapter_id,
        parent_revision_id,
        content_hash,
        content,
        word_count,
        source_type,
        source_generation_id,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning *
    `,
    [
      input.novelId,
      input.chapterId,
      input.parentRevisionId ?? null,
      input.contentHash,
      input.content,
      input.wordCount,
      input.sourceType,
      input.sourceGenerationId ?? null,
      input.createdBy ?? null
    ]
  );

  return mapRevision(result.rows[0]);
}

export async function findRevisionById(
  client: DbClient | undefined,
  revisionId: string
): Promise<ChapterRevisionRecord | null> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    'select * from chapter_revisions where revision_id = $1',
    [revisionId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapRevision(result.rows[0]);
}

export async function findLatestRevisionByChapterId(
  client: DbClient | undefined,
  chapterId: string
): Promise<ChapterRevisionRecord | null> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    'select * from chapter_revisions where chapter_id = $1 order by created_at desc limit 1',
    [chapterId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapRevision(result.rows[0]);
}

export async function listRevisionsByChapterId(
  client: DbClient | undefined,
  chapterId: string,
  limit: number = 50
): Promise<ChapterRevisionRecord[]> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    'select * from chapter_revisions where chapter_id = $1 order by created_at desc limit $2',
    [chapterId, limit]
  );

  return result.rows.map(mapRevision);
}

export async function lockChapterForUpdate(
  client: DbClient,
  chapterId: string
): Promise<QueryResultRow | null> {
  const result = await client.query(
    'select * from chapters where chapter_id = $1 for update',
    [chapterId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

export async function updateChapterLatestRevision(
  client: DbClient,
  chapterId: string,
  revisionId: string,
  wordCount: number
): Promise<void> {
  await client.query(
    `
      update chapters
      set latest_revision_id = $1,
          word_count = case when status = 'PUBLISHED' then word_count else $2 end,
          updated_at = now()
      where chapter_id = $3
    `,
    [revisionId, wordCount, chapterId]
  );
}

export async function findRevisionBySourceGenerationId(
  client: DbClient | undefined,
  chapterId: string,
  sourceGenerationId: string
): Promise<ChapterRevisionRecord | null> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    'select * from chapter_revisions where chapter_id = $1 and source_generation_id = $2 limit 1',
    [chapterId, sourceGenerationId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapRevision(result.rows[0]);
}

