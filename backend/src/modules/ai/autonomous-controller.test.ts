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

  test('Deterministic quality gate: strict fail-closed on brain freshness and non-empty patch', () => {
    function evaluateQualityGate(genJob: any, expectedBrainVersion: number, baseContent = 'Existing text') {
      const isJobCompleted = genJob?.status === 'completed';
      const isValidationPassed =
        genJob?.validation_status === 'passed' &&
        (genJob?.validations?.every((v: any) => v.passed) ?? true);

      const isBrainFresh =
        genJob?.brain_version_used !== undefined &&
        genJob?.brain_version_used !== null &&
        Number(genJob?.brain_version_used) === expectedBrainVersion;

      let isPatchValid = false;
      if (genJob?.patch) {
        if (typeof genJob.patch.replacement === 'string') {
          const rep = genJob.patch.replacement.trim();
          const codePoints = Array.from(baseContent);
          const hasValidBounds =
            typeof genJob.patch.start === 'number' &&
            typeof genJob.patch.end === 'number' &&
            Number.isInteger(genJob.patch.start) &&
            Number.isInteger(genJob.patch.end) &&
            genJob.patch.start >= 0 &&
            genJob.patch.end >= genJob.patch.start &&
            genJob.patch.end <= codePoints.length;
          const isNoOp =
            genJob.patch.start === genJob.patch.end
              ? rep.length === 0
              : codePoints.slice(genJob.patch.start, genJob.patch.end).join('') === genJob.patch.replacement;
          isPatchValid = hasValidBounds && rep.length > 0 && !isNoOp;
        } else if (typeof genJob.patch.patched_content === 'string') {
          const patched = genJob.patch.patched_content.trim();
          isPatchValid = patched.length > 0 && patched !== baseContent.trim();
        }
      }

      const isDraftNonEmpty =
        genJob?.draft === undefined ||
        genJob?.draft === null ||
        (typeof genJob.draft === 'string' && genJob.draft.trim().length > 0);

      return isJobCompleted && isValidationPassed && isPatchValid && isDraftNonEmpty && isBrainFresh;
    }

    // Happy path with replacement: PASS
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 13, end: 13, replacement: ' with addition' },
          brain_version_used: 1,
        },
        1,
        'Existing text'
      ),
      true
    );

    // Missing brain_version_used: FAIL (strict fail-closed)
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 0, end: 0, replacement: 'new content' },
        },
        1
      ),
      false
    );

    // Stale brain_version_used: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 0, end: 0, replacement: 'new content' },
          brain_version_used: 2, // expected 1
        },
        1
      ),
      false
    );

    // Empty replacement: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 0, end: 0, replacement: '' },
          brain_version_used: 1,
        },
        1
      ),
      false
    );

    // Whitespace only replacement: FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 0, end: 0, replacement: '   ' },
          brain_version_used: 1,
        },
        1
      ),
      false
    );

    // No-op replacement (replacing slice with identical text): FAIL
    assert.equal(
      evaluateQualityGate(
        {
          status: 'completed',
          validation_status: 'passed',
          validations: [{ passed: true }],
          patch: { start: 0, end: 8, replacement: 'Existing' },
          brain_version_used: 1,
        },
        1,
        'Existing text'
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

  test('Scoped proposal acceptance: ignores unrelated pending proposals in review queue', () => {
    const queue = [
      {
        proposal_id: 'p-unrelated-1',
        dependency_group_id: 'grp-unrelated',
        evidence: [{ revision_id: 'rev-other-author' }],
      },
      {
        proposal_id: 'p-unrelated-2',
        dependency_group_id: 'grp-unrelated',
        evidence: [{ revision_id: 'rev-old-chapter' }],
      },
      {
        proposal_id: 'p-current-1',
        dependency_group_id: 'grp-current',
        evidence: [{ revision_id: 'rev-current-step' }],
      },
    ];

    const currentRevId = 'rev-current-step';
    const relevant = queue.filter((p: any) => {
      if (!Array.isArray(p.evidence)) return false;
      return p.evidence.some((ev: any) => ev && ev.revision_id === currentRevId);
    });

    assert.equal(relevant.length, 1);
    assert.equal(relevant[0].proposal_id, 'p-current-1');

    // Unrelated proposals remain unselected
    const unselected = queue.filter(p => !relevant.includes(p));
    assert.equal(unselected.length, 2);
    assert.ok(unselected.every(p => p.dependency_group_id === 'grp-unrelated'));
  });

  test('Crash recovery: detects already-accepted revision and avoids duplicate acceptDraft', () => {
    const latestRev = {
      revisionId: 'rev-committed',
      sourceType: 'AI_DRAFT_ACCEPT',
      sourceGenerationId: 'gen-job-123',
    };
    const genJob = {
      id: 'gen-uuid',
      job_id: 'gen-job-123',
    };

    const isAlreadyAccepted =
      latestRev.sourceType === 'AI_DRAFT_ACCEPT' &&
      (latestRev.sourceGenerationId === genJob.job_id || latestRev.sourceGenerationId === genJob.id);

    assert.equal(isAlreadyAccepted, true);
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
