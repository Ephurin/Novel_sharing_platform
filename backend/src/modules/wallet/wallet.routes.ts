import { Router } from 'express';
import { env } from '../../core/config/env.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { rateLimit } from '../../core/security/rate-limit.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  completeMockDepositController,
  confirmVnpayReturnController,
  createDepositSessionController,
  vnpayIpnController,
  createWithdrawRequestController,
  donateController,
  getTransactionsController,
  getEarningsController,
  listDepositPackagesController,
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

// SRS payment-wallet-service §1: every payment API is rate limited. One budget is shared by all money-moving routes.
const paymentRateLimit = rateLimit({
  scope: 'payment',
  max: env.PAYMENT_RATE_LIMIT_MAX,
  windowMs: env.PAYMENT_RATE_LIMIT_WINDOW_MS
});
// The unauthenticated mock webhook is counted per deposit session and only after body validation, so
// malformed calls cannot use up the budget and callbacks behind one proxy/NAT do not throttle each other.
export const WEBHOOK_CALLS_PER_SESSION = 5;
const webhookRateLimit = rateLimit({
  scope: 'payment-webhook',
  max: WEBHOOK_CALLS_PER_SESSION,
  windowMs: env.PAYMENT_RATE_LIMIT_WINDOW_MS,
  key: (request) => `session:${(request.body as { depositSessionId: string }).depositSessionId}`
});

// VNPay retries an IPN a few times per order; this only stops floods from one address.
const vnpayIpnRateLimit = rateLimit({
  scope: 'payment-vnpay-ipn',
  max: 120,
  windowMs: env.PAYMENT_RATE_LIMIT_WINDOW_MS
});

walletRoutes.get('/me', requireAuth, getWalletController);
walletRoutes.get('/earnings', requireAuth, getEarningsController);
walletRoutes.get('/deposit-packages', listDepositPackagesController);
walletRoutes.get('/transactions', requireAuth, validateRequest(walletTransactionsSchema), getTransactionsController);
walletRoutes.post('/deposit-sessions', requireAuth, paymentRateLimit, validateRequest(createDepositSessionSchema), createDepositSessionController);
walletRoutes.post('/mock-webhook/deposit-success', validateRequest(mockDepositSuccessSchema), webhookRateLimit, completeMockDepositController);
// VNPay sandbox: the browser's Return URL (works on localhost) and the server-to-server IPN (needs a public URL).
// Both verify the signature and settle through the same locked, idempotent path.
walletRoutes.get('/vnpay/return', requireAuth, paymentRateLimit, confirmVnpayReturnController);
walletRoutes.get('/vnpay/ipn', vnpayIpnRateLimit, vnpayIpnController);
walletRoutes.post('/withdraw-requests', requireAuth, paymentRateLimit, validateRequest(createWithdrawRequestSchema), createWithdrawRequestController);

walletResourceRoutes.post('/chapters/:chapterId/unlock', requireAuth, paymentRateLimit, validateRequest(chapterIdParamSchema), unlockChapterController);
walletResourceRoutes.post('/authors/:authorId/donations', requireAuth, paymentRateLimit, validateRequest(donateSchema), donateController);
