import { becomeAuthorController } from './auth.controller.js';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import { authRateLimit } from './auth-rate-limit.js';
import {
  cancelNativeRegistrationController,
  cancelRegistrationController,
  changePasswordController,
  googleChallengeController,
  googleLoginController,
  loginController,
  logoutController,
  meController,
  pendingNativeRegistrationController,
  pendingRegistrationController,
  recoverRegistrationController,
  refreshTokenController,
  registerController,
  registerNativeController,
  requireGoogleOrigin,
  resendNativeRegistrationController,
  resendRegistrationController,
  verifyRegistrationController,
  verifyRegistrationLinkController
} from './auth.controller.js';
import { changePasswordSchema, googleLoginSchema, loginSchema, recoverRegistrationSchema, registerSchema, resendNativeRegistrationSchema, resendRegistrationSchema, verifyRegistrationLinkSchema, verifyRegistrationSchema } from './auth.schemas.js';

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

const limitRegistration = authRateLimit({ scope: 'email-registration', max: 30, windowMs: 60_000 });
const limitResend = authRateLimit({ scope: 'email-registration-resend', max: 10, windowMs: 60_000 });

authRoutes.post('/register', limitRegistration,
  rejectInvalidEmail, validateRequest(registerSchema), registerController);
authRoutes.post('/register/native', limitRegistration,
  rejectInvalidEmail, validateRequest(registerSchema), registerNativeController);
authRoutes.post('/register/resend', limitResend, validateRequest(resendRegistrationSchema), resendRegistrationController);
authRoutes.post('/register/native/resend', limitResend, validateRequest(resendNativeRegistrationSchema), resendNativeRegistrationController);
authRoutes.post('/register/pending', pendingRegistrationController);
authRoutes.post('/register/cancel', validateRequest(resendRegistrationSchema), cancelRegistrationController);
authRoutes.post('/register/native/pending', validateRequest(resendNativeRegistrationSchema), pendingNativeRegistrationController);
authRoutes.post('/register/native/cancel', validateRequest(resendNativeRegistrationSchema), cancelNativeRegistrationController);
authRoutes.post('/register/recover', limitRegistration, validateRequest(recoverRegistrationSchema), recoverRegistrationController);
authRoutes.post('/register/verify', validateRequest(verifyRegistrationSchema), verifyRegistrationController);
authRoutes.post('/register/verify-link', validateRequest(verifyRegistrationLinkSchema), verifyRegistrationLinkController);
authRoutes.post('/login', validateRequest(loginSchema), loginController);
authRoutes.post('/google/challenge', requireGoogleOrigin, googleChallengeController);
authRoutes.post('/google', requireGoogleOrigin,
  authRateLimit({ scope: 'google-login', max: 60, windowMs: 60_000 }),
  validateRequest(googleLoginSchema), googleLoginController);
authRoutes.post('/refresh-token', refreshTokenController);
authRoutes.post('/logout', requireAuth, logoutController);
authRoutes.get('/me', requireAuth, meController);
authRoutes.patch('/change-password', requireAuth, validateRequest(changePasswordSchema), changePasswordController);

authRoutes.post('/become-author', requireAuth, becomeAuthorController);
