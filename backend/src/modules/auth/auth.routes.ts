import { becomeAuthorController } from './auth.controller.js';
import { Router } from 'express';
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

authRoutes.post('/register', validateRequest(registerSchema), registerController);
authRoutes.post('/login', validateRequest(loginSchema), loginController);
authRoutes.post('/refresh-token', refreshTokenController);
authRoutes.post('/logout', requireAuth, logoutController);
authRoutes.get('/me', requireAuth, meController);
authRoutes.patch('/change-password', requireAuth, validateRequest(changePasswordSchema), changePasswordController);

authRoutes.post('/become-author', requireAuth, becomeAuthorController);
