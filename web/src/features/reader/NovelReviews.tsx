import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { listNovelReviews } from '../novels/novel-statistics-api';
import { getApiErrorMessage } from '../../shared/api/api-client';

export function NovelReviews({ novelId }: { novelId: string }) {
  const user = useAuthStore(state => state.user);
  const [page, setPage] = useState(1);
  const reviews = useQuery({ queryKey: ['novel-reviews', novelId, page, user?.userId ?? 'guest'], queryFn: () => listNovelReviews(novelId, page) });
  useEffect(() => setPage(1), [novelId]);
  useEffect(() => {
    if (reviews.data) setPage(current => Math.min(current, Math.max(1, reviews.data.totalPages)));
  }, [reviews.data?.totalPages]);
  return (<Stack gap="sm" mt="sm">
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
      </Stack>);
}
