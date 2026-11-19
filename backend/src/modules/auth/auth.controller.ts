import { becomeAuthor } from './auth.service.js';
import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { verifyGoogleIdentity } from './google-identity.js';
import {
  changePassword,
  getCurrentUser,
  login,
  loginWithGoogle,
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

const googleOrigin = new URL(env.WEB_ORIGIN);
const googleCookie = `${env.REFRESH_TOKEN_COOKIE_NAME}_google`;
const googleCookieOptions = {
  path: `${env.API_PREFIX}/auth/google`,
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: googleOrigin.protocol === 'https:'
};
const googleChallengeSeconds = 15 * 60;
const googleChallengeAudience = 'storycraft-google-login';

function readGoogleChallenge(cookie: unknown) {
  if (typeof cookie !== 'string') return null;
  try {
    const claims = jwt.verify(cookie, env.JWT_REFRESH_SECRET, {
      audience: googleChallengeAudience,
      algorithms: ['HS256']
    });
    if (typeof claims !== 'string' && typeof claims.jti === 'string' && typeof claims.exp === 'number') {
      return { nonce: claims.jti, expiresAt: new Date(claims.exp * 1000) };
    }
    return null;
  } catch {
    return null;
  }
}

export const requireGoogleOrigin: RequestHandler = (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  if (request.get('Origin') !== googleOrigin.origin) {
    return next(new AppError(403, 'AUTH_GOOGLE_ORIGIN', 'Hãy đăng nhập Google từ địa chỉ web đã cấu hình cho StoryCraft.'));
  }
  next();
};

export const googleChallengeController: RequestHandler = (request, response) => {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    response.json(successResponse(null));
    return;
  }
  const nonce = randomBytes(32).toString('base64url');
  const challenge = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    audience: googleChallengeAudience,
    jwtid: nonce,
    expiresIn: googleChallengeSeconds
  });
  response.cookie(googleCookie, challenge, {
    ...googleCookieOptions,
    maxAge: googleChallengeSeconds * 1000
  });
  response.json(successResponse({ clientId, nonce }));
};

export const googleLoginController: RequestHandler = async (request, response, next) => {
  try {
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new AppError(404, 'AUTH_GOOGLE_DISABLED', 'StoryCraft chưa bật đăng nhập Google.');
    const challenge = readGoogleChallenge(request.cookies?.[googleCookie]);
    if (!challenge) throw new AppError(401, 'AUTH_GOOGLE_CHALLENGE', 'Phiên đăng nhập Google đã hết hạn. Hãy thử lại.');
    const identity = await verifyGoogleIdentity(request.body.credential, clientId, challenge.nonce);
    const session = await loginWithGoogle({ ...identity, ...challenge, password: request.body.password });
    response.clearCookie(googleCookie, googleCookieOptions);
    setRefreshCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    response.json(successResponse({ user: session.user, accessToken: session.accessToken }));
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

export const becomeAuthorController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new AppError(401, 'AUTH_002', 'Missing access token');
    const result = await becomeAuthor(request.auth);
    setRefreshCookie(response, result.refreshToken, result.refreshTokenMaxAgeMs);
    response.json(successResponse({ user: result.user, accessToken: result.accessToken }));
  } catch (error) { next(error); }
};
