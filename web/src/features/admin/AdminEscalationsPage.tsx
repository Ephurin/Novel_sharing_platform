import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Select } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listModerationEscalations,
  resolveModerationEscalation,
  type ModerationEscalationListItem
} from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminId,
  AdminPagination,
  AdminPanel,
  labels,
  number,
  options,
  Status
} from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useUrlFilters, useListScroll, WorkspaceTable, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
import { ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';

type EscalationFilterStatus = 'OPEN' | 'EXECUTED' | 'DISMISSED' | '';

export function AdminEscalationsPage() {
  const cache = useQueryClient();
  const urlFilters = useUrlFilters({ status: 'OPEN', page: 1 }, { status: ['', 'OPEN', 'EXECUTED', 'DISMISSED'] });
  const [status, setStatus] = urlFilters.field('status');
  const [page, setPage] = urlFilters.field('page');
  const filters = { status: status as EscalationFilterStatus, page, limit: 10 };
  const query = useQuery({
    queryKey: ['admin-escalations', filters],
    queryFn: () => listModerationEscalations(filters)
  });
  useListScroll(!query.isPending);
  const [selected, setSelected] = useState<{
    escalation: ModerationEscalationListItem;
    decision: 'ACCEPTED' | 'REJECTED';
  } | null>(null);
  const [resolveReason, setResolveReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      resolveModerationEscalation(
        selected!.escalation.escalationId,
        selected!.decision,
        resolveReason
      ),
    onSuccess: async () => {
      setSelected(null);
      setResolveReason('');
      await cache.invalidateQueries({ queryKey: ['admin-escalations'] });
    }
  });
  return (
    <>
      <AdminHeader
        title="Đề nghị chuyển cấp"
        description="Xem chứng cứ và quyết định các đề nghị chuyển cấp của điều hành viên."
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">{number(query.data?.meta.totalItems ?? 0)} đề nghị</span>
      </AdminHeader>
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <Select
            comboboxProps={{ withinPortal: false }}
            label="Trạng thái"
            data={options(['OPEN', 'EXECUTED', 'DISMISSED'], 'Tất cả trạng thái')}
            value={status}
            onChange={(value) => {
              setStatus(value ?? '');
              setPage(1);
            }}
          />
          <Button
            variant="subtle"
            onClick={() => {
              setStatus('');
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
        </ResponsiveFilters>
        <WorkspaceTableOptions name="adminescalationspage" columns={['Đề nghị', 'Người đề nghị', 'Hồ sơ báo cáo', 'Trạng thái hồ sơ', 'Trạng thái', 'Thao tác']} presets={{ name: 'admin-escalations', fields: ['status'] }}>
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(status)}>
          {query.isLoading && <LoadingState variant="table" label="Đang tải đề nghị chuyển cấp..." />}
          {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
          {query.data && !query.data.items.length && (
            <EmptyState description="Không có đề nghị chuyển cấp nào khớp bộ lọc." />
          )}
          {!!query.data?.items.length && (
            <WorkspaceTable>
              <table>
                <thead>
                  <tr>
                    <th>Đề nghị</th>
                    <th>Người đề nghị</th>
                    <th>Hồ sơ báo cáo</th>
                    <th>Trạng thái hồ sơ</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.escalationId} data-testid={`admin-escalation-card-${item.escalationId}`}>
                      <td>
                        <div>{labels[item.proposedAction] || item.proposedAction}</div>
                        <small>{item.reason}</small>
                      </td>
                      <td>
                        <div>@{item.proposedByUsername ?? item.proposedBy}</div>
                        <small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small>
                      </td>
                      <td>
                        <div>
                          {item.review.targetUsername
                            ? `@${item.review.targetUsername} · `
                            : `${labels[item.review.targetType] ?? item.review.targetType} · `}
                          {number(item.review.reportCount)} báo cáo
                        </div>
                        <small>
                          <Link to={`/admin/moderation/${item.reviewId}`}>
                            Xem chứng cứ →
                          </Link>
                        </small>
                      </td>
                      <td>
                        <Status value={item.review.status} />
                      </td>
                      <td>
                        <Status value={item.status} />
                        {item.status !== 'OPEN' && (
                          <div>
                            <small>{item.resolution}</small>
                          </div>
                        )}
                      </td>
                      <td>
                        {item.status === 'OPEN' ? (
                          <div className="admin-review-decisions">
                            <Button
                              size="xs"
                              miw="max-content"
                              data-testid={`admin-escalation-accept-${item.escalationId}`}
                              onClick={() => {
                                mutation.reset();
                                setResolveReason('');
                                setSelected({ escalation: item, decision: 'ACCEPTED' });
                              }}
                            >
                              Chấp nhận
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              className="admin-danger"
                              data-testid={`admin-escalation-reject-${item.escalationId}`}
                              onClick={() => {
                                mutation.reset();
                                setResolveReason('');
                                setSelected({ escalation: item, decision: 'REJECTED' });
                              }}
                            >
                              Bác
                            </Button>
                          </div>
                        ) : (
                          <span className="admin-muted">
                            <AdminId value={item.escalationId} label="mã chuyển cấp" />
                          </span>
                        )}
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
        destructive={
          selected?.decision === 'REJECTED' ||
          (selected?.decision === 'ACCEPTED' && selected.escalation.proposedAction !== 'WARN')
        }
        opened={Boolean(selected)}
        title={selected?.decision === 'ACCEPTED' ? 'Chấp nhận đề nghị chuyển cấp' : 'Bác đề nghị chuyển cấp'}
        confirmLabel={selected?.decision === 'ACCEPTED' ? 'Áp dụng đề nghị' : 'Bác đề nghị'}
        reason={resolveReason}
        setReason={setResolveReason}
        required
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setSelected(null)}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          {selected?.decision === 'ACCEPTED'
            ? selected.escalation.proposedAction === 'HIDE'
              ? 'Ẩn nội dung thảo luận theo đề nghị, đóng báo cáo và thông báo kết quả.'
              : `Áp dụng ${labels[selected.escalation.proposedAction]} lên tài khoản ${selected.escalation.review.targetUsername ? `@${selected.escalation.review.targetUsername}` : 'bị báo cáo'} và đóng báo cáo.`
            : 'Bác đề nghị và trả hồ sơ về hàng chờ phù hợp.'}
        </p>
      </AdminConfirm>
    </>
  );
}
