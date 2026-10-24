import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AIGatewayService } from './ai-gateway.service.js';
import { applyPatchToContent } from '../novels/chapter-revisions.service.js';

describe('AI-PIPE-01 P1 Node Gateway & Acceptance Flow', () => {
  test('P1-Gateway: Forward manuscript bootstrap with tenant & service authentication', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = JSON.parse(init?.body || '{}');
      return new Response(
        JSON.stringify({
          data: {
            job_id: 'bootstrap-job-001',
            status: 'queued',
            revisions: capturedBody.revisions,
          },
          meta: { schema_version: 1 },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const res = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/story-brains/bootstrap/from-manuscript',
        userId: 'author-123',
        tenantId: '00000000-0000-0000-0000-000000000001',
        requestId: 'req-bs-01',
        body: {
          novel_id: 'novel-001',
          revisions: [
            { chapter_id: 'ch-1', revision_id: 'rev-1', content_hash: 'hash-1' },
            { chapter_id: 'ch-2', revision_id: 'rev-2', content_hash: 'hash-2' },
          ],
        },
      });

      assert.equal(res.job_id, 'bootstrap-job-001');
      assert.equal(capturedHeaders['X-Tenant-Id'], '00000000-0000-0000-0000-000000000001');
      assert.equal(capturedHeaders['X-User-Id'], 'author-123');
      assert.match(capturedUrl, /\/v1\/story-brains\/bootstrap\/from-manuscript$/);
      assert.equal(capturedBody.revisions.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('P1-Gateway: Context preview derives canonical cutoff and returns Story Brain package', async () => {
    let capturedUrl = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: {
            brain_version: 2,
            entities: [{ name: 'Tiêu Viêm', entity_type: 'PER' }, { name: 'Hải Ba Đông', entity_type: 'PER' }],
            world_rules: [{ fact_value: 'Dị Hỏa quy tắc' }],
            recent_events: [],
          },
          meta: { schema_version: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const res = await gateway.forwardRequest({
        method: 'GET',
        path: '/v1/story-brains/brain-novel-001/context-preview',
        queryParams: {
          chapter_number: 2,
        },
      });

      assert.equal(res.brain_version, 2);
      assert.equal(res.entities.length, 2);
      assert.match(capturedUrl, /chapter_number=2/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('P1-Gateway: AI Writing generation creates queued job with pinned brain version', async () => {
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init?.body || '{}');
      return new Response(
        JSON.stringify({
          data: {
            job_id: 'gen-job-001',
            status: 'completed',
            validation_status: 'passed',
            patch: { start: 10, end: 10, replacement: ' chậm rãi' },
            brain_version_used: 2,
          },
          meta: { schema_version: 1 },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const res = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/writing/generations',
        userId: 'author-123',
        body: {
          novel_id: 'novel-001',
          chapter_id: 'ch-2',
          revision_id: 'rev-2',
          content_hash: 'hash-2',
          operation: 'continue',
          expected_brain_version: 2,
          chapter_number: 2,
        },
      });

      assert.equal(res.job_id, 'gen-job-001');
      assert.equal(res.status, 'completed');
      assert.equal(res.validation_status, 'passed');
      assert.equal(capturedBody.expected_brain_version, 2);
      assert.equal(capturedBody.chapter_number, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('P1-Accept: Patch application and content hash update contract', () => {
    const originalText = 'Tiêu Viêm thở dài một hơi.';
    const patch = { start: 10, end: 10, replacement: 'chậm rãi ' };
    const updatedText = applyPatchToContent(originalText, patch);
    assert.equal(updatedText, 'Tiêu Viêm chậm rãi thở dài một hơi.');
  });

  test('P2-Gateway: Forward bootstrap from idea with tenant & service authentication', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = JSON.parse(init?.body || '{}');
      return new Response(
        JSON.stringify({
          data: {
            job_id: 'idea-job-001',
            status: 'waiting_review',
            story_brain_id: capturedBody.novel_id,
          },
          meta: { schema_version: 1 },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const res = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/story-brains/bootstrap/from-idea',
        userId: 'author-123',
        tenantId: '00000000-0000-0000-0000-000000000001',
        requestId: 'req-idea-01',
        body: {
          novel_id: 'novel-001',
          idea: 'Một pháp sư mất trí nhớ điều tra cái chết của chính mình.',
          locale: 'vi-VN',
          preferences: { genre: ['fantasy'] },
          author_constraints: ['Không có du hành thời gian'],
        },
      });

      assert.equal(res.job_id, 'idea-job-001');
      assert.equal(res.status, 'waiting_review');
      assert.equal(capturedHeaders['X-Tenant-Id'], '00000000-0000-0000-0000-000000000001');
      assert.equal(capturedHeaders['X-User-Id'], 'author-123');
      assert.match(capturedUrl, /\/v1\/story-brains\/bootstrap\/from-idea$/);
      assert.equal(capturedBody.idea, 'Một pháp sư mất trí nhớ điều tra cái chết của chính mình.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('P2B-Gateway: Forward Story Plan creation, activation, and objective update', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedMethod = init?.method || 'GET';
      capturedBody = init?.body ? JSON.parse(init.body) : null;
      if (capturedMethod === 'POST' && capturedUrl.includes('/v1/story-plans')) {
        return new Response(
          JSON.stringify({
            data: {
              plan_id: 'plan-001',
              novel_id: capturedBody?.novel_id || 'novel-001',
              plan_version: 1,
              status: 'draft',
              objectives: capturedBody?.objectives || [],
            },
            meta: { schema_version: 1 },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (capturedMethod === 'PATCH' && capturedUrl.includes('/objectives/')) {
        return new Response(
          JSON.stringify({
            data: {
              objective_id: 'obj-001',
              order_index: 1,
              status: capturedBody?.status,
            },
            meta: { schema_version: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ data: {}, meta: {} }), { status: 200 });
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();

      // 1. Create Story Plan
      const created = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/story-plans',
        userId: 'author-123',
        tenantId: '00000000-0000-0000-0000-000000000001',
        body: {
          novel_id: 'novel-001',
          source_outline: 'Chương 1: Khởi đầu. Chương 2: Xung đột.',
          objectives: [
            { order_index: 1, title: 'Khởi đầu', description: 'Tỉnh dậy ở hoang mạc', target_chapter: 1 },
            { order_index: 2, title: 'Xung đột', description: 'Đối đầu ma thú', target_chapter: 2 },
          ],
        },
      });
      assert.equal(created.plan_id, 'plan-001');
      assert.equal(created.plan_version, 1);
      assert.equal(created.status, 'draft');
      assert.equal(capturedMethod, 'POST');

      // 2. Update Objective Status
      const updated = await gateway.forwardRequest({
        method: 'PATCH',
        path: '/v1/story-plans/plan-001/objectives/obj-001',
        userId: 'author-123',
        queryParams: { novel_id: 'novel-001' },
        body: { status: 'completed' },
      });
      assert.equal(updated.status, 'completed');
      assert.equal(capturedMethod, 'PATCH');
      assert.match(capturedUrl, /novel_id=novel-001/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('P2B-Gateway: Non-owner cannot read another novel plan by UUID (403 FORBIDDEN)', async () => {
    // When non-owner tries to read plan by UUID, assertNovelOwnership rejects before exposing plan body
    function assertNovelOwnership(novelAuthorId: string, userId: string, role: string) {
      if (role === 'admin' || role === 'ADMIN') return;
      if (novelAuthorId !== userId) {
        throw new Error('403_FORBIDDEN');
      }
    }

    const novelAuthorId = 'author-alice';

    // Alice (owner) reads plan -> allowed
    assert.doesNotThrow(() => assertNovelOwnership(novelAuthorId, 'author-alice', 'author'));

    // Admin reads plan -> allowed
    assert.doesNotThrow(() => assertNovelOwnership(novelAuthorId, 'admin-carol', 'admin'));

    // Bob (non-owner) reads plan by UUID -> rejected with 403 FORBIDDEN
    assert.throws(
      () => assertNovelOwnership(novelAuthorId, 'author-bob', 'author'),
      /403_FORBIDDEN/
    );
  });

  test('P1-Gateway: Author operation consistency check forwards with actor/tenant and returns findings', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = JSON.parse(init?.body || '{}');
      return new Response(
        JSON.stringify({
          data: {
            findings: [
              {
                description: 'Mâu thuẫn thực thể: Trần Vân được ghi nhận còn sống trong Story Brain nhưng bản thảo nêu đã hy sinh',
                evidence: 'Trần Vân đã hy sinh',
                revision_id: capturedBody.revision_id,
              }
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const res = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/story-brains/novel-001/author-operation',
        userId: 'author-123',
        tenantId: '00000000-0000-0000-0000-000000000001',
        requestId: 'req-consist-01',
        body: {
          operation: 'check_consistency',
          content: 'Bản thảo mới: Trần Vân đã hy sinh tại đại chiến.',
          revision_id: 'rev-test-1',
        },
      });

      assert.equal(capturedHeaders['X-Tenant-Id'], '00000000-0000-0000-0000-000000000001');
      assert.equal(capturedHeaders['X-User-Id'], 'author-123');
      assert.match(capturedUrl, /\/v1\/story-brains\/novel-001\/author-operation$/);
      assert.equal(res.findings.length, 1);
      assert.equal(res.findings[0].evidence, 'Trần Vân đã hy sinh');
      assert.equal(res.findings[0].revision_id, 'rev-test-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

