import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleOutboxEvent, processOutboxOnce } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

const event: RevisionOutboxEvent = {
  eventId: 'evt-1', eventType: 'INCREMENTAL_ANALYSIS', revisionId: 'rev-1', novelId: 'novel-1',
  chapterId: 'chapter-1', contentHash: 'hash', createdBy: null, payload: {}, status: 'PROCESSING',
  retryCount: 0, maxRetries: 5, nextRetryAt: new Date(), lastError: null, claimToken: 'lease-1',
  createdAt: new Date(), updatedAt: new Date()
};

test('ordinary extraction persists proposals without reading or accepting them', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (url) => {
    paths.push(String(url));
    return new Response(JSON.stringify({ data: { status: 'completed', proposal_count: 3 } }));
  };
  try {
    await handleOutboxEvent(event);
    assert.equal(paths.length, 1);
    assert.match(paths[0], /revisions\/rev-1\/analyses$/);
    assert.ok(paths.every(path => !path.includes('/accept')));
  } finally { globalThis.fetch = original; }
});

test('failed extraction remains retryable and never completes or approves', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  let failed = 0;
  let completed = 0;
  try {
    const result = await processOutboxOnce(1, {
      claimEvents: async () => [event], handleEvent: handleOutboxEvent,
      markCompleted: async () => { completed++; return true; },
      markFailed: async (_id, _message, backoff, token) => {
        assert.equal(token, 'lease-1'); assert.ok(backoff > 0); failed++; return true;
      }
    });
    assert.equal(result.failed, 1); assert.equal(failed, 1); assert.equal(completed, 0);
  } finally { globalThis.fetch = original; }
});

test('retry succeeds without materializing narrative memory', async () => {
  let attempt = 0;
  let failed = 0;
  let completed = 0;
  const deps = {
    claimEvents: async () => [event],
    handleEvent: async () => { if (++attempt === 1) throw new Error('temporary extraction failure'); },
    markCompleted: async () => { completed++; return true; },
    markFailed: async () => { failed++; return true; }
  };
  await processOutboxOnce(1, deps); await processOutboxOnce(1, deps);
  assert.equal(failed, 1); assert.equal(completed, 1);
});
