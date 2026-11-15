import { useState } from 'react';
import { Alert, Button, Modal, Select, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { memoryPost, type MemoryEntity } from './author-memory-api';

export function EntityMergeControl({ novelId, version, entities, disabled = false }: {
  novelId: string; version: number; entities: MemoryEntity[]; disabled?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const qc = useQueryClient();
  const characters = entities.filter(e => ['PER', 'PERSON', 'CHARACTER'].includes(e.entity_type.toUpperCase()));
  const from = characters.find(e => e.entity_id === source);
  const to = characters.find(e => e.entity_id === target);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['approved-memory', novelId] }),
    qc.invalidateQueries({ queryKey: ['story-brain-summary', novelId] }),
    qc.invalidateQueries({ queryKey: ['memory-review', novelId] }),
    qc.invalidateQueries({ queryKey: ['story-context', novelId] }),
    qc.invalidateQueries({ queryKey: ['author', 'story-context'] })
  ]);
  const merge = useMutation({
    mutationFn: () => memoryPost(`/ai/story-brains/${novelId}/entities/merge`, {
      source_entity_id: source, target_entity_id: target, expected_brain_version: version
    }),
    onSuccess: async () => {
      setNotice(`Đã gộp “${from?.name}” vào “${to?.name}”. Tên cũ được giữ làm tên gọi khác.`);
      setOpened(false); setSource(null); setTarget(null);
      await refresh();
    }
  });
  if (characters.length < 2 && !notice) return null;
  const options = characters.map(e => ({ value: e.entity_id, label: `${e.name} · ${e.entity_id.slice(0, 8)}` }));
  return <Stack gap="xs">
    <Button size="xs" variant="light" disabled={disabled || characters.length < 2} onClick={() => { merge.reset(); setOpened(true); }}>
      Gộp hai tên của cùng nhân vật
    </Button>
    {notice && <Alert color="teal" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    <Modal opened={opened} onClose={() => { if (!merge.isPending) setOpened(false); }} title="Gộp danh tính nhân vật" centered>
      <Stack>
        <Text size="sm">Chỉ gộp khi bạn xác nhận hai hồ sơ là cùng một người. Nhân vật giữ lại sẽ có tên chính thức bạn chọn.</Text>
        <Select searchable label="Tên cần gộp (sẽ thành tên gọi khác)" data={options.filter(o => o.value !== target)}
          value={source} onChange={setSource} disabled={merge.isPending} />
        <Select searchable label="Nhân vật giữ lại (tên chính thức)" data={options.filter(o => o.value !== source)}
          value={target} onChange={setTarget} disabled={merge.isPending} />
        {from && to && <Alert color="blue">Gộp “{from.name}” vào “{to.name}”. Sự kiện, dữ kiện và quan hệ sẽ được chuyển về nhân vật giữ lại. Thông tin bổ sung của hai hồ sơ Cẩm nang được giữ; nội dung khác nhau được lưu trong ghi chú.</Alert>}
        {merge.error && <Alert color="red">{merge.error instanceof ApiClientError && merge.error.status === 409
          ? 'Bộ nhớ đã thay đổi. Hãy tải lại danh sách trước khi gộp.' : getApiErrorMessage(merge.error)}
          <Button size="xs" variant="subtle" onClick={() => void refresh()}>Tải lại danh sách</Button></Alert>}
        <Button loading={merge.isPending} disabled={disabled || !from || !to || source === target || from.entity_type !== to.entity_type}
          onClick={() => merge.mutate()}>Xác nhận gộp</Button>
      </Stack>
    </Modal>
  </Stack>;
}
