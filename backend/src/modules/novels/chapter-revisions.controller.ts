import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  acceptDraft,
  createSnapshot,
  getInternalRevision,
  getRevision,
  listRevisions
} from './chapter-revisions.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }
  return request.auth;
}

export const snapshotChapterController: RequestHandler = async (request, response, next) => {
  try {
    const auth = requireRequestAuth(request);
    const chapterId = String(request.params.chapterId);
    const revision = await createSnapshot(auth, chapterId, request.body);
    response.status(201).json(successResponse(revision));
  } catch (error) {
    next(error);
  }
};

export const acceptDraftController: RequestHandler = async (request, response, next) => {
  try {
    const auth = requireRequestAuth(request);
    const chapterId = String(request.params.chapterId);
    const result = await acceptDraft(auth, chapterId, request.body);
    response.status(200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listRevisionsController: RequestHandler = async (request, response, next) => {
  try {
    const auth = requireRequestAuth(request);
    const chapterId = String(request.params.chapterId);
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    const revisions = await listRevisions(auth, chapterId, limit);
    response.status(200).json(successResponse(revisions));
  } catch (error) {
    next(error);
  }
};

export const getRevisionController: RequestHandler = async (request, response, next) => {
  try {
    const auth = requireRequestAuth(request);
    const chapterId = String(request.params.chapterId);
    const revisionId = String(request.params.revisionId);
    const revision = await getRevision(auth, chapterId, revisionId);
    response.status(200).json(successResponse(revision));
  } catch (error) {
    next(error);
  }
};

function requireServiceToken(request: Parameters<RequestHandler>[0]) {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerToken = (request.headers['x-service-token'] as string) || (request.headers['x-internal-service-key'] as string);
  const token = bearerToken || headerToken;

  const expectedToken = process.env.PLATFORM_SERVICE_TOKEN;
  if (!expectedToken?.trim() || !token || token !== expectedToken) {
    throw new AppError(401, 'AUTH_002', 'Valid service authorization token required');
  }
}

export const internalGetRevisionController: RequestHandler = async (request, response, next) => {
  try {
    requireServiceToken(request);
    const revisionId = String(request.params.revisionId);
    const revision = await getInternalRevision(revisionId);
    response.status(200).json(successResponse(revision));
  } catch (error) {
    next(error);
  }
};

