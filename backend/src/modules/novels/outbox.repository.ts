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
  limit: number = 20
): Promise<RevisionOutboxEvent[]> {
  const executor = client ?? getPostgresPool();
  const lockClause = client ? 'for update skip locked' : '';
  const result = await executor.query(
    `
      select *
      from revision_outbox_events
      where status in ('PENDING', 'PROCESSING')
        and next_retry_at <= now()
      order by created_at asc
      limit $1
      ${lockClause}
    `,
    [limit]
  );

  return result.rows.map(mapOutboxEvent);
}

export async function claimPendingOutboxEvents(
  client: DbClient,
  limit: number = 20
): Promise<RevisionOutboxEvent[]> {
  const result = await client.query(
    `
      select *
      from revision_outbox_events
      where status in ('PENDING', 'PROCESSING')
        and next_retry_at <= now()
      order by created_at asc
      limit $1
      for update skip locked
    `,
    [limit]
  );

  const events = result.rows.map(mapOutboxEvent);
  if (events.length > 0) {
    const eventIds = events.map((e) => e.eventId);
    await client.query(
      `
        update revision_outbox_events
        set status = 'PROCESSING',
            updated_at = now()
        where event_id = any($1::uuid[])
      `,
      [eventIds]
    );
  }
  return events;
}


export async function markOutboxEventCompleted(
  client: DbClient | undefined,
  eventId: string
): Promise<void> {
  const executor = client ?? getPostgresPool();
  await executor.query(
    `
      update revision_outbox_events
      set status = 'COMPLETED',
          updated_at = now()
      where event_id = $1
    `,
    [eventId]
  );
}

export async function markOutboxEventFailed(
  client: DbClient | undefined,
  eventId: string,
  error: string,
  retryDelaySeconds: number = 10
): Promise<void> {
  const executor = client ?? getPostgresPool();
  await executor.query(
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
