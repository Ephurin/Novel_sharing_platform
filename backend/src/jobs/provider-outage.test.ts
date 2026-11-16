import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processOutboxOnce, PROVIDER_PAUSE_MAX_SECONDS, PROVIDER_PAUSE_MIN_SECONDS, type ProviderBreaker } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

// Live retest 6 (T1, T2): a 15-minute provider outage cost about 36 analysis calls and left the
// chapter FAILED for good.
const T0 = Date.UTC(2026, 10, 16, 15, 0, 0);
const analysis = (id: string, createdAt = new Date(T0)): RevisionOutboxEvent => ({
  eventId: id, eventType: 'INCREMENTAL_ANALYSIS', revisionId: `rev-${id}`, novelId: 'n', chapterId: `ch-${id}`,
  contentHash: 'h', createdBy: 'a', payload: {}, status: 'PROCESSING', retryCount: 0, maxRetries: 5,
  nextRetryAt: new Date(T0), lastError: null, claimToken: `lease-${id}`, createdAt, updatedAt: new Date(T0)
});

function harness(events: RevisionOutboxEvent[], fail: (e: RevisionOutboxEvent) => string | null, breaker: ProviderBreaker, now = T0) {
  const log = { handled: [] as string[], deferred: [] as Array<[string, number, string]>, failed: [] as string[], completed: [] as string[] };
  const run = () => processOutboxOnce(10, {
    claimEvents: async () => events,
    handleEvent: async e => { log.handled.push(e.eventId); const m = fail(e); if (m) throw new Error(m); },
    markCompleted: async id => { log.completed.push(id); return true; },
    markFailed: async id => { log.failed.push(id); return true; },
    markDeferred: async (id, s, reason) => { log.deferred.push([id, s, reason]); return true; },
    breaker, now: () => now
  });
  return { log, run };
}

const outage = 'AI service returned HTTP 502: {"detail":"PROVIDER_UNAVAILABLE retry_after=60"}';

test('T1: one outage pauses every chapter instead of spending a call per chapter', async () => {
  const breaker = { pausedUntil: 0, pauseSeconds: 0 };
  const { log, run } = harness([analysis('a'), analysis('b'), analysis('c')], () => outage, breaker);
  await run();
  assert.deepEqual(log.handled, ['a'], 'only the first chapter probes the AI service');
  assert.deepEqual(log.failed, [], 'an outage spends no retry');
  assert.deepEqual(log.deferred.map(([id, s]) => [id, s]), [['a', PROVIDER_PAUSE_MIN_SECONDS], ['b', PROVIDER_PAUSE_MIN_SECONDS], ['c', PROVIDER_PAUSE_MIN_SECONDS]]);
  assert.match(log.deferred[0][2], /^deferred: provider unavailable/);
});

test('T1: the pause doubles up to a cap while the outage lasts, and success closes it', async () => {
  const breaker = { pausedUntil: 0, pauseSeconds: 0 };
  let now = T0; const pauses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const { log, run } = harness([analysis('a')], () => outage, breaker, now);
    await run();
    pauses.push(log.deferred[0][1]);
    now += log.deferred[0][1] * 1000;
  }
  assert.deepEqual(pauses, [300, 600, 1200, PROVIDER_PAUSE_MAX_SECONDS, PROVIDER_PAUSE_MAX_SECONDS]);
  const ok = harness([analysis('a')], () => null, breaker, now);
  await ok.run();
  assert.deepEqual(ok.log.completed, ['a']);
  assert.equal(breaker.pauseSeconds, 0);
});

test('T2: an outage older than a day fails normally; other errors keep the usual retries', async () => {
  const breaker = { pausedUntil: 0, pauseSeconds: 0 };
  const old = harness([analysis('a', new Date(T0 - 25 * 3_600_000))], () => outage, breaker);
  await old.run();
  assert.deepEqual(old.log.failed, ['a']);
  const bug = harness([analysis('b')], () => 'AI service returned HTTP 422: INVALID', { pausedUntil: 0, pauseSeconds: 0 });
  await bug.run();
  assert.deepEqual(bug.log.failed, ['b']);
  assert.deepEqual(bug.log.deferred, []);
});

test('T1: non-analysis events are not held back by the pause', async () => {
  const breaker = { pausedUntil: T0 + 600_000, pauseSeconds: 600 };
  const sync = { ...analysis('s'), eventType: 'MONGO_DRAFT_SYNC' } as RevisionOutboxEvent;
  const { log, run } = harness([sync], () => null, breaker);
  await run();
  assert.deepEqual(log.completed, ['s']);
});
