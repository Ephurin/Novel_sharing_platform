import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  completeMockDeposit,
  createDepositSession,
  createWithdrawRequest,
  getWallet,
  listTransactions,
  type WalletTransaction
} from './wallet-api';
import { useAuthStore } from '../auth/useAuthStore';
import { getApiErrorMessage } from '../../shared/api/api-client';

type PeriodType = '7' | '30' | '365';

type ChartDataPoint = {
  label: string;
  sublabel: string;
  amount: number;
  heightPercent: number;
  highlight?: boolean;
};

const CHART_DATA_BY_PERIOD: Record<PeriodType, { total: string; growth: string; points: ChartDataPoint[] }> = {
  '7': {
    total: '8.950 Xu',
    growth: '+12.5%',
    points: [
      { label: 'Thứ 2', sublabel: '08/10', amount: 1200, heightPercent: 48 },
      { label: 'Thứ 3', sublabel: '09/10', amount: 950, heightPercent: 38 },
      { label: 'Thứ 4', sublabel: '10/10', amount: 1400, heightPercent: 56 },
      { label: 'Thứ 5', sublabel: '11/10', amount: 1100, heightPercent: 44 },
      { label: 'Thứ 6', sublabel: '12/10', amount: 1350, heightPercent: 54 },
      { label: 'Thứ 7', sublabel: '13/10', amount: 1800, heightPercent: 72 },
      { label: 'CN', sublabel: '14/10', amount: 2150, heightPercent: 86, highlight: true }
    ]
  },
  '30': {
    total: '34.200 Xu',
    growth: '+18.4%',
    points: [
      { label: '01-07/10', sublabel: 'Tuần 1', amount: 6200, heightPercent: 62 },
      { label: '08-14/10', sublabel: 'Tuần 2', amount: 7100, heightPercent: 71 },
      { label: '15-21/10', sublabel: 'Tuần 3', amount: 6850, heightPercent: 68 },
      { label: '22-28/10', sublabel: 'Tuần 4', amount: 8400, heightPercent: 84 },
      { label: '29-30/10', sublabel: 'Hôm nay', amount: 5650, heightPercent: 57, highlight: true }
    ]
  },
  '365': {
    total: '486.400 Xu',
    growth: '+28.0%',
    points: [
      { label: 'T1-T2', sublabel: 'Đầu năm', amount: 68000, heightPercent: 55 },
      { label: 'T3-T4', sublabel: 'Mùa xuân', amount: 76000, heightPercent: 62 },
      { label: 'T5-T6', sublabel: 'Hè', amount: 89000, heightPercent: 72 },
      { label: 'T7-T8', sublabel: 'Thu', amount: 94000, heightPercent: 76 },
      { label: 'T9-T10', sublabel: 'Đông', amount: 112000, heightPercent: 90 },
      { label: 'T11-T12', sublabel: 'Dự kiến', amount: 125000, heightPercent: 100, highlight: true }
    ]
  }
};

interface DisplayTransaction {
  id: string;
  time: string;
  category: 'vip' | 'tip' | 'withdraw' | 'audit' | 'deposit';
  categoryLabel: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  detail: string;
  amount: number;
  isPositive: boolean;
  status: 'done' | 'pending' | 'audit';
  statusLabel: string;
  code: string;
}

const DEFAULT_TRANSACTIONS: DisplayTransaction[] = [
  {
    id: 'tx-1',
    time: '26/10/2025 14:15',
    category: 'vip',
    categoryLabel: 'Mở khóa chương VIP',
    icon: 'menu_book',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
    title: 'Mở khóa',
    detail: 'Chương 48: Lời thú nhận – Gió Thoảng Qua Phố Cổ',
    amount: 15,
    isPositive: true,
    status: 'done',
    statusLabel: 'Hoàn tất',
    code: 'TX-20251026-0842'
  },
  {
    id: 'tx-2',
    time: '26/10/2025 11:30',
    category: 'tip',
    categoryLabel: 'Độc giả ủng hộ',
    icon: 'favorite',
    iconBg: 'bg-[#fae8ff]',
    iconColor: 'text-[#a21caf]',
    title: 'Thưởng trà ngọc lan',
    detail: 'Từ độc giả @hoanglan',
    amount: 50,
    isPositive: true,
    status: 'done',
    statusLabel: 'Hoàn tất',
    code: 'TX-20251026-0319'
  },
  {
    id: 'tx-3',
    time: '25/10/2025 16:40',
    category: 'vip',
    categoryLabel: 'Mở khóa chương VIP',
    icon: 'menu_book',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
    title: 'Mở khóa',
    detail: 'Chương 47: Quán cà phê góc phố Hàng Vải',
    amount: 15,
    isPositive: true,
    status: 'done',
    statusLabel: 'Hoàn tất',
    code: 'TX-20251025-9921'
  },
  {
    id: 'tx-4',
    time: '20/10/2025 09:00',
    category: 'withdraw',
    categoryLabel: 'Rút tiền về ngân hàng',
    icon: 'north_east',
    iconBg: 'bg-[#fee2e2]',
    iconColor: 'text-[#dc2626]',
    title: 'Lệnh rút tiền về Vietcombank',
    detail: 'Tài khoản thụ hưởng •••• 4829',
    amount: 50000,
    isPositive: false,
    status: 'done',
    statusLabel: 'Hoàn tất',
    code: 'WD-20251020-0112'
  },
  {
    id: 'tx-5',
    time: '18/10/2025 17:20',
    category: 'withdraw',
    categoryLabel: 'Rút tiền về ngân hàng',
    icon: 'north_east',
    iconBg: 'bg-[#fee2e2]',
    iconColor: 'text-[#dc2626]',
    title: 'Lệnh rút tiền định kỳ tháng 10',
    detail: 'Chờ đối tác giải ngân liên ngân hàng',
    amount: 30000,
    isPositive: false,
    status: 'pending',
    statusLabel: 'Đang xử lý',
    code: 'WD-20251018-0450'
  },
  {
    id: 'tx-6',
    time: '15/10/2025 00:00',
    category: 'audit',
    categoryLabel: 'Chốt đối soát kỳ 1',
    icon: 'rule',
    iconBg: 'bg-[#fef3c7]',
    iconColor: 'text-[#d97706]',
    title: 'Đối soát doanh thu độc quyền tháng 10',
    detail: 'Kỳ soát đợt 1 toàn bộ tác phẩm',
    amount: 18500,
    isPositive: true,
    status: 'audit',
    statusLabel: 'Chờ đối soát',
    code: 'ST-20251015-0001'
  }
];

export function WalletPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state: any) => state.user);

  // Queries
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
  const transactionsQuery = useQuery({ queryKey: ['wallet-transactions'], queryFn: listTransactions });

  // Bank state
  const [bankName, setBankName] = useState('Vietcombank');
  const [bankAccount, setBankAccount] = useState('•••• •••• •••• 4829');
  const [bankBranch, setBankBranch] = useState('CN Hoàn Kiếm, Hà Nội');
  const [bankHolder, setBankHolder] = useState(user?.displayName ? user.displayName.toUpperCase() : 'MAI LINH');

  // Modals state
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [manageBankModalOpen, setManageBankModalOpen] = useState(false);

  // Withdraw Form State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(50000);
  const [withdrawBankLabel, setWithdrawBankLabel] = useState('Vietcombank - ****4829 - MAI LINH');

  // Deposit Form State
  const [selectedPackage, setSelectedPackage] = useState<'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000'>('COIN_500');

  // Chart & Filter state
  const [chartPeriod, setChartPeriod] = useState<PeriodType>('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('30');
  const [currentPage, setCurrentPage] = useState(1);

  // Toast / notification banner
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const availableBalance = walletQuery.data?.coinsBalance ?? 125000;
  const lockedBalance = walletQuery.data?.lockedCoins ?? 18500;
  const totalAccumulated = availableBalance + 361400;

  // Mutations
  const withdrawMutation = useMutation({
    mutationFn: () => createWithdrawRequest(withdrawAmount, withdrawBankLabel),
    onSuccess: async () => {
      showToast(`Yêu cầu rút ${withdrawAmount.toLocaleString('vi-VN')} Xu thành công! Tiền sẽ về tài khoản sau 1-3 ngày làm việc.`);
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

  // Combine real transactions with prototype seed transactions
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
      let isPositive = true;

      if (isDeposit) {
        category = 'deposit';
        categoryLabel = 'Nạp Xu vào ví';
        icon = 'add_card';
        iconBg = 'bg-[#ecfdf5]';
        iconColor = 'text-[#059669]';
        isPositive = true;
      } else if (isWithdraw) {
        category = 'withdraw';
        categoryLabel = 'Rút tiền về ngân hàng';
        icon = 'north_east';
        iconBg = 'bg-[#fee2e2]';
        iconColor = 'text-[#dc2626]';
        isPositive = false;
      } else if (isTip) {
        category = 'tip';
        categoryLabel = 'Độc giả ủng hộ';
        icon = 'favorite';
        iconBg = 'bg-[#fae8ff]';
        iconColor = 'text-[#a21caf]';
        isPositive = true;
      } else if (isUnlock) {
        category = 'vip';
        categoryLabel = 'Mở khóa chương VIP';
        icon = 'menu_book';
        iconBg = 'bg-primary-fixed';
        iconColor = 'text-primary';
        isPositive = true;
      }

      const statusMap: Record<string, DisplayTransaction['status']> = {
        COMPLETED: 'done',
        SUCCESS: 'done',
        PENDING: 'pending',
        FAILED: 'audit'
      };

      return {
        id: t.transactionId,
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
        title: isWithdraw ? 'Lệnh rút tiền về ngân hàng' : isDeposit ? 'Nạp Xu thử nghiệm' : 'Giao dịch ví',
        detail: t.description || `Mã: ${t.transactionId.substring(0, 8)}`,
        amount: Math.abs(t.amountCoins),
        isPositive,
        status: statusMap[t.status] || 'done',
        statusLabel: t.status === 'COMPLETED' || t.status === 'SUCCESS' ? 'Hoàn tất' : t.status === 'PENDING' ? 'Đang xử lý' : t.status,
        code: t.transactionId.substring(0, 16).toUpperCase()
      };
    });

    return [...realTxs, ...DEFAULT_TRANSACTIONS];
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
      else if (filterType === 'audit') matchType = tx.category === 'audit';
      else if (filterType === 'deposit') matchType = tx.category === 'deposit';

      let matchStatus = true;
      if (filterStatus === 'done') matchStatus = tx.status === 'done';
      else if (filterStatus === 'pending') matchStatus = tx.status === 'pending';
      else if (filterStatus === 'audit') matchStatus = tx.status === 'audit';

      return matchQuery && matchType && matchStatus;
    });
  }, [combinedTransactions, searchQuery, filterType, filterStatus]);

  const currentChart = CHART_DATA_BY_PERIOD[chartPeriod as PeriodType];

  return (
    <div
      className="bg-[#faf8ff] font-body-md text-[#131b2e] antialiased min-h-screen flex flex-col w-full"
      style={{ backgroundColor: '#faf8ff', color: '#131b2e' }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border animate-in fade-in slide-in-from-top-4 duration-300 bg-surface-container-lowest border-outline-variant/40">
          <span
            className={`material-symbols-outlined text-[20px] ${
              toastMessage.type === 'success' ? 'text-[#059669]' : 'text-error'
            }`}
          >
            {toastMessage.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <p className="text-sm font-medium text-on-surface">{toastMessage.text}</p>
        </div>
      )}

      {/* Global Top Navbar */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-[#faf8ff]/95 backdrop-blur-md border-b border-[#eaedff] shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
        <div className="h-14 max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between gap-4">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-6 lg:gap-8 min-w-0">
            <Link to="/author/projects" className="flex items-center gap-2 group whitespace-nowrap shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm group-hover:bg-primary-container transition-colors shrink-0">
                <span className="material-symbols-outlined text-[18px]">auto_stories</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-headline-sm text-[16px] tracking-tight text-primary leading-none font-bold">
                  StoryCraft
                </span>
                <span className="font-label-sm text-[9px] tracking-wider uppercase text-tertiary font-bold bg-[#f2f3ff] px-1.5 py-0.5 rounded border border-[#eaedff]">
                  Văn Hoa Studio
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-5 h-14 shrink-0">
              <Link
                to="/author/projects"
                className="h-14 flex items-center font-body-md text-xs text-[#464555] hover:text-[#131b2e] transition-colors whitespace-nowrap"
              >
                Tổng quan
              </Link>
              <Link
                to="/author/projects"
                className="h-14 flex items-center font-body-md text-xs text-[#464555] hover:text-[#131b2e] transition-colors whitespace-nowrap"
              >
                Tác phẩm
              </Link>
              <Link
                to="/wallet"
                className="h-14 flex items-center transition-colors text-primary font-semibold text-xs relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary after:rounded-full whitespace-nowrap"
              >
                Ví &amp; doanh thu
              </Link>
              <Link
                to="/author/profile"
                className="h-14 flex items-center font-body-md text-xs text-[#464555] hover:text-[#131b2e] transition-colors whitespace-nowrap"
              >
                Trang tác giả
              </Link>
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setDepositModalOpen(true)}
              type="button"
              className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-primary/20 transition-all whitespace-nowrap shrink-0"
              title="Nạp thêm xu thử nghiệm để kiểm tra tính năng"
            >
              <span className="material-symbols-outlined text-[15px]">add_circle</span>
              <span className="hidden sm:inline">Nạp Xu test</span>
            </button>

            <Link
              to="/author/projects"
              className="hidden sm:flex items-center gap-1 bg-primary hover:bg-primary-container text-on-primary font-label-md text-[11px] font-semibold px-3 py-1 rounded-lg shadow-sm transition-all transform hover:-translate-y-0.5 whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">edit_square</span>
              <span>Viết chương mới</span>
            </Link>

            <button
              aria-label="Thông báo"
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors relative shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary ring-2 ring-surface"></span>
            </button>

            <div className="flex items-center gap-1.5 pl-1 shrink-0">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm text-on-primary shrink-0">
                <span className="material-symbols-outlined text-[16px]">person</span>
              </div>
              <div className="hidden lg:flex flex-col text-left whitespace-nowrap">
                <span className="font-label-md text-[11px] text-[#131b2e] font-semibold leading-tight">
                  {user?.displayName || user?.username || 'Mai Linh'}
                </span>
                <span className="font-label-sm text-[10px] text-[#777587] leading-tight">
                  @{user?.username || 'moclan'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-14 flex-1 bg-[#faf8ff]" style={{ backgroundColor: '#faf8ff' }}>
        <div className="flex flex-col w-full">
          {/* Ambient Glow */}
          <div className="relative w-full overflow-hidden">
            <div className="absolute -top-32 left-1/4 w-[400px] h-[280px] bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-12 right-10 w-[350px] h-[220px] bg-secondary-container/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-5 flex flex-col gap-4">
              {/* 1. Page Header Section */}
              <section className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-1">
                <div className="flex flex-col gap-0.5">
                  <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[#777587] font-label-md text-[11px]">
                    <Link to="/author/projects" className="hover:text-primary transition-colors">
                      Trang chủ
                    </Link>
                    <span className="text-[#c7c4d8]">/</span>
                    <span className="text-primary font-medium">Ví &amp; doanh thu</span>
                  </nav>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <h1 className="font-headline-lg text-2xl text-[#131b2e] font-serif font-bold tracking-tight">
                      Ví &amp; Doanh Thu
                    </h1>
                    <span className="font-label-sm text-[10px] px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-semibold uppercase tracking-wider">
                      Tác giả Văn Hoa
                    </span>
                  </div>
                  <p className="font-body-md text-xs text-[#464555]">
                    Theo dõi dòng tiền tác quyền, bảo chứng thu nhập từ tác phẩm và quản lý các giao dịch ký quỹ của bạn.
                  </p>
                </div>

                {/* Policy Modal Trigger */}
                <button
                  type="button"
                  onClick={() => setPolicyModalOpen(true)}
                  className="group self-start md:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-all text-primary font-label-md text-xs shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform">article</span>
                  <span>Chính sách phân chia doanh thu &amp; biểu phí tác giả</span>
                  <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">
                    arrow_forward
                  </span>
                </button>
              </section>

              {/* 2. Balance Cards Row */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
                {/* Card 1: Số dư khả dụng */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow border border-surface-container/60">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary-container to-secondary-container"></div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                        </div>
                        <span className="font-label-md text-xs font-semibold text-on-surface">Số dư khả dụng</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-primary font-medium bg-surface-container-low px-1.5 py-0.5 rounded">
                        1 Xu = 100 VNĐ
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {availableBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-sm font-semibold text-primary">Xu</span>
                      </div>
                      <p className="text-xs text-outline">
                        Quy đổi tham khảo:{' '}
                        <strong className="text-on-surface font-semibold">
                          {(availableBalance * 100).toLocaleString('vi-VN')} VNĐ
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-2">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-[11px] leading-snug">
                      <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">verified</span>
                      <span>Thu nhập đã đối soát hợp lệ, có thể yêu cầu rút về tài khoản ngân hàng ngay.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawAmount(Math.min(50000, availableBalance));
                        setWithdrawModalOpen(true);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary font-label-md text-xs py-2 px-3 rounded-lg shadow-sm hover:shadow-md transform hover:-translate-y-0.5 active:translate-y-0 transition-all font-semibold"
                    >
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Yêu cầu rút tiền</span>
                    </button>
                  </div>
                </div>

                {/* Card 2: Xu chờ đối soát */}
                <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow border border-surface-container/60">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center text-[#d97706]">
                          <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                        </div>
                        <span className="font-label-md text-xs font-semibold text-on-surface">Xu chờ đối soát</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-[#b45309] bg-[#fffbeb] px-1.5 py-0.5 rounded font-medium">
                        Kỳ soát 15 hàng tháng
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {lockedBalance.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-sm font-semibold text-outline">Xu</span>
                      </div>
                      <p className="text-xs text-outline">
                        Tương đương:{' '}
                        <strong className="text-on-surface font-semibold">
                          {(lockedBalance * 100).toLocaleString('vi-VN')} VNĐ
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-[11px] leading-snug">
                      <span className="material-symbols-outlined text-[14px] text-[#b45309] shrink-0 mt-0.5">info</span>
                      <span>Doanh thu chương VIP &amp; ủng hộ trong kỳ hiện tại, đang chờ đối soát vào ngày chốt kỳ.</span>
                    </div>
                  </div>
                </div>

                {/* Card 3: Tổng thu nhập tích lũy */}
                <div className="rounded-xl bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow border border-surface-container/60">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-lg bg-[#ecfdf5] flex items-center justify-center text-[#059669]">
                          <span className="material-symbols-outlined text-[16px]">military_tech</span>
                        </div>
                        <span className="font-label-md text-xs font-semibold text-on-surface">Tổng thu nhập tích lũy</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-[#047857] bg-[#f0fdf4] px-1.5 py-0.5 rounded font-medium">
                        Toàn thời gian
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl text-on-surface tracking-tight font-serif font-bold">
                          {totalAccumulated.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-sm font-semibold text-outline">Xu</span>
                      </div>
                      <p className="text-xs text-outline">
                        Tổng cộng:{' '}
                        <strong className="text-on-surface font-semibold">
                          {(totalAccumulated * 100).toLocaleString('vi-VN')} VNĐ
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 bg-surface-container-low rounded-lg p-2.5">
                    <div className="flex items-start gap-1.5 text-on-surface-variant text-[11px] leading-snug">
                      <span className="material-symbols-outlined text-[14px] text-[#059669] shrink-0 mt-0.5">trending_up</span>
                      <span>Toàn bộ doanh thu bản quyền được ghi nhận lũy kế từ trước đến nay qua mọi tác phẩm.</span>
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#047857] bg-[#ecfdf5] px-2 py-0.5 rounded-full">
                            <span className="material-symbols-outlined text-[12px]">percent</span>
                            Thu nhập thực nhận sau phân chia (70%)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-outline">Tổng kỳ này:</span>
                          <span className="text-sm text-on-surface font-bold">
                            {currentChart.total}
                          </span>
                          <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#059669]">
                            <span className="material-symbols-outlined text-[12px]">arrow_upward</span>
                            {currentChart.growth}
                          </span>
                        </div>
                      </div>

                      {/* Time filter toggle tabs */}
                      <div className="inline-flex p-0.5 bg-surface-container rounded-lg self-start sm:self-auto text-on-surface-variant text-xs">
                        {(['7', '30', '365'] as PeriodType[]).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setChartPeriod(period)}
                            className={`px-2.5 py-1 rounded transition-all text-xs font-medium ${
                              chartPeriod === period
                                ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs'
                                : 'hover:text-on-surface'
                            }`}
                          >
                            {period === '7' ? '7 ngày' : period === '30' ? '30 ngày' : '12 tháng'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Chart Visualization */}
                    <div className="w-full pt-2 pb-1">
                      <div className="relative w-full h-44 flex flex-col justify-end">
                        {/* Background Gridlines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-outline-variant opacity-40">
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-[9px] w-6 text-right">10k</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-[9px] w-6 text-right">7.5k</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-[9px] w-6 text-right">5k</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-[9px] w-6 text-right">2.5k</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                          <div className="w-full flex items-center gap-2">
                            <span className="font-label-sm text-[9px] w-6 text-right">0</span>
                            <div className="h-[1px] w-full bg-surface-container-highest"></div>
                          </div>
                        </div>

                        {/* Bars Cluster */}
                        <div className="relative pl-8 pr-1 h-36 flex items-end justify-between gap-2 sm:gap-3.5 z-10">
                          {currentChart.points.map((pt, idx) => (
                            <div key={idx} className="group flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer">
                              {/* Hover Tooltip */}
                              <div className="absolute -top-7 px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-label-sm text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-20">
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
                                className={`font-label-sm text-[10px] mt-2 whitespace-nowrap ${
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
                  <div className="pt-2 mt-2 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-3 py-2 rounded-lg text-xs">
                    <div className="flex items-center gap-3.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                        <span className="text-on-surface text-xs">
                          Mở khóa chương VIP: <strong className="text-on-surface font-semibold">82%</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary-container"></span>
                        <span className="text-on-surface text-xs">
                          Độc giả ủng hộ / Tip: <strong className="text-on-surface font-semibold">18%</strong>
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-tertiary">Dữ liệu kết chuyển tự động mỗi 24h</span>
                  </div>
                </div>

                {/* Right: Connected Bank Account Card (Col 9-12: 35%) */}
                <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm border border-surface-container/60">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-on-surface">Tài khoản nhận tiền</h2>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#047857] bg-[#ecfdf5] px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[13px]">verified</span>
                        KYC chính chủ
                      </span>
                    </div>

                    {/* Stylized Emerald Bank Card */}
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#022c22] text-white p-3.5 shadow-md flex flex-col justify-between min-h-[145px]">
                      <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none"></div>
                      <div className="absolute -right-2 top-0 w-20 h-20 rounded-full bg-white/5 pointer-events-none"></div>

                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-emerald-200/90 font-medium">
                            Ngân hàng thụ hưởng
                          </span>
                          <span className="font-semibold text-sm tracking-tight">{bankName}</span>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-xs">
                          <span className="material-symbols-outlined text-white text-[16px]">contactless</span>
                        </div>
                      </div>

                      <div className="my-2 relative z-10">
                        <span className="text-[10px] text-emerald-200/80 uppercase tracking-wider">
                          Số tài khoản
                        </span>
                        <p className="font-mono text-base tracking-widest text-white/95 mt-0.5">{bankAccount}</p>
                      </div>

                      <div className="flex items-end justify-between relative z-10">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-emerald-200/80">
                            Chủ tài khoản
                          </span>
                          <p className="font-semibold text-xs tracking-wide text-white">{bankHolder}</p>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-100">
                          <span>Văn Hoa Payout</span>
                          <span className="material-symbols-outlined text-[13px]">shield</span>
                        </div>
                      </div>
                    </div>

                    {/* Bank Details */}
                    <div className="flex flex-col gap-1.5 pt-0.5 text-xs text-on-surface-variant">
                      <div className="flex justify-between items-center py-0.5 border-b border-surface-container/60">
                        <span className="text-outline text-[11px]">Ngân hàng:</span>
                        <span className="text-on-surface font-medium text-right text-[11px]">
                          TMCP Ngoại Thương VN ({bankName})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-surface-container/60">
                        <span className="text-outline text-[11px]">Chi nhánh:</span>
                        <span className="text-on-surface font-medium text-right text-[11px]">{bankBranch}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-outline text-[11px]">Hạn mức rút / ngày:</span>
                        <span className="text-on-surface font-medium text-right text-[11px]">100.000.000 VNĐ</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setManageBankModalOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-all shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px] text-outline">credit_card</span>
                      <span>Quản lý tài khoản ngân hàng</span>
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
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
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
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-outline outline-none ring-1 ring-outline-variant/30 focus:ring-2 focus:ring-primary transition-all text-xs"
                      />
                    </div>

                    {/* Type Filter */}
                    <div className="relative">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-xs"
                      >
                        <option value="all">Tất cả loại giao dịch</option>
                        <option value="vip">Doanh thu chương VIP</option>
                        <option value="tip">Độc giả ủng hộ / Tip</option>
                        <option value="withdraw">Rút tiền về ngân hàng</option>
                        <option value="audit">Chốt đối soát định kỳ</option>
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
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-xs"
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="done">Hoàn tất</option>
                        <option value="pending">Đang xử lý</option>
                        <option value="audit">Chờ đối soát</option>
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
                        className="appearance-none pl-2.5 pr-7 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md outline-none cursor-pointer text-xs"
                      >
                        <option value="30">30 ngày gần đây</option>
                        <option value="60">60 ngày gần đây</option>
                        <option value="365">Năm 2025</option>
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
                      <tr className="bg-surface-container-low text-on-surface-variant font-label-md uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3.5 font-semibold">Thời gian</th>
                        <th className="py-2.5 px-3.5 font-semibold">Loại giao dịch</th>
                        <th className="py-2.5 px-3.5 font-semibold">Nội dung chi tiết</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Số Xu</th>
                        <th className="py-2.5 px-3.5 font-semibold text-center">Trạng thái</th>
                        <th className="py-2.5 px-3.5 font-semibold text-right">Mã giao dịch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container text-xs text-on-surface">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-outline">
                            Không tìm thấy giao dịch nào phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-surface-container-low/60 transition-colors group">
                            <td className="py-2.5 px-3.5 text-[11px] font-mono text-outline whitespace-nowrap">
                              {tx.time}
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded ${tx.iconBg} ${tx.iconColor} flex items-center justify-center shrink-0`}>
                                  <span className="material-symbols-outlined text-[14px]">{tx.icon}</span>
                                </span>
                                <span className="font-medium text-xs">{tx.categoryLabel}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-sm truncate text-on-surface" title={`${tx.title} - ${tx.detail}`}>
                              {tx.title}{' '}
                              <strong className="font-medium text-primary">{tx.detail}</strong>
                            </td>
                            <td
                              className={`py-2.5 px-3.5 text-right font-bold whitespace-nowrap text-sm ${
                                tx.isPositive ? 'text-[#059669]' : 'text-[#dc2626]'
                              }`}
                            >
                              {tx.isPositive ? '+' : '-'}
                              {tx.amount.toLocaleString('vi-VN')}{' '}
                              <span className="text-[10px] font-normal text-outline">Xu</span>
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              {tx.status === 'done' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#059669]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#059669]"></span>
                                  Hoàn tất
                                </span>
                              ) : tx.status === 'pending' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#eff6ff] text-[#2563eb]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-pulse"></span>
                                  Đang xử lý
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fffbeb] text-[#b45309]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]"></span>
                                  Chờ đối soát
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono text-[11px] text-outline whitespace-nowrap group-hover:text-on-surface">
                              {tx.code}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                  <p className="text-outline">
                    Hiển thị <span className="font-semibold text-on-surface">{filteredTransactions.length}</span> giao dịch
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
                    <button
                      type="button"
                      className="w-7 h-7 rounded bg-primary text-on-primary font-semibold text-xs flex items-center justify-center"
                    >
                      1
                    </button>
                    <button
                      type="button"
                      className="w-7 h-7 rounded hover:bg-surface-container text-on-surface text-xs flex items-center justify-center transition-colors"
                    >
                      2
                    </button>
                    <button
                      type="button"
                      className="w-7 h-7 rounded hover:bg-surface-container text-on-surface text-xs flex items-center justify-center transition-colors"
                    >
                      3
                    </button>
                    <span className="w-5 text-center text-outline text-[11px]">...</span>
                    <button
                      type="button"
                      disabled
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">
                  Yêu cầu rút tiền về ngân hàng
                </h3>
                <p className="text-xs text-outline">
                  Chuyển đổi số dư Xu sang tiền VNĐ vào tài khoản đã xác minh KYC
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
                <span className="text-[11px] text-outline">Số dư khả dụng hiện tại</span>
                <span className="text-sm text-on-surface font-bold">
                  {availableBalance.toLocaleString('vi-VN')} Xu
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-outline">Quy đổi tương ứng</span>
                <p className="text-xs font-semibold text-primary">
                  ~{(availableBalance * 100).toLocaleString('vi-VN')} VNĐ
                </p>
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
                <label className="text-xs font-medium text-on-surface flex justify-between" htmlFor="withdraw-amount">
                  <span>Số Xu muốn rút</span>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(availableBalance)}
                    className="text-primary hover:underline font-semibold text-[11px]"
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
                    step={100}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value) || 0)}
                    className="w-full pl-3 pr-14 py-2 rounded-lg bg-surface-container-lowest ring-1 ring-outline-variant focus:ring-2 focus:ring-primary outline-none text-base text-on-surface font-bold transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-outline font-semibold">
                    Xu
                  </span>
                </div>

                {withdrawAmount > availableBalance && (
                  <div className="text-[11px] text-error flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[13px]">error</span>
                    <span>Số Xu rút không được vượt quá số dư khả dụng ({availableBalance.toLocaleString('vi-VN')} Xu).</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[11px] text-outline mt-0.5">
                  <span className="material-symbols-outlined text-[13px]">info</span>
                  <span>Tối thiểu 100 Xu. 1 Xu = 100 VNĐ.</span>
                </div>
              </div>

              {/* Real Amount Preview */}
              <div className="p-2.5 bg-surface-container rounded-lg flex items-center justify-between">
                <span className="text-xs text-on-surface">Thực nhận về tài khoản:</span>
                <div className="text-right">
                  <span className="text-sm text-[#059669] font-bold">
                    {(withdrawAmount * 100).toLocaleString('vi-VN')} VNĐ
                  </span>
                  <span className="block text-[10px] text-[#059669] font-medium">Miễn phí giao dịch nền tảng Văn Hoa</span>
                </div>
              </div>

              {/* Destination Bank Confirm */}
              <div className="border-t border-surface-container pt-2.5 flex flex-col gap-1">
                <span className="text-[10px] text-outline">Tài khoản nhận tiền thụ hưởng:</span>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low text-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#047857] text-[18px]">account_balance</span>
                    <div>
                      <p className="font-semibold text-on-surface text-xs">
                        {bankName} {bankAccount}
                      </p>
                      <p className="text-[10px] text-tertiary">{bankBranch}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[11px] font-semibold text-on-surface block">{bankHolder}</span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-[#047857] font-semibold">
                      <span className="material-symbols-outlined text-[11px]">check_circle</span> KYC hợp lệ
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-2 rounded bg-surface-container-low text-[11px] text-on-surface-variant flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-tertiary mt-0.5">schedule</span>
                <span>
                  Thời gian xử lý: 1-3 ngày làm việc theo chu kỳ chuyển khoản liên ngân hàng. Biểu phí và điều kiện tuân thủ theo
                  quy chế tác giả Văn Hoa.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 mt-1">
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={withdrawAmount <= 0 || withdrawAmount > availableBalance || withdrawMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>{withdrawMutation.isPending ? 'Đang gửi...' : 'Xác nhận rút tiền'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Chính sách doanh thu */}
      {policyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-surface-container-lowest rounded-xl shadow-2xl p-5 flex flex-col gap-3.5 max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-surface-container/60">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-surface-container pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary-fixed text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">article</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">
                    Chính sách phân chia doanh thu &amp; biểu phí tác giả
                  </h3>
                  <p className="text-[11px] text-outline">
                    Áp dụng chính thức cho các tác giả xuất bản nội dung số tại Văn Hoa Studio
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Content Body */}
            <div className="flex flex-col gap-3 text-on-surface text-xs leading-relaxed">
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 border-l-4 border-primary">
                <h4 className="font-semibold text-primary flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-[16px]">pie_chart</span>
                  1. Tỷ lệ phân chia tác quyền (70% / 30%)
                </h4>
                <p className="text-on-surface-variant text-[11px]">
                  Tác giả ký kết hợp đồng xuất bản tiêu chuẩn nhận tỷ lệ cố định{' '}
                  <strong className="text-on-surface font-semibold">70%</strong> trên toàn bộ doanh thu mở khóa chương trả phí (VIP) và đóng góp quà tặng từ độc giả. Phần{' '}
                  <strong className="text-on-surface font-semibold">30%</strong> còn lại được phân bổ cho chi phí vận hành máy chủ, cổng thanh toán viễn thông, tiếp thị tác phẩm và bảo vệ bản quyền số.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 border-l-4 border-secondary">
                <h4 className="font-semibold text-secondary flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
                  2. Cơ chế quy đổi Xu &amp; định giá nội dung
                </h4>
                <p className="text-on-surface-variant text-[11px]">
                  Đơn vị giao dịch trên nền tảng được chuẩn hóa:{' '}
                  <strong className="text-on-surface font-semibold">1 Xu = 100 VNĐ</strong> quy đổi tham khảo theo quy chế nền tảng. Tác giả có quyền chủ động định giá mở khóa mỗi chương từ 5 Xu đến 30 Xu tùy theo khối lượng chữ và mức độ độc quyền.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 border-l-4 border-[#059669]">
                <h4 className="font-semibold text-[#059669] flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-[16px]">event_available</span>
                  3. Chu kỳ và quy trình đối soát
                </h4>
                <p className="text-on-surface-variant text-[11px]">
                  Hệ thống tự động chốt kỳ đối soát định kỳ vào{' '}
                  <strong className="text-on-surface font-semibold">ngày 15 hàng tháng</strong> cho toàn bộ phát sinh tháng dương lịch liền trước. Sau khi tác giả xác nhận đối soát trên cổng quản trị, lệnh rút tiền hợp lệ sẽ được giải ngân vào tài khoản ngân hàng trong vòng{' '}
                  <strong className="text-on-surface font-semibold">3-5 ngày làm việc</strong>.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 border-l-4 border-outline">
                <h4 className="font-semibold text-on-surface flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  4. Chính sách thuế TNCN &amp; điều kiện giải ngân
                </h4>
                <p className="text-on-surface-variant text-[11px]">
                  Theo quy định của pháp luật hiện hành, các khoản thu nhập từ bản quyền trên 2.000.000 VNĐ/lần chi trả sẽ được khấu trừ thuế TNCN (hoặc kê khai theo mã số thuế cá nhân đã đăng ký trên hồ sơ tác giả). Tài khoản nhận tiền bắt buộc phải trùng khớp họ tên với chứng minh nhân dân/CCCD đã KYC.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-surface-container pt-2.5">
              <span className="text-[10px] text-outline">Phiên bản chính sách 2.4 - Có hiệu lực từ 01/2025</span>
              <button
                type="button"
                onClick={() => setPolicyModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Nạp Xu Test (Graduation Project Mock Deposit) */}
      {depositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-2xl p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">Nạp Xu thử nghiệm</h3>
                <p className="text-xs text-outline">Cộng thêm số dư Xu để test chức năng</p>
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
              {[
                { code: 'COIN_100', label: '100 Xu', price: '10.000 VNĐ' },
                { code: 'COIN_500', label: '500 Xu', price: '50.000 VNĐ' },
                { code: 'COIN_1000', label: '1.000 Xu', price: '100.000 VNĐ' },
                { code: 'COIN_5000', label: '5.000 Xu', price: '500.000 VNĐ' }
              ].map((pkg) => (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() => setSelectedPackage(pkg.code as any)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    selectedPackage === pkg.code
                      ? 'border-primary bg-primary-fixed/20 ring-2 ring-primary/30'
                      : 'border-surface-container hover:bg-surface-container-low'
                  }`}
                >
                  <p className="font-bold text-xs text-on-surface">{pkg.label}</p>
                  <p className="text-[11px] text-outline">{pkg.price}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDepositModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={depositMutation.isPending}
                onClick={() => depositMutation.mutate()}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold transition-all disabled:opacity-50"
              >
                {depositMutation.isPending ? 'Đang nạp...' : 'Xác nhận nạp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Quản lý tài khoản ngân hàng */}
      {manageBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-xl shadow-2xl p-5 flex flex-col gap-3 animate-in zoom-in-95 duration-200 border border-surface-container/60">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-base text-on-surface font-bold">Tài khoản ngân hàng thụ hưởng</h3>
                <p className="text-xs text-outline">Cập nhật thông tin nhận chi trả tác quyền</p>
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
                <label className="text-[11px] font-semibold text-on-surface-variant block mb-0.5">Ngân hàng</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-on-surface-variant block mb-0.5">Số tài khoản</label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-xs font-mono text-on-surface"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-on-surface-variant block mb-0.5">Tên chủ tài khoản (in hoa)</label>
                <input
                  type="text"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-xs font-semibold text-on-surface"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-on-surface-variant block mb-0.5">Chi nhánh</label>
                <input
                  type="text"
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-low ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary outline-none text-xs text-on-surface"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setManageBankModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawBankLabel(`${bankName} - ${bankAccount} - ${bankHolder}`);
                  showToast('Đã lưu thông tin tài khoản ngân hàng thụ hưởng!');
                  setManageBankModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold transition-all"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Footer */}
      <footer className="w-full bg-surface-container-low mt-auto border-t border-surface-container/60">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-on-surface-variant">
          <div className="flex flex-col items-center md:items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-primary font-serif font-bold">StoryCraft</span>
              <span className="text-[10px] text-tertiary">Văn Hoa Studio</span>
            </div>
            <p className="text-[11px] text-outline text-center md:text-left">
              © 2025 Nền tảng Xuất bản Văn học Văn Hoa. Bảo lưu mọi quyền.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-[11px]">
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
