import { becomeAuthorController } from './auth.controller.js';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  changePasswordController,
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  registerController
} from './auth.controller.js';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas.js';

export const authRoutes = Router();

// SRS appendix A: a malformed email is reported as AUTH_001, not as a generic validation error.
const rejectInvalidEmail: RequestHandler = (request, _response, next) => {
  const email = request.body?.email;
  if (typeof email === 'string' && !z.string().email().safeParse(email).success) {
    next(new AppError(400, 'AUTH_001', 'Invalid Email format'));
    return;
  }
  next();
};

authRoutes.post('/register', rejectInvalidEmail, validateRequest(registerSchema), registerController);
authRoutes.post('/login', validateRequest(loginSchema), loginController);
authRoutes.post('/refresh-token', refreshTokenController);
authRoutes.post('/logout', requireAuth, logoutController);
authRoutes.get('/me', requireAuth, meController);
authRoutes.patch('/change-password', requireAuth, validateRequest(changePasswordSchema), changePasswordController);

authRoutes.post('/become-author', requireAuth, becomeAuthorController);
