import { useState } from 'react';
import { Button, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listChapters } from '../novels/novel-api';
import { listChapterRevisions } from './ai-copilot-api';
import { memoryPost, type MemoryEntity } from './author-memory-api';

export function AuthorMemoryRepair({ novelId, version, entities, disabled, perform }: {
  novelId: string; version: number; entities: MemoryEntity[]; disabled: boolean;
  perform: (fn: () => Promise<unknown>) => void;
}) {
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>('fact');
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState<string | null>('text');
  const [subject, setSubject] = useState<string | null>(null);
  const [locations, setLocations] = useState('');
  const [participants, setParticipants] = useState('');
  const [entityType, setEntityType] = useState<string | null>('PER');
  const chapters = useQuery({ queryKey: ['repair-chapters', novelId], queryFn: () => listChapters(novelId) });
  const revisions = useQuery({ queryKey: ['repair-revisions', chapterId], enabled: Boolean(chapterId),
    queryFn: () => listChapterRevisions(chapterId!) });
  const revision = revisions.data?.[0];
  const split = (text: string) => text.split(',').map(x => x.trim()).filter(Boolean);
  return <Stack>
    <Text fw={600}>Bổ sung hoặc thay thế dữ liệu trích xuất</Text>
    <Text size="sm">Tạo đề xuất từ bản lưu mới nhất. Nếu thay thế đề xuất sai, hãy loại đề xuất cũ riêng; dữ liệu đã duyệt không tự bị xóa.</Text>
    <Select label="Chương nguồn" value={chapterId} onChange={id => { setChapterId(id); setQuote(''); }}
      data={(chapters.data ?? []).map(c => ({ value: c.chapterId, label: `Chương ${c.chapterNumber}: ${c.title}` }))} />
    <Textarea label="Nội dung bản lưu (chọn và sao chép đoạn làm bằng chứng)" readOnly value={revision?.content ?? ''} minRows={4} maxRows={10} autosize />
    <Textarea label="Trích dẫn nguyên văn, đủ dài để xác định duy nhất" value={quote} onChange={e => setQuote(e.currentTarget.value)} />
    <Select label="Loại đề xuất" value={kind} onChange={setKind} data={[{ value: 'fact', label: 'Dữ kiện / trạng thái' }, { value: 'entity', label: 'Thực thể' }, { value: 'event', label: 'Sự kiện' }]} />
    <TextInput label={kind === 'entity' ? 'Tên thực thể trong đoạn nguồn' : kind === 'event' ? 'Loại sự kiện' : 'Thuộc tính (ví dụ status, hearing, scan_count)'} value={name} onChange={e => setName(e.currentTarget.value)} />
    {kind === 'entity' ? <Select label="Loại thực thể" value={entityType} onChange={setEntityType} data={['PER', 'LOC', 'ITEM', 'ORG', 'SKILL']} /> :
      <Textarea label={kind === 'event' ? 'Diễn biến, giữ đúng mức độ chắc chắn' : 'Giá trị (status: Alive / Dead / Unknown)'} value={value} onChange={e => setValue(e.currentTarget.value)} />}
    {kind === 'fact' && <Select searchable clearable label="Thực thể đã duyệt (bỏ trống với lời kể chưa xác nhận / quy tắc chung)" value={subject} onChange={setSubject} data={entities.map(e => ({ value: e.entity_id, label: e.name }))} />}
    {kind === 'fact' && <Select label="Kiểu giá trị" value={valueType} onChange={setValueType} data={[{ value: 'text', label: 'Văn bản' }, { value: 'number', label: 'Số' }]} />}
    {kind === 'event' && <><TextInput label="Người thực sự tham gia, cách nhau bằng dấu phẩy" value={participants} onChange={e => setParticipants(e.currentTarget.value)} />
      <TextInput label="Địa điểm xảy ra" value={locations} onChange={e => setLocations(e.currentTarget.value)} /></>}
    {chapters.error || revisions.error ? <Text c="red">Không đọc được chương/bản lưu. Hãy tải lại.</Text> : null}
    <Button disabled={disabled || !revision || !quote.trim() || !name.trim() || (kind !== 'entity' && !value.trim())} onClick={() => perform(async () => {
      if (kind === 'fact' && valueType === 'number' && !Number.isFinite(Number(value))) throw new Error('Giá trị phải là số.');
      const payload = kind === 'entity' ? { canonical_name: name.trim(), entity_type: entityType, initial_status: 'Unknown' } :
        kind === 'event' ? { event_type: name.trim(), summary: value, participants: split(participants), locations: split(locations) } :
          { fact_key: name.trim(), fact_value: valueType === 'number' ? Number(value) : value, ...(subject ? { subject_entity_id: subject } : {}) };
      await memoryPost(`/ai/story-brains/${novelId}/author-proposals`, { chapter_id: chapterId,
        revision_id: revision!.revisionId, quote, proposal_type: kind, payload, expected_brain_version: version });
      setQuote(''); setValue(''); setName('');
    })}>Tạo đề xuất để duyệt</Button>
  </Stack>;
}
