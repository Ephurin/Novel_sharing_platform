import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  checkContent,
  createUserReport,
  getModerationReview,
  listModerationReviews,
  resolveModerationReview
} from './content-control.service.js';
import {
  listModerationEscalations,
  resolveModerationEscalation
} from './moderation-escalations.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const checkContentController: RequestHandler = async (request, response, next) => {
  try {
    const result = await checkContent(request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const createReportController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createUserReport(requireRequestAuth(request), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listReviewsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listModerationReviews(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const getReviewController: RequestHandler = async (request, response, next) => {
  try {
    const { reviewId, reviewSlug } = request.params;
    const result = await getModerationReview(String(reviewSlug ?? reviewId), requireRequestAuth(request), Boolean(reviewSlug));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const resolveReviewController: RequestHandler = async (request, response, next) => {
  try {
    const result = await resolveModerationReview(
      requireRequestAuth(request),
      String(request.params.reviewId),
      request.body
    );
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listEscalationsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listModerationEscalations(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const resolveEscalationController: RequestHandler = async (request, response, next) => {
  try {
    const result = await resolveModerationEscalation(
      requireRequestAuth(request),
      String(request.params.escalationId),
      request.body
    );
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
