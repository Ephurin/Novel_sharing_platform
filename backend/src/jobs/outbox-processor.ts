import { env } from '../core/config/env.js';
import { getPostgresPool } from '../core/database/postgres.js';
import {
  claimPendingOutboxEvents,
  fetchPendingOutboxEvents,
  markOutboxEventCompleted,
  markOutboxEventDeferred,
  markOutboxEventFailed,
  type RevisionOutboxEvent
} from '../modules/novels/outbox.repository.js';
import { syncDraftFromRevisionConditional } from '../modules/novels/draft-chapters.repository.js';
import { findLatestRevisionByChapterId } from '../modules/novels/chapter-revisions.repository.js';

let isProcessing = false;

// #149: free-tier quota denials from the AI gateway. Retrying inside the same 60 s window only
// burns the slots an author needs for interactive writing, so these wait at least one window.
const RATE_LIMIT_PATTERN = /RPM_LIMIT_EXCEEDED|TPM_LIMIT_EXCEEDED|CONCURRENCY_LIMIT_EXCEEDED|PROVIDER_QUOTA_EXHAUSTED|HTTP 429\b/;
export const RATE_LIMIT_MIN_BACKOFF_SECONDS = 60;

export function outboxRetryDelaySeconds(retryCount: number, errorMessage: string): number {
  const exponential = Math.min(300, Math.pow(2, retryCount + 1) * 5);
  return RATE_LIMIT_PATTERN.test(errorMessage) ? Math.max(RATE_LIMIT_MIN_BACKOFF_SECONDS, exponential) : exponential;
}
let outboxTimer: NodeJS.Timeout | null = null;

// Live retest 6 (T1, T2): during a 15-minute provider outage the analysis outbox spent about 36 calls
// on attempts that could not succeed, then marked the chapter FAILED for good. A provider outage is
// not the chapter's fault: analysis pauses for all chapters (one probe per pause), the event is
// rescheduled without spending a retry, and it only fails after PROVIDER_OUTAGE_MAX_AGE_HOURS.
const PROVIDER_OUTAGE_PATTERN = /PROVIDER_UNAVAILABLE|PROVIDER_TIMEOUT|HTTP 50[234]/;
export const PROVIDER_PAUSE_MIN_SECONDS = 300;
export const PROVIDER_PAUSE_MAX_SECONDS = 1800;
export const PROVIDER_OUTAGE_MAX_AGE_HOURS = 24;
export const PROVIDER_DEFER_REASON = 'provider unavailable; analysis resumes automatically';

export type ProviderBreaker = { pausedUntil: number; pauseSeconds: number };
const providerBreaker: ProviderBreaker = { pausedUntil: 0, pauseSeconds: 0 };
export function resetProviderBreaker(breaker: ProviderBreaker = providerBreaker) {
  breaker.pausedUntil = 0; breaker.pauseSeconds = 0;
}

export function isProviderOutage(errorMessage: string): boolean {
  return PROVIDER_OUTAGE_PATTERN.test(errorMessage);
}

/** Opens (or lengthens) the pause after an outage; returns the seconds to wait. */
export function tripProviderBreaker(now: number, breaker: ProviderBreaker = providerBreaker): number {
  breaker.pauseSeconds = breaker.pauseSeconds
    ? Math.min(PROVIDER_PAUSE_MAX_SECONDS, breaker.pauseSeconds * 2) : PROVIDER_PAUSE_MIN_SECONDS;
  breaker.pausedUntil = now + breaker.pauseSeconds * 1000;
  return breaker.pauseSeconds;
}

/** Seconds analysis must still wait, or 0 when it may call the AI service. */
export function providerPauseRemaining(now: number, breaker: ProviderBreaker = providerBreaker): number {
  return breaker.pausedUntil > now ? Math.ceil((breaker.pausedUntil - now) / 1000) : 0;
}

// What handling an event decided. `deferSeconds` reschedules it without spending a retry.
export type OutboxOutcome = void | { skipped: string } | { deferSeconds: number; reason: string };

export interface OutboxDependencies {
  claimEvents?: (limit: number) => Promise<RevisionOutboxEvent[]>;
  handleEvent?: (event: RevisionOutboxEvent) => Promise<OutboxOutcome>;
  markCompleted?: (eventId: string, claimToken: string) => Promise<boolean>;
  markFailed?: (eventId: string, error: string, backoffSeconds: number, claimToken: string) => Promise<boolean>;
  markDeferred?: (eventId: string, delaySeconds: number, reason: string, claimToken: string) => Promise<boolean>;
  /** Analyse the chapter head now even if it is still inside the quiet period (Full auto). */
  ignoreQuietPeriod?: boolean;
  analysisGate?: AnalysisGateDependencies;
  breaker?: ProviderBreaker;
  now?: () => number;
}

export interface AnalysisGateDependencies {
  latestRevision?: (chapterId: string) => Promise<{ revisionId: string; createdAt: Date } | null>;
  chapterActive?: (chapterId: string) => Promise<boolean>;
  quietSeconds?: number;
  now?: () => number;
}

// Incremental analysis reads the whole saved chapter, so analysing every save costs
// (saves x chapter length) per chapter. Only the chapter head is worth analysing (older
// checkpoints can no longer be reviewed), and only once the author has stopped changing it.
export async function incrementalAnalysisGate(event: RevisionOutboxEvent,
  deps: AnalysisGateDependencies = {}): Promise<OutboxOutcome | 'analyse'> {
  const latest = deps.latestRevision ?? (async (chapterId: string) => {
    const head = await findLatestRevisionByChapterId(undefined, chapterId);
    return head ? { revisionId: head.revisionId, createdAt: new Date(head.createdAt) } : null;
  });
  const head = await latest(event.chapterId);
  if (head && head.revisionId !== event.revisionId) return { skipped: 'superseded by a newer saved revision' };
  // BB3: do not analyse a chapter the author has archived or deleted since saving it.
  const active = deps.chapterActive ?? (async (chapterId: string) => {
    const row = (await getPostgresPool().query(
      "select 1 from chapters where chapter_id = $1 and deleted_at is null and status <> 'ARCHIVED'", [chapterId])).rowCount;
    return Boolean(row);
  });
  if (!(await active(event.chapterId))) return { skipped: 'chapter archived or deleted' };
  const quiet = deps.quietSeconds ?? env.ANALYSIS_QUIET_SECONDS;
  if (head && quiet > 0) {
    const ageSeconds = ((deps.now ?? Date.now)() - head.createdAt.getTime()) / 1000;
    if (ageSeconds < quiet) {
      return { deferSeconds: Math.max(5, Math.ceil(quiet - ageSeconds)), reason: 'waiting for the chapter to stop changing' };
    }
  }
  return 'analyse';
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

    const handler = deps?.handleEvent ??
      ((event: RevisionOutboxEvent) => handleOutboxEvent(event,
        { ...deps?.analysisGate, ...(deps?.ignoreQuietPeriod ? { quietSeconds: 0 } : {}) }));
    const markCompletedFn = deps?.markCompleted ?? ((id, token) => markOutboxEventCompleted(undefined, id, token));
    const markFailedFn = deps?.markFailed ?? ((id, err, backoff, token) => markOutboxEventFailed(undefined, id, err, backoff, token));
    const markDeferredFn = deps?.markDeferred ?? ((id, delay, reason, token) => markOutboxEventDeferred(undefined, id, delay, reason, token));

    const breaker = deps?.breaker ?? providerBreaker;
    const now = deps?.now ?? Date.now;
    for (const event of events) {
      processed++;
      if (!event.claimToken) {
        console.error(`[OutboxProcessor] Event ${event.eventId} missing active claim token. Skipping.`);
        continue;
      }
      const isAnalysis = event.eventType === 'INCREMENTAL_ANALYSIS';
      const paused = isAnalysis ? providerPauseRemaining(now(), breaker) : 0;
      if (paused > 0) {
        await markDeferredFn(event.eventId, paused, `deferred: ${PROVIDER_DEFER_REASON}`, event.claimToken);
        continue;
      }
      try {
        const outcome = await handler(event);
        if (isAnalysis && !(outcome && ('deferSeconds' in outcome || 'skipped' in outcome))) resetProviderBreaker(breaker);
        if (outcome && 'deferSeconds' in outcome) {
          await markDeferredFn(event.eventId, outcome.deferSeconds, `deferred: ${outcome.reason}`, event.claimToken);
          continue;
        }
        if (outcome && 'skipped' in outcome) {
          console.info(`[OutboxProcessor] Event ${event.eventId} (${event.eventType}) skipped: ${outcome.skipped}`);
        }
        await markCompletedFn(event.eventId, event.claimToken);
        succeeded++;
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        const ageHours = (now() - new Date(event.createdAt).getTime()) / 3_600_000;
        if (isAnalysis && isProviderOutage(errorMessage) && ageHours < PROVIDER_OUTAGE_MAX_AGE_HOURS) {
          const wait = tripProviderBreaker(now(), breaker);
          await markDeferredFn(event.eventId, wait, `deferred: ${PROVIDER_DEFER_REASON} (${errorMessage.slice(0, 120)})`,
            event.claimToken);
          console.warn(`[OutboxProcessor] AI provider unavailable; analysis paused for ${wait}s`);
          continue;
        }
        failed++;
        const backoffSeconds = outboxRetryDelaySeconds(event.retryCount, errorMessage);
        await markFailedFn(event.eventId, errorMessage, backoffSeconds, event.claimToken);
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

export async function handleOutboxEvent(event: RevisionOutboxEvent,
  gate: AnalysisGateDependencies = {}): Promise<OutboxOutcome> {
  if (event.eventType === 'INCREMENTAL_ANALYSIS') {
    const decision = await incrementalAnalysisGate(event, gate);
    if (decision !== 'analyse') return decision;
    const analysisUrl = `${env.AI_SERVICE_URL}/v1/revisions/${event.revisionId}/analyses`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
      'X-Actor-Id': event.createdBy || '00000000-0000-0000-0000-000000000001',
      'X-Request-Id': crypto.randomUUID(),
      'Idempotency-Key': `analysis-${event.revisionId}`,
      // T1: this outbox retries the analysis itself, so the AI service fails fast on a provider outage.
      'X-Retry-Owner': 'outbox'
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
      operation: 'incremental_story_analysis',
      // Live retest 10 (X1): chapters saved in the Author IDE only got events; narrative facts, world
      // rules and state changes came only from a manual re-analysis. Since #181 they cost 2 calls.
      options: { extract_world_rules: true, extract_state_transitions: true }
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
