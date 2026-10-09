import type { Request, Response, NextFunction } from 'express';
import { aiGatewayService } from './ai-gateway.service.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { findNovelById, type NovelRecord } from '../novels/novels.repository.js';
import { findChapterById, type ChapterRecord } from '../novels/chapters.repository.js';

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

export async function getJobStatusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { jobId } = req.params;
    const userId = req.auth!.userId;
    const userRole = req.auth!.role;

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/jobs/${jobId}`,
      userId,
      requestId: req.header('x-request-id'),
    });

    // Verify resource ownership on returned job
    if (data?.novel_id) {
      await assertNovelOwnership(userId, userRole, data.novel_id);
    }

    res.json(successResponse(data));
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
