import { reviewHref } from '../../shared/routes';
import { formatDateTime } from '../../shared/lib/format-vi';
import { useUrlFilters, useListScroll, WorkspaceTable, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
import { AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
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
  dateTime,
  labels,
  number,
  options,
  Status
} from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';

const REPORT_REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam hoặc quảng cáo',
  HARASSMENT: 'Quấy rối',
  HATE_SPEECH: 'Ngôn từ thù ghét',
  SPOILER: 'Tiết lộ nội dung',
  ADULT_CONTENT: 'Nội dung không phù hợp',
  OTHER: 'Lý do khác',
  'Reader report': 'Độc giả báo cáo'
};
const reportReason = (value: string) => REPORT_REASON_LABELS[value] ?? value;

export function AdminModerationPage({ reports = false }: { reports?: boolean }) {
  const urlFilters = useUrlFilters({ targetType: '', status: 'PENDING', source: '', page: 1 }, { targetType: ['', 'NOVEL', 'CHAPTER', 'COMMENT', 'USER', 'DISCUSSION', 'DISCUSSION_COMMENT'], status: ['', 'PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'], source: ['', 'PUBLICATION_REQUEST', 'KEYWORD_FILTER', 'USER_REPORT'] });
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
            data={options(['NOVEL', 'CHAPTER', 'COMMENT', 'USER', 'DISCUSSION', 'DISCUSSION_COMMENT'], 'Tất cả đối tượng')}
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
              data={options(['PUBLICATION_REQUEST', 'KEYWORD_FILTER', 'USER_REPORT'], 'Tất cả nguồn')}
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
        <WorkspaceTableOptions name={reports ? 'adminreportspage' : 'adminmoderationpage'} columns={['Nội dung', reports ? 'Báo cáo' : 'Nguồn', 'Đã chờ', 'Trạng thái', 'Mã', 'Thao tác']} presets={{ name: reports ? 'admin-reports' : 'admin-moderation', fields: ["targetType", "status", "source"] }}>
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(targetType || status || source)}>{query.isLoading && <LoadingState variant="table" label="Đang tải kiểm duyệt..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không có mục nào khớp với bộ lọc hiện tại." />
        )}
        {!!query.data?.items.length && (
          <WorkspaceTable>
            <table className="admin-moderation-table">
              <thead>
                <tr>
                  <th>Nội dung</th>
                  <th>{reports ? 'Báo cáo' : 'Nguồn'}</th>
                  <th>Đã chờ</th>
                  <th>Trạng thái</th>
                  <th>Mã</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((review) => {
                  const heading = review.excerpt
                    ? `“${review.excerpt}”`
                    : review.targetTitle || review.summary || review.reason || `${labels[review.targetType] || review.targetType} không có tiêu đề`;
                  return (
                    <tr
                      key={review.reviewId}
                      data-testid={`moderation-review-card-${review.reviewId}`}
                    >
                      <td className="admin-moderation-subject">
                        <strong>{heading}</strong>
                        <small>
                          {labels[review.targetType] || review.targetType}
                          {review.targetContext ? ` · ${review.targetContext}` : ''}
                        </small>
                      </td>
                      <td>
                        {reports || review.source === 'USER_REPORT' ? (
                          <>
                            <div>{number(review.reportCount ?? 0)} báo cáo</div>
                            {review.topReason && <small className="admin-block">Lý do chính: {reportReason(review.topReason)}</small>}
                          </>
                        ) : (
                          <>
                            <div>{labels[review.source] || review.source}</div>
                            {!!review.matchedKeywords?.length && (
                              <small className="admin-block">Khớp: {review.matchedKeywords.join(', ')}</small>
                            )}
                          </>
                        )}
                      </td>
                      <td title={dateTime(review.createdAt)}>{formatDateTime(review.createdAt, 'relative')}</td>
                      <td>
                        <Status value={review.status} />
                      </td>
                      <td className="admin-moderation-ids">
                        <AdminId value={review.reviewId} label="mã kiểm duyệt" />
                        <AdminId value={review.targetId} label="mã đối tượng" />
                      </td>
                      <td>
                        <Button
                          component={Link}
                          to={reviewHref('/admin/moderation/:reviewId', review)}
                          variant="light"
                          size="xs"
                          data-testid={`moderation-review-inspect-${review.reviewId}`}
                        >
                          Chi tiết →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
