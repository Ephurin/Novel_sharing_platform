import { useUrlFilters, useListScroll, WorkspaceTable, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';
import { Link } from 'react-router-dom';
import { Button, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  AdminHeader,
  AdminId,
  AdminPagination,
  AdminPanel,
  labels,
  number,
  options,
  Status
} from '../admin/AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { listModeratorReviews } from './moderator-api';
import { ModeratorSelectionLink } from '../novel-selection/SelectionPages';

export function ModeratorReviewsPage() {
  const urlFilters = useUrlFilters(
    { targetType: '', status: 'PENDING', source: '', page: 1 },
    {
      targetType: ['', 'NOVEL', 'CHAPTER', 'COMMENT', 'USER', 'DISCUSSION', 'DISCUSSION_COMMENT'],
      status: ['', 'PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'],
      source: ['', 'PUBLICATION_REQUEST', 'KEYWORD_FILTER', 'USER_REPORT']
    }
  );
  const [targetType, setTargetType] = urlFilters.field('targetType');
  const [status, setStatus] = urlFilters.field('status');
  const [source, setSource] = urlFilters.field('source');
  const [page, setPage] = urlFilters.field('page');
  const filters = { targetType, status, source, page, limit: 8 };
  const query = useQuery({
    queryKey: ['moderator-reviews', filters],
    queryFn: () => listModeratorReviews(filters)
  });
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title="Hồ sơ điều hành"
        description="Xem và xử lý nội dung yêu cầu kiểm duyệt trong phạm vi điều hành."
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          {number(query.data?.meta.totalItems ?? 0)} mục theo bộ lọc
        </span>
        <ModeratorSelectionLink />
      </AdminHeader>
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <Select
            comboboxProps={{ withinPortal: false }}
            label="Đối tượng"
            data={options(['NOVEL', 'CHAPTER', 'COMMENT', 'USER', 'DISCUSSION', 'DISCUSSION_COMMENT'], 'Tất cả đối tượng')}
            value={targetType}
            onChange={(v) => {
              setTargetType(v ?? '');
              setPage(1);
            }}
          />
          <Select
            comboboxProps={{ withinPortal: false }}
            label="Trạng thái"
            data={options(['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'], 'Tất cả trạng thái')}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          <Select
            comboboxProps={{ withinPortal: false }}
            label="Nguồn"
            data={options(['PUBLICATION_REQUEST', 'KEYWORD_FILTER', 'USER_REPORT'], 'Tất cả nguồn')}
            value={source}
            onChange={(v) => {
              setSource(v ?? '');
              setPage(1);
            }}
          />
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
        <WorkspaceTableOptions name="moderatorreviewspage" columns={['Mã kiểm duyệt', 'Đối tượng', 'Mã đối tượng', 'Nguồn', 'Trạng thái', 'Thao tác']} presets={{ name: 'moderator-reviews', fields: ['targetType', 'status', 'source'] }}>
        <ActiveFilterChips
          items={[
            ...(targetType ? [{ id: 'target', label: labels[targetType] || targetType, onRemove: () => { setTargetType(''); setPage(1); } }] : []),
            ...(status ? [{ id: 'status', label: labels[status] || status, onRemove: () => { setStatus(''); setPage(1); } }] : []),
            ...(source ? [{ id: 'source', label: labels[source] || source, onRemove: () => { setSource(''); setPage(1); } }] : [])
          ]}
        />
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(targetType || status || source)}>
          {query.isLoading && <LoadingState variant="table" label="Đang tải hồ sơ điều hành..." />}
          {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
          {query.data && !query.data.items.length && (
            <EmptyState description="Không có mục nào khớp với bộ lọc hiện tại." />
          )}
          {!!query.data?.items.length && (
            <WorkspaceTable>
              <table>
                <thead>
                  <tr>
                    <th>Mã kiểm duyệt</th>
                    <th>Đối tượng</th>
                    <th>Mã đối tượng</th>
                    <th>Nguồn</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((review) => (
                    <tr
                      key={review.reviewId}
                      data-testid={`moderator-review-card-${review.reviewId}`}
                    >
                      <td>
                        <AdminId value={review.reviewId} label="mã kiểm duyệt" />
                      </td>
                      <td>
                        <div>{labels[review.targetType] || review.targetType}</div>
                        {(review.targetTitle || review.summary || review.reason) && (
                          <small>{review.targetTitle || review.summary || review.reason}</small>
                        )}
                      </td>
                      <td>
                        <AdminId value={review.targetId} label="mã đối tượng" />
                      </td>
                      <td>{review.source === 'USER_REPORT' ? `${number(review.reportCount ?? 0)} báo cáo` : labels[review.source]}</td>
                      <td>
                        <Status value={review.status} />
                      </td>
                      <td>
                        <Button
                          component={Link}
                          to={`/moderator/reviews/${review.reviewId}`}
                          variant="light"
                          size="xs"
                          data-testid={`moderator-review-inspect-${review.reviewId}`}
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
        </WorkspaceTableOptions>
      </AdminPanel>
    </>
  );
}
