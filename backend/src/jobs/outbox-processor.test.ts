import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleOutboxEvent } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

describe('AI-PIPE-01B Outbox Processor Fail-Closed Auto-Materialization', () => {
  const baseEvent: RevisionOutboxEvent = {
    eventId: 'evt-001',
    eventType: 'INCREMENTAL_ANALYSIS',
    revisionId: 'rev-target-123',
    novelId: 'novel-001',
    chapterId: 'chap-001',
    contentHash: 'hash-abc',
    status: 'CLAIMED',
    retryCount: 0,
    claimToken: 'tok-123',
    claimedAt: new Date(),
    processedAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  test('1. Analysis success + scoped proposal materialization success -> Brain advances', async () => {
    const originalFetch = globalThis.fetch;
    const acceptedGroups: string[] = [];

    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true, data: { analysis_id: 'ana-1' } }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: 5 } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                proposal_id: 'prop-1',
                dependency_group_id: 'grp-1',
                evidence: [{ revision_id: 'rev-target-123' }]
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/proposal-groups/grp-1/accept')) {
        const body = JSON.parse(init?.body || '{}');
        assert.equal(body.expected_brain_version, 5);
        acceptedGroups.push('grp-1');
        return new Response(JSON.stringify({ success: true, data: { brain_version: 6 } }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await handleOutboxEvent(baseEvent);
      assert.deepEqual(acceptedGroups, ['grp-1'], 'Proposal group for target revision must be accepted');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('2. Proposal-group accept transient failure -> throws Error so event fails closed and is retryable', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: 5 } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                proposal_id: 'prop-fail',
                dependency_group_id: 'grp-fail',
                evidence: [{ revision_id: 'rev-target-123' }]
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/proposal-groups/grp-fail/accept')) {
        return new Response('Internal error during merge', { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await assert.rejects(
        async () => {
          await handleOutboxEvent(baseEvent);
        },
        (err: Error) => {
          assert.match(err.message, /Failed to auto-materialize proposal group grp-fail/);
          return true;
        },
        'Must fail closed when proposal-group accept fails'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('3. Retry after partial attempt -> proposal already accepted does not re-accept; finishes cleanly', async () => {
    const originalFetch = globalThis.fetch;
    let acceptCallCount = 0;

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: 6 } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        // Upon retry, if proposals are already accepted/cleared, list returns empty
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }
      if (urlStr.includes('/accept')) {
        acceptCallCount++;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await handleOutboxEvent(baseEvent);
      assert.equal(acceptCallCount, 0, 'No proposals pending means no duplicate accept calls');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. Unrelated pending proposal groups are NOT auto-accepted', async () => {
    const originalFetch = globalThis.fetch;
    const acceptedGroups: string[] = [];

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: 5 } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                proposal_id: 'prop-other',
                dependency_group_id: 'grp-other',
                evidence: [{ revision_id: 'rev-different-456' }] // Unrelated revision!
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/accept')) {
        acceptedGroups.push('unrelated-group');
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await handleOutboxEvent(baseEvent);
      assert.equal(acceptedGroups.length, 0, 'Unrelated pending proposal group must NOT be auto-accepted');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. No relevant proposals / legitimate no-op analysis -> does not throw, does not claim Brain advance', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: 5 } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      // Must complete without error
      await handleOutboxEvent(baseEvent);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
