import { useState } from 'react';
import { Button, Select } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveWithdrawRequest,
  rejectWithdrawRequest,
  getAdminList,
  type WithdrawRequest
} from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminPagination,
  AdminPanel,
  dateTime,
  number,
  options,
  Status
} from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function AdminWithdrawsPage() {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<{
    request: WithdrawRequest;
    approve: boolean;
  } | null>(null);
  const query = useQuery({
    queryKey: ['admin-withdraw', status, page],
    queryFn: () =>
      getAdminList<WithdrawRequest>('/admin/withdraw-requests', {
        status,
        page,
        limit: 8
      })
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) return;
      if (action.approve) await approveWithdrawRequest(action.request.withdrawRequestId);
      else await rejectWithdrawRequest(action.request.withdrawRequestId, reason);
    },
    onSuccess: async () => {
      setAction(null);
      setReason('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-withdraw'] }),
        cache.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    }
  });
  return (
    <>
      <AdminHeader
        title="Yêu cầu rút tiền"
        description="Theo dõi và xử lý các yêu cầu rút coin của tác giả."
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          {number(query.data?.meta.totalItems ?? 0)} yêu cầu theo bộ lọc
        </span>
      </AdminHeader>
      <AdminPanel>
        <div className="admin-toolbar">
          <Select
            label="Trạng thái"
            data={options(['PENDING', 'SUCCESS', 'FAILED'], 'Tất cả trạng thái')}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
        </div>
        {query.isLoading && <LoadingState label="Đang tải yêu cầu rút tiền..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không có yêu cầu rút tiền phù hợp." />
        )}
        {!!query.data?.items.length && (
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Người yêu cầu</th>
                  <th>Số coin yêu cầu rút</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((request) => (
                  <tr key={request.withdrawRequestId}>
                    <td>
                      <strong>@{request.username}</strong>
                      <small>{dateTime(request.createdAt)}</small>
                    </td>
                    <td>
                      <strong>{number(request.amountCoins)} coin</strong>
                    </td>
                    <td>
                      <Status value={request.status} />
                      {request.rejectionReason && <small>{request.rejectionReason}</small>}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {request.status === 'PENDING' ? (
                          <>
                            <Button
                              size="xs"
                              onClick={() => {
                                mutation.reset();
                                setReason('');
                                setAction({ request, approve: true });
                              }}
                            >
                              Duyệt
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              className="admin-danger"
                              variant="light"
                              onClick={() => {
                                mutation.reset();
                                setReason('');
                                setAction({ request, approve: false });
                              }}
                            >
                              Từ chối
                            </Button>
                          </>
                        ) : (
                          <span className="admin-muted">Đã xử lý</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </AdminPanel>
      <AdminConfirm
        destructive={!action?.approve}
        opened={!!action}
        title={action?.approve ? 'Duyệt yêu cầu rút tiền' : 'Từ chối yêu cầu rút tiền'}
        confirmLabel={action?.approve ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
        reason={reason}
        setReason={action?.approve ? undefined : setReason}
        required={!action?.approve}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setAction(null)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          @{action?.request.username} ·{' '}
          <strong>{number(action?.request.amountCoins ?? 0)} coin</strong>
        </p>
        <p>Đích nhận: {action?.request.bankAccountLabel || 'Chưa có thông tin'}</p>
        <p>
          {action?.approve
            ? 'Xác nhận hoàn tất yêu cầu và trừ số coin đang được giữ cho lệnh rút này.'
            : 'Số coin đang giữ sẽ được hoàn lại số dư khả dụng của tác giả.'}
        </p>
      </AdminConfirm>
    </>
  );
}
