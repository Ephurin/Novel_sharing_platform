import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Pagination, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { listNotifications, markNotificationRead, type AppNotification } from './notification-api';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
export function NotificationsPage() {
  const cache = useQueryClient(); const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL'); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['notifications', filter, page], queryFn: () => listNotifications(filter === 'ALL' ? undefined : filter, page), refetchInterval: 15000 });
  const mark = useMutation({ mutationFn: (item: AppNotification) => markNotificationRead(item.notificationId), onSuccess: () => cache.invalidateQueries({ queryKey: ['notifications'] }) });
  return <Box><Group justify="space-between" mb="lg"><Title order={1}>Thông báo</Title><SegmentedControl value={filter} data={[{ value: 'ALL', label: 'Tất cả' },{ value: 'UNREAD', label: 'Chưa đọc' },{ value: 'READ', label: 'Đã đọc' }]} onChange={value => { setFilter(value as typeof filter); setPage(1); }} /></Group><Stack>
    {query.isPending && <LoadingState label="Đang tải thông báo…" />}{query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}{mark.isError && <ErrorState error={mark.error} />}
    {query.data?.data.length === 0 && <EmptyState description="Chưa có thông báo." />}
    {query.data?.data.map(item => { const href = typeof item.payload.href === 'string' && (/^\/(author|reader)\//.test(item.payload.href) || item.payload.href === '/wallet') ? item.payload.href : null; return <Paper key={item.notificationId} p="md" withBorder data-testid={`notification-card-${item.notificationId}`}><Stack gap="xs"><Group justify="space-between"><Text fw={600}>{item.title}</Text>{item.status === 'UNREAD' && <Badge variant="light">Mới</Badge>}</Group><Badge size="sm" variant="outline" data-testid={`notification-type-${item.type}`}>{item.type === 'NOVEL_CHAPTER_PUBLISHED' ? 'Chương mới' : item.type}</Badge><Text size="sm" style={{ overflowWrap: 'anywhere' }}>{item.content}</Text><Text size="xs" c="dimmed">{new Date(item.createdAt).toLocaleString('vi-VN')}</Text><Group>{href && <Button component={Link} to={href} variant="light" size="xs" onClick={() => mark.mutate(item)}>Xem nội dung</Button>}{item.status === 'UNREAD' && <Button variant="subtle" size="xs" loading={mark.isPending} onClick={() => mark.mutate(item)}>Đánh dấu đã đọc</Button>}</Group></Stack></Paper>; })}
    {(query.data?.meta?.totalPages ?? 0) > 1 && <Pagination total={query.data!.meta!.totalPages} value={page} onChange={setPage} />}
  </Stack></Box>;
}
