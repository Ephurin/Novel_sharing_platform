import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Select, TextInput } from '@mantine/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminGet, adminSend } from './admin-operations-api';
import {
  AdminHeader,
  AdminPanel,
  AdminConfirm,
  AdminId,
  Status,
  dateTime,
  number
} from './AdminShared';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

type State = {
  status: string;
  version: number;
  reference?: string;
  evidence_url?: string;
  note?: string;
  updated_at?: string;
};
type Reconciliation = {
  request: { username: string; amount_coins: number; status: string; bank_account_label: string };
  state: State;
  history: Array<{
    event_id: string;
    actor_username: string;
    created_at: string;
    before_state: State;
    after_state: State;
  }>;
};
const statusLabel: Record<string, string> = {
  UNCONFIRMED: 'Chưa xác nhận thanh toán',
  PROCESSING: 'Đang chuyển tiền',
  PAID: 'Đã xác nhận thanh toán',
  FAILED: 'Chuyển tiền thất bại'
};
const transitions: Record<string, string[]> = {
  UNCONFIRMED: ['PROCESSING', 'PAID'],
  PROCESSING: ['PAID', 'FAILED'],
  FAILED: ['PROCESSING'],
  PAID: []
};
export function AdminReconciliationPage() {
  const { requestId = '' } = useParams();
  const [status, setStatus] = useState('');
  const [reference, setReference] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [reason, setReason] = useState('');
  const [opened, setOpened] = useState(false);
  const path = `/admin/withdraw-requests/${requestId}/reconciliation`;
  const query = useQuery({
    queryKey: ['admin-reconciliation', requestId],
    queryFn: () => adminGet<Reconciliation>(path)
  });
  const mutation = useMutation({
    mutationFn: () =>
      adminSend('post', path, {
        status,
        version: query.data!.state.version,
        reference: reference.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
        note: reason
      }),
    onSuccess: async () => {
      setOpened(false);
      setStatus('');
      setReference('');
      setEvidenceUrl('');
      setReason('');
      await query.refetch();
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải đối soát..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const { request, state, history } = query.data;
  return (
    <>
      <Link className="admin-link" to="/admin/withdraws">
        ← Yêu cầu rút tiền
      </Link>
      <AdminHeader
        title="Đối soát thanh toán"
        description={`@${request.username} · ${number(Number(request.amount_coins))} coin`}
        refresh={() => void query.refetch()}
      />
      <Alert mb="md">
        Đây là ghi nhận đối soát thủ công. Thao tác không gọi ngân hàng và không thay đổi số dư
        coin.
      </Alert>
      {mutation.isSuccess && (
        <Alert color="green" mb="md" role="status">
          Đã lưu đối soát.
        </Alert>
      )}
      <div className="admin-grid-two">
        <AdminPanel>
          <h2>Yêu cầu</h2>
          <p>Đích nhận: {request.bank_account_label || 'Chưa có thông tin'}</p>
          <p>
            Phê duyệt:{' '}
            <Status
              value={request.status}
              label={request.status === 'SUCCESS' ? 'Đã duyệt' : undefined}
            />
          </p>
          <AdminId value={requestId} label="mã yêu cầu" />
          <h3>{statusLabel[state.status]}</h3>
          {state.reference && <p>Mã giao dịch: {state.reference}</p>}
          {state.note && <p className="admin-prose">{state.note}</p>}
          {state.evidence_url && (
            <a
              className="admin-link"
              href={state.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mở chứng từ ↗
            </a>
          )}
          {request.status === 'SUCCESS' && transitions[state.status]?.length > 0 && (
            <form
              className="admin-form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.reset();
                setOpened(true);
              }}
            >
              <Select
                label="Cập nhật đối soát"
                required
                value={status}
                data={transitions[state.status].map((value) => ({
                  value,
                  label: statusLabel[value]
                }))}
                onChange={(v) => setStatus(v || '')}
              />
              <TextInput
                label="Mã giao dịch ngân hàng"
                required={status === 'PAID'}
                value={reference}
                maxLength={200}
                onChange={(e) => setReference(e.currentTarget.value)}
              />
              <TextInput
                label="Liên kết chứng từ (nếu có)"
                type="url"
                placeholder="https://..."
                value={evidenceUrl}
                maxLength={2000}
                onChange={(e) => setEvidenceUrl(e.currentTarget.value)}
              />
              <Button type="submit" disabled={!status || mutation.isPending}>
                Xem lại & xác nhận
              </Button>
            </form>
          )}
          {request.status !== 'SUCCESS' && (
            <p className="admin-muted">Chỉ đối soát sau khi yêu cầu được duyệt.</p>
          )}
        </AdminPanel>
        <AdminPanel>
          <h2>Lịch sử đối soát</h2>
          {!history.length && <p className="admin-muted">Chưa có bản ghi đối soát.</p>}
          {history.map((h) => (
            <article className="admin-case" key={h.event_id}>
              <strong>{statusLabel[h.after_state.status]}</strong>
              <small className="admin-block">
                {dateTime(h.created_at)} · @{h.actor_username}
              </small>
              <p>{h.after_state.note}</p>
              {h.after_state.reference && <p>Mã giao dịch: {h.after_state.reference}</p>}
              {h.after_state.evidence_url && (
                <a
                  href={h.after_state.evidence_url}
                  className="admin-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chứng từ ↗
                </a>
              )}
            </article>
          ))}
        </AdminPanel>
      </div>
      <AdminConfirm
        opened={opened}
        title="Xác nhận đối soát"
        confirmLabel="Lưu đối soát"
        reason={reason}
        setReason={setReason}
        required
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setOpened(false)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          {statusLabel[state.status]} → <strong>{statusLabel[status]}</strong>
        </p>
        {reference && <p>Mã giao dịch: {reference}</p>}
        {status === 'PAID' && (
          <p>
            Chỉ xác nhận sau khi đã kiểm tra chuyển tiền thực tế. Bản ghi đã thanh toán không thể
            sửa trực tiếp.
          </p>
        )}
        <Button variant="subtle" onClick={() => void query.refetch()}>
          Tải lại dữ liệu mới nhất
        </Button>
      </AdminConfirm>
    </>
  );
}
