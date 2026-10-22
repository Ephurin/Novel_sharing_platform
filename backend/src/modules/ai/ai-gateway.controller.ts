import type { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { aiGatewayService } from './ai-gateway.service.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { findNovelById, type NovelRecord } from '../novels/novels.repository.js';
import { findChapterById, type ChapterRecord } from '../novels/chapters.repository.js';
import { assertCurrentProposalEvidence } from './proposal-evidence.service.js';
import { listLatestChapterAnalysis } from '../novels/outbox.repository.js';
import { findRevisionById, findLatestRevisionByChapterId } from '../novels/chapter-revisions.repository.js';

export async function entityGuidanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const data = await aiGatewayService.forwardRequest({ method: req.method === 'GET' ? 'GET' : 'POST',
      path: `/v1/story-brains/${novelId}/entity-guidance`, userId: req.auth!.userId,
      ...(req.method === 'GET' ? {} : { body: req.body }) });
    res.json(successResponse(data));
  } catch (error) { next(error); }
}

export async function authorEntityController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const data = await aiGatewayService.forwardRequest({ method: 'POST',
      path: `/v1/story-brains/${novelId}/author-entities`, body: req.body, userId: req.auth!.userId });
    res.status(201).json(successResponse(data));
  } catch (error) { next(error); }
}

export async function entityReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const base = `/v1/story-brains/${novelId}/entity-reviews`;
    if (req.method === 'GET') {
      res.json(successResponse(await aiGatewayService.forwardRequest({ method: 'GET', path: base,
        userId: req.auth!.userId })));
      return;
    }
    const runId = String(req.params.runId);
    if (!/^[a-f0-9-]{36}$/i.test(runId)) throw new AppError(400, 'INVALID_RUN_ID', 'Invalid analysis run');
    const audit = await aiGatewayService.forwardRequest<{ revision_id: string; chapter_id: string }>({ method: 'GET',
      path: `/v1/story-brains/${novelId}/entity-candidate-audits/${runId}`, userId: req.auth!.userId });
    const revision = await findRevisionById(undefined, audit.revision_id);
    const head = revision && await findLatestRevisionByChapterId(undefined, revision.chapterId);
    if (!revision || revision.novelId !== novelId || revision.chapterId !== audit.chapter_id ||
        head?.revisionId !== revision.revisionId) {
      throw new AppError(409, 'STALE_PROPOSAL_EVIDENCE', 'Chapter changed; extract the latest saved revision');
    }
    const action = req.path.endsWith('/review') ? 'review' : 'continue';
    const data = await aiGatewayService.forwardRequest({ method: 'POST', path: `${base}/${runId}/${action}`,
      body: req.body, userId: req.auth!.userId });
    res.json(successResponse(data));
  } catch (error) { next(error); }
}

export async function reanalyseSavedChapterController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const revision = typeof req.body.revision_id === 'string' ? await findRevisionById(undefined, req.body.revision_id) : null;
    const head = revision && await findLatestRevisionByChapterId(undefined, revision.chapterId);
    if (!revision || revision.novelId !== novelId || head?.revisionId !== revision.revisionId) {
      throw new AppError(409, 'STALE_PROPOSAL_EVIDENCE', 'Select the latest saved revision of this novel');
    }
    const requestKey = req.get('Idempotency-Key') || randomUUID();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestKey)) {
      throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Use a request identifier of at most 128 characters');
    }
    const data = await aiGatewayService.forwardRequest({ method: 'POST',
      path: `/v1/revisions/${revision.revisionId}/analyses`, userId: req.auth!.userId,
      idempotencyKey: `author-reanalysis:${createHash('sha256')
        .update(JSON.stringify([req.auth!.userId, novelId, revision.revisionId, requestKey])).digest('hex')}`,
      body: { novel_id: novelId, chapter_id: revision.chapterId, content_hash: revision.contentHash,
        operation: 'author_reanalysis', options: { extract_state_transitions: true } } });
    res.json(successResponse(data));
  } catch (error) { next(error); }
}

export async function authorMemoryProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const revision = typeof req.body.revision_id === 'string' ? await findRevisionById(undefined, req.body.revision_id) : null;
    const head = revision && await findLatestRevisionByChapterId(undefined, revision.chapterId);
    if (!revision || revision.novelId !== novelId || revision.chapterId !== req.body.chapter_id || head?.revisionId !== revision.revisionId) {
      throw new AppError(409, 'STALE_PROPOSAL_EVIDENCE', 'Choose the latest saved revision of this novel');
    }
    const data = await aiGatewayService.forwardRequest({ method: 'POST',
      path: `/v1/story-brains/${novelId}/author-proposals`, body: req.body, userId: req.auth!.userId });
    res.status(201).json(successResponse(data));
  } catch (error) { next(error); }
}

export async function extractionStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    res.json(successResponse(await listLatestChapterAnalysis(novelId)));
  } catch (error) { next(error); }
}

export async function getApprovedMemoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const data = await aiGatewayService.forwardRequest({ method: 'GET',
      path: `/v1/story-brains/${novelId}/memory`, userId: req.auth!.userId });
    res.json(successResponse(data));
  } catch (error) { next(error); }
}

export async function authorOperationController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const data = await aiGatewayService.forwardRequest({ method: 'POST',
      path: `/v1/story-brains/${novelId}/author-operation`, body: req.body, userId: req.auth!.userId });
    res.json(successResponse(data));
  } catch (error) { next(error); }
}

export async function eventCorrectionController(req: Request, res: Response, next: NextFunction) {
  try {
    const novelId = String(req.params.novelId);
    await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
    const data = await aiGatewayService.forwardRequest({ method: 'POST',
      path: `/v1/story-brains/${novelId}/events/${req.params.eventId}/corrections`, body: req.body, userId: req.auth!.userId });
    res.status(201).json(successResponse(data));
  } catch (error) { next(error); }
}

export async function assertNovelOwnership(
  userId: string,
  role: string,
  novelId: string
): Promise<NovelRecord> {
  const novel = await findNovelById(novelId);
  if (!novel) {
    throw new AppError(404, 'NOVEL_NOT_FOUND', 'Novel not found');
  }
  if (role !== 'ADMIN' && novel.authorId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this novel');
  }
  return novel;
}

export async function assertChapterOwnership(
  userId: string,
  role: string,
  chapterId: string
): Promise<{ chapter: ChapterRecord; novel: NovelRecord }> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_NOT_FOUND', 'Chapter not found');
  }
  const novel = await assertNovelOwnership(userId, role, chapter.novelId);
  return { chapter, novel };
}

export async function getContextPreviewController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { storyBrainId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    // Verify novel ownership (storyBrainId corresponds to novelId)
    await assertNovelOwnership(userId, userRole, String(storyBrainId));

    const queryParams: Record<string, string | number | undefined> = {};

    // Canonical chapter cutoff derivation:
    // If chapterId is passed, derive chapter_number from canonical DB record rather than trusting client
    const rawChapterId = req.query.chapter_id || req.query.chapterId;
    if (rawChapterId) {
      const { chapter } = await assertChapterOwnership(userId, userRole, String(rawChapterId));
      if (chapter.novelId !== storyBrainId) {
        throw new AppError(400, 'CHAPTER_MISMATCH', 'Chapter does not belong to specified story brain');
      }
      queryParams.chapter_number = chapter.chapterNumber;
    } else if (req.query.chapter_number !== undefined) {
      queryParams.chapter_number = Number(req.query.chapter_number);
    } else if (req.query.chapterNumber !== undefined) {
      queryParams.chapter_number = Number(req.query.chapterNumber);
    }

    if (req.query.character_name !== undefined) queryParams.character_name = String(req.query.character_name);
    if (req.query.characterName !== undefined) queryParams.character_name = String(req.query.characterName);
    if (req.query.token_budget !== undefined) queryParams.token_budget = Number(req.query.token_budget);
    if (req.query.tokenBudget !== undefined) queryParams.token_budget = Number(req.query.tokenBudget);

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/${storyBrainId}/context-preview`,
      userId,
      queryParams,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function startWritingGenerationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    if (!req.body.chapter_id || !req.body.novel_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'chapter_id and novel_id are required');
    }

    // Verify chapter & novel ownership
    const { chapter, novel } = await assertChapterOwnership(userId, userRole, req.body.chapter_id);
    if (chapter.novelId !== req.body.novel_id) {
      throw new AppError(400, 'CHAPTER_MISMATCH', 'Chapter does not belong to specified novel');
    }

    // Canonical chapter cutoff: derive from canonical chapter record, overwrite client-supplied cutoff
    const body = {
      ...req.body,
      chapter_number: chapter.chapterNumber,
      actor_id: userId,
    };

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/writing/generations',
      body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.status(202).json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

// Resolve scope only from the service-authenticated job lookup, never from request input.
async function getAuthorizedJob(req: Request) {
  const data = await aiGatewayService.forwardRequest<unknown>({
    method: 'GET',
    path: `/v1/jobs/${req.params.jobId}`,
    userId: req.auth!.userId,
    requestId: req.header('x-request-id'),
  });
  const novelId = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).novel_id : undefined;
  if (typeof novelId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId)) {
    throw new AppError(403, 'JOB_SCOPE_INVALID', 'Job has no valid novel scope');
  }
  await assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId);
  return data;
}

export async function getJobStatusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    res.json(successResponse(await getAuthorizedJob(req)));
  } catch (error) {
    next(error);
  }
}

export async function resumeJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await getAuthorizedJob(req);
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/jobs/${req.params.jobId}/resume`,
      userId: req.auth!.userId,
      requestId: req.header('x-request-id'),
    });
    res.status(202).json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function startManuscriptBootstrapController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    if (!req.body.novel_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    await assertNovelOwnership(userId, userRole, req.body.novel_id);

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/story-brains/bootstrap/from-manuscript',
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.status(202).json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function startIdeaBootstrapController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    if (!req.body.novel_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }
    if (!req.body.idea || typeof req.body.idea !== 'string') {
      throw new AppError(400, 'INVALID_REQUEST', 'idea is required');
    }

    await assertNovelOwnership(userId, userRole, req.body.novel_id);

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/story-brains/bootstrap/from-idea',
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.status(202).json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function getReviewQueueController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { novelId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/${novelId}/review-queue`,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function getStoryBrainSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { novelId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/by-novel/${novelId}`,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function acceptProposalGroupController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { groupId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    const resolution = await aiGatewayService.forwardRequest<{ novel_id: string; group_id: string; proposal_ids: string[] }>({
      method: 'GET',
      path: `/internal/v1/proposal-groups/${groupId}/novel`,
      userId,
      requestId: req.header('x-request-id'),
    });

    const trustedNovelId = resolution?.novel_id;
    if (!trustedNovelId) {
      throw new AppError(404, 'PROPOSAL_GROUP_NOT_FOUND', 'Proposal group not found');
    }

    await assertNovelOwnership(userId, userRole, trustedNovelId);

    await assertCurrentProposalEvidence(trustedNovelId, req.body?.proposal_ids, userId);

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposal-groups/${groupId}/accept`,
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function rejectProposalController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { proposalId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    const resolution = await aiGatewayService.forwardRequest<{ novel_id: string; proposal_id: string }>({
      method: 'GET',
      path: `/internal/v1/proposals/${proposalId}/novel`,
      userId,
      requestId: req.header('x-request-id'),
    });

    const trustedNovelId = resolution?.novel_id;
    if (!trustedNovelId) {
      throw new AppError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found');
    }

    await assertNovelOwnership(userId, userRole, trustedNovelId);

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposals/${proposalId}/reject`,
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function editAndAcceptProposalController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { proposalId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    const resolution = await aiGatewayService.forwardRequest<{ novel_id: string; proposal_id: string }>({
      method: 'GET',
      path: `/internal/v1/proposals/${proposalId}/novel`,
      userId,
      requestId: req.header('x-request-id'),
    });

    const trustedNovelId = resolution?.novel_id;
    if (!trustedNovelId) {
      throw new AppError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found');
    }

    await assertNovelOwnership(userId, userRole, trustedNovelId);

    await assertCurrentProposalEvidence(trustedNovelId, [String(proposalId)], userId);

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposals/${proposalId}/edit-and-accept`,
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}


export async function activateBaselineController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { novelId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/story-brains/${novelId}/baseline/activate`,
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function createStoryPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;
    const novelId = req.body?.novel_id;

    if (!novelId) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/story-plans',
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.status(201).json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function getActiveStoryPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { novelId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-plans/by-novel/${novelId}/active`,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function getStoryPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { planId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-plans/${planId}`,
      userId,
      requestId: req.header('x-request-id'),
    });

    if (data?.novel_id) {
      await assertNovelOwnership(userId, userRole, data.novel_id);
    }

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function activateStoryPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { planId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;
    const novelId = req.body?.novel_id || req.query?.novel_id;

    if (!novelId) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/story-plans/${planId}/activate`,
      queryParams: { novel_id: String(novelId) },
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function updateStoryPlanObjectiveController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { planId, objectiveId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;
    const novelId = req.body?.novel_id || req.query?.novel_id;

    if (!novelId) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    await assertNovelOwnership(userId, userRole, String(novelId));

    const data = await aiGatewayService.forwardRequest({
      method: 'PATCH',
      path: `/v1/story-plans/${planId}/objectives/${objectiveId}`,
      queryParams: { novel_id: String(novelId) },
      body: req.body,
      userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

