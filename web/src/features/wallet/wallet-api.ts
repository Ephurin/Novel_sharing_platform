import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type Wallet = {
  walletId: string;
  userId: string;
  coinsBalance: number;
  lockedCoins: number;
};

export type WalletTransaction = {
  transactionId: string;
  type: string;
  status: string;
  amountCoins: number;
  description?: string | null;
  createdAt: string;
};

export async function getWallet() {
  const response = await apiClient.get<ApiEnvelope<Wallet>>('/wallet/me');
  return response.data.data;
}

export async function listTransactions() {
  const response = await apiClient.get<ApiEnvelope<WalletTransaction[]>>('/wallet/transactions', {
    params: { page: 1, limit: 20 }
  });
  return response.data.data;
}

export async function createDepositSession(packageCode: 'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000') {
  const response = await apiClient.post<ApiEnvelope<{ depositSessionId: string; amountCoins: number; status: string; mockPaymentUrl: string }>>(
    '/wallet/deposit-sessions',
    { packageCode }
  );
  return response.data.data;
}

export async function completeMockDeposit(depositSessionId: string) {
  const response = await apiClient.post<ApiEnvelope<{ transactionId: string; status: string }>>('/wallet/mock-webhook/deposit-success', {
    depositSessionId,
    mockResult: 'SUCCESS'
  });
  return response.data.data;
}

export async function unlockChapter(chapterId: string) {
  const response = await apiClient.post<ApiEnvelope<{ unlocked: boolean; transactionId?: string }>>(`/chapters/${chapterId}/unlock`);
  return response.data.data;
}

export async function donateToAuthor(authorId: string, amountCoins: number, message?: string) {
  const response = await apiClient.post<ApiEnvelope<{ transactionId: string; status: string }>>(`/authors/${authorId}/donations`, {
    amountCoins,
    message
  });
  return response.data.data;
}

export async function createWithdrawRequest(amountCoins: number, bankAccountLabel: string) {
  const response = await apiClient.post<ApiEnvelope<{ withdrawRequestId: string; status: string }>>('/wallet/withdraw-requests', {
    amountCoins,
    bankAccountLabel
  });
  return response.data.data;
}
