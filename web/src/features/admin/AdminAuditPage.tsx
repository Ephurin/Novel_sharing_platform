import { useUrlFilters, useListScroll, WorkspaceTable, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
import { AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { StateComparison } from '../../shared/components/StateComparison';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { Button, TextInput, Alert, Select } from '@mantine/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AdminHeader,
  AdminPanel,
  AdminPagination,
  AdminId,
  AdminError,
  dateTime,
  labels,
  options
} from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getAdminList } from './admin-api';
import { adminGet, adminSend, useAdminAccess, type AuditEntry } from './admin-operations-api';

// Audit actions an admin can filter by; the API matches the code exactly, so offer a list instead of free text.
const AUDIT_ACTIONS = [
  'USER_LOCK', 'USER_UNLOCKED', 'USER_WARN', 'USER_ACCESS_CHANGED',
  'NOVEL_HIDE', 'NOVEL_WARN', 'NOVEL_RESTORED', 'CHAPTER_HIDE', 'CHAPTER_WARN',
  'COMMENT_HIDE', 'COMMENT_WARN', 'SANCTION_RESTORED',
  'PUBLICATION_APPROVED', 'PUBLICATION_REJECTED', 'PUBLICATION_REVISION_REQUIRED',
  'REPORT_ACCEPTED', 'REPORT_DISMISSED', 'APPEAL_ACCEPTED', 'APPEAL_REJECTED',
  'WITHDRAW_APPROVED', 'WITHDRAW_REJECTED', 'WITHDRAW_RECONCILED',
  'TAXONOMY_CREATED', 'TAXONOMY_UPDATED', 'TAXONOMY_MERGED', 'TAXONOMY_DELETED',
  'ADMIN_JOB_RETRIED', 'NOTIFY', 'NOVEL_DRAFT_SYNC', 'COMMENT_SYNC'
];

export function AuditRows({ items }: { items: AuditEntry[] }) {
  return (
    <WorkspaceTable>
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
              <td>{labels[item.action] || item.action}</td>
              <td>
                <div>{labels[item.target_type] || item.target_type}</div>
                <AdminId value={item.target_id} label="mã đối tượng" />
              </td>
              <td>
                {item.reason || '—'}
                <StateComparison before={item.before_state} after={item.after_state} />
                <AnimatedDisclosure className="admin-audit-detail" summary="Xem trước / sau">
                  <pre>
                    {JSON.stringify(
                      { before: item.before_state, after: item.after_state },
                      null,
                      2
                    )}
                  </pre>
                </AnimatedDisclosure>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </WorkspaceTable>
  );
}
export function AdminAuditPage() {
  const urlFilters = useUrlFilters({ q: '', action: '', page: 1 });
  const [q, setQ] = urlFilters.field('q');
  const [action, setAction] = urlFilters.field('action');
  const [page, setPage] = urlFilters.field('page');
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
  useListScroll(!query.isPending);
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
          <AnimatedDisclosure summary="Chi tiết tác vụ">
            {jobs.data.map((j) => (
              <div className="admin-case" key={j.job_id}>
                <strong>
                  {labels[j.kind] || j.kind} · {j.status === 'FAILED' ? 'Đã dừng do lỗi' : 'Đang chờ'}
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
          </AnimatedDisclosure>
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
        <ResponsiveFilters className="admin-toolbar">
          <TextInput
            label="Tìm kiếm"
            placeholder="Admin, mã đối tượng hoặc lý do"
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}
            label="Thao tác"
            searchable
            data={options(action && !AUDIT_ACTIONS.includes(action) ? [...AUDIT_ACTIONS, action] : AUDIT_ACTIONS, 'Tất cả thao tác')}
            value={action}
            onChange={(v) => {
              setAction(v ?? '');
              setPage(1);
            }}
          />
        </ResponsiveFilters>
        <WorkspaceTableOptions name="adminauditpage" columns={['Thời gian / Admin', 'Thao tác', 'Đối tượng', 'Lý do / Thay đổi']} presets={{ name: 'AdminAuditPage', fields: ["q", "action"] }}>
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(q.trim() || action.trim())}>{query.isLoading && <LoadingState variant="table" label="Đang tải nhật ký..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Chưa có thao tác phù hợp." />
        )}
        {!!query.data?.items.length && <AuditRows items={query.data.items} />}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </ResultsSurface>
        </WorkspaceTableOptions>
      </AdminPanel>
    </>
  );
}
