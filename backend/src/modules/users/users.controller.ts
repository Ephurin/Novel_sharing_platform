import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  getMySettings,
  getAuthorProfile,
  getPrivateProfile,
  getPublicProfile,
  updateMyProfile,
  updateMySettings
} from './users.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const getPublicProfileController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getPublicProfile(String(request.params.userId));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const getAuthorProfileController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getAuthorProfile(String(request.params.authorId));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const getMyProfileController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getPrivateProfile(requireRequestAuth(request));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateMyProfileController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateMyProfile(requireRequestAuth(request), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const getMySettingsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getMySettings(requireRequestAuth(request));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateMySettingsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateMySettings(requireRequestAuth(request), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
