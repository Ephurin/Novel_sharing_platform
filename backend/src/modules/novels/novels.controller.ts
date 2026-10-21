import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  createNovel,
  deleteNovel,
  readNovel,
  getNovelEarnings,
  listMyNovels,
  listNovels,
  submitPublish,
  updateNovel
} from './novels.service.js';
import { listGenres } from './novels.repository.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const createNovelController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createNovel(requireRequestAuth(request), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listNovelsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listNovels(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const listGenresController: RequestHandler = async (_request, response, next) => {
  try {
    response.json(successResponse(await listGenres()));
  } catch (error) {
    next(error);
  }
};

export const listMyNovelsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listMyNovels(requireRequestAuth(request), request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const getNovelController: RequestHandler = async (request, response, next) => {
  try {
    const result = await readNovel(String(request.params.novelId), request.auth);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const getNovelEarningsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getNovelEarnings(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const updateNovelController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateNovel(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deleteNovelController: RequestHandler = async (request, response, next) => {
  try {
    await deleteNovel(requireRequestAuth(request), String(request.params.novelId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const submitNovelPublishController: RequestHandler = async (request, response, next) => {
  try {
    const result = await submitPublish(requireRequestAuth(request), String(request.params.novelId));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
