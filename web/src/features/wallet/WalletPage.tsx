import { AnimatedNumber } from '../../shared/components/AuthorAdminMotion';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { AnimatedChoiceGroup } from '../../shared/components/AnimatedChoiceGroup';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { useToast } from '../../shared/components/ToastProvider';
import { useStoryCraftAutoAnimate } from '../../shared/hooks/useStoryCraftAutoAnimate';
import { navigationLabels } from '../../shared/components/navigation';
import NumberFlow from '@number-flow/react';
import { useReducedMotion } from 'motion/react';
import React, { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeMockDeposit,
  createDepositSession,
  createWithdrawRequest,
  getWallet,
  getWalletEarnings,
  listDepositPackages,
  listTransactions,
  type WalletTransaction
} from './wallet-api';
import { makeChart, type PeriodType } from './wallet-earnings';
import { useAuthStore } from '../auth/useAuthStore';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

interface DisplayTransaction {
  id: string;
  time: string;
  createdAt: string;
  category: 'vip' | 'tip' | 'withdraw' | 'deposit';
  categoryLabel: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  detail: string;
  amount: number;
  isPositive: boolean;
  balanceChangeCoins: number;
  status: 'done' | 'pending' | 'failed';
  statusLabel: string;
  code: string;
}

const chartPeriodOptions: ReadonlyArray<{ value: PeriodType; label: string }> = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '365', label: '365 ngày' }
];

export function WalletPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.user?.role);
  const isAuthor = role === 'AUTHOR' || role === 'ADMIN';
  const animateAuthor = isAuthor;
  const pageTitle = isAuthor ? navigationLabels.authorWallet : navigationLabels.readerWallet;

  // Queries
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
  const transactionsQuery = useQuery({ queryKey: ['wallet-transactions'], queryFn: listTransactions });
  const earningsQuery = useQuery({
    queryKey: ['wallet-earnings'],
    queryFn: getWalletEarnings,
    enabled: isAuthor
  });
  const depositPackagesQuery = useQuery({ queryKey: ['deposit-packages'], queryFn: listDepositPackages });

  // Bank state
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankHolder, setBankHolder] = useState(user?.displayName?.toUpperCase() ?? '');

  // Modals state
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [manageBankModalOpen, setManageBankModalOpen] = useState(false);

  // Withdraw Form State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const withdrawBankLabel = [bankName, bankAccount, bankHolder].filter(Boolean).join(' - ');

  // Deposit Form State
  const [selectedPackage, setSelectedPackage] = useState<'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000' | null>(null);

  // Chart & Filter state
  const [chartPeriod, setChartPeriod] = useState<PeriodType>('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => setCurrentPage(1), [searchQuery, filterType, filterStatus, filterDateRange]);

  const reduce = useReducedMotion();
  const txBodyRef = useStoryCraftAutoAnimate<HTMLTableSectionElement>();
  const { showToast: showGlobalToast } = useToast();
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    showGlobalToast(text, type);
  };

  const availableBalance = walletQuery.data?.coinsBalance ?? 0;
  const lockedBalance = walletQuery.data?.lockedCoins ?? 0;
  const totalAccumulated = earningsQuery.data?.totalEarnedCoins ?? 0;

  const openDepositModal = () => {
    if (!selectedPackage && depositPackagesQuery.data?.[0]) {
      setSelectedPackage(depositPackagesQuery.data[0].code);
    }
    setDepositModalOpen(true);
  };

  // Mutations
  const withdrawMutation = useMutation({
    mutationFn: () => createWithdrawRequest(withdrawAmount, withdrawBankLabel),
    onSuccess: async () => {
      showToast(`Đã gửi yêu cầu rút ${withdrawAmount.toLocaleString('vi-VN')} Xu.`);
      setWithdrawModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-withdraw'] });
    },
    onError: (err: unknown) => {
      showToast(`Rút Xu thất bại: ${getApiErrorMessage(err)}`, 'error');
    }
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackage) throw new Error('Vui lòng chọn gói Xu.');
      const session = await createDepositSession(selectedPackage);
      return completeMockDeposit(session.depositSessionId);
    },
    onSuccess: async () => {
      const addedCoins = (depositPackagesQuery.data ?? []).find((p) => p.code === selectedPackage)?.amountCoins;
      showToast(
        addedCoins
          ? `Đã nạp thử nghiệm ${addedCoins.toLocaleString('vi-VN')} Xu vào ví!`
          : 'Nạp Xu thử nghiệm thành công! Số dư ví đã được cộng thêm.'
      );
      setDepositModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    },
    onError: (err: unknown) => {
      showToast(`Nạp thử nghiệm thất bại: ${getApiErrorMessage(err)}`, 'error');
    }
  });

  // Transactions come only from the wallet API.
  const combinedTransactions = useMemo<DisplayTransaction[]>(() => {
    const realTxs: DisplayTransaction[] = (transactionsQuery.data || []).map((t: WalletTransaction) => {
      const isDeposit = t.type.toLowerCase().includes('deposit');
      const isWithdraw = t.type.toLowerCase().includes('withdraw');
      const isTip = t.type.toLowerCase().includes('donate') || t.type.toLowerCase().includes('tip');
      const isUnlock = t.type.toLowerCase().includes('unlock');

      let category: DisplayTransaction['category'] = 'vip';
      let categoryLabel = 'Doanh thu chương VIP';
      let icon = 'menu_book';
      let iconBg = 'bg-primary-fixed';
      let iconColor = 'text-primary-800';
      const isPositive = t.direction === 'IN';

      if (isDeposit) {
        category = 'deposit';
        categoryLabel = 'Nạp Xu vào ví';
        icon = 'add_card';
        iconBg = 'bg-success-bg';
        iconColor = 'text-success';
      } else if (isWithdraw) {
        category = 'withdraw';
        categoryLabel = 'Rút Xu';
        icon = 'north_east';
        iconBg = 'bg-danger-bg';
        iconColor = 'text-danger';
      } else if (isTip) {
        category = 'tip';
        categoryLabel = isPositive ? 'Nhận ủng hộ' : 'Ủng hộ tác giả';
        icon = 'favorite';
        iconBg = 'bg-primary-50';
        iconColor = 'text-primary-800';
      } else if (isUnlock) {
        category = 'vip';
        categoryLabel = isPositive ? 'Doanh thu mở khóa' : 'Mở khóa chương VIP';
        icon = 'menu_book';
        iconBg = 'bg-primary-fixed';
        iconColor = 'text-primary-800';
      }

      const statusMap: Record<string, DisplayTransaction['status']> = {
        COMPLETED: 'done',
        SUCCESS: 'done',
        PENDING: 'pending',
        FAILED: 'failed'
      };

      return {
        id: t.transactionId,
        createdAt: t.createdAt,
        time: new Date(t.createdAt).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        category,
        categoryLabel,
        icon,
        iconBg,
        iconColor,
        title: isWithdraw
          ? 'Yêu cầu rút Xu'
          : isDeposit
            ? 'Nạp Xu vào ví'
            : isTip
              ? isPositive
                ? 'Nhận ủng hộ'
                : 'Ủng hộ tác giả'
              : isUnlock
                ? isPositive
                  ? 'Doanh thu mở khóa'
                  : 'Mở khóa chương'
                : 'Giao dịch ví',
        detail: t.metadata?.bankAccountLabel || t.metadata?.message || t.description || `Mã: ${t.transactionId.substring(0, 8)}`,
        amount: Math.abs(t.amountCoins),
        balanceChangeCoins: t.balanceChangeCoins,
        isPositive,
        status: statusMap[t.status] || 'failed',
        statusLabel:
          t.status === 'COMPLETED' || t.status === 'SUCCESS'
            ? 'Hoàn tất'
            : t.status === 'PENDING'
              ? 'Đang xử lý'
              : 'Thất bại',
        code: t.transactionId.substring(0, 16).toUpperCase()
      };
    });

    return realTxs;
  }, [transactionsQuery.data]);

  const readerStats = useMemo(() => {
    let spent = 0;
    let deposited = 0;
    for (const tx of combinedTransactions) {
      if (tx.status !== 'done') continue;
      if (tx.category === 'deposit' && tx.isPositive) deposited += tx.amount;
      else if (!tx.isPositive && (tx.category === 'vip' || tx.category === 'tip')) spent += tx.amount;
    }
    return { spent, deposited };
  }, [combinedTransactions]);

  const hasWithdrawTx = useMemo(
    () => combinedTransactions.some((tx) => tx.category === 'withdraw'),
    [combinedTransactions]
  );

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return combinedTransactions.filter((tx: DisplayTransaction) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        tx.title.toLowerCase().includes(q) ||
        tx.detail.toLowerCase().includes(q) ||
        tx.code.toLowerCase().includes(q);

      let matchType = true;
      if (filterType === 'vip') matchType = tx.category === 'vip';
      else if (filterType === 'tip') matchType = tx.category === 'tip';
      else if (filterType === 'withdraw') matchType = tx.category === 'withdraw';
      else if (filterType === 'deposit') matchType = tx.category === 'deposit';

      let matchStatus = true;
      if (filterStatus === 'done') matchStatus = tx.status === 'done';
      else if (filterStatus === 'pending') matchStatus = tx.status === 'pending';
      else if (filterStatus === 'failed') matchStatus = tx.status === 'failed';

      const ageDays = (Date.now() - new Date(tx.createdAt).getTime()) / 86400000;
      const matchDate = filterDateRange === 'all' || ageDays <= Number(filterDateRange);
      return matchQuery && matchType && matchStatus && matchDate;
    });
  }, [combinedTransactions, searchQuery, filterType, filterStatus, filterDateRange]);

  const currentChart = useMemo(
    () =>
      makeChart(
        earningsQuery.data ?? {
          asOfDay: new Date().toISOString().slice(0, 10),
          timeZone: 'Asia/Bangkok',
          totalEarnedCoins: 0,
          daily: []
        },
        chartPeriod
      ),
    [earningsQuery.data, chartPeriod]
  );
  const peakChartAmount = useMemo(
    () => Math.max(0, ...currentChart.points.map((pt) => pt.amount)),
    [currentChart.points]
  );

  const displayedTransactions = filteredTransactions.slice((currentPage - 1) * 10, currentPage * 10);
  const transactionPages = Math.max(1, Math.ceil(filteredTransactions.length / 10));

  if (walletQuery.isLoading || transactionsQuery.isLoading || (isAuthor && earningsQuery.isLoading)) {
    return <LoadingState label="Đang tải dữ liệu ví..." />;
  }
  if (walletQuery.isError) return <ErrorState error={walletQuery.error} onRetry={() => void walletQuery.refetch()} />;
  if (transactionsQuery.isError) return <ErrorState error={transactionsQuery.error} onRetry={() => void transactionsQuery.refetch()} />;
  if (isAuthor && earningsQuery.isError) return <ErrorState error={earningsQuery.error} onRetry={() => void earningsQuery.refetch()} />;

  return (
    <div
      className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col w-full"
      style={{ backgroundColor: 'var(--sc-bg)', color: 'var(--sc-text)' }}
    >
      {/* Global Top Navbar */}
      <AuthorNavbar />

      {/* Main Content Area */}
      <main className="w-full pt-0 flex-1 bg-surface" style={{ backgroundColor: 'var(--sc-bg)' }}>
        <div className="flex flex-col w-full">
          <div className="relative w-full overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-5 flex flex-col gap-4">
              {/* 1. Page Header Section */}
              <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex flex-col gap-1">
                  <h1 className="font-headline-lg text-2xl text-on-surface font-serif font-bold tracking-tight">
                    {pageTitle}
                  </h1>
                  <p className="text-body text-on-surface-variant">
                    {isAuthor
                      ? 'Ví thử nghiệm: giao dịch nạp và rút Xu chỉ mang tính mô phỏng, không phát sinh thanh toán thật.'
                      : 'Ví thử nghiệm: nạp Xu mô phỏng để mở khóa chương VIP và ủng hộ tác giả.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openDepositModal}
                  className="sc-button sc-button-primary self-start sm:self-auto"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add_card</span>
                  <span>Nạp Xu thử nghiệm</span>
                </button>
              </section>

              {/* 2. Balance Cards Row */}
              {isAuthor ? (
                <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
                  {/* Card 1: Số dư khả dụng */}
                  <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm transition-shadow border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-primary-fixed flex items-center justify-center text-primary-800">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">account_balance_wallet</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Số dư khả dụng</span>
                        </div>
                        <span className="font-label-sm text-meta text-primary-800 font-medium bg-surface-container-low px-1.5 py-0.5 rounded">
                          Khả dụng
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {animateAuthor ? <AnimatedNumber value={availableBalance} /> : availableBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-primary-800">Xu</span>
                      </div>
                    </div>

                    <div className="pt-2.5 mt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawAmount(Math.min(100, availableBalance));
                          setWithdrawModalOpen(true);
                        }}
                        className="sc-button sc-button-soft w-full"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">payments</span>
                        <span>Yêu cầu rút Xu mô phỏng</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Xu bị khóa */}
                  <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm transition-shadow border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-warning-bg flex items-center justify-center text-warning">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">hourglass_top</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Xu bị khóa</span>
                        </div>
                        <span className="font-label-sm text-meta text-warning bg-warning-bg px-1.5 py-0.5 rounded font-medium">
                          Chờ xử lý rút
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          <NumberFlow value={lockedBalance} locales="vi-VN" animated={!reduce} />
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Tổng thu nhập tích lũy */}
                  <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm transition-shadow border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-success-bg flex items-center justify-center text-success">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">military_tech</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Tổng thu nhập tích lũy</span>
                        </div>
                        <span className="font-label-sm text-meta text-success bg-success-bg px-1.5 py-0.5 rounded font-medium">
                          Toàn thời gian
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {animateAuthor ? <AnimatedNumber value={totalAccumulated} /> : totalAccumulated.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
                  {/* Reader Card 1: Số dư khả dụng */}
                  <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-primary-fixed flex items-center justify-center text-primary-800">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">account_balance_wallet</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Số dư khả dụng</span>
                        </div>
                        <span className="font-label-sm text-meta text-primary-800 font-medium bg-surface-container-low px-1.5 py-0.5 rounded">
                          Trong ví
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold tabular-nums">
                          {availableBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-primary-800">Xu</span>
                      </div>
                    </div>
                  </div>

                  {/* Reader Card 2: Đã chi tiêu */}
                  <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-warning-bg flex items-center justify-center text-warning">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">menu_book</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Đã dùng đọc truyện &amp; ủng hộ</span>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold tabular-nums">
                          {readerStats.spent.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>

                  {/* Reader Card 3: Tổng Xu đã nạp */}
                  <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm border border-surface-container/60">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 rounded-lg bg-success-bg flex items-center justify-center text-success">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add_card</span>
                          </div>
                          <span className="font-label-md text-meta font-semibold text-on-surface">Tổng Xu đã nạp</span>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold tabular-nums">
                          {readerStats.deposited.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. Author-Only Revenue Analytics Chart & Bank Info */}
              {isAuthor && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                  {/* Left: Revenue Analytics Chart */}
                  <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm border border-surface-container/60">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                        <div className="flex flex-col">
                          <h2 className="text-base sm:text-lg text-on-surface font-serif font-bold">Doanh thu theo thời gian</h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-meta text-outline">Tổng kỳ này:</span>
                            <span className="text-body text-on-surface font-bold">
                              {animateAuthor ? <AnimatedNumber value={currentChart.total} /> : currentChart.total.toLocaleString('vi-VN')} Xu
                            </span>
                          </div>
                        </div>

                        <AnimatedChoiceGroup
                          label="Khoảng thời gian doanh thu"
                          value={chartPeriod}
                          onChange={setChartPeriod}
                          options={chartPeriodOptions}
                        />
                      </div>

                      <p className="text-meta text-outline">
                        Kỳ trước: {currentChart.previousTotal.toLocaleString('vi-VN')} Xu ·{' '}
                        {currentChart.previousTotal > 0
                          ? `Thay đổi ${(((currentChart.total - currentChart.previousTotal) / currentChart.previousTotal) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                          : 'Chưa có tỷ lệ tăng trưởng'}
                      </p>

                      {/* Chart Visualization */}
                      <div className="w-full pt-2 pb-1">
                        <div className="relative w-full h-44 flex flex-col justify-end">
                          {/* Background Gridlines */}
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                            {[1, 0.75, 0.5, 0.25, 0].map((factor) => (
                              <div key={factor} className="w-full flex items-center gap-2">
                                <span className="font-label-sm text-meta min-w-[40px] tabular-nums text-right text-on-surface-variant">
                                  {factor === 0 ? '0' : Math.round(currentChart.maxAmount * factor).toLocaleString('vi-VN')}
                                </span>
                                <div className="h-[1px] w-full bg-surface-container-highest/70"></div>
                              </div>
                            ))}
                          </div>

                          {/* Bars Cluster */}
                          <div className="relative pl-12 pr-1 h-36 flex items-end justify-between gap-2 sm:gap-3.5 z-10">
                            {currentChart.points.map((pt, idx) => {
                              const isPeak = peakChartAmount > 0 ? pt.amount === peakChartAmount : Boolean(pt.highlight);
                              return (
                                <div
                                  key={animateAuthor ? `${chartPeriod}-${idx}` : idx}
                                  tabIndex={0}
                                  aria-label={`${pt.label}: ${pt.amount.toLocaleString('vi-VN')} Xu`}
                                  className="group flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer"
                                >
                                  <div className="absolute -top-7 px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-label-sm text-meta rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-sm z-20">
                                    {pt.label}: {pt.amount.toLocaleString('vi-VN')} Xu
                                  </div>
                                  <div
                                    className={`w-full max-w-[32px] flex flex-col justify-end rounded-t-md overflow-hidden group-hover:brightness-95 transition-all ${
                                      animateAuthor ? 'sc-author-chart-bar' : ''
                                    }`}
                                    style={{ height: `${pt.heightPercent}%` }}
                                  >
                                    <div
                                      className={`w-full h-full rounded-t-sm transition-all ${
                                        isPeak
                                          ? 'bg-primary'
                                          : 'bg-primary-fixed border border-primary/40'
                                      }`}
                                    ></div>
                                  </div>
                                  <span
                                    className={`font-label-sm text-meta mt-2 whitespace-nowrap tabular-nums ${
                                      isPeak ? 'text-primary-800 font-bold' : 'text-on-surface-variant'
                                    }`}
                                  >
                                    {pt.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Chart Legend & Source Breakdown */}
                    <div className="pt-2 mt-2 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-3 py-2 rounded-lg text-meta">
                      <div className="flex items-center gap-3.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-on-surface">
                          <span className="w-2.5 h-2.5 rounded-sm bg-primary" aria-hidden="true"></span>
                          <span>Kỳ cao nhất</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-on-surface">
                          <span className="w-2.5 h-2.5 rounded-sm bg-primary-fixed border border-primary/40" aria-hidden="true"></span>
                          <span>Kỳ thông thường</span>
                        </span>
                      </div>
                      <span className="text-meta text-on-surface-variant">
                        Mở khóa VIP: <strong className="text-on-surface font-semibold">{currentChart.unlockCoins.toLocaleString('vi-VN')} Xu</strong>
                        {' · '}
                        Ủng hộ: <strong className="text-on-surface font-semibold">{currentChart.donateCoins.toLocaleString('vi-VN')} Xu</strong>
                      </span>
                    </div>
                  </div>

                  {/* Right: Connected Bank Account Card */}
                  <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm border border-surface-container/60">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-body font-bold text-on-surface">Tài khoản nhận tiền</h2>
                      </div>

                      {/* Editorial Bank Card */}
                      <div className="sc-bank-card rounded-xl p-4 flex flex-col justify-between min-h-[152px]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-meta text-on-surface-variant font-medium">
                              Ngân hàng thụ hưởng
                            </span>
                            <span className="font-semibold text-body text-on-surface tracking-tight">
                              {bankName || 'Chưa nhập ngân hàng'}
                            </span>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">
                            account_balance
                          </span>
                        </div>

                        <div className="my-2">
                          <span className="text-meta text-on-surface-variant">
                            Số tài khoản
                          </span>
                          <p className="font-mono text-base tracking-wider text-on-surface mt-0.5">
                            {bankAccount ? `•••• ${bankAccount.slice(-4)}` : 'Chưa nhập số tài khoản'}
                          </p>
                        </div>

                        <div>
                          <span className="text-meta text-on-surface-variant">
                            Chủ tài khoản
                          </span>
                          <p className="font-semibold text-meta text-on-surface">
                            {bankHolder || 'Chưa nhập chủ tài khoản'}
                          </p>
                        </div>
                      </div>

                      {/* Bank Details */}
                      <div className="flex flex-col gap-1.5 pt-0.5 text-meta text-on-surface-variant">
                        {bankBranch.trim() !== '' && (
                          <div className="flex justify-between items-center py-0.5 border-b border-surface-container/60">
                            <span className="text-outline text-meta">Chi nhánh:</span>
                            <span className="text-on-surface font-medium text-right text-meta">{bankBranch}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-outline text-meta">Lưu trữ:</span>
                          <span className="text-on-surface font-medium text-right text-meta">Chỉ dùng trong phiên hiện tại</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setManageBankModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-meta transition-all shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[16px] text-outline" aria-hidden="true">credit_card</span>
                        <span>Nhập thông tin nhận tiền</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* 4. Transaction History Table Section */}
              <section className="bg-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5 border border-surface-container/60">
                {/* Header and Controls */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg text-on-surface font-serif font-bold">Lịch sử giao dịch</h2>
                    <span className="text-meta px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
                      {filteredTransactions.length.toLocaleString('vi-VN')} giao dịch
                    </span>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative min-w-[200px]">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline" aria-hidden="true">
                        search
                      </span>
                      <input
                        type="text"
                        aria-label="Tìm kiếm giao dịch"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm nội dung hoặc mã..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-outline outline-none ring-1 ring-outline-variant/30 focus:ring-2 focus:ring-primary transition-all text-meta"
                      />
                    </div>

                    {/* Type Filter */}
                    <select
                      aria-label="Lọc theo loại giao dịch"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                    >
                      <option value="all">Tất cả loại giao dịch</option>
                      <option value="vip">{isAuthor ? 'Chương VIP' : 'Mở khóa chương VIP'}</option>
                      <option value="tip">{isAuthor ? 'Ủng hộ / Tip' : 'Ủng hộ tác giả'}</option>
                      {(isAuthor || hasWithdrawTx) && <option value="withdraw">Rút Xu</option>}
                      <option value="deposit">Nạp Xu vào ví</option>
                    </select>

                    {/* Status Filter */}
                    <select
                      aria-label="Lọc theo trạng thái giao dịch"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="done">Hoàn tất</option>
                      <option value="pending">Đang xử lý</option>
                      <option value="failed">Thất bại</option>
                    </select>

                    {/* Range Filter */}
                    <select
                      aria-label="Lọc theo khoảng thời gian"
                      value={filterDateRange}
                      onChange={(e) => setFilterDateRange(e.target.value)}
                      className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                    >
                      <option value="all">Tất cả thời gian</option>
                      <option value="30">30 ngày gần đây</option>
                      <option value="60">60 ngày gần đây</option>
                      <option value="365">365 ngày gần đây</option>
                    </select>
                  </div>
                </div>

                {/* Table Viewport */}
                <div className="w-full overflow-x-auto rounded-lg border border-surface-container/40">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-meta">
                        <th className="py-2.5 px-3.5 font-semibold">Thời gian</th>
                        <th className="py-2.5 px-3.5 font-semibold">Loại giao dịch</th>
                        <th className="py-2.5 px-3.5 font-semibold">Nội dung chi tiết</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Số Xu</th>
                        <th className="py-2.5 px-3.5 font-semibold text-center">Trạng thái</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Mã giao dịch</th>
                      </tr>
                    </thead>
                    <tbody ref={txBodyRef} className="divide-y divide-surface-container text-meta text-on-surface">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-outline">
                            Không tìm thấy giao dịch nào phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        displayedTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-surface-container-low/60 transition-colors group">
                            <td className="py-2.5 px-3.5 text-meta font-mono text-outline whitespace-nowrap">
                              {tx.time}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded ${tx.iconBg} ${tx.iconColor} flex items-center justify-center shrink-0`}>
                                  <span className="material-symbols-outlined text-body" aria-hidden="true">{tx.icon}</span>
                                </span>
                                <span className="font-medium text-meta">{tx.categoryLabel}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-sm truncate text-on-surface" title={`${tx.title} - ${tx.detail}`}>
                              {tx.title}{' '}
                              <strong className="font-medium text-primary-800">{tx.detail}</strong>
                            </td>
                            <td
                              className={`py-2.5 px-3.5 text-right font-bold whitespace-nowrap text-body tabular-nums ${
                                tx.balanceChangeCoins === 0 ? 'text-outline' : tx.isPositive ? 'text-success' : 'text-danger'
                              }`}
                            >
                              {tx.balanceChangeCoins === 0 ? '' : tx.isPositive ? '+' : '-'}
                              <span className={tx.balanceChangeCoins === 0 ? 'line-through' : ''}>{tx.amount.toLocaleString('vi-VN')}</span>{' '}
                              <span className="text-meta font-normal text-outline">Xu</span>
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              {tx.status === 'done' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-semibold bg-success-bg text-success">
                                  <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                                  Hoàn tất
                                </span>
                              ) : tx.status === 'pending' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-semibold bg-primary-50 text-primary-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary-700 animate-pulse" aria-hidden="true"></span>
                                  Đang xử lý
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-semibold bg-danger-bg text-danger">
                                  <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true"></span>
                                  Thất bại
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono text-meta text-outline whitespace-nowrap group-hover:text-on-surface">
                              {tx.code}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-meta">
                  <p className="text-outline">
                    Hiển thị <span className="font-semibold text-on-surface">{displayedTransactions.length.toLocaleString('vi-VN')}</span> / {filteredTransactions.length.toLocaleString('vi-VN')} giao dịch
                  </p>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Trang trước"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="w-7 h-7 rounded flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                    </button>
                    <span className="px-2 tabular-nums">{currentPage} / {transactionPages}</span>
                    <button
                      type="button"
                      aria-label="Trang sau"
                      disabled={currentPage >= transactionPages}
                      onClick={() => setCurrentPage((p) => Math.min(transactionPages, p + 1))}
                      className="w-7 h-7 rounded flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* 5. Modal: Yêu cầu rút Xu mô phỏng (Author only) */}
      {isAuthor && (
        <AnimatedModal
          opened={withdrawModalOpen}
          onClose={() => setWithdrawModalOpen(false)}
          title="Yêu cầu rút Xu mô phỏng"
          size="md"
          centered
        >
          <div className="flex flex-col gap-3.5">
            {/* Current Balance Banner */}
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-meta text-outline">Số dư khả dụng hiện tại</span>
                <span className="text-body text-on-surface font-bold">
                  {availableBalance.toLocaleString('vi-VN')} Xu
                </span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-meta text-outline">Dự kiến sau rút</span>
                <span className="text-body text-primary-800 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <NumberFlow value={Math.max(0, availableBalance - (Number.isFinite(withdrawAmount) ? withdrawAmount : 0))} locales="vi-VN" animated={!reduce} /> Xu
                </span>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                withdrawMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <div className="text-meta font-medium text-on-surface flex justify-between items-center">
                  <label htmlFor="withdraw-amount">Số Xu muốn rút</label>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(availableBalance)}
                    className="text-primary-800 hover:underline font-semibold text-meta"
                  >
                    Rút tối đa ({availableBalance.toLocaleString('vi-VN')} Xu)
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="withdraw-amount"
                    type="number"
                    min={100}
                    max={availableBalance}
                    step={1}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value) || 0)}
                    className="w-full pl-3 pr-14 py-2 rounded-lg bg-surface-container-lowest ring-1 ring-outline-variant focus:ring-2 focus:ring-primary outline-none text-base text-on-surface font-bold transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-meta text-outline font-semibold">
                    Xu
                  </span>
                </div>

                {withdrawAmount > availableBalance && (
                  <div className="text-meta text-error flex items-center gap-1 mt-0.5" role="alert">
                    <span className="material-symbols-outlined text-table" aria-hidden="true">error</span>
                    <span>Số Xu rút không được vượt quá số dư khả dụng ({availableBalance.toLocaleString('vi-VN')} Xu).</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-meta text-outline mt-0.5">
                  <span className="material-symbols-outlined text-table" aria-hidden="true">info</span>
                  <span>Tối thiểu 100 Xu · Yêu cầu mô phỏng, không chuyển khoản ngân hàng.</span>
                </div>
              </div>

              {/* Destination Bank Confirm */}
              <div className="border-t border-surface-container pt-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta text-outline">Tài khoản nhận tiền thụ hưởng:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawModalOpen(false);
                      setManageBankModalOpen(true);
                    }}
                    className="text-meta text-primary-800 underline font-medium"
                  >
                    {bankAccount ? 'Sửa tài khoản nhận' : 'Nhập tài khoản nhận'}
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low text-meta">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-success text-[18px]" aria-hidden="true">account_balance</span>
                    <div>
                      <p className="font-semibold text-on-surface text-meta">
                        {bankName || bankAccount ? `${bankName} ${bankAccount}`.trim() : 'Chưa nhập ngân hàng'}
                      </p>
                      {bankBranch.trim() !== '' && <p className="text-meta text-tertiary">{bankBranch}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-meta font-semibold text-on-surface block">
                      {bankHolder || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 mt-1">
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-meta transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={withdrawAmount < 100 || withdrawAmount > availableBalance || !bankName.trim() || !bankAccount.trim() || !bankHolder.trim() || withdrawMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-meta font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>
                  <span>{withdrawMutation.isPending ? 'Đang gửi...' : 'Xác nhận rút Xu'}</span>
                </button>
              </div>
            </form>
          </div>
        </AnimatedModal>
      )}

      {/* 6. Modal: Nạp Xu thử nghiệm */}
      <AnimatedModal
        opened={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        title="Nạp Xu thử nghiệm"
        size="sm"
        centered
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-meta text-outline">Chọn gói Xu thử nghiệm để cộng ngay vào số dư ví.</p>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Chọn gói Xu thử nghiệm">
            {(depositPackagesQuery.data ?? []).map((pkg) => {
              const active = selectedPackage === pkg.code;
              return (
                <button
                  key={pkg.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedPackage(pkg.code)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    active
                      ? 'border-primary bg-primary-fixed/40 ring-2 ring-primary/30'
                      : 'border-surface-container hover:bg-surface-container-low'
                  }`}
                >
                  <p className="font-bold text-meta text-on-surface">{pkg.amountCoins.toLocaleString('vi-VN')} Xu</p>
                </button>
              );
            })}
          </div>
          <div className="bg-surface-container-low px-3 py-2 rounded-lg flex items-center justify-between text-meta">
            <span className="text-outline">Số dư dự kiến sau nạp</span>
            <span className="font-bold text-primary-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <NumberFlow
                value={availableBalance + ((depositPackagesQuery.data ?? []).find((p) => p.code === selectedPackage)?.amountCoins ?? 0)}
                locales="vi-VN"
                animated={!reduce}
              />{' '}
              Xu
            </span>
          </div>
          {depositPackagesQuery.isError && <p className="text-meta text-error" role="alert">Không tải được các gói Xu.</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDepositModalOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-meta"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!selectedPackage || depositPackagesQuery.isLoading || depositMutation.isPending}
              onClick={() => depositMutation.mutate()}
              className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-meta font-semibold transition-all disabled:opacity-50"
            >
              {depositMutation.isPending ? 'Đang nạp...' : 'Xác nhận nạp'}
            </button>
          </div>
        </div>
      </AnimatedModal>

      {/* 7. Modal: Tài khoản ngân hàng thụ hưởng (Author only) */}
      {isAuthor && (
        <AnimatedModal
          opened={manageBankModalOpen}
          onClose={() => setManageBankModalOpen(false)}
          title="Tài khoản ngân hàng thụ hưởng"
          size="sm"
          centered
        >
          <div className="flex flex-col gap-3">
            <p className="text-meta text-outline">Nhập thông tin cho yêu cầu rút hiện tại. Hệ thống chưa lưu lâu dài tài khoản ngân hàng.</p>

            <div className="flex flex-col gap-2.5">
              <div>
                <label htmlFor="bank-name-input" className="text-meta font-semibold text-on-surface-variant block mb-0.5">
                  Ngân hàng
                </label>
                <input
                  id="bank-name-input"
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta text-on-surface"
                />
              </div>

              <div>
                <label htmlFor="bank-account-input" className="text-meta font-semibold text-on-surface-variant block mb-0.5">
                  Số tài khoản
                </label>
                <input
                  id="bank-account-input"
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta font-mono text-on-surface"
                />
              </div>

              <div>
                <label htmlFor="bank-holder-input" className="text-meta font-semibold text-on-surface-variant block mb-0.5">
                  Tên chủ tài khoản (in hoa)
                </label>
                <input
                  id="bank-holder-input"
                  type="text"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta font-semibold text-on-surface"
                />
              </div>

              <div>
                <label htmlFor="bank-branch-input" className="text-meta font-semibold text-on-surface-variant block mb-0.5">
                  Chi nhánh (không bắt buộc)
                </label>
                <input
                  id="bank-branch-input"
                  type="text"
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta text-on-surface"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setManageBankModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-meta"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  showToast('Đã nhập thông tin tài khoản cho yêu cầu rút trong phiên này.');
                  setManageBankModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-meta font-semibold transition-all"
              >
                Dùng thông tin này
              </button>
            </div>
          </div>
        </AnimatedModal>
      )}
    </div>
  );
}
