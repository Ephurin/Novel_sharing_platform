import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { successResponse } from '../../core/response/response.js';
import { requireModeratorOperational } from '../moderator/moderator-access.js';
import { caseParams, decisionBody, nominationBody, nominationKey, novelParams, pageQuery, supplementBody, supplementParams } from './novel-selection.schemas.js';
import { decide, getAuthorSelection, getReview, getReviewChapter, listOwnNominations, listSelectionReviews, nominate, requireSelectionEnabled, supplement } from './novel-selection.service.js';

function auth(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
  return request.auth;
}

function respond(handler: (request: Request) => Promise<unknown>): RequestHandler {
  return async (request, response, next) => {
    try {
      response.json(successResponse(await handler(request)));
    } catch (error) {
      next(error);
    }
  };
}

const enabled: RequestHandler = (_request, _response, next) => {
  requireSelectionEnabled();
  next();
};
const reviewer = [enabled, requireAuth, requireModeratorOperational('selection.review')];

export const novelSelectionRoutes = Router();
novelSelectionRoutes.post('/novels/:novelId/nominations', enabled, requireAuth, async (request, response, next) => {
  try {
    const { novelId } = novelParams.parse(request.params);
    const { reason } = nominationBody.parse(request.body);
    const key = nominationKey.parse(request.get('Idempotency-Key'));
    const { created, ...result } = await nominate(auth(request), novelId, reason, key);
    response.status(created ? 201 : 200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
});
novelSelectionRoutes.get('/account/nominations', enabled, requireAuth, respond((request) =>
  listOwnNominations(auth(request).userId, pageQuery.parse(request.query))));
novelSelectionRoutes.get('/author/novels/:novelId/selection', enabled, requireAuth, respond((request) =>
  getAuthorSelection(auth(request), novelParams.parse(request.params).novelId)));
novelSelectionRoutes.post('/novels/:novelId/selections/:caseId/supplement', enabled, requireAuth, respond((request) => {
  const { novelId, caseId } = supplementParams.parse(request.params);
  const { notes, expectedVersion } = supplementBody.parse(request.body);
  return supplement(auth(request), novelId, caseId, notes, expectedVersion);
}));
novelSelectionRoutes.get('/moderator/selections', ...reviewer, respond((request) =>
  listSelectionReviews(auth(request).userId, pageQuery.parse(request.query))));
novelSelectionRoutes.get('/moderator/selections/:caseId', ...reviewer, respond((request) =>
  getReview(auth(request), caseParams.parse(request.params).caseId)));
novelSelectionRoutes.get('/moderator/selections/:caseId/chapters/:chapterId', ...reviewer, respond((request) => {
  const { caseId, chapterId } = caseParams.extend({ chapterId: z.string().uuid() }).parse(request.params);
  return getReviewChapter(auth(request), caseId, chapterId);
}));
novelSelectionRoutes.post('/moderator/selections/:caseId/decisions', ...reviewer, respond((request) =>
  decide(auth(request), caseParams.parse(request.params).caseId, decisionBody.parse(request.body))));
