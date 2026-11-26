import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { successResponse } from '../../core/response/response.js';
import { requireModeratorOperational } from '../moderator/moderator-access.js';
import { requireAdminPermission } from '../admin/admin-access.js';
import { authorReconsiderations, listReconsiderations, resolveReconsideration, submitReconsideration } from './selection-reconsiderations.js';
import { assertPlacementAccess, cancelPlacementBody, changePlacement, createPlacement, createPlacementBody,
  featuredSelections, listPlacements, placementCandidates, updatePlacementBody } from './novel-featured-placements.js';
import { caseParams, decisionBody, nominationBody, nominationKey, novelParams, pageQuery, supplementBody, supplementParams } from './novel-selection.schemas.js';
import { decide, getAuthorSelection, getReview, getReviewChapter, listOwnNominations, listSelectionReviews, nominate, requireSelectionEnabled, supplement } from './novel-selection.service.js';

function auth(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
  return request.auth;
}

function respond(handler: (request: Request) => Promise<unknown>, status = 200): RequestHandler {
  return async (request, response, next) => {
    try {
      response.status(status).json(successResponse(await handler(request)));
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
const adminReviewer = [enabled, requireAuth, requireRoles(['ADMIN']), requireAdminPermission('selection.reconsider')];
const reconsiderationReason = z.string().trim().min(1).max(2000);
const reconsiderationVersion = z.number().int().positive();

export const novelSelectionRoutes = Router();
novelSelectionRoutes.get('/reading/featured-selections', (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  return respond(featuredSelections)(_request, response, next);
});
novelSelectionRoutes.get('/moderator/placements', requireAuth, respond(async request => {
  const actor = auth(request);
  await assertPlacementAccess(actor);
  const { page, limit } = pageQuery.parse(request.query);
  return listPlacements(actor.userId, page, limit);
}));
novelSelectionRoutes.post('/moderator/placements', requireAuth, async (request, response, next) => {
  try {
    const actor = auth(request);
    await assertPlacementAccess(actor);
    const { placement, created } = await createPlacement(actor, createPlacementBody.parse(request.body),
      nominationKey.parse(request.get('Idempotency-Key')));
    response.status(created ? 201 : 200).json(successResponse(placement));
  } catch (error) { next(error); }
});
novelSelectionRoutes.get('/moderator/placements/candidates', requireAuth, respond(async request => {
  const actor = auth(request);
  await assertPlacementAccess(actor);
  return placementCandidates(actor.userId, z.object({ q: z.string().trim().max(150).default('') }).parse(request.query).q);
}));
const placementParams = z.object({ placementId: z.string().uuid() });
novelSelectionRoutes.patch('/moderator/placements/:placementId', requireAuth, respond(request =>
  changePlacement(auth(request), placementParams.parse(request.params).placementId,
    { kind: 'priority', ...updatePlacementBody.parse(request.body) })));
novelSelectionRoutes.delete('/moderator/placements/:placementId', requireAuth, respond(request =>
  changePlacement(auth(request), placementParams.parse(request.params).placementId,
    { kind: 'cancel', ...cancelPlacementBody.parse(request.body) })));
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
novelSelectionRoutes.get('/author/novels/:novelId/selection', enabled, requireAuth, respond(async (request) => {
  const { novelId } = novelParams.parse(request.params);
  const actor = auth(request);
  const selection = await getAuthorSelection(actor, novelId);
  return { ...selection, ...await authorReconsiderations(actor.userId, novelId, selection.item) };
}));
novelSelectionRoutes.post('/novels/:novelId/selections/:caseId/reconsiderations', enabled, requireAuth, respond((request) => {
  const params = supplementParams.parse(request.params);
  const body = z.object({ decisionVersion: reconsiderationVersion, reason: reconsiderationReason }).parse(request.body);
  return submitReconsideration(auth(request), { ...params, ...body });
}, 201));
novelSelectionRoutes.get('/admin/selection-reconsiderations', ...adminReviewer, respond((request) => {
  const query = pageQuery.omit({ view: true }).extend({ status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED']).default('OPEN') }).parse(request.query);
  return listReconsiderations(auth(request).userId, query);
}));
novelSelectionRoutes.post('/admin/selection-reconsiderations/:id/resolve', ...adminReviewer, respond((request) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const input = z.object({ outcome: z.enum(['ACCEPTED', 'REJECTED']), reason: reconsiderationReason,
    expectedVersion: reconsiderationVersion }).parse(request.body);
  return resolveReconsideration(auth(request), id, input);
}));
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
