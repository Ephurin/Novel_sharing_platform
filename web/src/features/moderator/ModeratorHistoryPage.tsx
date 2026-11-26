import { useUrlFilters, useListScroll } from '../../shared/components/WorkspacePreferences';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AdminHeader, AdminPagination, AdminPanel } from '../admin/AdminShared';
import { AuditRows } from '../admin/AdminAuditPage';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { listModeratorHistory } from './moderator-api';

export function ModeratorHistoryPage() {
  const urlFilters = useUrlFilters({ q: '', page: 1 });
  const [q, setQ] = urlFilters.field('q');
  const [page, setPage] = urlFilters.field('page');
  const filters = { q, page, limit: 15 };
  const query = useQuery({
    queryKey: ['moderator-history', filters],
    queryFn: () => listModeratorHistory(filters)
  });
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title="Lịch sử thao tác"
        description="Toàn bộ quyết định điều hành do chính bạn thực hiện, theo thời gian và nội dung."
        refresh={() => void query.refetch()}
      />
      <AdminPanel>
        <TextInput
          className="admin-search"
          label="Tìm kiếm"
          aria-label="Tìm kiếm trong lịch sử thao tác"
          placeholder="Tìm theo lý do hoặc mã đối tượng"
          value={q}
          onChange={(event) => {
            setQ(event.currentTarget.value);
            setPage(1);
          }}
        />
        <ActiveFilterChips
          items={[
            ...(q
              ? [
                  {
                    id: 'q',
                    label: q,
                    onRemove: () => {
                      setQ('');
                      setPage(1);
                    }
                  }
                ]
              : [])
          ]}
        />
      </AdminPanel>
      <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(q)}>
        {query.isLoading && <LoadingState variant="table" label="Đang tải lịch sử thao tác..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState
            description={
              q.trim()
                ? 'Không có mục nào khớp với bộ lọc hiện tại.'
                : 'Chưa có quyết định điều hành nào của bạn.'
            }
          />
        )}
        {!!query.data?.items.length && (
          <>
            <AuditRows items={query.data.items} />
            <AdminPagination meta={query.data.meta} onChange={setPage} />
          </>
        )}
      </ResultsSurface>
    </>
  );
}
