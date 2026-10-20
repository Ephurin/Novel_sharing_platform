import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { createComment, createNovelComment, deleteComment, listComments, listNovelComments, updateComment } from './comments.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const createCommentController: RequestHandler = async (request, response, next) => {
  try {
    const result = await (request.params.novelId ? createNovelComment : createComment)(requireRequestAuth(request), String(request.params.novelId ?? request.params.chapterId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const listCommentsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await (request.params.novelId ? listNovelComments : listComments)(String(request.params.novelId ?? request.params.chapterId), request.query as never, request.auth);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const updateCommentController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateComment(requireRequestAuth(request), String(request.params.commentId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deleteCommentController: RequestHandler = async (request, response, next) => {
  try {
    await deleteComment(requireRequestAuth(request), String(request.params.commentId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
