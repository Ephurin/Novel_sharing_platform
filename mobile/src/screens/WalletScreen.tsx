import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import type { Wallet, WalletTransaction } from '../api/types';
import { completeMockDeposit, createDepositSession, getWallet, listWalletTransactions } from '../api/wallet-api';
import { AppIcon } from '../components/Icons';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
  PrimaryButton,
  Screen,
  Section,
  useScreenStyles
} from '../components/Screen';
import { resolveStoryCraftFontFamily, useStoryCraftTheme } from '../theme/ThemeProvider';
import { formatRelativeOrDate } from '../utils/format';

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

function isCreditTransaction(tx: WalletTransaction): boolean {
  if (tx.direction === 'IN') return true;
  if (tx.direction === 'OUT') return false;
  if (typeof tx.balanceChangeCoins === 'number') return tx.balanceChangeCoins > 0;
  return tx.type === 'DEPOSIT';
}

export function WalletScreen() {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [walletData, transactionData] = await Promise.all([getWallet(), listWalletTransactions()]);
      setWallet(walletData);
      setTransactions(transactionData);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const deposit = async () => {
    if (depositing) return;
    setDepositing(true);
    setNotice(null);
    setActionError(null);
    try {
      const session = await createDepositSession('COIN_1000');
      await completeMockDeposit(session.depositSessionId);
      setNotice('Đã nạp mô phỏng +1.000 Xu thành công.');
      const [walletData, transactionData] = await Promise.all([getWallet(), listWalletTransactions()]);
      setWallet(walletData);
      setTransactions(transactionData);
    } catch (caughtError) {
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      setDepositing(false);
    }
  };

  if (loading) return <LoadingState label="Đang tải Ví Xu..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <Card>
        <Text style={themed.muted}>Số dư khả dụng</Text>
        <Text
          style={{
            color: palette.text,
            fontSize: 28,
            lineHeight: 36,
            fontWeight: '700',
            fontFamily: resolveStoryCraftFontFamily('700', fontsLoaded)
          }}
        >
          {(wallet?.coinsBalance ?? 0).toLocaleString('vi-VN')}{' '}
          <Text style={{ color: palette.primaryMuted, fontSize: 16 }}>Xu</Text>
        </Text>
        {(wallet?.lockedCoins ?? 0) > 0 ? (
          <Text style={themed.muted}>
            Đang tạm khóa: {(wallet?.lockedCoins ?? 0).toLocaleString('vi-VN')} Xu
          </Text>
        ) : null}
        <Text style={themed.muted}>
          Ví thử nghiệm: nạp Xu mô phỏng, không thanh toán hoặc chuyển tiền thật.
        </Text>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        {actionError ? (
          <Text accessibilityLiveRegion="polite" style={themed.error}>
            {actionError}
          </Text>
        ) : null}
        <PrimaryButton
          label="Nạp thử nghiệm +1.000 Xu"
          accessibilityLabel="Nạp thử nghiệm +1.000 Xu"
          loading={depositing}
          disabled={depositing}
          onPress={() => void deposit()}
        />
      </Card>

      <Section
        title="Lịch sử giao dịch"
        rightAction={
          <GhostButton
            label="Làm mới giao dịch"
            loading={refreshing}
            disabled={refreshing || depositing}
            icon={<AppIcon name="refresh" size={15} color={palette.primaryMuted} />}
            onPress={() => void load(true)}
          />
        }
      >
        {!transactions.length ? <EmptyState label="Chưa có giao dịch nào." /> : null}
        {transactions.map((transaction) => {
          const isCredit = isCreditTransaction(transaction);
          const sign = isCredit ? '+' : '-';
          const amountAbs = Math.abs(transaction.amountCoins);
          const typeLabel = TX_TYPE_LABELS[transaction.type] ?? transaction.type;
          const formattedDate = formatRelativeOrDate(transaction.createdAt);

          return (
            <Card key={transaction.transactionId}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Badge label={typeLabel} tone="primary" />
                <Badge
                  label={TX_STATUS_LABELS[transaction.status] ?? transaction.status}
                  tone={resolveTxStatusTone(transaction.status)}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <Text
                  style={[
                    themed.cardTitle,
                    { color: isCredit ? palette.success : palette.text }
                  ]}
                >
                  {sign}
                  {amountAbs.toLocaleString('vi-VN')} Xu
                </Text>
                {formattedDate ? <Text style={themed.muted}>{formattedDate}</Text> : null}
              </View>

              {transaction.description?.trim() ? (
                <Text style={themed.muted} numberOfLines={2}>
                  {transaction.description.trim()}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </Section>
    </Screen>
  );
}
