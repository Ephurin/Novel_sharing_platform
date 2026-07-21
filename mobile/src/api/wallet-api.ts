import { apiClient, type ApiEnvelope } from './api-client';
import type { Wallet, WalletTransaction } from './types';

export async function getWallet() {
  const response = await apiClient.get<ApiEnvelope<Wallet>>('/wallet/me');
  return response.data.data;
}

export async function listWalletTransactions() {
  const response = await apiClient.get<ApiEnvelope<WalletTransaction[]>>('/wallet/transactions', {
    params: { page: 1, limit: 30 }
  });
  return response.data.data;
}

export async function createDepositSession(amountCoins: number) {
  const response = await apiClient.post<ApiEnvelope<{ depositSessionId: string; amountCoins: number; status: string; mockPaymentUrl: string }>>(
    '/wallet/deposit-sessions',
    { amountCoins }
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

export async function unlockVipChapter(chapterId: string) {
  const response = await apiClient.post<ApiEnvelope<{ unlocked: boolean; transactionId?: string }>>(`/chapters/${chapterId}/unlock`);
  return response.data.data;
}
