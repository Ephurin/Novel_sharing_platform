import { useState } from 'react';
import { Button, TextInput, Alert } from '@mantine/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AdminHeader,
  AdminPanel,
  AdminPagination,
  AdminId,
  AdminError,
  dateTime
} from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getAdminList } from './admin-api';
import { adminGet, adminSend, useAdminAccess, type AuditEntry } from './admin-operations-api';

export function AuditRows({ items }: { items: AuditEntry[] }) {
  return (
    <div className="admin-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Thời gian / Admin</th>
            <th>Thao tác</th>
            <th>Đối tượng</th>
            <th>Lý do / Thay đổi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.audit_id}>
              <td>
                {dateTime(item.created_at)}
                <small className="admin-block">@{item.actor_username}</small>
              </td>
              <td>{item.action}</td>
              <td>
                {item.target_type}
                <AdminId value={item.target_id} label="mã đối tượng" />
              </td>
              <td>
                {item.reason || '—'}
                <details className="admin-audit-detail">
                  <summary>Xem trước / sau</summary>
                  <pre>
                    {JSON.stringify(
                      { before: item.before_state, after: item.after_state },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AdminAuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const access = useAdminAccess();
  const query = useQuery({
    queryKey: ['admin-audit', q, action, page],
    queryFn: () => getAdminList<AuditEntry>('/admin/audit', { q, action, page, limit: 15 })
  });
  const jobs = useQuery({
    queryKey: ['admin-jobs'],
    queryFn: () =>
      adminGet<
        Array<{
          job_id: string;
          kind: string;
          status: string;
          attempts: number;
          error: string;
          next_attempt_at: string;
          retry_count: number;
        }>
      >('/admin/jobs'),
    enabled: !!access.data?.permissions.includes('audit')
  });
  const retry = useMutation({
    mutationFn: (jobId?: string) =>
      adminSend('post', jobId ? `/admin/jobs/${jobId}/retry` : '/admin/jobs/retry', {}),
    onSuccess: () => jobs.refetch()
  });
  return (
    <>
      <AdminHeader
        title="Nhật ký quản trị"
        description={
          access.data?.permissions.includes('audit')
            ? 'Lịch sử quyết định và thay đổi trong hệ thống.'
            : 'Lịch sử thao tác của tài khoản quản trị đang dùng.'
        }
        refresh={() => {
          void query.refetch();
          void jobs.refetch();
        }}
      />
      {!!jobs.data?.length && (
        <Alert color="yellow" mb="md">
          <strong>{jobs.data.length} tác vụ chưa hoàn tất</strong>
          <p>Tác vụ lỗi được thử lại giãn dần; sau nhiều lần lỗi sẽ dừng để kiểm tra.</p>
          <details>
            <summary>Chi tiết tác vụ</summary>
            {jobs.data.map((j) => (
              <div className="admin-case" key={j.job_id}>
                <strong>
                  {j.kind} · {j.status === 'FAILED' ? 'Đã dừng do lỗi' : 'Đang chờ'}
                </strong>
                <p>
                  {j.attempts} lần thử · {j.error || 'Chờ xử lý'}
                </p>
                {j.status === 'PENDING' && (
                  <small>Lần thử tiếp theo: {dateTime(j.next_attempt_at)}</small>
                )}
                {j.status === 'FAILED' && (
                  <Button
                    variant="default"
                    size="xs"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(j.job_id)}
                  >
                    Lên lịch thử lại
                  </Button>
                )}
              </div>
            ))}
          </details>
          <Button
            mt="sm"
            variant="default"
            loading={retry.isPending}
            onClick={() => retry.mutate(undefined)}
          >
            Xử lý tác vụ đến lịch
          </Button>
          <AdminError error={retry.error} />
        </Alert>
      )}
      <AdminPanel>
        <div className="admin-toolbar">
          <TextInput
            label="Tìm kiếm"
            placeholder="Admin, mã đối tượng hoặc lý do"
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <TextInput
            label="Mã thao tác"
            placeholder="Ví dụ: USER_LOCK"
            value={action}
            onChange={(e) => {
              setAction(e.currentTarget.value);
              setPage(1);
            }}
          />
        </div>
        {query.isLoading && <LoadingState label="Đang tải nhật ký..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Chưa có thao tác phù hợp." />
        )}
        {!!query.data?.items.length && <AuditRows items={query.data.items} />}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </AdminPanel>
    </>
  );
}
