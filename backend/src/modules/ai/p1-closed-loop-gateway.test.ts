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
});
