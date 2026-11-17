import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleOutboxEvent, outboxRetryDelaySeconds, processOutboxOnce, RATE_LIMIT_MIN_BACKOFF_SECONDS } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

// WORKFLOW_CONTRACT v1.4: P1 extraction is not an authorized canon decision.
// These replace obsolete integration tests requiring generic worker auto-approval.
const event: RevisionOutboxEvent = {
 eventId: 'evt-1', eventType: 'INCREMENTAL_ANALYSIS', revisionId: 'rev-1',
 novelId: 'novel-1', chapterId: 'chapter-1', contentHash: 'hash-1', createdBy: 'author-1',
 payload: {}, status: 'PROCESSING', retryCount: 0, maxRetries: 5,
 nextRetryAt: new Date(), lastError: null, claimToken: 'lease-1', createdAt: new Date(), updatedAt: new Date()
};
const headIsThisRevision = { latestRevision: async () => ({ revisionId: event.revisionId, createdAt: new Date(0) }), chapterActive: async () => true };
async function usingFetch(fn: typeof fetch, action: () => Promise<void>) {
 const original = globalThis.fetch;
 globalThis.fetch = fn;
 try { await action(); } finally { globalThis.fetch = original; }
}
describe('P1 extraction-only outbox authorization boundary', () => {
 test('successful extraction issues exactly one source-scoped request and no canon decision', async () => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  await usingFetch(async (url, init) => {
   calls.push({url: String(url), init});
   return new Response(JSON.stringify({data: {status: 'waiting_review'}}));
  }, async () => { await handleOutboxEvent(event, headIsThisRevision); });
  assert.equal(calls.length, 1, 'Generic worker must not query/accept proposal groups');
  assert.ok(calls[0].url.endsWith('/v1/revisions/rev-1/analyses'));
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
   novel_id: event.novelId, chapter_id: event.chapterId, revision_id: event.revisionId,
   content_hash: event.contentHash, operation: 'incremental_story_analysis',
   options: { extract_world_rules: true, extract_state_transitions: true }
  });
  const h = calls[0].init?.headers as Record<string,string>;
  assert.equal(h['X-Actor-Id'], event.createdBy);
  assert.equal(h['Idempotency-Key'], 'analysis-rev-1');
 });
 test('duplicate delivery preserves extraction idempotency key and never invokes accept', async () => {
  const keys: string[] = [];
  await usingFetch(async (url, init) => {
   assert.ok(String(url).endsWith('/analyses'));
   keys.push((init?.headers as Record<string,string>)['Idempotency-Key']);
   return new Response('{}');
  }, async () => { await handleOutboxEvent(event, headIsThisRevision); await handleOutboxEvent(event, headIsThisRevision); });
  assert.deepEqual(keys, ['analysis-rev-1','analysis-rev-1']);
 });
 test('interrupted extraction fails explicitly, retry remains extraction-only', async () => {
  let attempt = 0;
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   if (++attempt === 1) throw new Error('interrupted extraction');
   return new Response('{}');
  }, async () => {
   await assert.rejects(handleOutboxEvent(event, headIsThisRevision), /interrupted extraction/);
   await handleOutboxEvent(event, headIsThisRevision);
  });
  assert.equal(attempt, 2);
 });
 test('HTTP extraction failure is retryable without accessing pending canon', async () => {
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   return new Response('owned extraction fault', {status:503});
  }, async () => { await assert.rejects(handleOutboxEvent(event, headIsThisRevision), /HTTP 503: owned extraction fault/); });
 });
 test('outbox COMPLETED means extraction delivered, not canon accepted', async () => {
  const completed: string[] = [];
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   return new Response(JSON.stringify({data: {status:'waiting_entity_review'}}));
  }, async () => {
   const result = await processOutboxOnce(1, {
    analysisGate: headIsThisRevision, claimEvents: async () => [event],
    markCompleted: async (id, token) => { assert.equal(token, event.claimToken); completed.push(id); return true; },
    markFailed: async () => { assert.fail('successful extraction must not depend on canon approval'); }
   });
   assert.deepEqual(result, {processed:1,succeeded:1,failed:0});
  });
  assert.deepEqual(completed, [event.eventId]);
 });
 test('failed extraction marks FAILED then successful retry completes using claim fences', async () => {
  let attempt=0; const failed: string[]=[]; const completed: string[]=[];
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   return new Response('{}', {status: ++attempt===1 ? 503 : 200});
  }, async () => {
   const deps={analysisGate: headIsThisRevision, claimEvents: async () => [event],markCompleted:async(id:string,token:string)=>{
    assert.equal(token,event.claimToken);completed.push(id);return true;
   },markFailed:async(id:string,error:string,backoff:number,token:string)=>{
    assert.equal(token,event.claimToken);assert.match(error,/503/);assert.equal(backoff,10);failed.push(id);return true;
   }};
   assert.deepEqual(await processOutboxOnce(1,deps),{processed:1,succeeded:0,failed:1});
   assert.deepEqual(await processOutboxOnce(1,deps),{processed:1,succeeded:1,failed:0});
  });
  assert.deepEqual(failed,[event.eventId]);assert.deepEqual(completed,[event.eventId]);
 });
 test('#149: free-tier rate-limit failures back off at least one RPM window', async () => {
  const backoffs: number[] = [];
  await usingFetch(async () => new Response('{"detail":"BUDGET_GUARD_DENIED RPM_LIMIT_EXCEEDED retry_after=12"}', {status: 502}), async () => {
   await processOutboxOnce(1, {analysisGate: headIsThisRevision, claimEvents: async () => [event], markCompleted: async () => true,
    markFailed: async (_id, _error, backoff) => { backoffs.push(backoff); return true; }});
  });
  assert.deepEqual(backoffs, [RATE_LIMIT_MIN_BACKOFF_SECONDS]);
  assert.equal(outboxRetryDelaySeconds(0, 'AI service returned HTTP 429: busy'), 60);
  assert.equal(outboxRetryDelaySeconds(5, 'AI service returned HTTP 429: busy'), 300);
  assert.equal(outboxRetryDelaySeconds(0, 'AI service returned HTTP 503: down'), 10);
 });
 test('incremental analysis skips a revision that is no longer the chapter head', async () => {
  let calls = 0;
  await usingFetch(async () => { calls++; return new Response('{}'); }, async () => {
   const outcome = await handleOutboxEvent(event, { latestRevision: async () => ({ revisionId: 'rev-2', createdAt: new Date(0) }) });
   assert.deepEqual(outcome, { skipped: 'superseded by a newer saved revision' });
  });
  assert.equal(calls, 0, 'a superseded revision must not spend a model call');
 });
 test('incremental analysis waits until the head revision has been unchanged for the quiet period', async () => {
  const saved = new Date('2026-11-15T10:00:00Z');
  const gate = (offsetSeconds: number) => ({ quietSeconds: 120, now: () => saved.getTime() + offsetSeconds * 1000,
   latestRevision: async () => ({ revisionId: event.revisionId, createdAt: saved }), chapterActive: async () => true });
  let calls = 0;
  await usingFetch(async () => { calls++; return new Response('{}'); }, async () => {
   assert.deepEqual(await handleOutboxEvent(event, gate(30)), { deferSeconds: 90, reason: 'waiting for the chapter to stop changing' });
   assert.deepEqual(await handleOutboxEvent(event, gate(118)), { deferSeconds: 5, reason: 'waiting for the chapter to stop changing' });
   assert.equal(calls, 0);
   assert.equal(await handleOutboxEvent(event, gate(121)), undefined);
  });
  assert.equal(calls, 1, 'the quiet head is analysed exactly once');
 });
 test('a deferred event is rescheduled without spending a retry or counting as success', async () => {
  const deferred: Array<[string, number, string]> = []; const completed: string[] = []; const failed: string[] = [];
  const result = await processOutboxOnce(1, {
   claimEvents: async () => [event],
   handleEvent: async () => ({ deferSeconds: 42, reason: 'waiting for the chapter to stop changing' }),
   markCompleted: async id => { completed.push(id); return true; },
   markFailed: async id => { failed.push(id); return true; },
   markDeferred: async (id, delay, reason, token) => { assert.equal(token, event.claimToken); deferred.push([id, delay, reason]); return true; }
  });
  assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 0 });
  assert.deepEqual(deferred, [[event.eventId, 42, 'deferred: waiting for the chapter to stop changing']]);
  assert.deepEqual(completed, []); assert.deepEqual(failed, []);
 });
 test('Full auto analyses the head immediately, ignoring the quiet period', async () => {
  let calls = 0; const completed: string[] = [];
  await usingFetch(async () => { calls++; return new Response('{}'); }, async () => {
   await processOutboxOnce(1, { claimEvents: async () => [event], ignoreQuietPeriod: true,
    analysisGate: { quietSeconds: 600, latestRevision: async () => ({ revisionId: event.revisionId, createdAt: new Date() }), chapterActive: async () => true },
    markCompleted: async id => { completed.push(id); return true; }, markFailed: async () => true });
  });
  assert.equal(calls, 1); assert.deepEqual(completed, [event.eventId]);
 });
});
 test('BB3: a chapter archived or deleted after saving is not analysed', async () => {
  let calls = 0;
  await usingFetch(async () => { calls++; return new Response('{}'); }, async () => {
   const outcome = await handleOutboxEvent(event, { ...headIsThisRevision, chapterActive: async () => false });
   assert.deepEqual(outcome, { skipped: 'chapter archived or deleted' });
  });
  assert.equal(calls, 0);
 });
