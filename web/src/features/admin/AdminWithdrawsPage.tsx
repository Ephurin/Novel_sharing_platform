import { FilterPresets, useUrlFilters, useListScroll, WorkspaceTable } from '../../shared/components/WorkspacePreferences';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { labels as filterLabels } from './AdminShared';
import { ResponsiveFilters, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Alert, Button, Select } from '@mantine/core';
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
          : 'Đã từ chối yêu cầu và hoàn lại coin khả dụng.'
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
  const updated = useUpdatedItems(query.data?.items.map(item => ({ id: item.withdrawRequestId, version: JSON.stringify(item) })), [status, page].join('|'));
  useListScroll(!query.isPending);
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
      {success && (
        <Alert color="green" mb="md" withCloseButton onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <Select comboboxProps={{ withinPortal: false }}             label="Trạng thái"
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
        <FilterPresets name={'AdminWithdrawsPage'} fields={["status"]} />
        <ActiveFilterChips items={status ? [{ id: 'status', label: status === 'SUCCESS' ? 'Đã duyệt' : filterLabels[status] || status, onRemove: () => { setStatus(''); setPage(1); } }] : []} />
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(status)}>{query.isLoading && <LoadingState variant="table" label="Đang tải yêu cầu rút tiền..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không có yêu cầu rút tiền phù hợp." />
        )}
        {!!query.data?.items.length && (
          <WorkspaceTable name="adminwithdrawspage" columns={['Người yêu cầu', 'Số coin yêu cầu rút', 'Trạng thái', 'Thao tác']}>
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
                  <tr key={request.withdrawRequestId} className={updated.has(request.withdrawRequestId) ? 'sc-item-updated' : undefined}>
                    <td>
                      <strong>@{request.username}</strong>
                      <small>{dateTime(request.createdAt)}</small>
                    </td>
                    <td>
                      <strong>{number(request.amountCoins)} coin</strong>
                    </td>
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
                          <>
                            <Button
                              size="xs"
                              disabled={mutation.isPending}
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
                              disabled={mutation.isPending}
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
                          <Button
                            component={Link}
                            to={`/admin/withdraws/${request.withdrawRequestId}`}
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
            ? 'Duyệt yêu cầu cập nhật trạng thái và trừ coin đang giữ. Trạng thái này không xác nhận tiền đã vào tài khoản ngân hàng.'
            : 'Số coin đang giữ sẽ được hoàn lại số dư khả dụng của tác giả.'}
        </p>
      </AdminConfirm>
    </>
  );
}
