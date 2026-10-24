import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
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

export async function createDepositSession(auth: AuthContext, input: CreateDepositSessionInput) {
  const session = await createDepositSessionRow(auth.userId, input);
  if (!session) {
    throw new AppError(404, 'PAYMENT_001', 'Wallet not found');
  }
  return {
    depositSessionId: session.depositSessionId,
    mockPaymentUrl: `/mock-payment/${session.depositSessionId}`,
    amountCoins: session.amountCoins,
    status: session.status
  };
}

export async function completeMockDeposit(input: MockDepositSuccessInput) {
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
