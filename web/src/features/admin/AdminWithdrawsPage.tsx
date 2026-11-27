import { navigationHref } from '../../shared/routes';
import { formatDateTime } from '../../shared/lib/format-vi';
import { useUrlFilters, useListScroll, WorkspaceTable, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
import { AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { ResponsiveFilters, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Alert, Button, Menu, Select } from '@mantine/core';
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
  AdminRowMenu,
  dateTime,
  number,
  options,
  Status
} from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { ApiClientError } from '../../shared/api/api-client';

export function AdminWithdrawsPage() {
  const cache = useQueryClient();
  const urlFilters = useUrlFilters({ status: 'PENDING', page: 1 }, { status: ['', 'PENDING', 'SUCCESS', 'FAILED'] });
  const [page, setPage] = urlFilters.field('page');
  const [status, setStatus] = urlFilters.field('status');
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');
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
      setSuccess(
        action?.approve
          ? 'Đã duyệt yêu cầu trong hệ thống.'
          : 'Đã từ chối yêu cầu và hoàn lại xu khả dụng.'
      );
      setAction(null);
      setReason('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-withdraw'] }),
        cache.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && [404, 409].includes(error.status)) {
        void cache.invalidateQueries({ queryKey: ['admin-withdraw'] });
      }
    }
  });
  const updated = useUpdatedItems(
    query.data?.items.map((item) => ({ id: item.withdrawRequestId, version: JSON.stringify(item) })),
    [status, page].join('|')
  );
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title="Yêu cầu rút xu"
        description="Theo dõi và xử lý các yêu cầu rút xu của tác giả."
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          {number(query.data?.meta.totalItems ?? 0)} yêu cầu theo bộ lọc
        </span>
      </AdminHeader>
      {success && (
        <Alert color="green" mb="md" withCloseButton onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <Select
            comboboxProps={{ withinPortal: false }}
            label="Trạng thái"
            data={options(['PENDING', 'SUCCESS', 'FAILED'], 'Tất cả trạng thái').map((option) =>
              option.value === 'SUCCESS' ? { ...option, label: 'Đã duyệt' } : option
            )}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
        </ResponsiveFilters>
        <WorkspaceTableOptions name="adminwithdrawspage"
              columns={['Người yêu cầu', 'Số xu yêu cầu', 'Tài khoản nhận', 'Trạng thái', 'Thao tác']} presets={{ name: 'AdminWithdrawsPage', fields: ['status'] }}>
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(status)}>
          {query.isLoading && <LoadingState variant="table" label="Đang tải yêu cầu rút xu..." />}
          {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
          {query.data && !query.data.items.length && (
            <EmptyState description="Không có yêu cầu rút xu phù hợp." />
          )}
          {!!query.data?.items.length && (
            <WorkspaceTable>
              <table>
                <thead>
                  <tr>
                    <th>Người yêu cầu</th>
                    <th>Số xu yêu cầu</th>
                    <th>Tài khoản nhận</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((request) => (
                    <tr
                      key={request.withdrawRequestId}
                      className={updated.has(request.withdrawRequestId) ? 'sc-item-updated' : undefined}
                    >
                      <td>
                        <strong>@{request.username}</strong>
                        <small><time dateTime={request.createdAt} title={dateTime(request.createdAt)}>{formatDateTime(request.createdAt, 'relative')}</time></small>
                      </td>
                      <td>
                        <strong>{number(request.amountCoins)} xu</strong>
                      </td>
                      <td>{request.bankAccountLabel || <span className="admin-muted">Chưa cung cấp</span>}</td>
                      <td>
                        <Status
                          value={request.status}
                          label={request.status === 'SUCCESS' ? 'Đã duyệt' : undefined}
                        />
                        {request.rejectionReason && <small>{request.rejectionReason}</small>}
                      </td>
                      <td>
                        <div className="admin-actions">
                          {request.status === 'PENDING' ? (
                            <AdminRowMenu label={`Xử lý yêu cầu của @${request.username}`} disabled={mutation.isPending}>
                              <Menu.Item
                                onClick={() => {
                                  mutation.reset();
                                  setReason('');
                                  setAction({ request, approve: true });
                                }}
                              >
                                Duyệt
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                onClick={() => {
                                  mutation.reset();
                                  setReason('');
                                  setAction({ request, approve: false });
                                }}
                              >
                                Từ chối
                              </Menu.Item>
                            </AdminRowMenu>
                          ) : (
                            <Button
                              component={Link}
                              to={navigationHref(`/admin/withdraws/${request.withdrawRequestId}`)}
                              variant="subtle"
                              size="xs"
                            >
                              Đối soát / Lịch sử
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkspaceTable>
          )}
          <AdminPagination meta={query.data?.meta} onChange={setPage} />
        </ResultsSurface>
        </WorkspaceTableOptions>
      </AdminPanel>
      <AdminConfirm
        destructive={!action?.approve}
        opened={!!action}
        title={action?.approve ? 'Duyệt yêu cầu rút xu' : 'Từ chối yêu cầu rút xu'}
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
          <strong>{number(action?.request.amountCoins ?? 0)} xu</strong>
        </p>
        <p>Đích nhận: {action?.request.bankAccountLabel || 'Chưa có thông tin'}</p>
        <p>
          {action?.approve
            ? 'Duyệt yêu cầu cập nhật trạng thái và trừ xu đang giữ. Trạng thái này không xác nhận tiền đã vào tài khoản ngân hàng.'
            : 'Số xu đang giữ sẽ được hoàn lại số dư khả dụng của tác giả.'}
        </p>
      </AdminConfirm>
    </>
  );
}
