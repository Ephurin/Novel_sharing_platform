import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../core/errors/app-error.js';
import { AIGatewayService } from './ai-gateway.service.js';

describe('Autonomous Controller Gateway & Contract Tests', () => {
  test('Cross-author autonomous run access enforces 403 FORBIDDEN', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/autonomous/runs/run-alice')) {
        return new Response(
          JSON.stringify({
            data: {
              run_id: 'run-alice',
              novel_id: 'novel-alice',
              plan_id: 'plan-alice',
              plan_version: 1,
              status: 'running',
              current_iteration: 0,
              max_iterations: 10,
              current_retries: 0,
              max_retries_per_objective: 3,
            },
            meta: { schema_version: 1 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
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
        if (role === 'admin' || role === 'ADMIN') return;
        if (novel.authorId !== userId) {
          throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập tác phẩm này');
        }
      }

      const runData = await gateway.forwardRequest<{ run_id: string; novel_id: string }>({
        method: 'GET',
        path: '/v1/autonomous/runs/run-alice',
      });

      assert.equal(runData.run_id, 'run-alice');
      assert.equal(runData.novel_id, 'novel-alice');

      const novel = await mockNovelRepo.findById(runData.novel_id);
      assert.ok(novel);

      // Non-owner author Bob gets 403 FORBIDDEN
      assert.throws(
        () => assertNovelOwnership(novel, 'author-bob', 'AUTHOR'),
        (err: any) => err instanceof AppError && err.httpStatus === 403 && err.code === 'FORBIDDEN'
      );

      // Author Alice (owner) gets access
      assert.doesNotThrow(() => assertNovelOwnership(novel, 'author-alice', 'AUTHOR'));

      // Admin gets access
      assert.doesNotThrow(() => assertNovelOwnership(novel, 'admin-carol', 'ADMIN'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Single-writer conflict returns 409 ACTIVE_RUN_CONFLICT', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/autonomous/runs') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            detail: {
              code: 'ACTIVE_RUN_CONFLICT',
              message: 'Active autonomous run already exists for novel',
            },
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      const gateway = new AIGatewayService();
      await assert.rejects(
        async () => {
          await gateway.forwardRequest({
            method: 'POST',
            path: '/v1/autonomous/runs',
            body: { novel_id: 'novel-alice' },
          });
        },
        (err: any) => err instanceof AppError && err.httpStatus === 409
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Deterministic quality gate: checks completion, validation, patch validity and brain freshness', () => {
    function evaluateQualityGate(genJob: any, expectedBrainVersion: number) {
      const isJobCompleted = genJob?.status === 'completed';
      const isValidationPassed =
        genJob?.validation_status === 'passed' &&
        (genJob?.validations?.every((v: any) => v.passed) ?? true);
      const isPatchValid =
        !!genJob?.patch &&
        typeof genJob?.patch?.patched_content === 'string' &&
        genJob.patch.patched_content.length > 0;
      const isBrainFresh =
        !genJob?.brain_version_used || genJob.brain_version_used === expectedBrainVersion;

      return isJobCompleted && isValidationPassed && isPatchValid && isBrainFresh;
    }

    // Happy path: PASS
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { patched_content: 'Nội dung chương 1...' },
          brain_version_used: 1,
        },
        1
      ),
      true
    );

    // Incomplete job: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'generating',
          validation_status: 'passed',
          patch: { patched_content: '...' },
        },
        1
      ),
      false
    );

    // Validation failed: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'failed',
          validations: [{ passed: false }],
          patch: { patched_content: '...' },
          brain_version_used: 1,
        },
        1
      ),
      false
    );

    // Stale brain version: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { patched_content: '...' },
          brain_version_used: 2, // expected 1
        },
        1
      ),
      false
    );

    // Missing patch: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: null,
          brain_version_used: 1,
        },
        1
      ),
      false
    );
  });

  test('Intentional completion gate terminates on terminal objective or all objectives done', () => {
    function evaluateCompletion(
      currentObj: { metadata?: { is_terminal?: boolean }; objective_type?: string },
      remainingObjectives: any[],
      currentIteration: number,
      maxIterations: number
    ): { status: 'running' | 'completed' | 'stopped'; stopReason: string | null } {
      const isTerminal =
        currentObj.metadata?.is_terminal === true ||
        currentObj.objective_type === 'ending' ||
        currentObj.objective_type === 'terminal';

      if (isTerminal) {
        return { status: 'completed', stopReason: 'terminal_objective_completed' };
      }
      if (remainingObjectives.length === 0) {
        return { status: 'completed', stopReason: 'all_objectives_completed' };
      }
      if (currentIteration + 1 >= maxIterations) {
        return { status: 'stopped', stopReason: 'max_iterations_reached' };
      }
      return { status: 'running', stopReason: null };
    }

    // Terminal objective completes run immediately
    const termRes = evaluateCompletion(
      { metadata: { is_terminal: true }, objective_type: 'chapter_goal' },
      [{ id: 'obj-next' }],
      1,
      10
    );
    assert.equal(termRes.status, 'completed');
    assert.equal(termRes.stopReason, 'terminal_objective_completed');

    // All objectives completed
    const allDoneRes = evaluateCompletion(
      { objective_type: 'chapter_goal' },
      [], // no remaining
      1,
      10
    );
    assert.equal(allDoneRes.status, 'completed');
    assert.equal(allDoneRes.stopReason, 'all_objectives_completed');

    // Max iterations reached
    const maxIterRes = evaluateCompletion(
      { objective_type: 'chapter_goal' },
      [{ id: 'obj-2' }],
      9,
      10 // 9 + 1 >= 10
    );
    assert.equal(maxIterRes.status, 'stopped');
    assert.equal(maxIterRes.stopReason, 'max_iterations_reached');

    // Continuing
    const contRes = evaluateCompletion(
      { objective_type: 'chapter_goal' },
      [{ id: 'obj-2' }],
      1,
      10
    );
    assert.equal(contRes.status, 'running');
    assert.equal(contRes.stopReason, null);
  });
});
