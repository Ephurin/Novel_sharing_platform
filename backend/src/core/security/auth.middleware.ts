import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { userRoles, type UserRole } from '../../shared/constants/roles.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { getPostgresPool } from '../database/postgres.js';

const accessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(userRoles),
  jti: z.string().optional(),
  purpose: z.string().optional()
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
    if (parsedPayload.purpose) throw new Error('Restricted token');

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

async function activeIdentity(token: string) {
  const identity = verifyAccessToken(token);
  const user = (
    await getPostgresPool().query(
      "select u.role,u.status,u.deleted_at,case when u.role='ADMIN' then coalesce(a.scope,'SUPER_ADMIN') end as admin_scope from users u left join admin_access a using(user_id) where u.user_id::text=$1",
      [identity.userId]
    )
  ).rows[0];
  if (!user || user.deleted_at || user.status !== 'ACTIVE')
    throw new AppError(
      403,
      'AUTH_ACCOUNT_INACTIVE',
      'Tài khoản bị khóa hoặc không còn hoạt động. Bạn có thể gửi khiếu nại tại /appeals.'
    );
  return { ...identity, role: user.role, adminScope:user.admin_scope };
}
export const optionalAuth: RequestHandler = async (request, _response, next) => {
  const token = readBearerToken(request.header('authorization'));

  try {
    if (token) request.auth = await activeIdentity(token);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const token = readBearerToken(request.header('authorization'));

  if (!token) {
    next(new AppError(401, 'AUTH_002', 'Missing access token'));
    return;
  }

  try {
    request.auth = await activeIdentity(token);
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
    if(request.auth.role==='ADMIN'&&allowedRoles.includes('AUTHOR')&&request.auth.adminScope&&['FINANCE','USER_MANAGER'].includes(request.auth.adminScope)){
      next(new AppError(403,'ADMIN_PERMISSION','Nhóm quyền hiện tại không có quyền quản lý nội dung.'));return;
    }

    next();
  };
}
