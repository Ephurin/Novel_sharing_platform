import { becomeAuthor } from './auth.service.js';
import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { verifyGoogleIdentity } from './google-identity.js';
import { REGISTRATION_RECOVERY_MINUTES } from './auth.repository.js';
import { registrationIdSchema } from './auth.schemas.js';
import {
  changePassword,
  getCurrentUser,
  login,
  loginWithGoogle,
  logout,
  refreshAccessToken,
  register,
  resendRegistrationEmail,
  verifyRegistration
} from './auth.service.js';

const webOrigin = new URL(env.WEB_ORIGIN);
const secureRegistrationCookie = webOrigin.protocol === 'https:';
const registrationCookie = `${secureRegistrationCookie ? '__Host-' : ''}${env.REFRESH_TOKEN_COOKIE_NAME}_registration`;
const registrationCookieOptions = {
  path: secureRegistrationCookie ? '/' : `${env.API_PREFIX}/auth/register`,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: secureRegistrationCookie
};

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

function sendPendingRegistration(response: Parameters<RequestHandler>[1], result: Awaited<ReturnType<typeof register>>) {
  response.cookie(registrationCookie, result.registrationId, {
    ...registrationCookieOptions,
    maxAge: REGISTRATION_RECOVERY_MINUTES * 60_000
  });
  response.set('Cache-Control', 'no-store').status(202).json(successResponse(result));
}

export const registerController: RequestHandler = async (request, response, next) => {
  try {
    sendPendingRegistration(response, await register(request.body));
  } catch (error) {
    next(error);
  }
};

export const resendRegistrationController: RequestHandler = async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const { registrationId } = request.body;
    if (request.get('Origin') !== webOrigin.origin || request.cookies?.[registrationCookie] !== registrationId) {
      throw new AppError(403, 'AUTH_EMAIL_BROWSER', 'Hãy gửi lại email trong tab đã đăng ký hoặc đăng ký lại.');
    }
    sendPendingRegistration(response, await resendRegistrationEmail(registrationId));
  } catch (error) {
    next(error);
  }
};

function sendVerifiedRegistration(response: Parameters<RequestHandler>[1], session: Awaited<ReturnType<typeof verifyRegistration>>) {
  setRefreshCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
  response.set('Cache-Control', 'no-store').status(201).json(successResponse({
    user: session.user,
    accessToken: session.accessToken
  }));
}

export const verifyRegistrationController: RequestHandler = async (request, response, next) => {
  try {
    const { registrationId, code } = request.body;
    const result = await verifyRegistration(registrationId, { code });
    if (request.cookies?.[registrationCookie] === registrationId) {
      response.clearCookie(registrationCookie, registrationCookieOptions);
    }
    sendVerifiedRegistration(response, result);
  } catch (error) {
    next(error);
  }
};

export const verifyRegistrationLinkController: RequestHandler = async (request, response, next) => {
  try {
    // Binding the link to the browser that began signup keeps a forwarded link from activating someone else's password.
    const registrationId = registrationIdSchema.safeParse(request.cookies?.[registrationCookie]);
    if (request.get('Origin') !== webOrigin.origin || !registrationId.success) {
      throw new AppError(403, 'AUTH_EMAIL_BROWSER', 'Hãy mở link trong trình duyệt đã đăng ký, hoặc nhập mã 8 số ở tab đăng ký.');
    }
    const result = await verifyRegistration(registrationId.data, { linkToken: request.body.token });
    response.clearCookie(registrationCookie, registrationCookieOptions);
    sendVerifiedRegistration(response, result);
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

const googleCookie = `${env.REFRESH_TOKEN_COOKIE_NAME}_google`;
const googleCookieOptions = {
  path: `${env.API_PREFIX}/auth/google`,
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: webOrigin.protocol === 'https:'
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
  if (request.get('Origin') !== webOrigin.origin) {
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
