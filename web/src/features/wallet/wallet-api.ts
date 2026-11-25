import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type Wallet = {
  walletId: string;
  coinsBalance: number;
  lockedCoins: number;
};

export type WalletTransaction = {
  transactionId: string;
  type: string;
  status: string;
  amountCoins: number;
  description?: string | null;
  direction: 'IN' | 'OUT';
  balanceChangeCoins: number;
  metadata?: { message?: string | null; bankAccountLabel?: string | null } | null;
  createdAt: string;
};

export async function getWallet() {
  const response = await apiClient.get<ApiEnvelope<Wallet>>('/wallet/me');
  return response.data.data;
}

export async function listTransactions() {
  const transactions: WalletTransaction[] = [];
  let page = 1;
  while (true) {
    const response = await apiClient.get<ApiEnvelope<WalletTransaction[]>>('/wallet/transactions', {
      params: { page, limit: 100 }
    });
    transactions.push(...response.data.data);
    if (page >= Number(response.data.meta.totalPages ?? 1)) return transactions;
    page += 1;
  }
}

export type WalletEarnings = {
  asOfDay: string;
  timeZone: string;
  totalEarnedCoins: number;
  daily: Array<{ day: string; amountCoins: number; unlockCoins: number; donateCoins: number }>;
};

export async function getWalletEarnings() {
  const response = await apiClient.get<ApiEnvelope<WalletEarnings>>('/wallet/earnings');
  return response.data.data;
}

export type DepositPackageCode = 'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000';
export type DepositGateway = 'MOCK' | 'VNPAY';
export type DepositPackage = { code: DepositPackageCode; amountCoins: number; amountVnd: number };

/** Packages plus the gateway the server is using (MOCK settles in-app, VNPAY redirects to the sandbox). */
export async function listDepositPackages() {
  const response = await apiClient.get<ApiEnvelope<DepositPackage[]>>('/wallet/deposit-packages');
  return {
    packages: response.data.data,
    gateway: (response.data.meta.gateway === 'VNPAY' ? 'VNPAY' : 'MOCK') as DepositGateway
  };
}

export async function createDepositSession(packageCode: DepositPackageCode) {
  const response = await apiClient.post<ApiEnvelope<{
    depositSessionId: string;
    gateway: DepositGateway;
    amountCoins: number;
    status: string;
    mockPaymentUrl?: string;
    paymentUrl?: string;
  }>>('/wallet/deposit-sessions', { packageCode });
  return response.data.data;
}

export type VnpayReturnResult = {
  depositSessionId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amountCoins: number;
  transactionId: string | null;
  responseCode: string | null;
};

/** Forwards VNPay's Return URL query untouched; the backend verifies its signature before crediting. */
export async function confirmVnpayReturn(search: string) {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const response = await apiClient.get<ApiEnvelope<VnpayReturnResult>>(`/wallet/vnpay/return?${query}`);
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
