import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Select, Alert } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminList } from './admin-api';
import { adminSend, useAdminAccess, type Appeal } from './admin-operations-api';
import {
  AdminHeader,
  AdminPanel,
  AdminConfirm,
  AdminPagination,
  AdminId,
  Status,
  dateTime,
  labels
} from './AdminShared';
import { EmptyState, LoadingState, ErrorState } from '../../shared/components/PageStates';

export function AdminAppealsPage() {
  const access = useAdminAccess();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{
    appeal: Appeal;
    decision: 'ACCEPTED' | 'REJECTED';
  } | null>(null);
  const [reason, setReason] = useState('');
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-appeals', status, page],
    queryFn: () => getAdminList<Appeal>('/admin/appeals', { status, page, limit: 10 })
  });
  const mutation = useMutation({
    mutationFn: () =>
      adminSend('post', `/admin/appeals/${selected!.appeal.appeal_id}/resolve`, {
        decision: selected!.decision,
        reason
      }),
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-appeals'] }),
        cache.invalidateQueries({ queryKey: ['admin-users'] }),
        cache.invalidateQueries({ queryKey: ['admin-novels'] }),
        cache.invalidateQueries({ queryKey: ['admin-moderation-detail'] })
      ]);
    }
  });
  return (
    <>
      <AdminHeader
        title="Khiếu nại"
        description="Xem lại quyết định quản trị và phản hồi của người bị ảnh hưởng."
        refresh={() => void query.refetch()}
      />
      {mutation.isSuccess && (
        <Alert mb="md" color="green" role="status">
          Đã lưu kết quả xử lý khiếu nại.
        </Alert>
      )}
      <AdminPanel>
        <div className="admin-toolbar">
          <Select
            label="Trạng thái"
            value={status}
            data={[
              { value: '', label: 'Tất cả' },
              { value: 'OPEN', label: 'Chờ xem xét' },
              { value: 'ACCEPTED', label: 'Đã chấp nhận' },
              { value: 'REJECTED', label: 'Đã bác' }
            ]}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
        </div>
        {query.isLoading && <LoadingState label="Đang tải khiếu nại..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không có khiếu nại phù hợp." />
        )}
        {query.data?.items.map((item) => (
          <article className="admin-case" key={item.appeal_id}>
            <div className="admin-page-header">
              <div>
                <h2>@{item.username}</h2>
                <span className="admin-muted">
                  {dateTime(item.created_at)} · {labels[item.target_type] || item.target_type} ·{' '}
                  {labels[item.action] || item.action}
                </span>
              </div>
              <Status value={item.status} />
            </div>
            <p>
              <strong>Quyết định gốc: </strong>
              {item.decision_reason}
            </p>
            <p className="admin-prose">
              <strong>Khiếu nại: </strong>
              {item.message}
            </p>
            <AdminId value={item.target_id} label="mã đối tượng" />
            {item.review_id && access.data?.permissions.includes('content') && (
              <p>
                <Link className="admin-link" to={`/admin/moderation/${item.review_id}`}>
                  Xem nội dung & bằng chứng →
                </Link>
              </p>
            )}
            {item.target_type === 'NOVEL' && (
              <p>
                <Link className="admin-link" to={`/admin/novels/${item.target_id}`}>
                  Xem truyện →
                </Link>
              </p>
            )}
            <p className="admin-muted">
              {item.active ? 'Quyết định đang có hiệu lực.' : 'Quyết định đã được thu hồi.'}
            </p>
            {item.resolution && <p>Kết quả: {item.resolution}</p>}
            {item.status === 'OPEN' && (
              <div className="admin-actions">
                {(['ACCEPTED', 'REJECTED'] as const).map((decision) => (
                  <Button
                    key={decision}
                    variant={decision === 'ACCEPTED' ? 'filled' : 'default'}
                    onClick={() => {
                      mutation.reset();
                      setReason('');
                      setSelected({ appeal: item, decision });
                    }}
                  >
                    {decision === 'ACCEPTED' ? 'Chấp nhận khiếu nại' : 'Bác khiếu nại'}
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </AdminPanel>
      <AdminConfirm
        opened={!!selected}
        title="Xác nhận kết quả khiếu nại"
        confirmLabel="Lưu kết quả"
        reason={reason}
        setReason={setReason}
        required
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setSelected(null)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          {selected?.decision === 'ACCEPTED'
            ? 'Thu hồi quyết định liên quan và khôi phục phần bị hạn chế bởi chính quyết định đó. Trạng thái xuất bản được giữ nguyên.'
            : 'Giữ quyết định hiện tại và gửi lý do đến người khiếu nại.'}
        </p>
      </AdminConfirm>
    </>
  );
}
