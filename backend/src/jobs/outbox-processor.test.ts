import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleOutboxEvent, processOutboxOnce } from './outbox-processor.js';
import type { RevisionOutboxEvent } from '../modules/novels/outbox.repository.js';

describe('AI-PIPE-01B Outbox Processor Fail-Closed Auto-Materialization', () => {
  const baseEvent: RevisionOutboxEvent = {
    eventId: 'evt-001',
    eventType: 'INCREMENTAL_ANALYSIS',
    revisionId: 'rev-target-123',
    novelId: 'novel-001',
    chapterId: 'chap-001',
    contentHash: 'hash-abc',
    createdBy: null,
    payload: {},
    status: 'PROCESSING',
    retryCount: 0,
    maxRetries: 5,
    nextRetryAt: new Date(),
    lastError: null,
    claimToken: 'tok-123',
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

  test('6. processOutboxOnce multi-attempt sequence: Attempt 1 partial failure leaves event retryable (FAILED), Attempt 2 idempotent retry marks COMPLETED', async () => {
    interface StoredEvent extends RevisionOutboxEvent {
      dbStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    }

    const storedEvents: Record<string, StoredEvent> = {
      'evt-retry-001': {
        eventId: 'evt-retry-001',
        eventType: 'INCREMENTAL_ANALYSIS',
        revisionId: 'rev-retry-101',
        novelId: 'novel-retry-001',
        chapterId: 'chap-retry-001',
        contentHash: 'hash-retry-101',
        createdBy: 'user-001',
        payload: {},
        status: 'PENDING',
        dbStatus: 'PENDING',
        retryCount: 0,
        maxRetries: 5,
        nextRetryAt: new Date(),
        lastError: null,
        claimToken: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    const completedCalls: { eventId: string; claimToken: string }[] = [];
    const failedCalls: { eventId: string; error: string; backoffSeconds: number; claimToken: string }[] = [];
    const materializedGroups: string[] = [];

    const originalFetch = globalThis.fetch;
    let brainVersion = 10;

    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/analyses')) {
        return new Response(JSON.stringify({ success: true, data: { analysis_id: 'ana-retry' } }), { status: 200 });
      }
      if (urlStr.includes('/story-brains/by-novel/')) {
        return new Response(JSON.stringify({ success: true, data: { brain_version: brainVersion } }), { status: 200 });
      }
      if (urlStr.includes('/proposals?status=pending')) {
        const pending: any[] = [];
        if (!materializedGroups.includes('grp-A')) {
          pending.push({
            proposal_id: 'prop-A',
            dependency_group_id: 'grp-A',
            evidence: [{ revision_id: 'rev-retry-101' }]
          });
        }
        if (!materializedGroups.includes('grp-B')) {
          pending.push({
            proposal_id: 'prop-B',
            dependency_group_id: 'grp-B',
            evidence: [{ revision_id: 'rev-retry-101' }]
          });
        }
        return new Response(JSON.stringify({ success: true, data: pending }), { status: 200 });
      }
      if (urlStr.includes('/proposal-groups/grp-A/accept')) {
        materializedGroups.push('grp-A');
        brainVersion++;
        return new Response(JSON.stringify({ success: true, data: { brain_version: brainVersion } }), { status: 200 });
      }
      if (urlStr.includes('/proposal-groups/grp-B/accept')) {
        // Attempt 1: fail transiently
        if (storedEvents['evt-retry-001'].retryCount === 0) {
          return new Response('Transient AI service 503 error on group B', { status: 503 });
        }
        materializedGroups.push('grp-B');
        brainVersion++;
        return new Response(JSON.stringify({ success: true, data: { brain_version: brainVersion } }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const deps = {
      claimEvents: async (limit: number) => {
        const eligible = Object.values(storedEvents).filter(
          (e) => e.dbStatus === 'PENDING' || e.dbStatus === 'FAILED'
        ).slice(0, limit);
        return eligible.map((e) => {
          e.dbStatus = 'PROCESSING';
          e.status = 'PROCESSING';
          e.claimToken = `token-attempt-${e.retryCount + 1}`;
          return { ...e };
        });
      },
      markCompleted: async (eventId: string, claimToken: string) => {
        const e = storedEvents[eventId];
        assert.equal(e.claimToken, claimToken, 'Claim token must match active processing lease');
        e.dbStatus = 'COMPLETED';
        e.status = 'COMPLETED';
        completedCalls.push({ eventId, claimToken });
        return true;
      },
      markFailed: async (eventId: string, error: string, backoffSeconds: number, claimToken: string) => {
        const e = storedEvents[eventId];
        assert.equal(e.claimToken, claimToken, 'Claim token must match active processing lease');
        e.dbStatus = 'FAILED';
        e.status = 'FAILED';
        e.retryCount += 1;
        e.lastError = error;
        failedCalls.push({ eventId, error, backoffSeconds, claimToken });
        return true;
      }
    };

    try {
      // === ATTEMPT 1 ===
      const attempt1 = await processOutboxOnce(10, deps);
      assert.equal(attempt1.processed, 1, 'Attempt 1 processed 1 event');
      assert.equal(attempt1.succeeded, 0, 'Attempt 1 had 0 succeeded');
      assert.equal(attempt1.failed, 1, 'Attempt 1 failed on group B');
      assert.deepEqual(materializedGroups, ['grp-A'], 'Group A materialized before Group B failed');
      assert.equal(completedCalls.length, 0, 'markCompleted must NOT be called on partial failure');
      assert.equal(failedCalls.length, 1, 'markFailed must be called on partial failure');
      assert.match(failedCalls[0].error, /503/);
      assert.equal(storedEvents['evt-retry-001'].dbStatus, 'FAILED', 'Event remains retryable (FAILED)');
      assert.equal(storedEvents['evt-retry-001'].retryCount, 1);

      // === ATTEMPT 2 (Retry) ===
      const attempt2 = await processOutboxOnce(10, deps);
      assert.equal(attempt2.processed, 1, 'Attempt 2 processed reclaimed event');
      assert.equal(attempt2.succeeded, 1, 'Attempt 2 succeeded');
      assert.equal(attempt2.failed, 0, 'Attempt 2 had 0 failed');
      assert.deepEqual(materializedGroups, ['grp-A', 'grp-B'], 'Group A not duplicated; Group B succeeded');
      assert.equal(completedCalls.length, 1, 'markCompleted MUST be called on successful retry');
      assert.equal(completedCalls[0].eventId, 'evt-retry-001');
      assert.equal(completedCalls[0].claimToken, 'token-attempt-2');
      assert.equal(storedEvents['evt-retry-001'].dbStatus, 'COMPLETED', 'Event transitioned to COMPLETED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
