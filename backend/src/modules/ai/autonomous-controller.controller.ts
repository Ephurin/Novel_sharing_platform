import type { Request, Response, NextFunction } from 'express';
import { autonomousControllerService } from './autonomous-controller.service.js';
import { successResponse } from '../../core/response/response.js';
import { AppError } from '../../core/errors/app-error.js';

export async function createAutonomousRunController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { novel_id, plan_id, max_iterations, max_retries_per_objective, idempotency_key } = req.body;

    if (!novel_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'novel_id is required');
    }

    const run = await autonomousControllerService.createRun(auth, {
      novel_id,
      plan_id,
      max_iterations: max_iterations !== undefined ? Number(max_iterations) : undefined,
      max_retries_per_objective:
        max_retries_per_objective !== undefined ? Number(max_retries_per_objective) : undefined,
      idempotency_key,
    });

    res.status(201).json(successResponse(run));
  } catch (error) {
    next(error);
  }
}

export async function getAutonomousRunController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { runId } = req.params;

    const run = await autonomousControllerService.getRun(auth, String(runId));
    res.json(successResponse(run));
  } catch (error) {
    next(error);
  }
}

export async function getActiveAutonomousRunController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { novelId } = req.params;

    const run = await autonomousControllerService.getActiveRun(auth, String(novelId));
    res.json(successResponse(run));
  } catch (error) {
    next(error);
  }
}

export async function stepAutonomousRunController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { runId } = req.params;
    const force_gate_failure = req.body?.force_gate_failure === true || req.query?.force_gate_failure === 'true';

    const run = await autonomousControllerService.stepRun(auth, String(runId), { force_gate_failure });
    res.json(successResponse(run));
  } catch (error) {
    next(error);
  }
}

export async function runAutonomousController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { runId } = req.params;
    const maxSteps = req.body?.max_steps ? Number(req.body.max_steps) : 10;

    const result = await autonomousControllerService.executeLoop(auth, String(runId), maxSteps);
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
}

export async function stopAutonomousRunController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.auth!;
    const { runId } = req.params;
    const reason = req.body?.reason || 'cancelled_by_user';

    const run = await autonomousControllerService.stopRun(auth, String(runId), reason);
    res.json(successResponse(run));
  } catch (error) {
    next(error);
  }
}
