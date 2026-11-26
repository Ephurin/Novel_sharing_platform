import { navigationHref } from '../../shared/routes';
import { hasReaderCapability } from '../auth/auth-types';
import { Alert, Button, Group, NumberInput, Slider, Stack, Text, Textarea } from '@mantine/core';
import NumberFlow from '@number-flow/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { getNovelStatistics, rateNovel, type NovelStatistics } from '../novels/novel-statistics-api';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { Link } from 'react-router-dom';

export function NovelEngagement({ novelId, authorId, onSaved }: { novelId: string; authorId: string; onSaved?: () => void }) {
  const user = useAuthStore(state => state.user);
  const reduce = useReducedMotion();
  const client = useQueryClient();
  const key = ['novel-statistics', novelId, user?.userId ?? 'guest'];
  const query = useQuery({ queryKey: key, queryFn: () => getNovelStatistics(novelId) });
  const [score, setScore] = useState<number | string>('');
  const [review, setReview] = useState('');
  const [notice, setNotice] = useState('');
  // Refresh only when the saved review changes; a follow/refetch must not erase edits.
  useEffect(() => {
    setScore(query.data?.myRating ?? '');
    setReview(query.data?.myReview ?? '');
    setNotice('');
  }, [novelId, user?.userId, query.data?.myRating, query.data?.myReview]);
  const refresh = async (data: NovelStatistics) => {
    client.setQueryData(key, data);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['novel-statistics', novelId] }),
      client.invalidateQueries({ queryKey: ['novel-reviews', novelId] })
    ]);
  };
  const rating = useMutation({
    mutationFn: (input: { score: number | null; review?: string | null }) => rateNovel(novelId, input.score, input.review),
    onSuccess: async (data, input) => {
      await refresh(data);
      setNotice(input.score === null ? 'Đã xóa đánh giá.' : 'Đã lưu đánh giá.');
      onSaved?.();
    }
  });
  const disabled = !hasReaderCapability(user) || user?.status !== 'ACTIVE' || user?.userId === authorId;
  if (query.isPending) return <Text c="dimmed">Đang tải đánh giá…</Text>;
  if (query.isError) return <Alert color="red">{getApiErrorMessage(query.error)} <Button variant="subtle" onClick={() => void query.refetch()}>Thử lại</Button></Alert>;
  const stats = query.data;
  const numericScore = typeof score === 'number' ? score : 5;
  const scoreMood = numericScore >= 9 ? 'Kiệt tác' : numericScore >= 7 ? 'Rất đáng đọc' : numericScore >= 5 ? 'Khá ổn' : 'Cần cải thiện';
  const validScore = typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 10;
  const dirty = score !== (stats.myRating ?? '') || review.trim() !== (stats.myReview ?? '');
  return <Stack gap="sm" mt="md">
    {!disabled ? <form className="sc-reader-rating-form" onSubmit={event => { event.preventDefault(); if (validScore) rating.mutate({ score: Number(score), review: review.trim() || null }); }}>
      <Stack gap="xs">
        <div className="sc-reader-score-controls">
          <NumberInput label="Điểm của bạn /10" placeholder="Nhập điểm" required disabled={rating.isPending} value={score}
            min={1} max={10} step={1} allowDecimal={false} allowNegative={false} clampBehavior="strict" hideControls
            onChange={value => { setScore(value); setNotice(''); }} />
          <div className="sc-reader-score-slider">
            <Group justify="space-between" align="baseline" mb="xs">
              <Text size="sm" c="dimmed">Nhập điểm hoặc kéo thanh để chọn từ 1 đến 10.</Text>
              <Text size="sm" fw={600} c="var(--sc-primary-text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <NumberFlow value={numericScore} animated={!reduce} />/10 · {scoreMood}
              </Text>
            </Group>
            <Slider thumbLabel="Kéo để chọn điểm" value={numericScore} min={1} max={10} step={1} disabled={rating.isPending}
              marks={[{ value: 1, label: '1' }, { value: 5, label: '5' }, { value: 10, label: '10' }]}
              label={value => `${value}/10`} onChange={value => { setScore(value); setNotice(''); }} />
          </div>
        </div>
        <Textarea label="Nhận xét về tác phẩm" placeholder="Chia sẻ cảm nhận của bạn…" value={review}
          onChange={event => { setReview(event.currentTarget.value); setNotice(''); }} maxLength={2000}
          autosize minRows={4} maxRows={16} disabled={rating.isPending} />
        <Text size="xs" c="dimmed" ta="right" aria-live="polite">{review.length.toLocaleString('vi-VN')}/2.000 ký tự</Text>
        <Group>
          <Button type="submit" disabled={!validScore || !dirty} loading={rating.isPending}>{stats.myRating === null ? 'Đăng đánh giá' : 'Lưu đánh giá'}</Button>
          {stats.myRating !== null && <Button type="button" variant="subtle" color="red" disabled={rating.isPending} onClick={() => rating.mutate({ score: null })}>Xóa đánh giá</Button>}
        </Group>
      </Stack>
    </form> : <Text size="sm" c="dimmed">{!user ? <><Link to={navigationHref("/login")} className="sc-review-link">Đăng nhập</Link> bằng tài khoản độc giả để đánh giá tác phẩm.</> : 'Chỉ tài khoản độc giả đang hoạt động mới được đánh giá tác phẩm.'}</Text>}
    {notice && <Text size="sm" role="status">{notice}</Text>}
    {rating.isError ? <Alert color="red">{getApiErrorMessage(rating.error)}</Alert> : null}
  </Stack>;
}
