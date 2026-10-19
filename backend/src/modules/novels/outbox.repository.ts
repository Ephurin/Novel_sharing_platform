import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';

type DbClient = Pick<PoolClient, 'query'>;

export type OutboxEventStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type RevisionOutboxEvent = {
  eventId: string;
  eventType: string;
  novelId: string;
  chapterId: string;
  revisionId: string;
  contentHash: string;
  createdBy: string | null;
  payload: Record<string, any>;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  lastError: string | null;
  claimToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapOutboxEvent(row: QueryResultRow): RevisionOutboxEvent {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    revisionId: row.revision_id,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    payload: row.payload,
    status: row.status,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    claimToken: row.claim_token ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function insertOutboxEvent(
  client: DbClient | undefined,
  input: {
    eventType: string;
    novelId: string;
    chapterId: string;
    revisionId: string;
    contentHash: string;
    createdBy?: string | null;
    payload?: Record<string, any>;
    maxRetries?: number;
  }
): Promise<RevisionOutboxEvent> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      insert into revision_outbox_events (
        event_type,
        novel_id,
        chapter_id,
        revision_id,
        content_hash,
        created_by,
        payload,
        status,
        max_retries
      ) values ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
      on conflict (revision_id, event_type) do update
        set updated_at = now()
      returning *
    `,
    [
      input.eventType,
      input.novelId,
      input.chapterId,
      input.revisionId,
      input.contentHash,
      input.createdBy ?? null,
      JSON.stringify(input.payload ?? {}),
      input.maxRetries ?? 5
    ]
  );

  return mapOutboxEvent(result.rows[0]);
}

export async function fetchPendingOutboxEvents(
  client?: DbClient,
  limit: number = 20,
  staleThresholdSeconds: number = 300
): Promise<RevisionOutboxEvent[]> {
  const executor = client ?? getPostgresPool();
  const lockClause = client ? 'for update skip locked' : '';
  const result = await executor.query(
    `
      select *
      from revision_outbox_events
      where (
        (status = 'PENDING' and next_retry_at <= now())
        or
        (status = 'PROCESSING' and updated_at <= now() - ($2 || ' seconds')::interval)
      )
      order by created_at asc
      limit $1
      ${lockClause}
    `,
    [limit, staleThresholdSeconds]
  );

  return result.rows.map(mapOutboxEvent);
}

export async function claimPendingOutboxEvents(
  client: DbClient,
  limit: number = 20,
  staleThresholdSeconds: number = 300
): Promise<RevisionOutboxEvent[]> {
  const result = await client.query(
    `
      with eligible as (
        select event_id
        from revision_outbox_events
        where (
          (status = 'PENDING' and next_retry_at <= now())
          or
          (status = 'PROCESSING' and updated_at <= now() - ($2 || ' seconds')::interval)
        )
        order by created_at asc
        limit $1
        for update skip locked
      )
      update revision_outbox_events o
      set status = 'PROCESSING',
          claim_token = gen_random_uuid(),
          updated_at = now()
      from eligible
      where o.event_id = eligible.event_id
      returning o.*
    `,
    [limit, staleThresholdSeconds]
  );

  return result.rows.map(mapOutboxEvent);
}


export async function markOutboxEventCompleted(
  client: DbClient | undefined,
  eventId: string,
  claimToken: string
): Promise<boolean> {
  if (!claimToken) {
    throw new Error(`markOutboxEventCompleted requires a valid claimToken for event ${eventId}`);
  }
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      update revision_outbox_events
      set status = 'COMPLETED',
          updated_at = now()
      where event_id = $1 and claim_token = $2 and status = 'PROCESSING'
    `,
    [eventId, claimToken]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markOutboxEventCompletedUnfenced(
  client: DbClient | undefined,
  eventId: string
): Promise<boolean> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      update revision_outbox_events
      set status = 'COMPLETED',
          updated_at = now()
      where event_id = $1
    `,
    [eventId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markOutboxEventFailed(
  client: DbClient | undefined,
  eventId: string,
  error: string,
  retryDelaySeconds: number,
  claimToken: string
): Promise<boolean> {
  if (!claimToken) {
    throw new Error(`markOutboxEventFailed requires a valid claimToken for event ${eventId}`);
  }
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      update revision_outbox_events
      set retry_count = retry_count + 1,
          status = case
            when retry_count + 1 >= max_retries then 'FAILED'
            else 'PENDING'
          end,
          last_error = $2,
          next_retry_at = now() + ($3 || ' seconds')::interval,
          updated_at = now()
      where event_id = $1 and claim_token = $4 and status = 'PROCESSING'
    `,
    [eventId, error, retryDelaySeconds, claimToken]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markOutboxEventFailedUnfenced(
  client: DbClient | undefined,
  eventId: string,
  error: string,
  retryDelaySeconds: number = 10
): Promise<boolean> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      update revision_outbox_events
      set retry_count = retry_count + 1,
          status = case
            when retry_count + 1 >= max_retries then 'FAILED'
            else 'PENDING'
          end,
          last_error = $2,
          next_retry_at = now() + ($3 || ' seconds')::interval,
          updated_at = now()
      where event_id = $1
    `,
    [eventId, error, retryDelaySeconds]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findOutboxEventByRevisionAndType(
  client: DbClient | undefined,
  revisionId: string,
  eventType: string
): Promise<RevisionOutboxEvent | null> {
  const executor = client ?? getPostgresPool();
  const result = await executor.query(
    `
      select *
      from revision_outbox_events
      where revision_id = $1 and event_type = $2
      limit 1
    `,
    [revisionId, eventType]
  );

  return result.rows[0] ? mapOutboxEvent(result.rows[0]) : null;
}

export async function listLatestChapterAnalysis(novelId: string) {
  const result = await getPostgresPool().query(
    `select c.chapter_id, c.chapter_number, r.revision_id, o.status, o.retry_count
     from chapters c
     join chapter_revisions r on r.revision_id = c.latest_revision_id
     left join revision_outbox_events o on o.revision_id = r.revision_id and o.event_type = 'INCREMENTAL_ANALYSIS'
     where c.novel_id = $1 order by c.chapter_number`, [novelId]);
  return result.rows as { chapter_id: string; chapter_number: number; revision_id: string; status: string | null; retry_count: number }[];
}
