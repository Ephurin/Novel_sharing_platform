import { useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminConfirm, AdminHeader, AdminPanel, dateTime } from '../admin/AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { listAdminReconsiderations, reconsiderationLabels, resolveAdminReconsideration, selectionLabels,
  type AdminReconsideration, type Reconsideration, type ReconsiderationOutcome } from './selection-api';

const statuses = ['OPEN', 'ACCEPTED', 'REJECTED'] as const;

export function AdminReconsiderationsPage() {
  const [status, setStatus] = useState<Reconsideration['status']>('OPEN');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{ item: AdminReconsideration; outcome: ReconsiderationOutcome } | null>(null);
  const [reason, setReason] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['selection-reconsiderations', status, page], queryFn: () => listAdminReconsiderations(status, page), retry: false });
  const resolve = useMutation({
    mutationFn: ({ item, outcome }: NonNullable<typeof selection>) => resolveAdminReconsideration(item, outcome, reason.trim()),
    onSuccess: async (_, { item }) => {
      setSelection(null);
      await Promise.all([client.invalidateQueries({ queryKey: ['selection-reconsiderations'] }),
        client.invalidateQueries({ queryKey: ['author-selection', item.novel_id] }),
        client.invalidateQueries({ queryKey: ['selection-queue'] })]);
    },
    onError: () => { void query.refetch(); }
  });
  function open(item: AdminReconsideration, outcome: ReconsiderationOutcome) {
    resolve.reset();
    setReason('');
    setSelection({ item, outcome });
  }
  return <>
    <AdminHeader title="Xét lại tuyển chọn" refresh={() => void query.refetch()} />
    <AdminPanel>
      <Stack>
        <Select label="Trạng thái" value={status} data={statuses.map((value) => ({ value, label: reconsiderationLabels[value] }))}
          onChange={(value) => { setStatus(statuses.find((entry) => entry === value) ?? 'OPEN'); setPage(1); }} maw={250} />
        {resolve.isSuccess && <Alert role="status">Đã lưu kết quả xét lại.</Alert>}
        {query.isPending && <LoadingState />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.isSuccess && query.data.items.length === 0 && <EmptyState description="Nhóm này chưa có yêu cầu." />}
        {query.data?.items.map((item) => <Paper key={item.reconsideration_id} withBorder p="md" component="article">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start"><Title order={2} size="h4">{item.title}</Title>
              <Badge variant="light">{reconsiderationLabels[item.status]}</Badge></Group>
            <Text size="sm" c="dimmed">{selectionLabels[item.decision_status]} · Đã gửi {dateTime(item.created_at)}</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Quyết định gốc</strong> · {item.decision_reason}</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Lý do xét lại</strong> · {item.reason}</Text>
            {item.resolution && <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Kết quả</strong> · {item.resolution}</Text>}
            {item.status === 'OPEN' && (item.can_resolve ? <Group>
              <Button onClick={() => open(item, 'ACCEPTED')}>Chấp nhận xét lại</Button>
              <Button variant="default" onClick={() => open(item, 'REJECTED')}>Bác yêu cầu</Button>
            </Group> : <Text size="sm" c="dimmed">Yêu cầu này cần một Admin độc lập xử lý.</Text>)}
          </Stack>
        </Paper>)}
        {(page > 1 || query.data?.hasMore) && <Group justify="flex-end">
          <Button variant="default" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</Button>
          <Button variant="default" disabled={!query.data?.hasMore} onClick={() => setPage(page + 1)}>Trang sau</Button>
        </Group>}
      </Stack>
    </AdminPanel>
    <AdminConfirm opened={!!selection} title={selection?.outcome === 'ACCEPTED' ? 'Chấp nhận xét lại' : 'Bác yêu cầu'}
      confirmLabel="Lưu kết quả" reason={reason} setReason={setReason} required disabled={reason.length > 2000}
      error={resolve.error} pending={resolve.isPending} onClose={() => setSelection(null)}
      onConfirm={() => { if (selection && reason.trim()) resolve.mutate(selection); }}>
      <Text size="sm">{selection?.outcome === 'ACCEPTED' ? 'Hồ sơ được đưa về hàng chờ tuyển chọn.' : 'Quyết định tuyển chọn gốc tiếp tục có hiệu lực.'}</Text>
    </AdminConfirm>
  </>;
}
