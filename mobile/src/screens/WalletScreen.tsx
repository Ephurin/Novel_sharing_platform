import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import type { Wallet, WalletTransaction } from '../api/types';
import { completeMockDeposit, createDepositSession, getWallet, listWalletTransactions } from '../api/wallet-api';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

const TX_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Nạp Xu mô phỏng',
  UNLOCK: 'Mở khóa chương VIP',
  CHAPTER_UNLOCK: 'Mở khóa chương VIP',
  DONATE: 'Ủng hộ tác giả',
  DONATION: 'Ủng hộ tác giả',
  WITHDRAW: 'Rút Xu mô phỏng'
};

const TX_STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'Thành công',
  COMPLETED: 'Hoàn tất',
  PENDING: 'Đang xử lý',
  FAILED: 'Thất bại'
};

function resolveTxStatusTone(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'SUCCESS' || status === 'COMPLETED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'default';
}

export function WalletScreen() {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [walletData, transactionData] = await Promise.all([getWallet(), listWalletTransactions()]);
      setWallet(walletData);
      setTransactions(transactionData);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const deposit = async () => {
    try {
      const session = await createDepositSession('COIN_1000');
      await completeMockDeposit(session.depositSessionId);
      setNotice('Đã nạp mô phỏng +1.000 Xu thành công.');
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Đang tải Ví Xu..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section
        title="Ví Xu StoryCraft"
        subtitle="Ví thử nghiệm: nạp Xu mô phỏng, không thanh toán hoặc chuyển tiền thật."
      >
        <Card>
          <Text style={themed.muted}>Số dư khả dụng</Text>
          <Text style={{ color: palette.text, fontSize: 28, fontWeight: '700' }}>
            {(wallet?.coinsBalance ?? 0).toLocaleString('vi-VN')}{' '}
            <Text style={{ color: palette.primaryMuted, fontSize: 16 }}>Xu</Text>
          </Text>
          {(wallet?.lockedCoins ?? 0) > 0 ? (
            <Text style={themed.muted}>
              Đang tạm khóa: {(wallet?.lockedCoins ?? 0).toLocaleString('vi-VN')} Xu
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={themed.notice}>
              {notice}
            </Text>
          ) : null}
          <PrimaryButton label="Nạp thử nghiệm +1.000 Xu" onPress={deposit} />
        </Card>
      </Section>

      <Section title="Lịch sử giao dịch">
        {!transactions.length ? <EmptyState label="Chưa có giao dịch nào." /> : null}
        {transactions.map((transaction) => (
          <Card key={transaction.transactionId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Badge label={TX_TYPE_LABELS[transaction.type] ?? transaction.type} tone="primary" />
              <Badge
                label={TX_STATUS_LABELS[transaction.status] ?? transaction.status}
                tone={resolveTxStatusTone(transaction.status)}
              />
            </View>
            <Text style={themed.cardTitle}>
              {transaction.amountCoins.toLocaleString('vi-VN')} Xu
            </Text>
          </Card>
        ))}
        <GhostButton label="Làm mới giao dịch" onPress={load} />
      </Section>
    </Screen>
  );
}
