import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  addToLibrary,
  getHistoryForNovel,
  getPreferences,
  getReaderChapter,
  getReaderNovel,
  listHistory,
  listLibrary,
  removeFromLibrary,
  savePreferences,
  searchNovels,
  syncHistory
} from './reading.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const getPreferencesController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getPreferences(requireRequestAuth(request))));
  } catch (error) {
    next(error);
  }
};

export const savePreferencesController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await savePreferences(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};

export const searchNovelsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await searchNovels(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const getReaderNovelController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getReaderNovel(String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const getReaderChapterController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getReaderChapter(String(request.params.chapterId), request.auth)));
  } catch (error) {
    next(error);
  }
};

export const syncHistoryController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await syncHistory(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};

export const listHistoryController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listHistory(requireRequestAuth(request), request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const getHistoryForNovelController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getHistoryForNovel(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const listLibraryController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listLibrary(requireRequestAuth(request), request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const addToLibraryController: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(successResponse(await addToLibrary(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};

export const removeFromLibraryController: RequestHandler = async (request, response, next) => {
  try {
    await removeFromLibrary(requireRequestAuth(request), String(request.params.novelId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
