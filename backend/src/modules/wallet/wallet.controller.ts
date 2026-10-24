import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { listDepositPackages } from './wallet.repository.js';
import {
  completeMockDeposit,
  createDepositSession,
  createWithdrawRequest,
  donate,
  getTransactions,
  getEarnings,
  getWallet,
  unlockVipChapter
} from './wallet.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }
  return request.auth;
}

export const getWalletController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getWallet(requireRequestAuth(request))));
  } catch (error) {
    next(error);
  }
};

export const getTransactionsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await getTransactions(requireRequestAuth(request), request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const getEarningsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await getEarnings(requireRequestAuth(request))));
  } catch (error) {
    next(error);
  }
};

export const listDepositPackagesController: RequestHandler = (_request, response) => {
  response.json(successResponse(listDepositPackages()));
};

export const createDepositSessionController: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(successResponse(await createDepositSession(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};

export const completeMockDepositController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await completeMockDeposit(request.body)));
  } catch (error) {
    next(error);
  }
};

export const unlockChapterController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await unlockVipChapter(requireRequestAuth(request), String(request.params.chapterId))));
  } catch (error) {
    next(error);
  }
};

export const donateController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await donate(requireRequestAuth(request), String(request.params.authorId), request.body)));
  } catch (error) {
    next(error);
  }
};

export const createWithdrawRequestController: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(successResponse(await createWithdrawRequest(requireRequestAuth(request), request.body)));
  } catch (error) {
    next(error);
  }
};
