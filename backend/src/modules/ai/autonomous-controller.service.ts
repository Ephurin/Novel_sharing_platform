import { approveAutonomousMemory, objectiveIsComplete, EntityReviewRequiredError } from './autonomous-memory.service.js';
import { withAutonomousRunLock } from './autonomous-run.repository.js';
import crypto from 'node:crypto';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { aiGatewayService } from './ai-gateway.service.js';
import { assertNovelOwnership } from './ai-gateway.controller.js';
import { acceptDraft } from '../novels/chapter-revisions.service.js';
import { findOutboxEventByRevisionAndType } from '../novels/outbox.repository.js';
import { assertCurrentProposalEvidence } from './proposal-evidence.service.js';
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

    if (!input.plan_id) {
      try {
        const active = await aiGatewayService.forwardRequest<{ plan_id: string }>({ method: 'GET',
          path: `/v1/story-plans/by-novel/${input.novel_id}/active`, userId: auth.userId });
        input = { ...input, plan_id: active.plan_id };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'PLAN_NOT_FOUND') throw error;
        const chapters = await listChaptersByNovelId(input.novel_id);
        const nextChapter = Math.max(0, ...chapters.map(c => c.chapterNumber)) + 1;
        const suggested = await aiGatewayService.forwardRequest<{ events: { title: string; description: string; target_chapter: number; min_words: number; ending: boolean }[] }>({
          method: 'POST', path: `/v1/story-brains/${input.novel_id}/author-operation`, userId: auth.userId,
          body: { operation: 'suggest_events', instruction: `Create a complete plan through a resolved ending. Start at chapter ${nextChapter}.` } });
        if (!suggested.events.length || !suggested.events.at(-1)?.ending || suggested.events.some(e => e.target_chapter < nextChapter)) {
          throw new AppError(422, 'INVALID_AUTOMATIC_PLAN', 'Generated plan must continue the draft and include an ending');
        }
        const plan = await aiGatewayService.forwardRequest<{ plan_id: string }>({ method: 'POST', path: '/v1/story-plans', userId: auth.userId,
          body: { novel_id: input.novel_id, source_outline: 'Automatically planned for full auto',
            objectives: suggested.events.map((e, i) => ({ order_index: i + 1, title: e.title, description: e.description,
              target_chapter: e.target_chapter, objective_type: e.ending ? 'ending' : 'chapter_goal',
              metadata: { min_words: e.min_words, is_terminal: e.ending } })) } });
        await aiGatewayService.forwardRequest({ method: 'POST', path: `/v1/story-plans/${plan.plan_id}/activate`,
          queryParams: { novel_id: input.novel_id }, body: {}, userId: auth.userId });
        input = { ...input, plan_id: plan.plan_id };
      }
    }
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
    return withAutonomousRunLock(runId, () => this.stepRunLocked(auth, runId, options));
  }

  private async stepRunLocked(auth: AuthContext, runId: string, options?: StepOptions): Promise<AutonomousRunDto> {
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
        body: { status: 'stopped', stop_reason: 'no_pending_objectives_requires_review' },
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

    let isAlreadyAccepted = false;
    let genJob: any = null;

    if (latestRev.sourceType === 'AI_DRAFT_ACCEPT' && latestRev.sourceGenerationId && latestRev.revisionId !== run.last_accepted_revision_id && eligibleObj.status === 'in_progress') {
      try {
        const existingJob = await aiGatewayService.forwardRequest<any>({
          method: 'GET',
          path: `/internal/v1/writing/generations/${latestRev.sourceGenerationId}`,
          userId: auth.userId,
        });
        if (existingJob && existingJob.status === 'completed'
          && existingJob.novel_id === run.novel_id && existingJob.chapter_id === targetChapter.chapterId
          && typeof existingJob.idempotency_key === 'string'
          && existingJob.idempotency_key.startsWith(`auto-${run.run_id}-`)) {
          genJob = existingJob;
          isAlreadyAccepted = true;
        }
      } catch {
        // Fallback to generating anew if retrieval fails
      }
    }

    if (!isAlreadyAccepted) {
      // Generate draft via P1 Writing Generation API
      const genIdempotencyKey = `auto-${run.run_id}-iter-${run.current_iteration}-try-${run.current_retries}`;
      const genPayload = {
        novel_id: run.novel_id,
        chapter_id: targetChapter.chapterId,
        revision_id: latestRev.revisionId,
        content_hash: latestRev.contentHash,
        operation: 'continuation',
        selection: {
          start: Array.from(latestRev.content).length,
          end: Array.from(latestRev.content).length,
          cursor: Array.from(latestRev.content).length,
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
    }

    if (!genJob) {
      throw new AppError(504, 'AI_SERVICE_TIMEOUT', 'Writing generation did not complete within timeout');
    }

    // Deterministic Quality Gate (Strict Fail-Closed)
    const isJobCompleted = genJob.status === 'completed';
    const isValidationPassed =
      genJob.validation_status === 'passed' &&
      (genJob.validations?.every((v: any) => v.passed) ?? true);

    const isBrainFresh =
      genJob.brain_version_used !== undefined &&
      genJob.brain_version_used !== null &&
      Number(genJob.brain_version_used) === run.last_brain_version;

    let isPatchValid = false;
    if (genJob.patch) {
      if (typeof genJob.patch.replacement === 'string') {
        const rep = genJob.patch.replacement.trim();
        const codePoints = Array.from(latestRev.content);
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
        isPatchValid = patched.length > 0 && patched !== latestRev.content.trim();
      }
    }

    const isDraftNonEmpty =
      genJob.draft === undefined ||
      genJob.draft === null ||
      (typeof genJob.draft === 'string' && genJob.draft.trim().length > 0);

    const isSimulatedFailure =
      options?.force_gate_failure === true || eligibleObj.metadata?.force_gate_failure === true;

    const qualityGatePassed =
      isJobCompleted &&
      isValidationPassed &&
      (isAlreadyAccepted || isPatchValid) &&
      isDraftNonEmpty &&
      (isAlreadyAccepted || isBrainFresh) &&
      !isSimulatedFailure;

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

    // Quality Gate Passed: Accept draft via production acceptDraft() with Crash/Recovery check
    const currentRun = await this.getRun(auth, runId);
    if (currentRun.status !== 'running') return currentRun;
    let acceptResult: any = null;
    if (isAlreadyAccepted) {
      acceptResult = { revision: latestRev };
    } else {
      acceptResult = await acceptDraft(auth, targetChapter.chapterId, {
        generationId: genJob.job_id,
      });
    }

    // Persisted analysis completion is required; an empty queue alone is ambiguous.
    try {
      await processOutboxOnce(10);
      const analysis = await findOutboxEventByRevisionAndType(undefined, acceptResult.revision.revisionId, 'INCREMENTAL_ANALYSIS');
      if (analysis && ['PENDING', 'PROCESSING'].includes(analysis.status)) {
        return aiGatewayService.forwardRequest<AutonomousRunDto>({ method: 'PATCH', path: `/v1/autonomous/runs/${runId}`,
          body: { stop_reason: 'waiting_for_memory_extraction', current_objective_id: currentObjectiveId,
            current_chapter_id: targetChapter.chapterId, last_generation_id: genJob.job_id }, userId: auth.userId });
      }
      if (!analysis || analysis.status !== 'COMPLETED') throw new Error('Analysis has not completed');
      await approveAutonomousMemory(acceptResult.revision.revisionId, {
        analysisStatus: async () => analysis.status,
        entityReviews: () => aiGatewayService.forwardRequest<{ revision_id: string }[]>({ method: 'GET',
          path: `/v1/story-brains/${run.novel_id}/entity-reviews`, userId: auth.userId }),
        brainVersion: async () => (await aiGatewayService.forwardRequest<{ brain_version: number }>({ method: 'GET',
          path: `/v1/story-brains/by-novel/${run.novel_id}`, userId: auth.userId })).brain_version,
        proposals: () => aiGatewayService.forwardRequest({ method: 'GET',
          path: `/v1/story-brains/${run.novel_id}/review-queue`, userId: auth.userId }),
        assertCurrent: ids => assertCurrentProposalEvidence(run.novel_id, ids, auth.userId),
        accept: async (gid, ids, version) => (await aiGatewayService.forwardRequest<{ brain_version: number }>({ method: 'POST',
          path: `/v1/proposal-groups/${gid}/accept`, body: { proposal_ids: ids,
            expected_brain_version: version, reason: 'autonomous_loop_auto_advance' }, userId: auth.userId })).brain_version,
      });
    } catch (error) {
      if (error instanceof EntityReviewRequiredError) {
        return aiGatewayService.forwardRequest<AutonomousRunDto>({ method: 'PATCH', path: `/v1/autonomous/runs/${runId}`,
          body: { stop_reason: 'waiting_for_entity_review', current_objective_id: currentObjectiveId,
            current_chapter_id: targetChapter.chapterId, last_generation_id: genJob.job_id }, userId: auth.userId });
      }
      const retries = run.current_retries + 1;
      return aiGatewayService.forwardRequest<AutonomousRunDto>({ method: 'PATCH', path: `/v1/autonomous/runs/${runId}`,
        body: { status: retries >= run.max_retries_per_objective ? 'failed' : 'running',
          stop_reason: 'memory_update_incomplete', current_retries: retries,
          current_objective_id: currentObjectiveId, current_chapter_id: targetChapter.chapterId,
          last_generation_id: genJob.job_id }, userId: auth.userId });
    }

    // Fetch advanced Story Brain version
    const brainRes = await aiGatewayService.forwardRequest<any>({
      method: 'GET',
      path: `/v1/story-brains/by-novel/${run.novel_id}`,
      userId: auth.userId,
    });
    const updatedBrainVersion = Number(brainRes?.brain_version || brainRes?.metadata?.brain_version || run.last_brain_version);

    const terminal = eligibleObj.metadata?.is_terminal === true || ['ending', 'terminal'].includes(eligibleObj.objective_type)
      || !objectives.some(o => o.objective_id !== currentObjectiveId && ['pending', 'in_progress'].includes(o.status));
    const minWords = Number(eligibleObj.metadata?.min_words ?? 1000);
    const achieved = await objectiveIsComplete(acceptResult.revision.content, minWords, terminal, () =>
      aiGatewayService.forwardRequest<{ achieved: boolean; ending_resolved: boolean }>({ method: 'POST',
        path: `/v1/story-brains/${run.novel_id}/author-operation`, userId: auth.userId,
        body: { operation: 'evaluate_objective', content: acceptResult.revision.content,
          revision_id: acceptResult.revision.revisionId, objective: `${eligibleObj.title}: ${eligibleObj.description}` } }));
    if (!achieved) {
      const exhausted = run.current_iteration + 1 >= run.max_iterations;
      return aiGatewayService.forwardRequest<AutonomousRunDto>({ method: 'PATCH', path: `/v1/autonomous/runs/${runId}`,
        body: { current_iteration: run.current_iteration + 1, current_retries: 0,
          current_objective_id: currentObjectiveId, current_chapter_id: targetChapter.chapterId,
          last_generation_id: genJob.job_id, last_accepted_revision_id: acceptResult.revision.revisionId,
          last_brain_version: updatedBrainVersion, status: exhausted ? 'stopped' : 'running',
          stop_reason: exhausted ? 'max_iterations_reached' : 'objective_needs_more_prose' }, userId: auth.userId });
    }

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

    if (isTerminal && remainingObjectives.length === 0) {
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
      if (currentRun.status !== 'running' || currentRun.stop_reason === 'waiting_for_entity_review') {
        break;
      }
    }

    return { run: currentRun, iterations_executed: iterations };
  }
}

export const autonomousControllerService = new AutonomousControllerService();
