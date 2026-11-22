import { Avatar, Group, Pagination, Select, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { listNovelReviews, type ReviewSort } from '../novels/novel-statistics-api';
import { ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

const sortOptions = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'highest', label: 'Điểm cao nhất' },
  { value: 'lowest', label: 'Điểm thấp nhất' }
];

export function NovelReviews({
  novelId,
  compact = false,
  reviewsPath,
}: {
  novelId: string;
  compact?: boolean;
  reviewsPath?: string;
}) {
  const user = useAuthStore(state => state.user);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const activePage = compact ? 1 : page;
  const activeSort: ReviewSort = compact ? 'newest' : sort;
  const reviews = useQuery({
    queryKey: ['novel-reviews', novelId, activePage, user?.userId ?? 'guest', activeSort],
    queryFn: () => listNovelReviews(novelId, activePage, activeSort)
  });
  useEffect(() => { setPage(1); setSort('newest'); }, [novelId]);
  useEffect(() => {
    if (!compact && reviews.data) setPage(current => Math.min(current, Math.max(1, reviews.data.totalPages)));
  }, [compact, reviews.data?.totalPages]);
  const average = reviews.data?.ratingAverage;
  const available = typeof average === 'number' && Number.isFinite(average);
  const formatted = available ? average.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'Chưa có';
  const visibleItems = compact ? (reviews.data?.items ?? []).slice(0, 2) : (reviews.data?.items ?? []);
  const totalItems = reviews.data?.totalItems ?? 0;

  return <Stack gap={compact ? 'sm' : 'lg'} className={compact ? 'sc-reader-reviews-compact' : undefined}>
    {!compact && reviews.data && <section className="sc-review-summary" aria-label="Tổng quan đánh giá">
      <div className="sc-review-summary-score">
        <strong>{available ? `${formatted}/10` : formatted}</strong>
        <Text size="sm" c="dimmed" mt={4}>{totalItems.toLocaleString('vi-VN')} nhận xét có điểm</Text>
      </div>
      <div className="sc-review-summary-meter">
        <Text size="sm" mb="xs">Điểm trung bình của nhận xét có nội dung</Text>
        {available ? <progress className="sc-review-progress" max={10} value={average} aria-label="Điểm trung bình của nhận xét có nội dung trên thang 10" /> : <Text c="dimmed" size="sm">Chưa có điểm trung bình.</Text>}
      </div>
    </section>}
    <section aria-labelledby="reader-reviews-heading" aria-busy={reviews.isFetching}>
      <Group justify="space-between" mb={compact ? 'xs' : 'md'} className="sc-reviews-list-heading">
        <h2 id="reader-reviews-heading" className="text-section-title">
          {compact ? 'Đánh giá mới' : 'Nhận xét của độc giả'}
          {compact && totalItems > 0 && <span className="sc-reviews-compact-count">({totalItems.toLocaleString('vi-VN')})</span>}
        </h2>
        {compact ? (
          reviewsPath ? (
            <Link to={reviewsPath} className="sc-reviews-all-link">
              {totalItems > 2 ? `Xem tất cả (${totalItems.toLocaleString('vi-VN')}) →` : 'Xem trang đánh giá →'}
            </Link>
          ) : null
        ) : (
          <Select aria-label="Sắp xếp đánh giá" data={sortOptions} value={sort} allowDeselect={false} comboboxProps={{ withinPortal: false }}
            onChange={value => { if (value) { setSort(value as ReviewSort); setPage(1); } }} w={170} />
        )}
      </Group>
      {reviews.isPending && <div role="status"><LoadingState label="Đang tải đánh giá…" /></div>}
      {reviews.isError && <ErrorState title="Không tải được đánh giá" retryLabel="Thử lại" error={reviews.error} onRetry={() => void reviews.refetch()} />}
      {reviews.data?.totalItems === 0 && <EmptyState title="Chưa có đánh giá" description="Nhận xét của độc giả sẽ xuất hiện tại đây." />}
      {reviews.data && visibleItems.length > 0 && <ResultsSurface identity={`${novelId}-${activeSort}-${activePage}`} busy={reviews.isFetching}><Stack gap={compact ? 'xs' : 'md'}>
        {visibleItems.map(item => <article key={item.userId} className={`sc-reader-review${compact ? ' is-compact' : ''}`} aria-label={`Đánh giá của ${item.displayName}`}>
          <div className="sc-reader-review-header">
            <Avatar src={item.avatarUrl} alt={`Ảnh đại diện ${item.displayName}`} radius="xl" size={compact ? 28 : 40}>{item.displayName.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || '?'}</Avatar>
            <div className="sc-reader-review-identity">
              <Text fw={600} size={compact ? 'sm' : undefined}>{item.displayName}</Text>
              <Text size={compact ? 'xs' : 'sm'} c="dimmed" component="time" dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</Text>
            </div>
            <Text fw={600} size={compact ? 'sm' : undefined} className="sc-reader-review-score" aria-label={`${item.score} trên 10 điểm`}>{item.score}/10</Text>
          </div>
          <Text size={compact ? 'sm' : undefined} className="sc-reader-review-content">{item.review}</Text>
        </article>)}
        {!compact && reviews.data.totalPages > 1 && <Group justify="center" mt="sm">
          <Pagination total={reviews.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1}
            getItemProps={item => ({ 'aria-label': `Trang ${item}` })} />
        </Group>}
      </Stack></ResultsSurface>}
    </section>
  </Stack>;
}
