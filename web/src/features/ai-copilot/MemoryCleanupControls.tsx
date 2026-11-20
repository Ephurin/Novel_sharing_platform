import { useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { correctMemoryFact, retireMemoryEntity, type MemoryEntity, type MemoryFact } from './author-memory-api';
import { entityOptionLabel, entityTypeLabel, factKeyLabel, isEntityIdValue, isStatusValue, stateValueLabel, statusValueOptions } from './event-labels';

// Demo walkthrough 2026-11-18: once approved, a wrong entity (an idiom read as a place) or a wrong fact
// (an English value) could not be fixed by the author. These controls remove an entity or correct /
// remove a fact. Nothing is deleted: the old record stays in history, and events that still name a
// removed entity are flagged so the author can correct them.

type Perform = (fn: () => Promise<unknown>) => void;

export function EntityRetireControl({ novelId, version, entity, eventCount, disabled, perform }: {
  novelId: string; version: number; entity: MemoryEntity; eventCount: number; disabled?: boolean; perform: Perform;
}) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  return <>
    <Button size="compact-xs" variant="subtle" color="red" disabled={disabled || entity.is_locked}
      data-testid={`btn-retire-entity-${entity.entity_id}`} onClick={() => setOpened(true)}>
      Gỡ khỏi bộ nhớ
    </Button>
    <Modal opened={opened} onClose={() => setOpened(false)} title={`Gỡ “${entity.name}” khỏi bộ nhớ?`} centered>
      <Stack>
        <Text size="sm">
          {entity.name} ({entityTypeLabel(entity.entity_type)}) sẽ không còn trong danh sách, ô chọn và ngữ cảnh AI dùng khi viết.
          Lịch sử vẫn được giữ.
        </Text>
        {eventCount > 0 && <Alert color="orange">
          {eventCount} sự kiện đang nhắc tới tên này. Sau khi gỡ, các sự kiện đó được đánh dấu đỏ để bạn sửa bằng “Đề xuất chỉnh sửa”.
        </Alert>}
        <TextInput label="Lý do (không bắt buộc)" placeholder="Ví dụ: thành ngữ, không phải địa danh" value={reason}
          maxLength={500} onChange={e => setReason(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setOpened(false)}>Hủy</Button>
          <Button color="red" data-testid={`btn-confirm-retire-${entity.entity_id}`}
            onClick={() => { setOpened(false); perform(() => retireMemoryEntity(novelId, entity.entity_id, version, reason)); }}>
            Gỡ khỏi bộ nhớ
          </Button>
        </Group>
      </Stack>
    </Modal>
  </>;
}

export function FactCorrectionControl({ novelId, version, fact, entities, disabled, perform }: {
  novelId: string; version: number; fact: MemoryFact; entities: MemoryEntity[]; disabled?: boolean; perform: Perform;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const shown = typeof fact.fact_value === 'string' ? stateValueLabel(entities, fact.fact_value) : JSON.stringify(fact.fact_value);
  // The edit field keeps the stored value: a status stays a status word (Alive, not "Còn sống") and a
  // place stays an entity ID, so the author picks those from a list. Other values are edited as text.
  const raw = typeof fact.fact_value === 'string' ? fact.fact_value : JSON.stringify(fact.fact_value);
  const kind = fact.fact_key === 'status' || isStatusValue(fact.fact_value) ? 'status'
    : isEntityIdValue(fact.fact_value) ? 'entity' : 'text';
  const statusOptions = statusValueOptions.some(o => o.value.toLowerCase() === raw.trim().toLowerCase())
    ? statusValueOptions : [{ value: raw, label: stateValueLabel(entities, raw) }, ...statusValueOptions];
  const initial = kind === 'status' ? (statusOptions.find(o => o.value.toLowerCase() === raw.trim().toLowerCase())?.value ?? raw) : raw;
  const entityOptions = entities.filter(e => !e.is_retired || e.entity_id === raw)
    .map(e => ({ value: e.entity_id, label: entityOptionLabel(e, entities) }));
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const factId = String(fact.fact_id ?? '');
  // Global world rules change through the world-rule amendment screen; locked facts stay as they are.
  if (!factId || fact.is_locked || (fact.fact_type === 'world_rule' && !fact.subject_entity_id)) return null;
  const save = () => {
    if (!value.trim()) { setError('Nhập giá trị mới, hoặc chọn “Gỡ”.'); return; }
    setError(''); setEditing(false);
    perform(() => correctMemoryFact(novelId, factId, version, { fact_value: value.trim() }));
  };
  return <Stack gap={4}>
    {!editing && <Group gap={4}>
      <Button size="compact-xs" variant="subtle" disabled={disabled} data-testid={`btn-edit-fact-${factId}`}
        onClick={() => { setValue(initial); setEditing(true); }}>Sửa</Button>
      <Button size="compact-xs" variant="subtle" color="red" disabled={disabled} data-testid={`btn-remove-fact-${factId}`}
        onClick={() => setConfirmRemove(true)}>Gỡ</Button>
    </Group>}
    {editing && <Group gap={4} align="flex-end">
      {kind === 'text' ? <TextInput size="xs" label={`${factKeyLabel(String(fact.fact_key))} — giá trị mới`} value={value} maxLength={2000}
        error={error || undefined} onChange={e => setValue(e.currentTarget.value)} style={{ flex: 1 }}
        data-testid={`input-fact-${factId}`} />
        : <Select size="xs" label={`${factKeyLabel(String(fact.fact_key))} — giá trị mới`} value={value} searchable
          data={kind === 'status' ? statusOptions : entityOptions} allowDeselect={false} error={error || undefined}
          onChange={v => setValue(v ?? '')} style={{ flex: 1 }} data-testid={`input-fact-${factId}`}
          comboboxProps={{ withinPortal: true, zIndex: 400 }} />}
      <Button size="xs" disabled={disabled} onClick={save} data-testid={`btn-save-fact-${factId}`}>Lưu</Button>
      <Button size="xs" variant="default" onClick={() => { setEditing(false); setError(''); }}>Hủy</Button>
    </Group>}
    <Modal opened={confirmRemove} onClose={() => setConfirmRemove(false)} title="Gỡ dữ kiện này khỏi bộ nhớ?" centered>
      <Stack>
        <Text size="sm">{factKeyLabel(String(fact.fact_key))}: {shown}</Text>
        <Text size="sm" c="dimmed">Dữ kiện không còn được dùng khi viết và kiểm tra nhất quán. Lịch sử vẫn được giữ.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirmRemove(false)}>Hủy</Button>
          <Button color="red" data-testid={`btn-confirm-remove-fact-${factId}`}
            onClick={() => { setConfirmRemove(false); perform(() => correctMemoryFact(novelId, factId, version, { retire: true })); }}>
            Gỡ dữ kiện
          </Button>
        </Group>
      </Stack>
    </Modal>
  </Stack>;
}
