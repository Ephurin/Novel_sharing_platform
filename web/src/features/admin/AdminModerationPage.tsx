import { FilterPresets, useUrlFilters, useListScroll, WorkspaceTable } from '../../shared/components/WorkspacePreferences';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';
import { Link } from 'react-router-dom';
import { Button, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getAdminList, type ModerationReview } from './admin-api';
import {
  AdminHeader,
  AdminId,
  AdminPagination,
  AdminPanel,
  labels,
  number,
  options,
  Status
} from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';

export function AdminModerationPage({ reports = false }: { reports?: boolean }) {
  const urlFilters = useUrlFilters({ targetType: '', status: 'PENDING', source: '', page: 1 }, { targetType: ['', 'NOVEL', 'CHAPTER', 'COMMENT', 'USER'], status: ['', 'PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'], source: ['', 'KEYWORD_FILTER', 'USER_REPORT'] });
  const [targetType, setTargetType] = urlFilters.field('targetType');
  const [status, setStatus] = urlFilters.field('status');
  const [source, setSource] = urlFilters.field('source');
  const [page, setPage] = urlFilters.field('page');
  const filters = {
    targetType,
    status,
    source: reports ? 'USER_REPORT' : source,
    page,
    limit: 8
  };
  const query = useQuery({
    queryKey: ['admin-moderation', filters],
    queryFn: () => getAdminList<ModerationReview>('/admin/moderation/reviews', filters)
  });
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title={reports ? 'Báo cáo người dùng' : 'Hàng đợi kiểm duyệt'}
        description={
          reports
            ? 'Xem và xử lý nội dung do người dùng báo cáo.'
            : 'Xem và xử lý nội dung cần kiểm tra.'
        }
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          {number(query.data?.meta.totalItems ?? 0)} mục theo bộ lọc
        </span>
      </AdminHeader>
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <Select comboboxProps={{ withinPortal: false }}             label="Đối tượng"
            data={options(['NOVEL', 'CHAPTER', 'COMMENT', 'USER'], 'Tất cả đối tượng')}
            value={targetType}
            onChange={(v) => {
              setTargetType(v ?? '');
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}             label="Trạng thái"
            data={options(
              ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'],
              'Tất cả trạng thái'
            )}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          {reports ? (
            <span className="admin-muted">Nguồn: Báo cáo người dùng</span>
          ) : (
            <Select comboboxProps={{ withinPortal: false }}               label="Nguồn"
              data={options(['KEYWORD_FILTER', 'USER_REPORT'], 'Tất cả nguồn')}
              value={source}
              onChange={(v) => {
                setSource(v ?? '');
                setPage(1);
              }}
            />
          )}
          <Button
            variant="subtle"
            onClick={() => {
              setTargetType('');
              setStatus('');
              setSource('');
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
        </ResponsiveFilters>
        <FilterPresets name={reports ? 'admin-reports' : 'admin-moderation'} fields={["targetType", "status", "source"]} />
        <ActiveFilterChips items={[
          ...(targetType ? [{ id: 'target', label: labels[targetType] || targetType, onRemove: () => { setTargetType(''); setPage(1); } }] : []),
          ...(status ? [{ id: 'status', label: labels[status] || status, onRemove: () => { setStatus(''); setPage(1); } }] : []),
          ...(!reports && source ? [{ id: 'source', label: labels[source] || source, onRemove: () => { setSource(''); setPage(1); } }] : [])
        ]} />
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(targetType || status || source)}>{query.isLoading && <LoadingState variant="table" label="Đang tải kiểm duyệt..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không có mục nào khớp với bộ lọc hiện tại." />
        )}
        {!!query.data?.items.length && (
          <WorkspaceTable name={reports ? 'adminreportspage' : 'adminmoderationpage'} columns={['Mã kiểm duyệt', 'Đối tượng', 'Mã đối tượng', reports ? 'Số báo cáo' : 'Nguồn', 'Trạng thái', 'Thao tác']}>
            <table>
              <thead>
                <tr>
                  <th>Mã kiểm duyệt</th>
                  <th>Đối tượng</th>
                  <th>Mã đối tượng</th>
                  <th>{reports ? 'Số báo cáo' : 'Nguồn'}</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((review) => (
                  <tr
                    key={review.reviewId}
                    data-testid={`moderation-review-card-${review.reviewId}`}
                  >
                    <td>
                      <AdminId value={review.reviewId} label="mã kiểm duyệt" />
                    </td>
                    <td>{labels[review.targetType]}</td>
                    <td>
                      <AdminId value={review.targetId} label="mã đối tượng" />
                    </td>
                    <td>
                      {reports
                        ? `${number(review.reportCount ?? 0)} báo cáo`
                        : labels[review.source]}
                    </td>
                    <td>
                      <Status value={review.status} />
                    </td>
                    <td>
                      <Button
                        component={Link}
                        to={`/admin/moderation/${review.reviewId}`}
                        variant="light"
                        size="xs"
                        data-testid={`moderation-review-inspect-${review.reviewId}`}
                      >
                        Chi tiết →
                      </Button>
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
    </>
  );
}
