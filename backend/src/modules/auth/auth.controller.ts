import type { RequestHandler } from 'express';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  changePassword,
  getCurrentUser,
  login,
  logout,
  refreshAccessToken,
  register
} from './auth.service.js';

function setRefreshCookie(
  response: Parameters<RequestHandler>[1],
  refreshToken: string,
  maxAgeMs: number
) {
  response.cookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/'
  });
}

function clearRefreshCookie(response: Parameters<RequestHandler>[1]) {
  response.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/'
  });
}

export const registerController: RequestHandler = async (request, response, next) => {
  try {
    const result = await register(request.body);
    setRefreshCookie(response, result.refreshToken, result.refreshTokenMaxAgeMs);

    response.status(201).json(
      successResponse({
        user: result.user,
        accessToken: result.accessToken
      })
    );
  } catch (error) {
    next(error);
  }
};

export const loginController: RequestHandler = async (request, response, next) => {
  try {
    const result = await login(request.body);
    setRefreshCookie(response, result.refreshToken, result.refreshTokenMaxAgeMs);

    response.json(
      successResponse({
        user: result.user,
        accessToken: result.accessToken
      })
    );
  } catch (error) {
    next(error);
  }
};

export const refreshTokenController: RequestHandler = async (request, response, next) => {
  try {
    const result = await refreshAccessToken(request.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME]);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const logoutController: RequestHandler = async (request, response, next) => {
  try {
    const result = await logout(request.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME]);
    clearRefreshCookie(response);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const meController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) {
      throw new AppError(401, 'AUTH_002', 'Missing access token');
    }

    const result = await getCurrentUser(request.auth);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const changePasswordController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) {
      throw new AppError(401, 'AUTH_002', 'Missing access token');
    }

    const result = await changePassword(request.auth, request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
