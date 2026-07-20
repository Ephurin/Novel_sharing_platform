import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  followPublishedAuthor,
  getFollowerCount,
  likePublishedNovel,
  unfollowPublishedAuthor,
  unlikePublishedNovel
} from './social.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const likeNovelController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await likePublishedNovel(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const unlikeNovelController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await unlikePublishedNovel(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const followAuthorController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await followPublishedAuthor(requireRequestAuth(request), String(request.params.authorId))));
  } catch (error) {
    next(error);
  }
};

export const unfollowAuthorController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await unfollowPublishedAuthor(requireRequestAuth(request), String(request.params.authorId))));
  } catch (error) {
    next(error);
  }
};

export const followerCountController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getFollowerCount(String(request.params.authorId))));
  } catch (error) {
    next(error);
  }
};
