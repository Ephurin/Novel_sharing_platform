import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  moderatorPermissionsFor,
  type ModeratorPermission
} from '../../core/security/moderation-policy.js';

export function assertModeratorOperational(auth: AuthContext, permission: ModeratorPermission) {
  if (!moderatorPermissionsFor(auth.role).includes(permission)) {
    throw new AppError(403, 'MOD_PERMISSION', 'Chức năng điều hành chưa được mở hoặc nằm ngoài quyền của bạn.');
  }
  return auth;
}

export function requireModeratorOperational(...permissions: ModeratorPermission[]): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!request.auth) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập.');
      if (request.auth.role !== 'MODERATOR') {
        throw new AppError(403, 'AUTH_008', 'Chỉ điều hành viên được thao tác trên không gian này.');
      }
      if (!permissions.some((permission) => moderatorPermissionsFor(request.auth!.role).includes(permission))) {
        throw new AppError(403, 'MOD_PERMISSION', 'Chức năng điều hành chưa được mở hoặc nằm ngoài quyền của bạn.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
