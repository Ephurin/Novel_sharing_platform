import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { PageTitle } from '../../shared/components/PageTitle';
import { card, primaryButton, secondaryButton, textInput } from '../../shared/components/ui-classes';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';

type PackageCode = 'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000';

const packages: Array<{ code: PackageCode; coins: number }> = [
  { code: 'COIN_100', coins: 100 },
  { code: 'COIN_500', coins: 500 },
  { code: 'COIN_1000', coins: 1000 },
  { code: 'COIN_5000', coins: 5000 }
];

const transactionTypes: Record<string, { label: string; icon: string; tone: string; sign: string }> = {
  DEPOSIT: { label: 'Nạp xu', icon: 'add_card', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', sign: '+' },
  UNLOCK: { label: 'Mở khóa chương', icon: 'lock_open', tone: 'text-amber-700 bg-amber-50 border-amber-200', sign: '−' },
  DONATE: { label: 'Tặng xu', icon: 'volunteer_activism', tone: 'text-primary-700 bg-primary-50 border-primary-200', sign: '' },
  WITHDRAW: { label: 'Rút tiền', icon: 'account_balance', tone: 'text-stone-700 bg-stone-100 border-stone-200', sign: '−' }
};

const transactionStatuses: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: 'Thành công', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PENDING: { label: 'Đang xử lý', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  FAILED: { label: 'Thất bại', className: 'bg-rose-100 text-rose-800 border-rose-200' }
};

export function WalletPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canWithdrawRole = user?.role === 'AUTHOR' || user?.role === 'ADMIN';
  const [packageCode, setPackageCode] = useState<PackageCode>('COIN_500');
  const [chapterId, setChapterId] = useState(localStorage.getItem('ephurin_wallet_chapter_id') ?? '');
  const [authorId, setAuthorId] = useState(localStorage.getItem('ephurin_wallet_author_id') ?? '');
  const [donationAmount, setDonationAmount] = useState(100);
  const [withdrawAmount, setWithdrawAmount] = useState(100);
  const [bankLabel, setBankLabel] = useState('Mock Bank Account');
  const [status, setStatus] = useState<{ tone: 'info' | 'error'; message: string } | null>(null);

  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
  const transactionsQuery = useQuery({ queryKey: ['wallet-transactions'], queryFn: listTransactions });
  const balance = walletQuery.data?.coinsBalance ?? 0;
  const canRequestWithdraw = Boolean(canWithdrawRole && bankLabel.trim().length >= 3 && withdrawAmount >= 100 && balance >= withdrawAmount);

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
      setStatus({ tone: 'info', message: 'Nạp xu thử nghiệm thành công.' });
      await refreshWallet();
    },
    onError: (error) => setStatus({ tone: 'error', message: `Nạp xu thất bại: ${getApiErrorMessage(error)}` })
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockChapter(chapterId),
    onSuccess: async () => {
      localStorage.setItem('ephurin_wallet_chapter_id', chapterId);
      setStatus({ tone: 'info', message: 'Đã mở khóa chương.' });
      await refreshWallet();
    },
    onError: (error) => setStatus({ tone: 'error', message: `Mở khóa thất bại: ${getApiErrorMessage(error)}` })
  });

  const donateMutation = useMutation({
    mutationFn: () => donateToAuthor(authorId, donationAmount, 'Sent from Phase 8 web UI'),
    onSuccess: async () => {
      localStorage.setItem('ephurin_wallet_author_id', authorId);
      setStatus({ tone: 'info', message: 'Đã tặng xu cho tác giả.' });
      await refreshWallet();
    },
    onError: (error) => setStatus({ tone: 'error', message: `Tặng xu thất bại: ${getApiErrorMessage(error)}` })
  });

  const withdrawMutation = useMutation({
    mutationFn: () => createWithdrawRequest(withdrawAmount, bankLabel.trim()),
    onMutate: () => setStatus({ tone: 'info', message: 'Đang tạo yêu cầu rút tiền...' }),
    onSuccess: async () => {
      setStatus({ tone: 'info', message: 'Đã gửi yêu cầu rút tiền, chờ quản trị viên duyệt.' });
      await refreshWallet();
      await queryClient.invalidateQueries({ queryKey: ['admin-withdraw'] });
    },
    onError: (error) => setStatus({ tone: 'error', message: `Rút tiền thất bại: ${getApiErrorMessage(error)}` })
  });

  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle
        title={canWithdrawRole ? 'Ví & doanh thu' : 'Ví xu'}
        description="Ví mô phỏng của đồ án: nạp xu thử nghiệm, mở khóa chương VIP, tặng tác giả và theo dõi giao dịch."
      />

      {status ? (
        <div
          className={`flex items-start gap-2 text-[12px] rounded-lg px-3 py-2 border ${
            status.tone === 'error' ? 'text-rose-800 bg-rose-50 border-rose-200' : 'text-primary-800 bg-primary-50 border-primary-200/70'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">{status.tone === 'error' ? 'error' : 'info'}</span>
          <span>{status.message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BalanceCard label="Số dư khả dụng" value={balance} icon="toll" highlight loading={walletQuery.isLoading} />
        <BalanceCard label="Đang khóa (chờ rút)" value={walletQuery.data?.lockedCoins ?? 0} icon="lock" loading={walletQuery.isLoading} />
        <BalanceCard label="Số giao dịch" value={transactions.length} icon="receipt_long" unit="" loading={transactionsQuery.isLoading} />
      </div>
      {walletQuery.isError ? <ErrorState error={walletQuery.error} onRetry={() => void walletQuery.refetch()} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${card} p-5 flex flex-col gap-4`}>
          <CardTitle icon="add_card" title="Nạp xu" description="Cổng thanh toán mô phỏng, xu được cộng ngay sau khi xác nhận." />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Gói nạp xu">
            {packages.map((item) => {
              const selected = item.code === packageCode;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPackageCode(item.code)}
                  className={`py-3 rounded-lg border text-center transition-colors cursor-pointer ${
                    selected ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200' : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div className={`text-[18px] font-bold ${selected ? 'text-primary-700' : 'text-stone-900'}`}>
                    {item.coins.toLocaleString('vi-VN')}
                  </div>
                  <div className="text-[11px] text-stone-500">xu</div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => depositMutation.mutate()}
            disabled={depositMutation.isPending}
            className={`${primaryButton} self-start`}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">payments</span>
            <span>{depositMutation.isPending ? 'Đang nạp...' : 'Nạp xu thử nghiệm'}</span>
          </button>
        </section>

        {canWithdrawRole ? (
          <section className={`${card} p-5 flex flex-col gap-4`}>
            <CardTitle
              icon="account_balance"
              title="Rút doanh thu"
              description="Tối thiểu 100 xu. Số xu yêu cầu bị khóa cho đến khi quản trị viên duyệt."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Số xu muốn rút">
                <input
                  type="number"
                  min={100}
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(Number(event.currentTarget.value) || 100)}
                  className={textInput}
                />
              </Field>
              <Field label="Tài khoản nhận">
                <input value={bankLabel} onChange={(event) => setBankLabel(event.currentTarget.value)} className={textInput} />
              </Field>
            </div>
            {balance < withdrawAmount ? (
              <p className="text-[12px] text-rose-600">Số dư khả dụng không đủ cho số xu muốn rút.</p>
            ) : null}
            <button
              onClick={() => withdrawMutation.mutate()}
              disabled={!canRequestWithdraw || withdrawMutation.isPending}
              className={`${primaryButton} self-start`}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">outbox</span>
              <span>{withdrawMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu rút'}</span>
            </button>
          </section>
        ) : (
          <section className={`${card} p-5 flex flex-col gap-4`}>
            <CardTitle
              icon="volunteer_activism"
              title="Tặng xu cho tác giả"
              description="Ủng hộ tác giả bạn yêu thích bằng xu trong ví."
            />
            <DonateFields
              authorId={authorId}
              onAuthorIdChange={setAuthorId}
              amount={donationAmount}
              onAmountChange={setDonationAmount}
            />
            <button
              onClick={() => donateMutation.mutate()}
              disabled={!authorId || donateMutation.isPending}
              className={`${primaryButton} self-start`}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">favorite</span>
              <span>{donateMutation.isPending ? 'Đang tặng...' : 'Tặng xu'}</span>
            </button>
          </section>
        )}
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-200/80">
          <span className="material-symbols-outlined text-[18px] text-primary-600">receipt_long</span>
          <h2 className="text-[15px] font-semibold text-stone-900">Lịch sử giao dịch</h2>
        </div>
        {transactionsQuery.isLoading ? <div className="p-4"><LoadingState label="Đang tải giao dịch..." /></div> : null}
        {transactionsQuery.isError ? (
          <div className="p-4">
            <ErrorState error={transactionsQuery.error} onRetry={() => void transactionsQuery.refetch()} />
          </div>
        ) : null}
        {!transactionsQuery.isLoading && !transactionsQuery.isError && !transactions.length ? (
          <p className="text-[13px] text-stone-400 text-center py-10">Chưa có giao dịch nào.</p>
        ) : null}
        {transactions.length ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-[#f9f8f4] text-stone-500 text-[11px] uppercase tracking-wider border-b border-stone-200">
                  <th className="py-2.5 px-5 font-semibold">Loại</th>
                  <th className="py-2.5 px-5 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-5 font-semibold text-right">Số xu</th>
                  <th className="py-2.5 px-5 font-semibold">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-[13px]">
                {transactions.map((transaction) => {
                  const type = transactionTypes[transaction.type] ?? {
                    label: transaction.type,
                    icon: 'swap_horiz',
                    tone: 'text-stone-700 bg-stone-100 border-stone-200',
                    sign: ''
                  };
                  const statusStyle = transactionStatuses[transaction.status] ?? {
                    label: transaction.status,
                    className: 'bg-stone-100 text-stone-700 border-stone-200'
                  };
                  return (
                    <tr key={transaction.transactionId} className="hover:bg-[#f9f8f4]/60 transition-colors">
                      <td className="py-3 px-5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-lg border flex items-center justify-center ${type.tone}`}>
                            <span className="material-symbols-outlined text-[16px]">{type.icon}</span>
                          </span>
                          <span className="font-medium text-stone-900">{type.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle.className}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right tabular-nums font-semibold text-stone-900">
                        {type.sign}
                        {transaction.amountCoins.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-5 text-stone-500 text-[12px]">{new Date(transaction.createdAt).toLocaleString('vi-VN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <details className={`${card} p-5 group`}>
        <summary className="flex items-center gap-2 cursor-pointer list-none text-[13px] font-medium text-stone-600">
          <span className="material-symbols-outlined text-[18px] text-stone-400 group-open:rotate-90 transition-transform">chevron_right</span>
          Công cụ kiểm thử (mở khóa chương VIP{canWithdrawRole ? ', tặng xu' : ''} bằng mã)
        </summary>
        <div className={`grid grid-cols-1 ${canWithdrawRole ? 'lg:grid-cols-2' : ''} gap-5 mt-4`}>
          <div className="flex flex-col gap-3">
            <Field label="Mã chương VIP">
              <input value={chapterId} onChange={(event) => setChapterId(event.currentTarget.value)} className={textInput} />
            </Field>
            <button
              onClick={() => unlockMutation.mutate()}
              disabled={!chapterId || unlockMutation.isPending}
              className={`${secondaryButton} self-start`}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px] text-stone-400">lock_open</span>
              <span>Mở khóa chương</span>
            </button>
          </div>
          {canWithdrawRole ? (
            <div className="flex flex-col gap-3">
              <DonateFields
                authorId={authorId}
                onAuthorIdChange={setAuthorId}
                amount={donationAmount}
                onAmountChange={setDonationAmount}
              />
              <button
                onClick={() => donateMutation.mutate()}
                disabled={!authorId || donateMutation.isPending}
                className={`${secondaryButton} self-start`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px] text-stone-400">volunteer_activism</span>
                <span>Tặng xu</span>
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  icon,
  unit = 'xu',
  highlight = false,
  loading = false
}: {
  label: string;
  value: number;
  icon: string;
  unit?: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`${card} p-4 flex items-center gap-3.5`}>
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
          highlight ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-stone-50 border-stone-200 text-stone-500'
        }`}
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div>
        <div className="text-[12px] text-stone-500">{label}</div>
        <div className={`text-[22px] font-bold leading-tight ${highlight ? 'text-primary-600' : 'text-stone-900'}`}>
          {loading ? '—' : value.toLocaleString('vi-VN')}
          {unit ? <span className="text-[12px] font-normal text-stone-500 ml-1">{unit}</span> : null}
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="material-symbols-outlined text-[18px] text-primary-600 mt-0.5">{icon}</span>
      <div>
        <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
        <p className="text-[12px] text-stone-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

function DonateFields({
  authorId,
  onAuthorIdChange,
  amount,
  onAmountChange
}: {
  authorId: string;
  onAuthorIdChange: (value: string) => void;
  amount: number;
  onAmountChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Mã tác giả">
        <input value={authorId} onChange={(event) => onAuthorIdChange(event.currentTarget.value)} className={textInput} />
      </Field>
      <Field label="Số xu">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(event) => onAmountChange(Number(event.currentTarget.value) || 1)}
          className={textInput}
        />
      </Field>
    </div>
  );
}
