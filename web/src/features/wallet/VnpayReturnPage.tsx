import { navigationHref } from '../../shared/routes';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { confirmVnpayReturn } from './wallet-api';

// VNPay response codes a tester is likely to hit in the sandbox.
const VNPAY_FAILURE_REASONS: Record<string, string> = {
  '24': 'Bạn đã huỷ giao dịch trên trang VNPay.',
  '11': 'Đã hết thời gian chờ thanh toán.',
  '12': 'Thẻ hoặc tài khoản bị khoá.',
  '13': 'Nhập sai mã OTP.',
  '51': 'Tài khoản không đủ số dư.',
  '65': 'Tài khoản đã vượt hạn mức giao dịch trong ngày.',
  '75': 'Ngân hàng thanh toán đang bảo trì.',
  '79': 'Nhập sai mật khẩu thanh toán quá số lần quy định.'
};

/**
 * VNPay sends the browser back here with a signed query string. The page only forwards it;
 * the backend verifies the signature and amount, then credits the wallet at most once,
 * so reloading this page is safe.
 */
export function VnpayReturnPage() {
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const resultQuery = useQuery({
    queryKey: ['vnpay-return', search],
    queryFn: () => confirmVnpayReturn(search),
    enabled: search.includes('vnp_'),
    retry: false,
    staleTime: Infinity
  });

  useEffect(() => {
    if (resultQuery.data) {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    }
  }, [resultQuery.data, queryClient]);

  const result = resultQuery.data;
  let tone: 'pending' | 'success' | 'failed' = 'pending';
  let title = 'Đang xác nhận thanh toán…';
  let detail = 'Hệ thống đang kiểm tra kết quả do VNPay gửi về.';

  if (!search.includes('vnp_')) {
    tone = 'failed';
    title = 'Không có kết quả thanh toán';
    detail = 'Trang này chỉ mở được khi VNPay chuyển bạn về sau khi thanh toán.';
  } else if (resultQuery.isError) {
    tone = 'failed';
    title = 'Không xác nhận được thanh toán';
    detail = getApiErrorMessage(resultQuery.error);
  } else if (result?.status === 'SUCCESS') {
    tone = 'success';
    title = `Đã nạp ${result.amountCoins.toLocaleString('vi-VN')} xu vào ví`;
    detail = 'Giao dịch thử nghiệm qua VNPay Sandbox đã được xác nhận.';
  } else if (result?.status === 'FAILED') {
    tone = 'failed';
    title = 'Thanh toán không thành công';
    detail = VNPAY_FAILURE_REASONS[result.responseCode ?? ''] ?? `VNPay trả về mã ${result.responseCode ?? 'không xác định'}. Ví của bạn không bị trừ hay cộng xu.`;
  } else if (result?.status === 'PENDING') {
    title = 'Giao dịch đang chờ xử lý';
    detail = 'VNPay chưa xác nhận giao dịch này. Hãy kiểm tra lại lịch sử ví sau ít phút.';
  }

  const toneClass = {
    pending: 'border-surface-container bg-surface-container-low text-on-surface',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    failed: 'border-red-300 bg-red-50 text-red-900'
  }[tone];
  const icon = { pending: 'hourglass_top', success: 'check_circle', failed: 'error' }[tone];

  return (
    <div
      className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col w-full"
      style={{ backgroundColor: 'var(--sc-bg)', color: 'var(--sc-text)' }}
    >
      <AuthorNavbar />
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <section
          className={`w-full max-w-md rounded-xl border px-6 py-6 ${toneClass}`}
          role={tone === 'pending' ? 'status' : 'alert'}
          aria-busy={resultQuery.isFetching}
          data-testid="vnpay-return-result"
          data-status={tone}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <p className="mt-2 text-meta">{detail}</p>
          <p className="mt-3 text-[11px] opacity-75">Môi trường thanh toán thử nghiệm — không phát sinh giao dịch tiền thật.</p>
          <div className="mt-5 flex justify-end">
            <Link
              to={navigationHref("/wallet")}
              className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-meta font-semibold"
            >
              Về ví của tôi
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
