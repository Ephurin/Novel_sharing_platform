import { Alert, Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel, getNovelStatistics, listNovelReviews, rateNovel, type NovelStatistics } from '../novels/novel-statistics-api';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { ReactionIcon } from '../../shared/components/InteractionWidgets';

export function NovelEngagement({ novelId, authorId }: { novelId: string; authorId: string }) {
  const user = useAuthStore(state => state.user);
  const client = useQueryClient();
  const key = ['novel-statistics', novelId, user?.userId ?? 'guest'];
  const query = useQuery({ queryKey: key, queryFn: () => getNovelStatistics(novelId) });
  const [page, setPage] = useState(1);
  const reviews = useQuery({ queryKey: ['novel-reviews', novelId, page, user?.userId ?? 'guest'], queryFn: () => listNovelReviews(novelId, page) });
  const [score, setScore] = useState<string | null>(null);
  const [review, setReview] = useState('');
  const [notice, setNotice] = useState('');
  // Refresh only when the saved review changes; a follow/refetch must not erase edits.
  useEffect(() => {
    setScore(query.data?.myRating == null ? null : String(query.data.myRating));
    setReview(query.data?.myReview ?? '');
    setNotice('');
  }, [novelId, user?.userId, query.data?.myRating, query.data?.myReview]);
  useEffect(() => setPage(1), [novelId]);
  useEffect(() => {
    if (reviews.data) setPage(current => Math.min(current, Math.max(1, reviews.data.totalPages)));
  }, [reviews.data?.totalPages]);
  const refresh = async (data: NovelStatistics) => {
    client.setQueryData(key, data);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['novel-statistics', novelId] }),
      client.invalidateQueries({ queryKey: ['novel-reviews', novelId] })
    ]);
  };
  const follow = useMutation({ mutationFn: () => followNovel(novelId, !query.data?.isFollowing), onSuccess: refresh });
  const rating = useMutation({
    mutationFn: (input: { score: number | null; review?: string | null }) => rateNovel(novelId, input.score, input.review),
    onSuccess: async (data, input) => {
      await refresh(data);
      setNotice(input.score === null ? 'Đã xóa đánh giá.' : 'Đã lưu đánh giá.');
    }
  });
  const disabled = user?.role !== 'READER' || user.userId === authorId;
  if (query.isPending) return <Text c="dimmed">Đang tải đánh giá…</Text>;
  if (query.isError) return <Alert color="red">{getApiErrorMessage(query.error)} <Button variant="subtle" onClick={() => void query.refetch()}>Thử lại</Button></Alert>;
  const stats = query.data;
  const dirty = score !== (stats.myRating === null ? null : String(stats.myRating)) || review.trim() !== (stats.myReview ?? '');
  return <Stack gap="sm" mt="md">
    <Group gap="md">
      <Text size="sm">{stats.ratingAverage === null ? 'Chưa có đánh giá' : `${stats.ratingAverage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}/10`} · {stats.ratingsCount} lượt đánh giá</Text>
      <Text size="sm">{stats.followersCount.toLocaleString('vi-VN')} người theo dõi truyện</Text>
      <Text size="sm">{stats.totalWords.toLocaleString('vi-VN')} {user?.userId === authorId || user?.role === 'ADMIN' ? 'từ toàn bộ chương' : 'từ đã xuất bản'}</Text>
    </Group>
    <Button variant="default" disabled={disabled} loading={follow.isPending} onClick={() => follow.mutate()} style={{ alignSelf: 'flex-start' }} leftSection={<ReactionIcon icon={stats.isFollowing ? 'check' : 'add'} active={stats.isFollowing} />}>{stats.isFollowing ? 'Bỏ theo dõi truyện' : 'Theo dõi truyện'}</Button>
    {!disabled ? <form onSubmit={event => { event.preventDefault(); if (score !== null) rating.mutate({ score: Number(score), review: review.trim() || null }); }}>
      <Stack gap="xs">
        <Select label="Điểm của bạn /10" placeholder="Chọn điểm" required disabled={rating.isPending} value={score}
          data={Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}/10` }))}
          onChange={value => { setScore(value); setNotice(''); }} />
        <Textarea label="Nhận xét về tác phẩm" placeholder="Chia sẻ cảm nhận của bạn…" value={review}
          onChange={event => { setReview(event.currentTarget.value); setNotice(''); }} maxLength={2000}
          autosize minRows={2} maxRows={6} disabled={rating.isPending} description="Tối đa 2.000 ký tự." />
        <Group>
          <Button type="submit" variant="default" disabled={score === null || !dirty} loading={rating.isPending}>{stats.myRating === null ? 'Gửi đánh giá' : 'Lưu đánh giá'}</Button>
          {stats.myRating !== null && <Button variant="subtle" color="red" disabled={rating.isPending} onClick={() => rating.mutate({ score: null })}>Xóa đánh giá</Button>}
        </Group>
      </Stack>
    </form> : <Text size="sm" c="dimmed">Chỉ tài khoản độc giả đã đăng nhập mới được đánh giá và theo dõi truyện.</Text>}
    {notice && <Text size="sm" role="status">{notice}</Text>}
    {follow.isError || rating.isError ? <Alert color="red">{getApiErrorMessage(follow.error ?? rating.error)}</Alert> : null}
    <details>
      <summary style={{ cursor: 'pointer' }}>Nhận xét của độc giả{reviews.data ? ` (${reviews.data.totalItems})` : ''}</summary>
      <Stack gap="sm" mt="sm">
        {reviews.isPending && <Text size="sm" c="dimmed">Đang tải nhận xét…</Text>}
        {reviews.isError && <Alert color="red">{getApiErrorMessage(reviews.error)} <Button variant="subtle" onClick={() => void reviews.refetch()}>Thử lại</Button></Alert>}
        {reviews.data?.totalItems === 0 && <Text size="sm" c="dimmed">Chưa có nhận xét.</Text>}
        {reviews.data?.items.map(item => <div key={item.userId} style={{ borderBottom: '1px solid var(--sc-border)', paddingBottom: 12 }}>
          <Group justify="space-between"><Text size="sm" fw={600}>{item.displayName}</Text><Text size="sm" fw={600}>{item.score}/10</Text></Group>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.review}</Text>
          <Text size="xs" c="dimmed">{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</Text>
        </div>)}
        {reviews.data && reviews.data.totalPages > 1 && <Group>
          <Button variant="default" size="xs" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Trang trước</Button>
          <Text size="sm">{page}/{reviews.data.totalPages}</Text>
          <Button variant="default" size="xs" disabled={page >= reviews.data.totalPages} onClick={() => setPage(current => current + 1)}>Trang sau</Button>
        </Group>}
      </Stack>
    </details>
  </Stack>;
}
