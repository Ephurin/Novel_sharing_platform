import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Paper, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { listNotifications, markNotificationRead, registerWebPushToken, type AppNotification } from './notification-api';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [deviceToken, setDeviceToken] = useState(`web-token-${Date.now()}`);
  const [statusMessage, setStatusMessage] = useState('Notifications UI ready');
  const notificationsQuery = useQuery({
    queryKey: ['notifications', statusFilter],
    queryFn: () => listNotifications(statusFilter === 'ALL' ? undefined : statusFilter)
  });

  const markReadMutation = useMutation({
    mutationFn: (notification: AppNotification) => markNotificationRead(notification.notificationId),
    onSuccess: async () => {
      setStatusMessage('Notification marked as read');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const registerTokenMutation = useMutation({
    mutationFn: () => registerWebPushToken(deviceToken),
    onSuccess: () => setStatusMessage('Web push token registered')
  });

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={1}>Notifications</Title>
          <Text c="dimmed">MVP inbox for persisted notifications and device-token registration.</Text>
        </Box>
        <Badge variant="light">{statusMessage}</Badge>
      </Group>

      <Paper p="md" withBorder mb="md">
        <Group align="end">
          <SegmentedControl
            value={statusFilter}
            data={['ALL', 'UNREAD', 'READ']}
            onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          />
          <TextInput
            label="Mock web push token"
            value={deviceToken}
            onChange={(event) => setDeviceToken(event.currentTarget.value)}
            className="grow"
          />
          <Button loading={registerTokenMutation.isPending} onClick={() => registerTokenMutation.mutate()}>
            Register device
          </Button>
        </Group>
      </Paper>

      <Stack>
        {notificationsQuery.isLoading ? <LoadingState label="Loading notifications..." /> : null}
        {notificationsQuery.isError ? <ErrorState error={notificationsQuery.error} onRetry={() => void notificationsQuery.refetch()} /> : null}
        {!notificationsQuery.isLoading && !notificationsQuery.isError && !notificationsQuery.data?.length ? (
          <EmptyState description="No notifications yet. Backend storage is ready; domain event creation can be wired later." />
        ) : null}
        {!notificationsQuery.isLoading && !notificationsQuery.isError ? (notificationsQuery.data ?? []).map((notification) => (
          <Paper key={notification.notificationId} p="md" withBorder data-testid={`notification-card-${notification.notificationId}`}>
            <Group justify="space-between">
              <Box>
                <Group gap="xs">
                  <Text fw={700}>{notification.title}</Text>
                  <Badge size="sm" color={notification.status === 'UNREAD' ? undefined : 'gray'}>
                    {notification.status}
                  </Badge>
                  <Badge size="sm" variant="outline" data-testid={`notification-type-${notification.type}`}>
                    {notification.type}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mt={4}>
                  {notification.content}
                </Text>
              </Box>
              <Button
                size="xs"
                variant="light"
                disabled={notification.status === 'READ'}
                onClick={() => markReadMutation.mutate(notification)}
              >
                Mark read
              </Button>
            </Group>
          </Paper>
        )) : null}
      </Stack>
    </Box>
  );
}
