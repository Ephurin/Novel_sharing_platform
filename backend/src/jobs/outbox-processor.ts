import { env } from '../core/config/env.js';
import { getPostgresPool } from '../core/database/postgres.js';
import {
  claimPendingOutboxEvents,
  fetchPendingOutboxEvents,
  markOutboxEventCompleted,
  markOutboxEventFailed,
  type RevisionOutboxEvent
} from '../modules/novels/outbox.repository.js';
import { syncDraftFromRevisionConditional } from '../modules/novels/draft-chapters.repository.js';

let isProcessing = false;
let outboxTimer: NodeJS.Timeout | null = null;

export interface OutboxDependencies {
  claimEvents?: (limit: number) => Promise<RevisionOutboxEvent[]>;
  handleEvent?: (event: RevisionOutboxEvent) => Promise<void>;
  markCompleted?: (eventId: string, claimToken: string) => Promise<boolean>;
  markFailed?: (eventId: string, error: string, backoffSeconds: number, claimToken: string) => Promise<boolean>;
}

export async function processOutboxOnce(
  limit: number = 10,
  deps?: OutboxDependencies
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (isProcessing) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    let events: RevisionOutboxEvent[] = [];
    if (deps?.claimEvents) {
      events = await deps.claimEvents(limit);
    } else {
      const pool = getPostgresPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        events = await claimPendingOutboxEvents(client, limit);
        await client.query('COMMIT');
      } catch (claimErr) {
        await client.query('ROLLBACK');
        throw claimErr;
      } finally {
        client.release();
      }
    }

    const handler = deps?.handleEvent ?? handleOutboxEvent;
    const markCompletedFn = deps?.markCompleted ?? ((id, token) => markOutboxEventCompleted(undefined, id, token));
    const markFailedFn = deps?.markFailed ?? ((id, err, backoff, token) => markOutboxEventFailed(undefined, id, err, backoff, token));

    for (const event of events) {
      processed++;
      if (!event.claimToken) {
        console.error(`[OutboxProcessor] Event ${event.eventId} missing active claim token. Skipping.`);
        continue;
      }
      try {
        await handler(event);
        await markCompletedFn(event.eventId, event.claimToken);
        succeeded++;
      } catch (err: any) {
        failed++;
        const backoffSeconds = Math.min(300, Math.pow(2, event.retryCount + 1) * 5);
        await markFailedFn(event.eventId, err?.message || String(err), backoffSeconds, event.claimToken);
        console.warn(
          `[OutboxProcessor] Event ${event.eventId} (${event.eventType}) failed (attempt ${event.retryCount + 1}):`,
          err?.message || err
        );
      }
    }
  } catch (err: any) {
    console.error('[OutboxProcessor] Error fetching outbox events:', err?.message || err);
  } finally {
    isProcessing = false;
  }

  return { processed, succeeded, failed };
}

export async function handleOutboxEvent(event: RevisionOutboxEvent): Promise<void> {
  if (event.eventType === 'INCREMENTAL_ANALYSIS') {
    const analysisUrl = `${env.AI_SERVICE_URL}/v1/revisions/${event.revisionId}/analyses`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
      'X-Actor-Id': event.createdBy || '00000000-0000-0000-0000-000000000001',
      'X-Request-Id': crypto.randomUUID(),
      'Idempotency-Key': `analysis-${event.revisionId}`
    };
    if (env.PLATFORM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${env.PLATFORM_SERVICE_TOKEN}`;
      headers['X-Service-Token'] = env.PLATFORM_SERVICE_TOKEN;
    }

    const body = {
      novel_id: event.novelId,
      chapter_id: event.chapterId,
      revision_id: event.revisionId,
      content_hash: event.contentHash,
      operation: 'incremental_story_analysis'
    };

    const res = await fetch(analysisUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI service returned HTTP ${res.status}: ${errText}`);
    }

    // Extraction delivery is complete; proposals remain pending for authorized review.
    // Generic workers have no canon-approval authority in either P1 or P3.
    // The controller owns its separate, revision-scoped decisions and mode fences.
  } else if (event.eventType === 'MONGO_DRAFT_SYNC') {
    const payload = event.payload || {};
    const result = await syncDraftFromRevisionConditional({
      chapterId: event.chapterId,
      revisionId: event.revisionId,
      novelId: payload.novelId || event.novelId,
      authorId: payload.authorId || event.createdBy || '',
      title: payload.title,
      content: payload.content || '',
      wordCount: payload.wordCount || 0,
      acceptTimestamp: new Date(payload.acceptTimestamp || event.createdAt)
    });

    if (result.status === 'skipped_newer_draft') {
      console.log(
        `[OutboxProcessor] MONGO_DRAFT_SYNC for chapter ${event.chapterId} skipped: author has newer draft in progress.`
      );
    }
  } else {
    console.warn(`[OutboxProcessor] Unhandled event type: ${event.eventType}`);
  }
}


export function triggerImmediateProcessing(): void {
  setTimeout(() => {
    processOutboxOnce().catch((err) => {
      console.error('[OutboxProcessor] Immediate process failed:', err);
    });
  }, 10);
}

export function startOutboxProcessor(intervalMs: number = 5000): void {
  if (outboxTimer) return;
  outboxTimer = setInterval(() => {
    processOutboxOnce().catch((err) => {
      console.error('[OutboxProcessor] Periodic process failed:', err);
    });
  }, intervalMs);
}

export function stopOutboxProcessor(): void {
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
}
