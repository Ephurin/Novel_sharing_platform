import crypto from 'node:crypto';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { aiGatewayService } from './ai-gateway.service.js';
import { assertNovelOwnership } from './ai-gateway.controller.js';
import { acceptDraft } from '../novels/chapter-revisions.service.js';
import { processOutboxOnce } from '../../jobs/outbox-processor.js';
import {
  createChapter,
  listChaptersByNovelId,
  type ChapterRecord,
} from '../novels/chapters.repository.js';
import {
  findLatestRevisionByChapterId,
  insertRevision,
  type ChapterRevisionRecord,
} from '../novels/chapter-revisions.repository.js';

export interface AutonomousRunDto {
  run_id: string;
  novel_id: string;
  tenant_id: string;
  plan_id: string;
  plan_version: number;
  status: 'queued' | 'running' | 'completed' | 'stopped' | 'failed';
  current_objective_id: string | null;
  current_chapter_id: string | null;
  current_iteration: number;
  max_iterations: number;
  current_retries: number;
  max_retries_per_objective: number;
  last_generation_id: string | null;
  last_accepted_revision_id: string | null;
  last_brain_version: number;
  stop_reason: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepOptions {
  force_gate_failure?: boolean;
}

export class AutonomousControllerService {
  async createRun(
    auth: AuthContext,
    input: {
      novel_id: string;
      plan_id?: string;
      max_iterations?: number;
      max_retries_per_objective?: number;
      idempotency_key?: string;
    }
  ): Promise<AutonomousRunDto> {
    if (!input.novel_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    await assertNovelOwnership(auth.userId, auth.role, input.novel_id);

    return await aiGatewayService.forwardRequest<AutonomousRunDto>({
      method: 'POST',
      path: '/v1/autonomous/runs',
      body: input,
      userId: auth.userId,
    });
  }

  async getRun(auth: AuthContext, runId: string): Promise<AutonomousRunDto> {
    const run = await aiGatewayService.forwardRequest<AutonomousRunDto>({
      method: 'GET',
      path: `/v1/autonomous/runs/${runId}`,
      userId: auth.userId,
    });

    if (!run) {
      throw new AppError(404, 'RUN_NOT_FOUND', `AutonomousRun ${runId} not found`);
    }

    await assertNovelOwnership(auth.userId, auth.role, run.novel_id);
    return run;
  }

  async getActiveRun(auth: AuthContext, novelId: string): Promise<AutonomousRunDto> {
    await assertNovelOwnership(auth.userId, auth.role, novelId);

    return await aiGatewayService.forwardRequest<AutonomousRunDto>({
      method: 'GET',
      path: `/v1/autonomous/by-novel/${novelId}/active`,
      userId: auth.userId,
    });
  }

  async stopRun(auth: AuthContext, runId: string, reason = 'cancelled_by_user'): Promise<AutonomousRunDto> {
    const run = await this.getRun(auth, runId);
    await assertNovelOwnership(auth.userId, auth.role, run.novel_id);

    return await aiGatewayService.forwardRequest<AutonomousRunDto>({
      method: 'POST',
      path: `/v1/autonomous/runs/${runId}/stop`,
      body: { reason },
      userId: auth.userId,
    });
  }

  async stepRun(auth: AuthContext, runId: string, options?: StepOptions): Promise<AutonomousRunDto> {
    const run = await this.getRun(auth, runId);
    await assertNovelOwnership(auth.userId, auth.role, run.novel_id);

    // Terminal guard: no operations on finished runs
    if (run.status === 'completed' || run.status === 'stopped' || run.status === 'failed') {
      return run;
    }

    // Safety bounds
    if (run.current_iteration >= run.max_iterations) {
      return await aiGatewayService.forwardRequest<AutonomousRunDto>({
        method: 'PATCH',
        path: `/v1/autonomous/runs/${runId}`,
        body: { status: 'stopped', stop_reason: 'max_iterations_reached' },
        userId: auth.userId,
      });
    }

    if (run.current_retries >= run.max_retries_per_objective) {
      return await aiGatewayService.forwardRequest<AutonomousRunDto>({
        method: 'PATCH',
        path: `/v1/autonomous/runs/${runId}`,
        body: { status: 'failed', stop_reason: 'max_retries_exceeded' },
        userId: auth.userId,
      });
    }

    // Fetch Story Plan & pin plan_version
    const plan = await aiGatewayService.forwardRequest<any>({
      method: 'GET',
      path: `/v1/story-plans/${run.plan_id}`,
      userId: auth.userId,
    });
    if (!plan) {
      throw new AppError(404, 'PLAN_NOT_FOUND', `StoryPlan ${run.plan_id} not found`);
    }
    if (plan.plan_version !== run.plan_version) {
      throw new AppError(
        409,
        'PLAN_VERSION_CONFLICT',
        `StoryPlan version ${plan.plan_version} does not match pinned run version ${run.plan_version}`
      );
    }

    // Select eligible objective deterministically
    const objectives: any[] = [...(plan.objectives || [])].sort((a, b) => a.order_index - b.order_index);
    const eligibleObj = objectives.find(o => o.status === 'pending' || o.status === 'in_progress');

    if (!eligibleObj) {
      // Intentional completion: No eligible objectives remain
      return await aiGatewayService.forwardRequest<AutonomousRunDto>({
        method: 'PATCH',
        path: `/v1/autonomous/runs/${runId}`,
        body: { status: 'completed', stop_reason: 'all_objectives_completed' },
        userId: auth.userId,
      });
    }

    const currentObjectiveId = eligibleObj.objective_id;
    if (eligibleObj.status === 'pending') {
      await aiGatewayService.forwardRequest({
        method: 'PATCH',
        path: `/v1/story-plans/${run.plan_id}/objectives/${currentObjectiveId}`,
        queryParams: { novel_id: run.novel_id },
        body: { status: 'in_progress' },
        userId: auth.userId,
      });
    }

    // Determine target chapter
    const chapters = await listChaptersByNovelId(run.novel_id);
    let targetChapter = eligibleObj.target_chapter
      ? chapters.find(c => c.chapterNumber === eligibleObj.target_chapter)
      : chapters[chapters.length - 1];

    if (!targetChapter) {
      const pool = getPostgresPool();
      targetChapter = await createChapter(pool, {
        novelId: run.novel_id,
        title: eligibleObj.title || `Chương ${eligibleObj.target_chapter || 1}`,
        chapterNumber: eligibleObj.target_chapter || 1,
        wordCount: 0,
        isVip: false,
        priceCoins: 0,
      });
    }

    // Determine latest revision
    let latestRev = await findLatestRevisionByChapterId(undefined, targetChapter.chapterId);
    if (!latestRev) {
      const pool = getPostgresPool();
      const initialContent = '';
      latestRev = await insertRevision(pool, {
        novelId: run.novel_id,
        chapterId: targetChapter.chapterId,
        content: initialContent,
        contentHash: crypto.createHash('sha256').update(initialContent).digest('hex'),
        wordCount: 0,
        sourceType: 'AUTHOR_MANUAL',
        createdBy: auth.userId,
      });
    }

    // Generate draft via P1 Writing Generation API
    const genIdempotencyKey = `auto-${run.run_id}-iter-${run.current_iteration}-try-${run.current_retries}`;
    const genPayload = {
      novel_id: run.novel_id,
      chapter_id: targetChapter.chapterId,
      revision_id: latestRev.revisionId,
      content_hash: latestRev.contentHash,
      operation: 'continuation',
      selection: {
        start: latestRev.content.length,
        end: latestRev.content.length,
        cursor: latestRev.content.length,
      },
      instruction: `Thực hiện mục tiêu cốt truyện: ${eligibleObj.title}. ${eligibleObj.description}`,
      expected_brain_version: run.last_brain_version,
      chapter_number: targetChapter.chapterNumber,
      actor_id: auth.userId,
      idempotency_key: genIdempotencyKey,
    };

    const initialGen = await aiGatewayService.forwardRequest<any>({
      method: 'POST',
      path: '/v1/writing/generations',
      body: genPayload,
      userId: auth.userId,
    });

    const genJobId = initialGen?.job_id;
    if (!genJobId) {
      throw new AppError(502, 'AI_SERVICE_ERROR', 'Writing generation failed to return job_id');
    }

    // Poll for generation completion (internal API)
    let genJob: any = null;
    for (let i = 0; i < 25; i++) {
      try {
        const fetched = await aiGatewayService.forwardRequest<any>({
          method: 'GET',
          path: `/internal/v1/writing/generations/${genJobId}`,
          userId: auth.userId,
        });
        if (fetched && (fetched.status === 'completed' || fetched.status === 'failed')) {
          genJob = fetched;
          break;
        }
      } catch {
        // Retry
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!genJob) {
      throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Writing generation did not complete within timeout');
    }

    // Deterministic Quality Gate
    const isJobCompleted = genJob.status === 'completed';
    const isValidationPassed =
      genJob.validation_status === 'passed' &&
      (genJob.validations?.every((v: any) => v.passed) ?? true);
    const isPatchValid =
      !!genJob.patch &&
      ((typeof genJob.patch.replacement === 'string' &&
        typeof genJob.patch.start === 'number' &&
        typeof genJob.patch.end === 'number') ||
        (typeof genJob.patch.patched_content === 'string' &&
          genJob.patch.patched_content.length >= latestRev.content.length));
    const isBrainFresh = !genJob.brain_version_used || genJob.brain_version_used === run.last_brain_version;
    const isSimulatedFailure =
      options?.force_gate_failure === true || eligibleObj.metadata?.force_gate_failure === true;

    const qualityGatePassed = isJobCompleted && isValidationPassed && isPatchValid && isBrainFresh && !isSimulatedFailure;

    if (!qualityGatePassed) {
      // Quality Gate Failed: Bounded retry, DO NOT mutate canon, DO NOT mutate plan progress
      const nextRetries = run.current_retries + 1;
      const isExceeded = nextRetries >= run.max_retries_per_objective;
      const newStatus = isExceeded ? 'failed' : 'running';
      const stopReason = isExceeded ? 'max_retries_exceeded' : 'quality_gate_failed_retry_scheduled';

      return await aiGatewayService.forwardRequest<AutonomousRunDto>({
        method: 'PATCH',
        path: `/v1/autonomous/runs/${runId}`,
        body: {
          current_retries: nextRetries,
          status: newStatus,
          stop_reason: stopReason,
          last_generation_id: genJob.job_id,
          current_objective_id: currentObjectiveId,
          current_chapter_id: targetChapter.chapterId,
        },
        userId: auth.userId,
      });
    }

    // Quality Gate Passed: Accept draft via production acceptDraft()
    const acceptResult = await acceptDraft(auth, targetChapter.chapterId, {
      generationId: genJob.job_id,
    });

    // Process outbox to advance Story Brain
    await processOutboxOnce(10);

    // If incremental analysis produced proposals in the review queue, auto-accept them to advance Story Brain
    try {
      const queue = await aiGatewayService.forwardRequest<any[]>({
        method: 'GET',
        path: `/v1/story-brains/${run.novel_id}/review-queue`,
        userId: auth.userId,
      });

      if (Array.isArray(queue) && queue.length > 0) {
        const groupIds = Array.from(new Set(queue.map(p => p.dependency_group_id).filter(Boolean)));
        let currentBv = run.last_brain_version;
        for (const gid of groupIds) {
          const groupProposals = queue.filter(p => p.dependency_group_id === gid);
          try {
            const acceptRes: any = await aiGatewayService.forwardRequest({
              method: 'POST',
              path: `/v1/proposal-groups/${gid}/accept`,
              body: {
                proposal_ids: groupProposals.map(p => p.proposal_id),
                expected_brain_version: currentBv,
                reason: 'autonomous_loop_auto_advance',
              },
              userId: auth.userId,
            });
            if (acceptRes?.brain_version) {
              currentBv = acceptRes.brain_version;
            } else {
              currentBv += 1;
            }
          } catch (accErr) {
            console.warn(`[AutonomousController] Auto-accept group ${gid} note:`, accErr);
          }
        }
      }
    } catch (queueErr) {
      console.warn('[AutonomousController] Review queue auto-advance warning:', queueErr);
    }

    // Fetch advanced Story Brain version
    const brainRes = await aiGatewayService.forwardRequest<any>({
      method: 'GET',
      path: `/v1/story-brains/by-novel/${run.novel_id}`,
      userId: auth.userId,
    });
    const updatedBrainVersion = Number(brainRes?.brain_version || brainRes?.metadata?.brain_version || run.last_brain_version);

    // Advance Plan Progress: mark current objective completed
    await aiGatewayService.forwardRequest({
      method: 'PATCH',
      path: `/v1/story-plans/${run.plan_id}/objectives/${currentObjectiveId}`,
      queryParams: { novel_id: run.novel_id },
      body: { status: 'completed' },
      userId: auth.userId,
    });

    // Evaluate Intentional Completion Gate
    const isTerminal =
      eligibleObj.metadata?.is_terminal === true ||
      eligibleObj.objective_type === 'ending' ||
      eligibleObj.objective_type === 'terminal';

    const remainingObjectives = objectives.filter(
      o => o.objective_id !== currentObjectiveId && (o.status === 'pending' || o.status === 'in_progress')
    );

    let nextStatus: 'running' | 'completed' | 'stopped' = 'running';
    let stopReason: string | null = null;

    if (isTerminal) {
      nextStatus = 'completed';
      stopReason = 'terminal_objective_completed';
    } else if (remainingObjectives.length === 0) {
      nextStatus = 'completed';
      stopReason = 'all_objectives_completed';
    } else if (run.current_iteration + 1 >= run.max_iterations) {
      nextStatus = 'stopped';
      stopReason = 'max_iterations_reached';
    }

    // Persist updated durable run state
    return await aiGatewayService.forwardRequest<AutonomousRunDto>({
      method: 'PATCH',
      path: `/v1/autonomous/runs/${runId}`,
      body: {
        current_iteration: run.current_iteration + 1,
        current_retries: 0,
        current_objective_id: currentObjectiveId,
        current_chapter_id: targetChapter.chapterId,
        last_generation_id: genJob.job_id,
        last_accepted_revision_id: acceptResult.revision.revisionId,
        last_brain_version: updatedBrainVersion,
        status: nextStatus,
        stop_reason: stopReason,
      },
      userId: auth.userId,
    });
  }

  async executeLoop(
    auth: AuthContext,
    runId: string,
    maxSteps = 10
  ): Promise<{ run: AutonomousRunDto; iterations_executed: number }> {
    let currentRun = await this.getRun(auth, runId);
    let iterations = 0;

    while (currentRun.status === 'running' && iterations < maxSteps) {
      currentRun = await this.stepRun(auth, runId);
      iterations++;
      if (currentRun.status !== 'running') {
        break;
      }
    }

    return { run: currentRun, iterations_executed: iterations };
  }
}

export const autonomousControllerService = new AutonomousControllerService();
