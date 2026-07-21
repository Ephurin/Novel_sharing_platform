import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconLock, IconMoodEmpty } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { getApiErrorMessage } from '../api/api-client';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <Paper p="lg" withBorder>
      <Group gap="sm">
        <Loader size="sm" />
        <Text>{label}</Text>
      </Group>
    </Paper>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  action
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Paper p="lg" withBorder>
      <Stack gap="xs" align="flex-start">
        <IconMoodEmpty size={24} />
        <Title order={4}>{title}</Title>
        <Text c="dimmed">{description}</Text>
        {action}
      </Stack>
    </Paper>
  );
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert color="red" icon={<IconAlertTriangle size={18} />} title={title}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{getApiErrorMessage(error)}</Text>
        {onRetry ? (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}

export function PermissionState({
  requiredRole,
  onBack
}: {
  requiredRole: string;
  onBack?: () => void;
}) {
  return (
    <Paper p="lg" withBorder>
      <Stack gap="xs" align="flex-start">
        <IconLock size={24} />
        <Title order={4}>Permission required</Title>
        <Text c="dimmed">This screen requires: {requiredRole}.</Text>
        {onBack ? (
          <Button size="xs" variant="light" onClick={onBack}>
            Go back
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
