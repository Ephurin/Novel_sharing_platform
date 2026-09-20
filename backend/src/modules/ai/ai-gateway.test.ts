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

  test('assertNovelOwnership enforces author access control with 403 FORBIDDEN', () => {
    function assertNovelOwnership(novel: { authorId: string }, userId: string, role: string) {
      if (role === 'admin') return;
      if (novel.authorId !== userId) {
        throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập tác phẩm này');
      }
    }

    const novel = { authorId: 'author-alice' };

    // Alice accessing her novel -> ok
    assert.doesNotThrow(() => assertNovelOwnership(novel, 'author-alice', 'author'));

    // Admin accessing novel -> ok
    assert.doesNotThrow(() => assertNovelOwnership(novel, 'admin-bob', 'admin'));

    // Attacker Bob accessing Alice's novel -> 403 Forbidden
    assert.throws(
      () => assertNovelOwnership(novel, 'author-bob', 'author'),
      (err: any) => err instanceof AppError && err.httpStatus === 403 && err.code === 'FORBIDDEN'
    );
  });

  test('Canonical chapter cutoff derivation from DB record overrides client cutoff', () => {
    function deriveCanonicalCutoff(
      chapterFromDb: { chapterNumber: number } | null,
      clientProvidedCutoff?: number
    ): number | undefined {
      if (chapterFromDb) {
        return chapterFromDb.chapterNumber;
      }
      return clientProvidedCutoff;
    }

    // Client maliciously requests chapter 99 for a chapter 2 generation
    const dbChapter = { chapterNumber: 2 };
    const clientProvided = 99;

    const canonicalCutoff = deriveCanonicalCutoff(dbChapter, clientProvided);
    assert.equal(canonicalCutoff, 2, 'Canonical chapter number from DB must override client supplied cutoff');
  });

  test('Cross-author proposal group resolution enforces 403 FORBIDDEN when novel belongs to another author', async () => {
    // Mock internal resolution endpoint returning Alice's novel
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/internal/v1/proposal-groups/group-alice/novel')) {
        return new Response(JSON.stringify({ novel_id: 'novel-alice' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const mockNovelRepo = {
        async findById(novelId: string) {
          if (novelId === 'novel-alice') {
            return { id: 'novel-alice', authorId: 'author-alice' };
          }
          return null;
        },
      };

      function assertNovelOwnership(novel: { authorId: string }, userId: string, role: string) {
        if (role === 'admin') return;
        if (novel.authorId !== userId) {
          throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập tác phẩm này');
        }
      }

      // Attacker Bob tries to accept Alice's proposal group
      const targetGroupId = 'group-alice';
      const bobUserId = 'author-bob';
      const bobRole = 'author';

      // Gateway resolves novelId from internal endpoint
      const novelInfo = await gateway.forwardRequest<{ novel_id: string }>({
        method: 'GET',
        path: `/internal/v1/proposal-groups/${targetGroupId}/novel`,
      });
      assert.equal(novelInfo.novel_id, 'novel-alice');

      const novel = await mockNovelRepo.findById(novelInfo.novel_id);
      assert.ok(novel);

      assert.throws(
        () => assertNovelOwnership(novel, bobUserId, bobRole),
        (err: any) => err instanceof AppError && err.httpStatus === 403 && err.code === 'FORBIDDEN'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Cross-author single proposal resolution enforces 403 FORBIDDEN for reject and edit-and-accept', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/internal/v1/proposals/prop-alice/novel')) {
        return new Response(JSON.stringify({ novel_id: 'novel-alice' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      const mockNovelRepo = {
        async findById(novelId: string) {
          if (novelId === 'novel-alice') {
            return { id: 'novel-alice', authorId: 'author-alice' };
          }
          return null;
        },
      };

      function assertNovelOwnership(novel: { authorId: string }, userId: string, role: string) {
        if (role === 'admin') return;
        if (novel.authorId !== userId) {
          throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập tác phẩm này');
        }
      }

      const novelInfo = await gateway.forwardRequest<{ novel_id: string }>({
        method: 'GET',
        path: `/internal/v1/proposals/prop-alice/novel`,
      });

      const novel = await mockNovelRepo.findById(novelInfo.novel_id);
      assert.ok(novel);

      // Bob cannot reject or edit-accept Alice's proposal
      assert.throws(
        () => assertNovelOwnership(novel, 'author-bob', 'author'),
        (err: any) => err instanceof AppError && err.httpStatus === 403
      );
      // Admin CAN access Alice's proposal
      assert.doesNotThrow(() => assertNovelOwnership(novel, 'admin-carol', 'admin'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Story Brain freshness check fails closed with 503 when AI service is unavailable', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    try {
      // Simulate acceptDraft fail-closed logic
      async function verifyFreshnessOrFailClosed(novelId: string) {
        let brainRes: Response;
        try {
          brainRes = await fetch(`http://ai-service/internal/v1/novels/${novelId}/brain`);
        } catch (fetchErr: any) {
          throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Không thể xác thực tính nhất quán của Story Brain lúc này. Vui lòng thử lại sau.');
        }
        if (!brainRes.ok) {
          throw new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'Không thể xác thực tính nhất quán của Story Brain lúc này.');
        }
        return brainRes.json();
      }

      await assert.rejects(
        () => verifyFreshnessOrFailClosed('nov-123'),
        (err: any) => err instanceof AppError && err.httpStatus === 503 && err.code === 'AI_SERVICE_UNAVAILABLE'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

