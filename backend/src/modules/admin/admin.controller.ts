import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  addGenre,
  addTag,
  approveWithdraw,
  dashboardStats,
  getTaxonomy,
  listUsers,
  listWithdrawRequests,
  lockUser,
  rejectWithdraw,
  unlockUser
} from './admin.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AppError(401, 'AUTH_002', 'Missing access token');
  return request.auth;
}

export const listAdminUsersController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listUsers(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const lockUserController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await lockUser(String(request.params.userId))));
  } catch (error) {
    next(error);
  }
};

export const unlockUserController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await unlockUser(String(request.params.userId))));
  } catch (error) {
    next(error);
  }
};

export const taxonomyController: RequestHandler = async (_request, response, next) => {
  try {
    response.json(successResponse(await getTaxonomy()));
  } catch (error) {
    next(error);
  }
};

export const createGenreController: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(successResponse(await addGenre(request.body)));
  } catch (error) {
    next(error);
  }
};

export const createTagController: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(successResponse(await addTag(request.body)));
  } catch (error) {
    next(error);
  }
};

export const listWithdrawRequestsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listWithdrawRequests(request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const approveWithdrawController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await approveWithdraw(requireRequestAuth(request), String(request.params.withdrawRequestId))));
  } catch (error) {
    next(error);
  }
};

export const rejectWithdrawController: RequestHandler = async (request, response, next) => {
  try {
    response.json(
      successResponse(await rejectWithdraw(requireRequestAuth(request), String(request.params.withdrawRequestId), request.body.reason))
    );
  } catch (error) {
    next(error);
  }
};

export const dashboardStatsController: RequestHandler = async (_request, response, next) => {
  try {
    response.json(successResponse(await dashboardStats()));
  } catch (error) {
    next(error);
  }
};
