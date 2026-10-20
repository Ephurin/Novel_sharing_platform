import { AuthorDialog, AuthorNavbar } from '../../shared/components/AuthorTheme';
import React, { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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

export function WalletPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state: any) => state.user);

  // Queries
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
  const transactionsQuery = useQuery({ queryKey: ['wallet-transactions'], queryFn: listTransactions });
  const earningsQuery = useQuery({ queryKey: ['wallet-earnings'], queryFn: getWalletEarnings });
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

  // Toast / notification banner
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const availableBalance = walletQuery.data?.coinsBalance ?? 0;
  const lockedBalance = walletQuery.data?.lockedCoins ?? 0;
  const totalAccumulated = earningsQuery.data?.totalEarnedCoins ?? 0;

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
      showToast(`Rút tiền thất bại: ${getApiErrorMessage(err)}`, 'error');
    }
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackage) throw new Error('Vui lòng chọn gói Xu.');
      const session = await createDepositSession(selectedPackage);
      return completeMockDeposit(session.depositSessionId);
    },
    onSuccess: async () => {
      showToast(`Nạp thử nghiệm thành công gói ${selectedPackage}! Số dư ví đã được cộng thêm.`);
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
      let iconColor = 'text-primary';
      let isPositive = t.direction === 'IN';

      if (isDeposit) {
        category = 'deposit';
        categoryLabel = 'Nạp Xu vào ví';
        icon = 'add_card';
        iconBg = 'bg-success-bg';
        iconColor = 'text-success';
      } else if (isWithdraw) {
        category = 'withdraw';
        categoryLabel = 'Rút Xu mô phỏng';
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
        iconColor = 'text-primary';
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
        title: isWithdraw ? 'Yêu cầu rút Xu mô phỏng' : isDeposit ? 'Nạp Xu vào ví' : isTip ? (isPositive ? 'Nhận ủng hộ' : 'Ủng hộ tác giả') : isUnlock ? (isPositive ? 'Doanh thu mở khóa' : 'Mở khóa chương') : 'Giao dịch ví',
        detail: t.metadata?.bankAccountLabel || t.metadata?.message || t.description || `Mã: ${t.transactionId.substring(0, 8)}`,
        amount: Math.abs(t.amountCoins),
        balanceChangeCoins: t.balanceChangeCoins,
        isPositive,
        status: statusMap[t.status] || 'failed',
        statusLabel: t.status === 'COMPLETED' || t.status === 'SUCCESS' ? 'Hoàn tất' : t.status === 'PENDING' ? 'Đang xử lý' : t.status,
        code: t.transactionId.substring(0, 16).toUpperCase()
      };
    });

    return realTxs;
  }, [transactionsQuery.data]);

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

  const currentChart = useMemo(() => makeChart(earningsQuery.data ?? { asOfDay: new Date().toISOString().slice(0, 10), timeZone: 'Asia/Bangkok', totalEarnedCoins: 0, daily: [] }, chartPeriod), [earningsQuery.data, chartPeriod]);
  const displayedTransactions = filteredTransactions.slice((currentPage - 1) * 10, currentPage * 10);
  const transactionPages = Math.max(1, Math.ceil(filteredTransactions.length / 10));

  if (walletQuery.isLoading || transactionsQuery.isLoading || earningsQuery.isLoading) return <LoadingState label="Đang tải dữ liệu ví..." />;
  if (walletQuery.isError) return <ErrorState error={walletQuery.error} onRetry={() => void walletQuery.refetch()} />;
  if (transactionsQuery.isError) return <ErrorState error={transactionsQuery.error} onRetry={() => void transactionsQuery.refetch()} />;
  if (earningsQuery.isError) return <ErrorState error={earningsQuery.error} onRetry={() => void earningsQuery.refetch()} />;

  return (
    <div
      className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col w-full"
      style={{ backgroundColor: 'var(--sc-bg)', color: 'var(--sc-text)' }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-sm border animate-in fade-in  duration-300 bg-surface-container-lowest border-outline-variant/40">
          <span
            className={`material-symbols-outlined text-[20px] ${
              toastMessage.type === 'success' ? 'text-success' : 'text-error'
            }`}
          >
            {toastMessage.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <p className="text-body font-medium text-on-surface">{toastMessage.text}</p>
        </div>
      )}

      {/* Global Top Navbar */}
      <AuthorNavbar />

      {/* Main Content Area */}
      <main className="w-full pt-0 flex-1 bg-surface" style={{ backgroundColor: 'var(--sc-bg)' }}>
        <div className="flex flex-col w-full">
          {/* Ambient Glow */}
          <div className="relative w-full overflow-hidden">
            <div className="absolute -top-32 left-1/4 w-[400px] h-[280px] bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-12 right-10 w-[350px] h-[220px] bg-secondary-container/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-5 flex flex-col gap-4">
              {/* 1. Page Header Section */}
              <section className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-1">
                <div className="flex flex-col gap-0.5">
                  <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-outline font-label-md text-meta">
                    <Link to="/author/projects" className="hover:text-primary transition-colors">
                      Trang chủ
                    </Link>
                    <span className="text-outline-variant">/</span>
                    <span className="text-primary font-medium">Ví &amp; doanh thu</span>
                  </nav>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <h1 className="font-headline-lg text-2xl text-on-surface font-serif font-bold tracking-tight">
                      Ví &amp; Doanh Thu
                    </h1>
                  </div>
                </div>

              </section>

              <p className="text-body text-on-surface-variant">Ví thử nghiệm: nạp/rút Xu mô phỏng, không thanh toán hoặc chuyển tiền thật.</p>

              {/* 2. Balance Cards Row */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
                {/* Card 1: Số dư khả dụng */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow border border-surface-container/60">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-surface-subtle   "></div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                        </div>
                        <span className="font-label-md text-meta font-semibold text-on-surface">Số dư khả dụng</span>
                      </div>
                      <span className="font-label-sm text-meta text-primary font-medium bg-surface-container-low px-1.5 py-0.5 rounded">
                        Số dư trong ví
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {availableBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-primary">Xu</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-2">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-meta leading-snug">
                      <span className="material-symbols-outlined text-body text-primary shrink-0 mt-0.5">verified</span>
                      <span>Số Xu hiện có trong ví của bạn.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawAmount(Math.min(100, availableBalance));
                        setWithdrawModalOpen(true);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary font-label-md text-meta py-2 px-3 rounded-lg shadow-sm hover:shadow-sm transform   transition-all font-semibold"
                    >
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Yêu cầu rút Xu mô phỏng</span>
                    </button>
                  </div>
                </div>

                {/* Card 2: Xu bị khóa */}
                <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow border border-surface-container/60">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-warning-bg flex items-center justify-center text-warning">
                          <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                        </div>
                        <span className="font-label-md text-meta font-semibold text-on-surface">Xu bị khóa</span>
                      </div>
                      <span className="font-label-sm text-meta text-warning bg-warning-bg px-1.5 py-0.5 rounded font-medium">
                        Đang khóa
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {lockedBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-meta leading-snug">
                      <span className="material-symbols-outlined text-body text-warning shrink-0 mt-0.5">info</span>
                      <span>Số Xu đang bị khóa theo dữ liệu ví hiện tại.</span>
                    </div>
                  </div>
                </div>

                {/* Card 3: Tổng thu nhập tích lũy */}
                <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-sm transition-shadow border border-surface-container/60">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-success-bg flex items-center justify-center text-success">
                          <span className="material-symbols-outlined text-[16px]">military_tech</span>
                        </div>
                        <span className="font-label-md text-meta font-semibold text-on-surface">Tổng thu nhập tích lũy</span>
                      </div>
                      <span className="font-label-sm text-meta text-success bg-success-bg px-1.5 py-0.5 rounded font-medium">
                        Toàn thời gian
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {totalAccumulated.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-body font-semibold text-outline">Xu</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-meta leading-snug">
                      <span className="material-symbols-outlined text-body text-success shrink-0 mt-0.5">trending_up</span>
                      <span>Xu nhận từ lượt mở khóa chương và ủng hộ đã hoàn tất.</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Revenue Analytics Chart & Bank Info */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                {/* Left: Revenue Analytics Chart (Col 1-8: 65%) */}
                <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm border border-surface-container/60">
                  <div>
                    {/* Header Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base sm:text-lg text-on-surface font-serif font-bold">Doanh thu theo thời gian</h2>
                          <span className="inline-flex items-center gap-1 text-meta font-semibold text-success bg-success-bg px-2 py-0.5 rounded-full">
                            <span className="material-symbols-outlined text-meta">percent</span>
                            Xu nhận từ mở khóa và ủng hộ
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-meta text-outline">Tổng kỳ này:</span>
                          <span className="text-body text-on-surface font-bold">
                            {currentChart.total.toLocaleString('vi-VN')} Xu
                          </span>
                        </div>
                      </div>

                      {/* Time filter toggle tabs */}
                      <div className="inline-flex p-0.5 bg-surface-container rounded-lg self-start sm:self-auto text-on-surface-variant text-meta">
                        {(['7', '30', '365'] as PeriodType[]).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setChartPeriod(period)}
                            className={`px-2.5 py-1 rounded transition-all text-meta font-medium ${
                              chartPeriod === period
                                ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                                : 'hover:text-on-surface'
                            }`}
                          >
                            {period === '7' ? '7 ngày' : period === '30' ? '30 ngày' : '365 ngày'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-meta text-outline">
                      Kỳ trước: {currentChart.previousTotal.toLocaleString('vi-VN')} Xu · {currentChart.previousTotal > 0
                        ? `Thay đổi ${((currentChart.total - currentChart.previousTotal) / currentChart.previousTotal * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                        : 'Chưa có tỷ lệ tăng trưởng'}
                    </p>
                    {/* Chart Visualization */}
                    <div className="w-full pt-2 pb-1">
                      <div className="relative w-full h-44 flex flex-col justify-end">
                        {/* Background Gridlines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-outline-variant opacity-40">
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-meta w-6 text-right">{currentChart.maxAmount.toLocaleString('vi-VN')}</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-meta w-6 text-right">{Math.round(currentChart.maxAmount * 0.75).toLocaleString('vi-VN')}</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-meta w-6 text-right">{Math.round(currentChart.maxAmount * 0.5).toLocaleString('vi-VN')}</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-meta w-6 text-right">{Math.round(currentChart.maxAmount * 0.25).toLocaleString('vi-VN')}</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-meta w-6 text-right">0</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                        </div>

                        {/* Bars Cluster */}
                        <div className="relative pl-8 pr-1 h-36 flex items-end justify-between gap-2 sm:gap-3.5 z-10">
                          {currentChart.points.map((pt, idx) => (
                            <div key={idx} tabIndex={0} aria-label={`${pt.label}: ${pt.amount.toLocaleString('vi-VN')} Xu`} className="group flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer">
                              {/* Hover Tooltip */}
                              <div className="absolute -top-7 px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-label-sm text-meta rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-sm z-20">
                                {pt.label}: {pt.amount.toLocaleString('vi-VN')} Xu
                              </div>
                              <div
                                className={`w-full max-w-[32px] flex flex-col justify-end rounded-t-md overflow-hidden group-hover:brightness-95 transition-all ${
                                  pt.highlight ? 'shadow-sm' : ''
                                }`}
                                style={{ height: `${pt.heightPercent}%` }}
                              >
                                <div
                                  className={`w-full h-full rounded-t-sm transition-all ${
                                    pt.highlight ? 'bg-primary' : 'bg-primary-container'
                                  }`}
                                ></div>
                              </div>
                              <span
                                className={`font-label-sm text-meta mt-2 whitespace-nowrap ${
                                  pt.highlight ? 'text-primary font-bold' : 'text-on-surface-variant'
                                }`}
                              >
                                {pt.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Legend Breakdown */}
                  <div className="pt-2 mt-2 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-3 py-2 rounded-lg text-meta">
                    <div className="flex items-center gap-3.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                        <span className="text-on-surface text-meta">
                          Mở khóa chương VIP: <strong className="text-on-surface font-semibold">{currentChart.unlockCoins.toLocaleString('vi-VN')} Xu</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary-container"></span>
                        <span className="text-on-surface text-meta">
                          Độc giả ủng hộ / Tip: <strong className="text-on-surface font-semibold">{currentChart.donateCoins.toLocaleString('vi-VN')} Xu</strong>
                        </span>
                      </div>
                    </div>
                    <span className="text-meta text-tertiary">Dữ liệu giao dịch đã hoàn tất</span>
                  </div>
                </div>

                {/* Right: Connected Bank Account Card (Col 9-12: 35%) */}
                <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm border border-surface-container/60">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-body font-bold text-on-surface">Tài khoản nhận tiền</h2>
                      <span className="inline-flex items-center gap-1 text-meta font-semibold text-success bg-success-bg px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-table">verified</span>
                        Nhập khi yêu cầu rút
                      </span>
                    </div>

                    {/* Stylized Emerald Bank Card */}
                    <div className="sc-bank-card relative overflow-hidden rounded-xl p-4 flex flex-col justify-between min-h-[160px]">
                      <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none"></div>
                      <div className="absolute -right-2 top-0 w-20 h-20 rounded-full bg-white/5 pointer-events-none"></div>

                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex flex-col">
                          <span className="text-meta uppercase tracking-wider text-emerald-200/90 font-medium">
                            Ngân hàng thụ hưởng
                          </span>
                          <span className="font-semibold text-body tracking-tight">{bankName || 'Chưa nhập ngân hàng'}</span>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-xs">
                          <span className="material-symbols-outlined text-white text-[16px]">contactless</span>
                        </div>
                      </div>

                      <div className="my-2 relative z-10">
                        <span className="text-meta text-emerald-200/80 uppercase tracking-wider">
                          Số tài khoản
                        </span>
                        <p className="font-mono text-base tracking-widest mt-0.5">{bankAccount ? `•••• ${bankAccount.slice(-4)}` : 'Chưa nhập số tài khoản'}</p>
                      </div>

                      <div className="flex items-end justify-between relative z-10">
                        <div>
                          <span className="text-meta uppercase tracking-wider text-emerald-200/80">
                            Chủ tài khoản
                          </span>
                          <p className="font-semibold text-meta tracking-wide text-white">{bankHolder || 'Chưa nhập chủ tài khoản'}</p>
                        </div>
                        <div className="flex items-center gap-1 text-meta text-emerald-100">
                          <span>Ví mô phỏng</span>
                          <span className="material-symbols-outlined text-table">shield</span>
                        </div>
                      </div>
                    </div>

                    {/* Bank Details */}
                    <div className="flex flex-col gap-1.5 pt-0.5 text-meta text-on-surface-variant">
                      <div className="flex justify-between items-center py-0.5 border-b border-surface-container/60">
                        <span className="text-outline text-meta">Ngân hàng:</span>
                        <span className="text-on-surface font-medium text-right text-meta">
                          {bankName || 'Chưa nhập'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-surface-container/60">
                        <span className="text-outline text-meta">Chi nhánh:</span>
                        <span className="text-on-surface font-medium text-right text-meta">{bankBranch}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-outline text-meta">Thông tin:</span>
                        <span className="text-on-surface font-medium text-right text-meta">Chỉ dùng cho yêu cầu rút hiện tại</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setManageBankModalOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-meta transition-all shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px] text-outline">credit_card</span>
                      <span>Nhập thông tin yêu cầu rút</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* 4. Transaction History Table Section */}
              <section className="bg-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5 border border-surface-container/60">
                {/* Header and Controls */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg text-on-surface font-serif font-bold">Lịch sử giao dịch</h2>
                    <span className="text-meta px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
                      {filteredTransactions.length} giao dịch
                    </span>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative min-w-[200px]">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline">
                        search
                      </span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm nội dung hoặc mã..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-outline outline-none ring-1 ring-outline-variant/30 focus:ring-2 focus:ring-primary transition-all text-meta"
                      />
                    </div>

                    {/* Type Filter */}
                    <div className="relative">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                      >
                        <option value="all">Tất cả loại giao dịch</option>
                        <option value="vip">Doanh thu chương VIP</option>
                        <option value="tip">Độc giả ủng hộ / Tip</option>
                        <option value="withdraw">Rút Xu mô phỏng</option>
                        <option value="deposit">Nạp Xu vào ví</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none text-outline">
                        expand_more
                      </span>
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="done">Hoàn tất</option>
                        <option value="pending">Đang xử lý</option>
                        <option value="failed">Thất bại</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none text-outline">
                        expand_more
                      </span>
                    </div>

                    {/* Range Filter */}
                    <div className="relative">
                      <select
                        value={filterDateRange}
                        onChange={(e) => setFilterDateRange(e.target.value)}
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-meta"
                      >
                        <option value="all">Tất cả thời gian</option>
                        <option value="30">30 ngày gần đây</option>
                        <option value="60">60 ngày gần đây</option>
                        <option value="365">365 ngày gần đây</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none text-outline">
                        calendar_today
                      </span>
                    </div>
                  </div>
                </div>

                {/* Table Viewport */}
                <div className="w-full overflow-x-auto rounded-lg border border-surface-container/40">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant font-label-md uppercase tracking-wider text-meta">
                        <th className="py-2.5 px-3.5 font-semibold">Thời gian</th>
                        <th className="py-2.5 px-3.5 font-semibold">Loại giao dịch</th>
                        <th className="py-2.5 px-3.5 font-semibold">Nội dung chi tiết</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Số Xu</th>
                        <th className="py-2.5 px-3.5 font-semibold text-center">Trạng thái</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Mã giao dịch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container text-meta text-on-surface">
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
                                  <span className="material-symbols-outlined text-body">{tx.icon}</span>
                                </span>
                                <span className="font-medium text-meta">{tx.categoryLabel}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-sm truncate text-on-surface" title={`${tx.title} - ${tx.detail}`}>
                              {tx.title}{' '}
                              <strong className="font-medium text-primary">{tx.detail}</strong>
                            </td>
                            <td
                              className={`py-2.5 px-3.5 text-right font-bold whitespace-nowrap text-body ${
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
                                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                                  Hoàn tất
                                </span>
                              ) : tx.status === 'pending' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-semibold bg-primary-50 text-primary-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary-700 animate-pulse"></span>
                                  Đang xử lý
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta font-semibold bg-warning-bg text-warning">
                                  <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>
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
                    Hiển thị <span className="font-semibold text-on-surface">{displayedTransactions.length}</span> / {filteredTransactions.length} giao dịch
                  </p>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="w-7 h-7 rounded flex items-center justify-center text-outline-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    </button>
                    <span className="px-2">{currentPage} / {transactionPages}</span>
                    <button
                      type="button"
                      disabled={currentPage >= transactionPages}
                      onClick={() => setCurrentPage((p) => Math.min(transactionPages, p + 1))}
                      className="w-7 h-7 rounded flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* 5. Modal: Yêu cầu rút tiền */}
      {withdrawModalOpen && (
        <AuthorDialog onClose={() => setWithdrawModalOpen(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">
                  Yêu cầu rút Xu mô phỏng
                </h3>
                <p className="text-meta text-outline">
                  Yêu cầu chỉ dùng để mô phỏng, không chuyển tiền qua ngân hàng.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWithdrawModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-meta text-outline">Số dư khả dụng hiện tại</span>
                <span className="text-body text-on-surface font-bold">
                  {availableBalance.toLocaleString('vi-VN')} Xu
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
              {/* Input Xu */}
              <div className="flex flex-col gap-1">
                <label className="text-meta font-medium text-on-surface flex justify-between" htmlFor="withdraw-amount">
                  <span>Số Xu muốn rút</span>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(availableBalance)}
                    className="text-primary hover:underline font-semibold text-meta"
                  >
                    Rút tối đa ({availableBalance.toLocaleString('vi-VN')} Xu)
                  </button>
                </label>
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
                  <div className="text-meta text-error flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-table">error</span>
                    <span>Số Xu rút không được vượt quá số dư khả dụng ({availableBalance.toLocaleString('vi-VN')} Xu).</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-meta text-outline mt-0.5">
                  <span className="material-symbols-outlined text-table">info</span>
                  <span>Tối thiểu 100 Xu. Không quy đổi thành tiền thật.</span>
                </div>
              </div>


              {/* Destination Bank Confirm */}
              <div className="border-t border-surface-container pt-2.5 flex flex-col gap-1">
                <span className="text-meta text-outline">Tài khoản nhận tiền thụ hưởng:</span>
                <button type="button" onClick={() => { setWithdrawModalOpen(false); setManageBankModalOpen(true); }} className="self-start text-meta text-primary underline">{bankAccount ? 'Sửa tài khoản nhận' : 'Nhập tài khoản nhận'}</button>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low text-meta">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-success text-[18px]">account_balance</span>
                    <div>
                      <p className="font-semibold text-on-surface text-meta">
                        {bankName} {bankAccount}
                      </p>
                      <p className="text-meta text-tertiary">{bankBranch}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-meta font-semibold text-on-surface block">{bankHolder}</span>
                    <span className="inline-flex items-center gap-0.5 text-meta text-success font-semibold">
                      Thông tin do bạn cung cấp
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
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-meta font-semibold shadow-sm hover:shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>{withdrawMutation.isPending ? 'Đang gửi...' : 'Xác nhận rút tiền'}</span>
                </button>
              </div>
            </form>
          </div>
        </div></AuthorDialog>
      )}

      {/* 7. Modal: Nạp Xu Test (Graduation Project Mock Deposit) */}
      {depositModalOpen && (
        <AuthorDialog onClose={() => setDepositModalOpen(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">Nạp Xu thử nghiệm</h3>
                <p className="text-meta text-outline">Cộng thêm số dư Xu để test chức năng</p>
              </div>
              <button
                type="button"
                onClick={() => setDepositModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(depositPackagesQuery.data ?? []).map((pkg) => (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() => setSelectedPackage(pkg.code)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    selectedPackage === pkg.code
                      ? 'border-primary bg-primary-fixed/20 ring-2 ring-primary/30'
                      : 'border-surface-container hover:bg-surface-container-low'
                  }`}
                >
                  <p className="font-bold text-meta text-on-surface">{pkg.amountCoins.toLocaleString('vi-VN')} Xu</p>
                </button>
              ))}
            </div>
            {depositPackagesQuery.isError && <p className="text-meta text-error">Không tải được các gói Xu.</p>}

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
        </div></AuthorDialog>
      )}

      {/* 8. Modal: Quản lý tài khoản ngân hàng */}
      {manageBankModalOpen && (
        <AuthorDialog onClose={() => setManageBankModalOpen(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col gap-3 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">Tài khoản ngân hàng thụ hưởng</h3>
                <p className="text-meta text-outline">Nhập thông tin cho yêu cầu rút hiện tại. Hệ thống chưa lưu tài khoản ngân hàng.</p>
              </div>
              <button
                type="button"
                onClick={() => setManageBankModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <div>
                <label className="text-meta font-semibold text-on-surface-variant block mb-0.5">Ngân hàng</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta text-on-surface"
                />
              </div>

              <div>
                <label className="text-meta font-semibold text-on-surface-variant block mb-0.5">Số tài khoản</label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta font-mono text-on-surface"
                />
              </div>

              <div>
                <label className="text-meta font-semibold text-on-surface-variant block mb-0.5">Tên chủ tài khoản (in hoa)</label>
                <input
                  type="text"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-meta font-semibold text-on-surface"
                />
              </div>

              <div>
                <label className="text-meta font-semibold text-on-surface-variant block mb-0.5">Chi nhánh</label>
                <input
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
        </div></AuthorDialog>
      )}

      {/* Global Footer */}
      <footer className="w-full bg-surface-container-low mt-auto border-t border-surface-container/60">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-on-surface-variant">
          <div className="flex flex-col items-center md:items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-body text-primary font-serif font-bold">StoryCraft</span>
              <span className="text-meta text-tertiary">Văn Hoa Studio</span>
            </div>
            <p className="text-meta text-outline text-center md:text-left">
              © 2025 Nền tảng Xuất bản Văn học Văn Hoa. Bảo lưu mọi quyền.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-meta">
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors">
              Chính sách xuất bản
            </a>
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors">
              Bản quyền &amp; Sở hữu trí tuệ
            </a>
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors">
              Tiêu chuẩn cộng đồng
            </a>
            <a href="#" className="text-on-surface-variant hover:text-primary transition-colors">
              Trung tâm trợ giúp tác giả
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
