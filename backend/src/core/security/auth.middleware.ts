import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { userRoles, type UserRole } from '../../shared/constants/roles.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const accessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(userRoles),
  jti: z.string().optional()
});

function readBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function verifyAccessToken(token: string) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const parsedPayload = accessTokenPayloadSchema.parse(payload);

    return {
      userId: parsedPayload.sub,
      role: parsedPayload.role,
      tokenId: parsedPayload.jti
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'AUTH_005', 'Access token expired');
    }

    throw new AppError(401, 'AUTH_002', 'Missing or invalid access token');
  }
}

export const optionalAuth: RequestHandler = (request, _response, next) => {
  const token = readBearerToken(request.header('authorization'));

  if (token) {
    request.auth = verifyAccessToken(token);
  }

  next();
};

export const requireAuth: RequestHandler = (request, _response, next) => {
  const token = readBearerToken(request.header('authorization'));

  if (!token) {
    next(new AppError(401, 'AUTH_002', 'Missing access token'));
    return;
  }

  try {
    request.auth = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRoles(allowedRoles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, 'AUTH_002', 'Missing access token'));
      return;
    }

    if (!allowedRoles.includes(request.auth.role)) {
      next(new AppError(403, 'AUTH_008', 'Unauthorized action'));
      return;
    }

    next();
  };
}
