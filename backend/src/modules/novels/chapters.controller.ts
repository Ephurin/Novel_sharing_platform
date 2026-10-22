import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  createChapter,
  getChapter,
  listChapters,
  submitChapterPublish,
  updateChapter
} from './chapters.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const createChapterController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createChapter(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listChaptersController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listChapters(String(request.params.novelId), requireRequestAuth(request));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const getChapterController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getChapter(String(request.params.chapterId), requireRequestAuth(request));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateChapterController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateChapter(requireRequestAuth(request), String(request.params.chapterId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const submitChapterPublishController: RequestHandler = async (request, response, next) => {
  try {
    const result = await submitChapterPublish(requireRequestAuth(request), String(request.params.chapterId));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
