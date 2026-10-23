import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleOutboxEvent, processOutboxOnce } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

// WORKFLOW_CONTRACT v1.4: P1 extraction is not an authorized canon decision.
// These replace obsolete integration tests requiring generic worker auto-approval.
const event: RevisionOutboxEvent = {
 eventId: 'evt-1', eventType: 'INCREMENTAL_ANALYSIS', revisionId: 'rev-1',
 novelId: 'novel-1', chapterId: 'chapter-1', contentHash: 'hash-1', createdBy: 'author-1',
 payload: {}, status: 'PROCESSING', retryCount: 0, maxRetries: 5,
 nextRetryAt: new Date(), lastError: null, claimToken: 'lease-1', createdAt: new Date(), updatedAt: new Date()
};
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
  }, async () => { await handleOutboxEvent(event); });
  assert.equal(calls.length, 1, 'Generic worker must not query/accept proposal groups');
  assert.ok(calls[0].url.endsWith('/v1/revisions/rev-1/analyses'));
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
   novel_id: event.novelId, chapter_id: event.chapterId, revision_id: event.revisionId,
   content_hash: event.contentHash, operation: 'incremental_story_analysis'
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
  }, async () => { await handleOutboxEvent(event); await handleOutboxEvent(event); });
  assert.deepEqual(keys, ['analysis-rev-1','analysis-rev-1']);
 });
 test('interrupted extraction fails explicitly, retry remains extraction-only', async () => {
  let attempt = 0;
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   if (++attempt === 1) throw new Error('interrupted extraction');
   return new Response('{}');
  }, async () => {
   await assert.rejects(handleOutboxEvent(event), /interrupted extraction/);
   await handleOutboxEvent(event);
  });
  assert.equal(attempt, 2);
 });
 test('HTTP extraction failure is retryable without accessing pending canon', async () => {
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   return new Response('owned extraction fault', {status:503});
  }, async () => { await assert.rejects(handleOutboxEvent(event), /HTTP 503: owned extraction fault/); });
 });
 test('outbox COMPLETED means extraction delivered, not canon accepted', async () => {
  const completed: string[] = [];
  await usingFetch(async (url) => {
   assert.ok(String(url).endsWith('/analyses'));
   return new Response(JSON.stringify({data: {status:'waiting_entity_review'}}));
  }, async () => {
   const result = await processOutboxOnce(1, {
    claimEvents: async () => [event],
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
   const deps={claimEvents:async()=>[event],markCompleted:async(id:string,token:string)=>{
    assert.equal(token,event.claimToken);completed.push(id);return true;
   },markFailed:async(id:string,error:string,backoff:number,token:string)=>{
    assert.equal(token,event.claimToken);assert.match(error,/503/);assert.equal(backoff,10);failed.push(id);return true;
   }};
   assert.deepEqual(await processOutboxOnce(1,deps),{processed:1,succeeded:0,failed:1});
   assert.deepEqual(await processOutboxOnce(1,deps),{processed:1,succeeded:1,failed:0});
  });
  assert.deepEqual(failed,[event.eventId]);assert.deepEqual(completed,[event.eventId]);
 });
});
