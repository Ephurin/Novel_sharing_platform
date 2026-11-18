import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Pagination, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  notificationTypeLabel,
  type AppNotification
} from './notification-api';
import { useAuthStore } from '../auth/useAuthStore';
import { ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function NotificationsPage() {
  const user = useAuthStore((state) => state.user);
  const reader = user?.role === 'READER';
  const cache = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['notifications', filter, page],
    queryFn: () => listNotifications(filter === 'ALL' ? undefined : filter, page),
    refetchInterval: 15000
  });
  const unreadCountQuery = useQuery({
    queryKey: ['notifications', 'unread-count', user?.userId],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(user?.userId),
    refetchInterval: 15000
  });

  const mark = useMutation({
    mutationFn: (item: AppNotification) => markNotificationRead(item.notificationId),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['notifications'] })
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(query.data?.data ?? []),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['notifications'] })
  });

  const hasUnread =
    (query.data?.data ?? []).some((item) => item.status === 'UNREAD') ||
    (typeof unreadCountQuery.data === 'number' && unreadCountQuery.data > 0);

  return (
    <Box maw={840} mx="auto" w="100%">
      <Group justify="space-between" wrap="wrap" gap="sm" mb="lg">
        <Title order={1}>Thông báo</Title>
        <Group wrap="wrap" gap="sm">
          {hasUnread && (
            <Button
              variant="default"
              size="sm"
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          )}
          <SegmentedControl
            value={filter}
            data={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'UNREAD', label: 'Chưa đọc' },
              { value: 'READ', label: 'Đã đọc' }
            ]}
            onChange={(value) => {
              setFilter(value as typeof filter);
              setPage(1);
            }}
          />
        </Group>
      </Group>

      <Stack>
        {query.isPending && <LoadingState label="Đang tải thông báo…" />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {mark.isError && <ErrorState error={mark.error} />}
        {markAll.isError && <ErrorState error={markAll.error} />}
        {query.data?.data.length === 0 && <EmptyState description="Chưa có thông báo." />}

        <ResultsSurface identity={`${filter}-${page}`} busy={query.isFetching}>
          <Stack gap="sm">
            {query.data?.data.map((item) => {
              const href = notificationHref(item, reader);
              const isMarkingThis = mark.isPending && mark.variables?.notificationId === item.notificationId;
              return (
                <Paper
                  key={item.notificationId}
                  p="md"
                  withBorder
                  style={item.status === 'UNREAD' ? { borderLeft: '3px solid var(--sc-primary)' } : undefined}
                  data-testid={`notification-card-${item.notificationId}`}
                >
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Text fw={600}>{item.title}</Text>
                      {item.status === 'UNREAD' && <Badge variant="light">Mới</Badge>}
                    </Group>
                    <Badge
                      size="sm"
                      variant="outline"
                      w="fit-content"
                      data-testid={`notification-type-${item.type}`}
                    >
                      {notificationTypeLabel(item.type)}
                    </Badge>
                    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {item.content}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(item.createdAt).toLocaleString('vi-VN')}
                    </Text>
                    <Group wrap="wrap" gap="xs">
                      {href && (
                        <Button
                          component={Link}
                          to={href}
                          variant="light"
                          size="xs"
                          onClick={() => {
                            if (item.status === 'UNREAD') mark.mutate(item);
                          }}
                        >
                          Xem nội dung
                        </Button>
                      )}
                      {item.status === 'UNREAD' && (
                        <Button
                          variant="subtle"
                          size="xs"
                          loading={isMarkingThis}
                          disabled={markAll.isPending}
                          onClick={() => mark.mutate(item)}
                        >
                          Đánh dấu đã đọc
                        </Button>
                      )}
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </ResultsSurface>

        {(query.data?.meta?.totalPages ?? 0) > 1 && (
          <Pagination total={query.data!.meta!.totalPages} value={page} onChange={setPage} />
        )}
      </Stack>
    </Box>
  );
}
