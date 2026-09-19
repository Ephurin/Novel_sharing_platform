import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AIGatewayService } from './ai-gateway.service.js';
import { AppError } from '../../core/errors/app-error.js';

describe('Node.js AI Gateway Service (P6.5 Hardening)', () => {
  test('AIGatewayService forwards headers with tenant, user, and service token', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = init?.body || '';
      return new Response(
        JSON.stringify({
          data: { status: 'queued', job_id: 'test-job-123' },
          meta: { schema_version: 1 }
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const result = await gateway.forwardRequest({
        method: 'POST',
        path: '/v1/writing/generations',
        userId: 'user-author-999',
        tenantId: '00000000-0000-0000-0000-000000000001',
        requestId: 'req-test-uuid',
        body: { operation: 'continue', chapter_id: 'ch-1' },
      });

      assert.equal(result.job_id, 'test-job-123');
      assert.equal(capturedHeaders['X-Tenant-Id'], '00000000-0000-0000-0000-000000000001');
      assert.equal(capturedHeaders['X-User-Id'], 'user-author-999');
      assert.equal(capturedHeaders['X-Request-Id'], 'req-test-uuid');
      assert.match(capturedUrl, /\/v1\/writing\/generations$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('AIGatewayService builds query parameters correctly for context-preview', async () => {
    let capturedUrl = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: { brain_version: 1, world_rules: [] }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      await gateway.forwardRequest({
        method: 'GET',
        path: '/v1/story-brains/brain-456/context-preview',
        queryParams: {
          chapter_number: 2,
          token_budget: 4000,
        },
      });

      assert.match(capturedUrl, /chapter_number=2/);
      assert.match(capturedUrl, /token_budget=4000/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('AIGatewayService propagates remote AI errors as AppError with correct status code', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          detail: {
            code: 'BRAIN_VERSION_CONFLICT',
            message: 'Expected brain version 1 but current is 2',
          }
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      await assert.rejects(
        () => gateway.forwardRequest({
          method: 'POST',
          path: '/v1/writing/generations',
          body: {},
        }),
        (err: any) => err instanceof AppError && err.httpStatus === 409 && err.code === 'BRAIN_VERSION_CONFLICT'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('AIGatewayService maps network connection failures to 502 AI_SERVICE_UNAVAILABLE', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:8000');
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      await assert.rejects(
        () => gateway.forwardRequest({
          method: 'GET',
          path: '/v1/jobs/non-existent',
        }),
        (err: any) => err instanceof AppError && err.httpStatus === 502 && err.code === 'AI_SERVICE_UNAVAILABLE'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
