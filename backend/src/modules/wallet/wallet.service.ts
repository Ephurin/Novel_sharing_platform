import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { buildVnpayPaymentUrl, fromVnpayTxnRef, toVnpayTxnRef, verifyVnpayCallback, type VnpayConfig } from './vnpay.js';
import type {
  CreateDepositSessionInput,
  CreateWithdrawRequestInput,
  DonateInput,
  MockDepositSuccessInput,
  WalletTransactionsInput
} from './wallet.schemas.js';
import {
  completeDepositSession,
  createDepositSession as createDepositSessionRow,
  createWithdrawRequest as createWithdrawRequestRow,
  donateToAuthor,
  findActiveAuthorWallet,
  findPublishedChapterForUnlock,
  findWalletByUserId,
  getAuthorEarnings,
  listTransactions,
  settleGatewayDeposit,
  unlockChapter as unlockChapterRow
} from './wallet.repository.js';

function buildMeta(totalItems: number, page: number, limit: number) {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit)
  };
}

export async function getWallet(auth: AuthContext) {
  const wallet = await findWalletByUserId(auth.userId);
  if (!wallet) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return {
    walletId: wallet.walletId,
    coinsBalance: wallet.coinsBalance,
    lockedCoins: wallet.lockedCoins
  };
}

export async function getEarnings(auth: AuthContext) {
  return getAuthorEarnings(auth.userId);
}

export async function getTransactions(auth: AuthContext, input: WalletTransactionsInput) {
  const result = await listTransactions(auth.userId, input);
  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

function getVnpayConfig(): VnpayConfig {
  if (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET) {
    throw new AppError(503, 'PAYMENT_009', 'Payment gateway is not configured');
  }
  return {
    tmnCode: env.VNPAY_TMN_CODE,
    hashSecret: env.VNPAY_HASH_SECRET,
    paymentUrl: env.VNPAY_PAYMENT_URL,
    returnUrl: env.VNPAY_RETURN_URL ?? `${env.WEB_ORIGIN}/wallet/vnpay-return`
  };
}

export async function createDepositSession(auth: AuthContext, input: CreateDepositSessionInput, context: { ipAddr?: string } = {}) {
  if (env.PAYMENT_GATEWAY === 'vnpay') {
    const config = getVnpayConfig();
    const session = await createDepositSessionRow(auth.userId, input, { gateway: 'VNPAY', ttlMinutes: env.VNPAY_SESSION_TTL_MINUTES });
    if (!session) {
      throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
    }
    const amountVnd = session.amountVnd!;
    return {
      depositSessionId: session.depositSessionId,
      gateway: 'VNPAY' as const,
      paymentUrl: buildVnpayPaymentUrl({
        config,
        txnRef: toVnpayTxnRef(session.depositSessionId),
        amountVnd,
        orderInfo: `Nap ${session.amountCoins} Xu Ephurin`,
        ipAddr: context.ipAddr ?? '127.0.0.1',
        createdAt: session.createdAt,
        expiresAt: session.expiresAt!
      }),
      amountCoins: session.amountCoins,
      amountVnd,
      expiresAt: session.expiresAt,
      status: session.status
    };
  }

  const session = await createDepositSessionRow(auth.userId, input);
  if (!session) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return {
    depositSessionId: session.depositSessionId,
    gateway: 'MOCK' as const,
    mockPaymentUrl: `/mock-payment/${session.depositSessionId}`,
    amountCoins: session.amountCoins,
    status: session.status
  };
}

type VnpaySettlement =
  | { kind: 'INVALID_SIGNATURE' | 'NOT_FOUND' }
  | Exclude<Awaited<ReturnType<typeof settleGatewayDeposit>>, { result: 'NOT_FOUND' }>;

/** Shared by the Return URL and the IPN: verify the signature, then settle the session once. */
async function settleVnpayCallback(query: Record<string, unknown>): Promise<VnpaySettlement> {
  const callback = verifyVnpayCallback(query, getVnpayConfig().hashSecret);
  if (!callback.signatureValid) return { kind: 'INVALID_SIGNATURE' };
  const depositSessionId = fromVnpayTxnRef(callback.txnRef);
  if (!depositSessionId) return { kind: 'NOT_FOUND' };

  const settled = await settleGatewayDeposit(depositSessionId, {
    gateway: 'VNPAY',
    paid: callback.paid,
    amountVnd: callback.amountVnd,
    transactionNo: callback.transactionNo,
    responseCode: callback.responseCode,
    payload: callback.params
  });
  return settled.result === 'NOT_FOUND' ? { kind: 'NOT_FOUND' } : settled;
}

/** Browser came back from VNPay. Works on localhost, where the IPN cannot reach the server. */
export async function confirmVnpayReturn(auth: AuthContext, query: Record<string, unknown>) {
  const settlement = await settleVnpayCallback(query);
  if ('kind' in settlement) {
    if (settlement.kind === 'INVALID_SIGNATURE') {
      throw new AppError(400, 'PAYMENT_007', 'Invalid payment signature');
    }
    throw new AppError(404, 'PAYMENT_004', 'Invalid or completed deposit session');
  }
  if (settlement.result === 'AMOUNT_MISMATCH') {
    throw new AppError(400, 'PAYMENT_008', 'Payment amount does not match the deposit session');
  }
  // Checked after settling on purpose: a validly signed VNPay result is applied whoever relays it,
  // but only the wallet owner may see the outcome.
  if (settlement.session.userId !== auth.userId) {
    throw new AppError(403, 'PAYMENT_006', 'Wallet owner required');
  }
  return {
    depositSessionId: settlement.session.depositSessionId,
    status: settlement.session.status,
    amountCoins: settlement.session.amountCoins,
    transactionId: settlement.session.transactionId,
    responseCode: settlement.session.responseCode
  };
}

export type VnpayIpnResponse = { RspCode: string; Message: string };

/** Server-to-server notification from VNPay. Always answers in VNPay's own format. */
export async function handleVnpayIpn(query: Record<string, unknown>): Promise<VnpayIpnResponse> {
  try {
    const settlement = await settleVnpayCallback(query);
    if ('kind' in settlement) {
      return settlement.kind === 'INVALID_SIGNATURE'
        ? { RspCode: '97', Message: 'Invalid signature' }
        : { RspCode: '01', Message: 'Order not found' };
    }
    if (settlement.result === 'AMOUNT_MISMATCH') return { RspCode: '04', Message: 'Invalid amount' };
    if (settlement.result === 'ALREADY_SETTLED') return { RspCode: '02', Message: 'Order already confirmed' };
    return { RspCode: '00', Message: 'Confirm Success' };
  } catch (error) {
    logger.error({ err: error }, 'VNPay IPN handling failed');
    return { RspCode: '99', Message: 'Unknown error' };
  }
}

export async function completeMockDeposit(input: MockDepositSuccessInput) {
  // The mock webhook is unauthenticated, so it only exists while the mock gateway is active.
  if (env.PAYMENT_GATEWAY !== 'mock') {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }
  const result = await completeDepositSession(input.depositSessionId);
  if (!result) {
    throw new AppError(404, 'PAYMENT_004', 'Invalid or completed deposit session');
  }
  return result;
}

export async function unlockVipChapter(auth: AuthContext, chapterId: string) {
  const chapter = await findPublishedChapterForUnlock(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }
  if (chapter.author_id === auth.userId || !chapter.is_vip || chapter.price_coins <= 0) {
    return {
      chapterId,
      unlocked: true,
      transactionId: null,
      alreadyUnlocked: true
    };
  }

  const result = await unlockChapterRow(auth.userId, chapter);
  if (result === false) {
    throw new AppError(402, 'PAYMENT_003', 'Insufficient Coins balance');
  }
  if (!result) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return result;
}

export async function donate(auth: AuthContext, authorId: string, input: DonateInput) {
  const authorWallet = await findActiveAuthorWallet(authorId);
  if (!authorWallet) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  const result = await donateToAuthor(auth.userId, authorId, input);
  if (result === false) {
    throw new AppError(402, 'PAYMENT_003', 'Insufficient Coins balance');
  }
  if (!result) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return result;
}

export async function createWithdrawRequest(auth: AuthContext, input: CreateWithdrawRequestInput) {
  if (auth.role !== 'AUTHOR' && auth.role !== 'ADMIN') {
    throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  }

  const result = await createWithdrawRequestRow(auth.userId, input);
  if (result === false) {
    throw new AppError(402, 'PAYMENT_003', 'Insufficient Coins balance');
  }
  if (!result) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return result;
}
