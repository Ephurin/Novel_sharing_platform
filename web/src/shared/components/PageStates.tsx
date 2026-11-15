import { Alert, Button, Paper, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconLock, IconMoodEmpty } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { getApiErrorMessage } from '../api/api-client';

export function LoadingState({ label = 'Đang tải…', variant = 'detail' }: { label?: string; variant?: 'detail' | 'table' | 'cards' }) {
  return (
    <Paper p="lg" withBorder aria-busy="true" role="status">
      <Text>{label}</Text>
      <div className="sc-loading-skeleton" aria-hidden="true" data-variant={variant}>
        {Array.from({ length: variant === 'table' ? 5 : 3 }, (_, index) => <div className="sc-skeleton-row" key={index}>
          {Array.from({ length: variant === 'detail' ? 1 : 3 }, (_, cell) => <span key={cell} className="sc-skeleton-block" style={variant === 'cards' ? { height: 100 } : undefined} />)}
        </div>)}
      </div>
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
