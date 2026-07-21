import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { completeMockDeposit, createDepositSession, getWallet, listWalletTransactions } from '../api/wallet-api';
import type { Wallet, WalletTransaction } from '../api/types';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';

export function WalletScreen() {
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
      const session = await createDepositSession(1000);
      await completeMockDeposit(session.depositSessionId);
      setNotice('Mock deposit completed: +1000 Coins.');
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Loading wallet..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Mock Wallet" subtitle="Demo-only payment flow. No real payment credentials are collected.">
        <Card>
          <Text style={styles.sectionTitle}>{wallet?.balanceCoins ?? 0} Coins</Text>
          {notice ? <Text style={styles.ghostButtonText}>{notice}</Text> : null}
          <PrimaryButton label="Mock deposit +1000" onPress={deposit} />
        </Card>
      </Section>

      <Section title="Transactions">
        {!transactions.length ? <EmptyState label="No transactions yet." /> : null}
        {transactions.map((transaction) => (
          <Card key={transaction.transactionId}>
            <Badge label={transaction.type} />
            <Text style={styles.sectionTitle}>{transaction.amountCoins} Coins</Text>
            <Text style={styles.muted}>{transaction.status}</Text>
          </Card>
        ))}
        <GhostButton label="Refresh" onPress={load} />
      </Section>
    </Screen>
  );
}
