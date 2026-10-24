import { Avatar, Group, Pagination, Select, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { listNovelReviews, type ReviewSort } from '../novels/novel-statistics-api';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

const sortOptions = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'highest', label: 'Điểm cao nhất' },
  { value: 'lowest', label: 'Điểm thấp nhất' }
];

export function NovelReviews({ novelId }: { novelId: string }) {
  const user = useAuthStore(state => state.user);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const reviews = useQuery({
    queryKey: ['novel-reviews', novelId, page, user?.userId ?? 'guest', sort],
    queryFn: () => listNovelReviews(novelId, page, sort)
  });
  useEffect(() => { setPage(1); setSort('newest'); }, [novelId]);
  useEffect(() => {
    if (reviews.data) setPage(current => Math.min(current, Math.max(1, reviews.data.totalPages)));
  }, [reviews.data?.totalPages]);
  const average = reviews.data?.ratingAverage;
  const available = typeof average === 'number' && Number.isFinite(average);
  const formatted = available ? average.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'Chưa có';

  return <Stack gap="lg">
    {reviews.data && <section className="sc-review-summary" aria-label="Tổng quan đánh giá">
      <div className="sc-review-summary-score">
        <strong>{formatted}</strong>
        <div className="sc-review-scale" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => <span key={index} className={available && index < Math.round(average) ? 'is-filled' : ''} />)}
        </div>
        <Text size="sm" c="dimmed">{reviews.data.totalItems.toLocaleString('vi-VN')} nhận xét có điểm</Text>
      </div>
      <div className="sc-review-summary-meter">
        <Text size="sm" mb="xs">Điểm trung bình của nhận xét có nội dung</Text>
        {available ? <progress className="sc-review-progress" max={10} value={average} aria-label="Điểm trung bình của nhận xét có nội dung trên thang 10" /> : <Text c="dimmed" size="sm">Chưa có điểm trung bình.</Text>}
        {available && <Text size="sm" c="dimmed" mt="xs">{formatted}/10</Text>}
      </div>
    </section>}
    <section aria-labelledby="reader-reviews-heading" aria-busy={reviews.isFetching}>
      <Group justify="space-between" mb="md" className="sc-reviews-list-heading">
        <h2 id="reader-reviews-heading" className="text-section">Nhận xét của độc giả</h2>
        <Select aria-label="Sắp xếp đánh giá" data={sortOptions} value={sort} allowDeselect={false}
          onChange={value => { if (value) { setSort(value as ReviewSort); setPage(1); } }} w={170} />
      </Group>
      {reviews.isPending && <div role="status"><LoadingState label="Đang tải đánh giá…" /></div>}
      {reviews.isError && <ErrorState title="Không tải được đánh giá" error={reviews.error} onRetry={() => void reviews.refetch()} />}
      {reviews.data?.totalItems === 0 && <EmptyState title="Chưa có đánh giá" description="Nhận xét của độc giả sẽ xuất hiện tại đây." />}
      {reviews.data && <Stack gap="md">
        {reviews.data.items.map(item => <article key={item.userId} className="sc-reader-review" aria-label={`Đánh giá của ${item.displayName}`}>
          <div className="sc-reader-review-header">
            <Avatar src={item.avatarUrl} alt={`Ảnh đại diện ${item.displayName}`} radius="xl" size={40}>{item.displayName.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || '?'}</Avatar>
            <div className="sc-reader-review-identity">
              <Text fw={600}>{item.displayName}</Text>
              <Text size="sm" c="dimmed" component="time" dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</Text>
            </div>
            <Text fw={600} className="sc-reader-review-score" aria-label={`${item.score} trên 10 điểm`}>{item.score}/10</Text>
          </div>
          <Text className="sc-reader-review-content">{item.review}</Text>
        </article>)}
        {reviews.data.totalPages > 1 && <Group justify="center" mt="sm">
          <Pagination total={reviews.data.totalPages} value={page} onChange={setPage} size="sm" siblings={0} boundaries={1}
            getItemProps={item => ({ 'aria-label': `Trang ${item}` })} />
        </Group>}
      </Stack>}
    </section>
  </Stack>;
}
