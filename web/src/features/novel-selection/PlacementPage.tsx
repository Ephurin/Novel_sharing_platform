import { useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Paper, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiErrorMessage, type ApiEnvelope } from '../../shared/api/api-client';
import { AdminHeader, AdminPanel, dateTime } from '../admin/AdminShared';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

type Placement = {
  placement_id: string; starts_at: string; ends_at: string; cancelled_at: string | null;
  priority: number; version: number; title: string; manageable: boolean; ended: boolean;
};
type Action = { kind: 'create' } | { kind: 'priority' | 'cancel'; item: Placement };
const endpoint = '/moderator/placements';
const titles = { create: 'Đặt lịch giới thiệu', priority: 'Đổi độ ưu tiên', cancel: 'Hủy lịch giới thiệu' };

export function PlacementPage() {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [search, setSearch] = useState('');
  const [searchText] = useDebouncedValue(search, 250);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [picked, setPicked] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [priority, setPriority] = useState<string | number>(0);
  const [reason, setReason] = useState('');
  const [key, setKey] = useState('');
  const list = useQuery({ queryKey: ['featured-placements', page], retry: false,
    queryFn: async () => (await apiClient.get<ApiEnvelope<{items: Placement[]; hasMore: boolean}>>(endpoint, { params: { page } })).data.data });
  const candidates = useQuery({ queryKey: ['placement-candidates', searchText], enabled: action?.kind === 'create', retry: false,
    queryFn: async () => (await apiClient.get<ApiEnvelope<{caseId: string; title: string}[]>>(endpoint + '/candidates',
      {params:{q:searchText}})).data.data });
  const mutation = useMutation({
    mutationFn: async (input: Action) => {
      const note = reason.trim();
      if (input.kind === 'create') {
        return apiClient.post(endpoint, {caseId, startsAt:new Date(starts).toISOString(),
          endsAt:ends ? new Date(ends).toISOString() : undefined, priority, reason:note}, {headers:{'Idempotency-Key':key}});
      }
      const path = `${endpoint}/${input.item.placement_id}`;
      const body = {reason:note, expectedVersion:input.item.version};
      return input.kind === 'priority' ? apiClient.patch(path,{...body,priority}) : apiClient.delete(path,{data:body});
    },
    onSuccess: async () => {
      setAction(null);
      await Promise.all([cache.invalidateQueries({queryKey:['featured-placements']}),cache.invalidateQueries({queryKey:['featured-selections']})]);
    },
    onError: () => { void list.refetch(); }
  });
  function open(input: Action) {
    mutation.reset();
    setAction(input);
    setReason('');
    setPriority(input.kind === 'create' ? 0 : input.item.priority);
    setCaseId(null);
    setPicked('');
    setSearch('');
    setStarts('');
    setEnds('');
    setKey(crypto.randomUUID());
  }
  const validDates = !!starts && Number.isFinite(Date.parse(starts)) && (!ends || Number.isFinite(Date.parse(ends)));
  const validPriority = typeof priority === 'number' && Number.isInteger(priority) && priority >= 0 && priority <= 100;
  const canSave = action && reason.trim() && (action.kind === 'cancel' || validPriority) &&
    (action.kind !== 'create' || (caseId && validDates));
  const options = (candidates.data ?? []).map(item=>({value:item.caseId,label:item.title}));
  if (caseId && !options.some(item=>item.value===caseId)) options.push({value:caseId,label:picked});
  return <>
    <AdminHeader title="Lịch giới thiệu" refresh={() => void list.refetch()}>
      <Button onClick={() => open({kind:'create'})}>Đặt lịch giới thiệu</Button>
    </AdminHeader>
    <AdminPanel>
      <Stack>
        {mutation.isSuccess && <Alert role="status">Đã lưu lịch giới thiệu.</Alert>}
        {list.isPending && <LoadingState />}
        {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
        {list.isSuccess && !list.data.items.length && <EmptyState description="Chưa có lịch giới thiệu." />}
        {list.data?.items.map(item=><Paper key={item.placement_id} component="article" withBorder p="md">
          <Stack gap="xs">
            <Group justify="space-between"><Title order={2} size="h4">{item.title}</Title>
              <Badge variant="light">{item.cancelled_at ? 'Đã hủy' : item.ended ? 'Đã hết hạn' :
                Date.parse(item.starts_at)>Date.now() ? 'Sắp hiển thị' : 'Đang hiển thị'}</Badge></Group>
            <Text size="sm" c="dimmed">{dateTime(item.starts_at)} – {dateTime(item.ends_at)} · Ưu tiên {item.priority}</Text>
            {item.manageable && !item.ended && !item.cancelled_at && <Group>
              <Button variant="default" size="sm" onClick={()=>open({kind:'priority',item})}>Đổi độ ưu tiên</Button>
              <Button variant="subtle" size="sm" onClick={()=>open({kind:'cancel',item})}>Hủy lịch</Button>
            </Group>}
          </Stack>
        </Paper>)}
        {(page>1 || list.data?.hasMore) && <Group justify="flex-end">
          <Button variant="default" disabled={page===1} onClick={()=>setPage(page-1)}>Trang trước</Button>
          <Button variant="default" disabled={!list.data?.hasMore} onClick={()=>setPage(page+1)}>Trang sau</Button>
        </Group>}
      </Stack>
    </AdminPanel>
    <AnimatedModal opened={!!action} title={action ? titles[action.kind] : ''} centered onClose={()=>!mutation.isPending && setAction(null)}>
      <form onSubmit={event=>{event.preventDefault(); if(action && canSave && !mutation.isPending) mutation.mutate(action);}}
        onChange={()=>{if(action?.kind==='create') setKey(crypto.randomUUID());}}>
        <Stack>
          {action?.kind==='create' && <>
            <Select label="Tác phẩm đã tuyển chọn" searchable searchValue={search} onSearchChange={setSearch}
              filter={({options:items})=>items} comboboxProps={{withinPortal:false}} value={caseId}
              nothingFoundMessage={candidates.isFetching?'Đang tìm…':'Không tìm thấy tác phẩm'}
              onChange={(value, option)=>{setCaseId(value); setPicked(option?.label ?? ''); setKey(crypto.randomUUID());}} data={options} />
            {candidates.isError && <Alert color="red">{getApiErrorMessage(candidates.error)}</Alert>}
            <TextInput type="datetime-local" label="Bắt đầu theo giờ địa phương" value={starts} onChange={event=>setStarts(event.currentTarget.value)} required />
            <TextInput type="datetime-local" label="Kết thúc theo giờ địa phương" description="Để trống cho lịch 7 ngày. Tối đa 14 ngày."
              value={ends} onChange={event=>setEnds(event.currentTarget.value)} />
          </>}
          {action && action.kind!=='create' && <Text size="sm">{action.item.title}</Text>}
          {action?.kind!=='cancel' && <NumberInput label="Độ ưu tiên" value={priority} onChange={setPriority} min={0} max={100} allowDecimal={false} />}
          <Textarea label="Lý do" value={reason} onChange={event=>setReason(event.currentTarget.value)} minRows={3} required maxLength={1000} />
          {mutation.isError && <Alert color="red" role="alert">{getApiErrorMessage(mutation.error)}</Alert>}
          <Group justify="flex-end"><Button type="submit" disabled={!canSave} loading={mutation.isPending}>
            {action?.kind==='cancel'?'Xác nhận hủy':'Lưu lịch'}
          </Button></Group>
        </Stack>
      </form>
    </AnimatedModal>
  </>;
}
