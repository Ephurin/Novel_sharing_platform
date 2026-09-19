import type { Request, Response, NextFunction } from 'express';
import { aiGatewayService } from './ai-gateway.service.js';
import { successResponse } from '../../core/response/response.js';

export async function getContextPreviewController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { storyBrainId } = req.params;
    const queryParams: Record<string, string | number | undefined> = {};
    if (req.query.chapter_number !== undefined) queryParams.chapter_number = Number(req.query.chapter_number);
    if (req.query.chapterNumber !== undefined) queryParams.chapter_number = Number(req.query.chapterNumber);
    if (req.query.character_name !== undefined) queryParams.character_name = String(req.query.character_name);
    if (req.query.characterName !== undefined) queryParams.character_name = String(req.query.characterName);
    if (req.query.token_budget !== undefined) queryParams.token_budget = Number(req.query.token_budget);
    if (req.query.tokenBudget !== undefined) queryParams.token_budget = Number(req.query.tokenBudget);

    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/${storyBrainId}/context-preview`,
      userId: req.auth?.userId,
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
    const body = {
      ...req.body,
      actor_id: req.auth?.userId,
    };

    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/writing/generations',
      body,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/jobs/${jobId}`,
      userId: req.auth?.userId,
      requestId: req.header('x-request-id'),
    });

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
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: '/v1/story-brains/bootstrap/from-manuscript',
      body: req.body,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/${novelId}/review-queue`,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'GET',
      path: `/v1/story-brains/by-novel/${novelId}`,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposal-groups/${groupId}/accept`,
      body: req.body,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposals/${proposalId}/reject`,
      body: req.body,
      userId: req.auth?.userId,
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
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/story-brains/${novelId}/baseline/activate`,
      body: req.body,
      userId: req.auth?.userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}

export async function decideProposalController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { proposalId } = req.params;
    const data = await aiGatewayService.forwardRequest({
      method: 'POST',
      path: `/v1/proposals/${proposalId}/decision`,
      body: req.body,
      userId: req.auth?.userId,
      requestId: req.header('x-request-id'),
    });

    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
}
