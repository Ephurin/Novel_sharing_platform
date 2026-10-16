import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import {
  completeMockDeposit,
  createDepositSession,
  createWithdrawRequest,
  donateToAuthor,
  getWallet,
  listTransactions,
  unlockChapter
} from './wallet-api';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';

export function WalletPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [packageCode, setPackageCode] = useState<'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000'>('COIN_500');
  const [chapterId, setChapterId] = useState(localStorage.getItem('ephurin_wallet_chapter_id') ?? '');
  const [authorId, setAuthorId] = useState(localStorage.getItem('ephurin_wallet_author_id') ?? '');
  const [donationAmount, setDonationAmount] = useState(100);
  const [withdrawAmount, setWithdrawAmount] = useState(100);
  const [bankLabel, setBankLabel] = useState('Mock Bank Account');
  const [status, setStatus] = useState('Wallet UI ready');

  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
  const transactionsQuery = useQuery({ queryKey: ['wallet-transactions'], queryFn: listTransactions });
  const canRequestWithdraw = Boolean(
    (user?.role === 'AUTHOR' || user?.role === 'ADMIN') &&
      bankLabel.trim().length >= 3 &&
      withdrawAmount >= 100 &&
      (walletQuery.data?.coinsBalance ?? 0) >= withdrawAmount
  );

  const refreshWallet = async () => {
    await queryClient.invalidateQueries({ queryKey: ['wallet'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
  };

  const depositMutation = useMutation({
    mutationFn: async () => {
      const session = await createDepositSession(packageCode);
      return completeMockDeposit(session.depositSessionId);
    },
    onSuccess: async () => {
      setStatus('Mock deposit completed');
      await refreshWallet();
    },
    onError: (error) => {
      setStatus(`Deposit failed: ${getApiErrorMessage(error)}`);
    }
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockChapter(chapterId),
    onSuccess: async (data) => {
      localStorage.setItem('ephurin_wallet_chapter_id', chapterId);
      setStatus(data?.alreadyUnlocked ? 'Chapter already unlocked' : 'Chapter unlocked');
      await refreshWallet();
    },
    onError: (error) => {
      setStatus(`Unlock failed: ${getApiErrorMessage(error)}`);
    }
  });

  const donateMutation = useMutation({
    mutationFn: () => donateToAuthor(authorId, donationAmount, 'Sent from Phase 8 web UI'),
    onSuccess: async () => {
      localStorage.setItem('ephurin_wallet_author_id', authorId);
      setStatus('Donation sent');
      await refreshWallet();
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: () => createWithdrawRequest(withdrawAmount, bankLabel.trim()),
    onMutate: () => setStatus('Creating withdraw request...'),
    onSuccess: async () => {
      setStatus('Withdraw request created');
      await refreshWallet();
      await queryClient.invalidateQueries({ queryKey: ['admin-withdraw'] });
    },
    onError: (error) => {
      setStatus(`Withdraw failed: ${getApiErrorMessage(error)}`);
    }
  });

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Mock Wallet</Title>
          <Text c="dimmed">Graduation-project wallet flow with mock deposit and reviewable transactions.</Text>
        </Box>
        <Badge variant="light" data-testid="wallet-status-badge">{status}</Badge>
      </Group>

      <Box className="phase-grid">
        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Balance</Title>
            <Text size="xl" fw={800} data-testid="wallet-coins-balance">
              {walletQuery.data?.coinsBalance ?? 0} coins
            </Text>
            <Text c="dimmed">Locked: {walletQuery.data?.lockedCoins ?? 0}</Text>
            <Select
              label="Mock package"
              value={packageCode}
              data={['COIN_100', 'COIN_500', 'COIN_1000', 'COIN_5000']}
              onChange={(value) => setPackageCode((value ?? 'COIN_500') as typeof packageCode)}
              data-testid="mock-package-select"
            />
            <Button loading={depositMutation.isPending} onClick={() => depositMutation.mutate()} data-testid="deposit-mock-coins-button">
              Deposit mock coins
            </Button>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>VIP Unlock</Title>
            <TextInput label="VIP Chapter ID" value={chapterId} onChange={(event) => setChapterId(event.currentTarget.value)} data-testid="vip-chapter-id-input" />
            <Button disabled={!chapterId} loading={unlockMutation.isPending} onClick={() => unlockMutation.mutate()} data-testid="wallet-unlock-chapter-button">
              Unlock chapter
            </Button>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Donate Author</Title>
            <TextInput label="Author user ID" value={authorId} onChange={(event) => setAuthorId(event.currentTarget.value)} />
            <NumberInput label="Coins" value={donationAmount} min={1} onChange={(value) => setDonationAmount(Number(value) || 1)} />
            <Button disabled={!authorId} loading={donateMutation.isPending} onClick={() => donateMutation.mutate()}>
              Donate
            </Button>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Withdraw</Title>
            <Text size="sm" c="dimmed">
              Author/Admin only. Minimum 100 coins; requested coins are locked until Admin review.
            </Text>
            <NumberInput label="Coins" value={withdrawAmount} min={100} onChange={(value) => setWithdrawAmount(Number(value) || 100)} />
            <TextInput label="Bank label" value={bankLabel} onChange={(event) => setBankLabel(event.currentTarget.value)} />
            {user?.role !== 'AUTHOR' && user?.role !== 'ADMIN' ? (
              <Text size="xs" c="red">
                Reader accounts cannot request withdraws.
              </Text>
            ) : null}
            {(walletQuery.data?.coinsBalance ?? 0) < withdrawAmount ? (
              <Text size="xs" c="red">
                Available balance is not enough for this withdraw amount.
              </Text>
            ) : null}
            <Button disabled={!canRequestWithdraw} loading={withdrawMutation.isPending} onClick={() => withdrawMutation.mutate()}>
              Request withdraw
            </Button>
          </Stack>
        </Paper>
      </Box>

      <Paper p="md" withBorder mt="md">
        <Title order={4} mb="sm">Transactions</Title>
        {transactionsQuery.isLoading ? <LoadingState label="Loading transactions..." /> : null}
        {transactionsQuery.isError ? <ErrorState error={transactionsQuery.error} onRetry={() => void transactionsQuery.refetch()} /> : null}
        {!transactionsQuery.isLoading && !transactionsQuery.isError && !transactionsQuery.data?.length ? (
          <EmptyState description="No wallet transactions yet." />
        ) : null}
        <Table data-testid="wallet-transactions-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Coins</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!transactionsQuery.isLoading && !transactionsQuery.isError ? (transactionsQuery.data ?? []).map((transaction) => (
              <Table.Tr key={transaction.transactionId}>
                <Table.Td>{transaction.type}</Table.Td>
                <Table.Td>{transaction.status}</Table.Td>
                <Table.Td>{transaction.amountCoins}</Table.Td>
                <Table.Td>{new Date(transaction.createdAt).toLocaleString()}</Table.Td>
              </Table.Tr>
            )) : null}
          </Table.Tbody>
        </Table>
      </Paper>
    </Box>
  );
}
