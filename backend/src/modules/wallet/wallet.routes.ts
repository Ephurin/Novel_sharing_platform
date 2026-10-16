import { Router } from 'express';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  completeMockDepositController,
  createDepositSessionController,
  createWithdrawRequestController,
  donateController,
  getTransactionsController,
  getWalletController,
  unlockChapterController
} from './wallet.controller.js';
import {
  authorIdParamSchema,
  chapterIdParamSchema,
  createDepositSessionSchema,
  createWithdrawRequestSchema,
  donateSchema,
  mockDepositSuccessSchema,
  walletTransactionsSchema
} from './wallet.schemas.js';

export const walletRoutes = Router();
export const walletResourceRoutes = Router();

walletRoutes.get('/me', requireAuth, getWalletController);
walletRoutes.get('/transactions', requireAuth, validateRequest(walletTransactionsSchema), getTransactionsController);
walletRoutes.post('/deposit-sessions', requireAuth, validateRequest(createDepositSessionSchema), createDepositSessionController);
walletRoutes.post('/mock-webhook/deposit-success', requireAuth, validateRequest(mockDepositSuccessSchema), completeMockDepositController);
walletRoutes.post('/withdraw-requests', requireAuth, validateRequest(createWithdrawRequestSchema), createWithdrawRequestController);

walletResourceRoutes.post('/chapters/:chapterId/unlock', requireAuth, validateRequest(chapterIdParamSchema), unlockChapterController);
walletResourceRoutes.post('/authors/:authorId/donations', requireAuth, validateRequest(donateSchema), donateController);
