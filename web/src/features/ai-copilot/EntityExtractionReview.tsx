import { useEffect, useState } from 'react';
import { Alert, Button, Card, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { memoryGet, memoryPost } from './author-memory-api';

interface GuidanceEntry { name: string; kind: string; entity_type?: string | null; aliases?: string[]; notes?: string }
interface Decision { candidate_id: string; verdict: string; canonical_name?: string; entity_type?: string | null;
  canonical_entity_id?: string; identity_quote?: string; initial_status?: string; status_quote?: string; reason: string }
interface Candidate { candidate_id: string; surface: string; start: number; end: number; context: string }
interface Review { analysis_run_id: string; chapter_id: string; revision_id: string; status: string; review_version: number;
  guidance_version: number; candidates: Candidate[]; decisions: Decision[]; reviewed_decisions: Decision[]; review_error?: string;
  known_entities: { entity_id: string; name: string; entity_type: string }[] }
const types = ['PER', 'LOC', 'ITEM', 'ORG', 'SKILL'];

export function EntityExtractionReview({ novelId, disabled, perform, onContinued }: {
  novelId: string; disabled: boolean; perform: (fn: () => Promise<unknown>) => void; onContinued: () => Promise<unknown>;
}) {
  const base = `/ai/story-brains/${novelId}`;
  const guidance = useQuery({ queryKey: ['entity-guidance', novelId],
    queryFn: () => memoryGet<{ version: number; entries: GuidanceEntry[]; chapter_review_enabled: boolean }>(`${base}/entity-guidance`) });
  const reviews = useQuery({ queryKey: ['entity-reviews', novelId], refetchInterval: 3000,
    queryFn: () => memoryGet<Review[]>(`${base}/entity-reviews`) });
  const [names, setNames] = useState('');
  const [dirty, setDirty] = useState(false);
  const [declaredName, setDeclaredName] = useState('');
  const [declaredType, setDeclaredType] = useState<string | null>('PER');
  useEffect(() => { setDirty(false); setNames(''); setDeclaredName(''); }, [novelId]);
  useEffect(() => { if (!dirty && guidance.data) setNames(guidance.data.entries.filter(e => e.kind === 'hint').map(e => e.name).join('\n')); }, [guidance.data, dirty]);
  const refresh = async () => { await Promise.all([guidance.refetch(), reviews.refetch()]); };
  return <Stack>
    {guidance.data && !guidance.data.chapter_review_enabled && <Alert color="orange">Chế độ duyệt entity trước event/fact chưa bật trên server này. Danh sách vẫn được lưu; cần bật cấu hình kiểm thử để áp dụng cho extraction chương.</Alert>}
    <Text fw={600}>1. Danh sách tăng cường (tùy chọn)</Text>
    <Text size="sm">Mỗi dòng một tên cần tìm. Tên trong danh sách không chứng minh đã xuất hiện trong chương.</Text>
    <Textarea label="Tên cần chú ý khi trích xuất" value={names} onChange={e => { setNames(e.currentTarget.value); setDirty(true); }} autosize minRows={2} />
    <Button disabled={disabled || !guidance.data} onClick={() => perform(async () => {
      const previous = new Map(guidance.data!.entries.map(e => [e.name, e]));
      const entries = names.split('\n').map(n => n.trim()).filter(Boolean).map(name => previous.get(name) ?? { name, kind: 'hint' });
      entries.push(...guidance.data!.entries.filter(e => e.kind === 'declared'));
      await memoryPost(`${base}/entity-guidance`, { expected_version: guidance.data!.version, entries });
      setDirty(false); await refresh();
    })}>Lưu danh sách tăng cường</Button>
    <Text size="sm">Khai báo entity của thế giới truyện: tạo đề xuất riêng để duyệt, không khẳng định entity đã xuất hiện trong chương.</Text>
    <TextInput label="Tên entity do tác giả khai báo" value={declaredName} onChange={e => setDeclaredName(e.currentTarget.value)} />
    <Select label="Loại entity khai báo" data={types} value={declaredType} onChange={setDeclaredType} />
    <Button disabled={disabled || !declaredName.trim() || !declaredType} onClick={() => perform(async () => {
      await memoryPost(`${base}/author-entities`, { name: declaredName.trim(), entity_type: declaredType });
      setDeclaredName(''); await refresh();
    })}>Tạo đề xuất entity từ khai báo</Button>
    {(guidance.error || reviews.error) && <Alert color="red">{String(guidance.error ?? reviews.error)}</Alert>}
    <Text fw={600}>2. Kiểm tra entity trước khi trích xuất event/fact</Text>
    {reviews.data?.map(review => <EntityCheckpoint key={`${review.analysis_run_id}:${review.review_version}`} review={review}
      guidanceVersion={guidance.data?.version} disabled={disabled || dirty} perform={perform}
      base={base} onContinued={async () => { await refresh(); await onContinued(); }} />)}
    {!reviews.data?.length && <Text size="sm">Chưa có checkpoint chờ duyệt entity. Hãy lưu danh sách rồi trích xuất nội dung.</Text>}
  </Stack>;
}

function EntityCheckpoint({ review, guidanceVersion, disabled, perform, base, onContinued }: {
  review: Review; guidanceVersion?: number; disabled: boolean; perform: (fn: () => Promise<unknown>) => void;
  base: string; onContinued: () => Promise<unknown>;
}) {
  const retained = new Map(review.reviewed_decisions.map(d => [d.candidate_id, d]));
  const [choices, setChoices] = useState<Record<string, Decision>>(() => Object.fromEntries(retained));
  const groups = new Map<string, { candidate: Candidate; decision: Decision; candidates: Candidate[] }>();
  for (const c of review.candidates) {
    const d = review.decisions.find(d => d.candidate_id === c.candidate_id)!;
    const key = JSON.stringify([c.surface, d.canonical_name, d.entity_type, d.verdict, d.canonical_entity_id]);
    const group = groups.get(key);
    if (group) group.candidates.push(c); else groups.set(key, { candidate: c, decision: d, candidates: [c] });
  }
  const choose = (ids: string[], d: Decision) => setChoices(prev => ({ ...prev,
    ...Object.fromEntries(ids.map(id => [id, { ...d, candidate_id: id, reason: 'Author reviewed entity occurrence' }])) }));
  const stale = guidanceVersion !== review.guidance_version;
  const endpoint = `${base}/entity-reviews/${review.analysis_run_id}`;
  return <Card withBorder><Stack>
    <Text fw={600}>Chương {review.chapter_id} · {review.status} · v{review.review_version}</Text>
    <Text size="xs">Bản lưu: {review.revision_id}. Các occurrence cùng tên và quyết định được gom nhóm; mở bằng chứng để kiểm tra riêng từng vị trí.</Text>
    {review.review_error && <Alert color="orange">{review.review_error}</Alert>}
    {stale && <Alert>Danh sách tăng cường đã đổi. Chạy lại bước entity để cập nhật trước khi duyệt.</Alert>}
    {review.status === 'waiting_entity_review' && !stale && <>
      <Button variant="light" disabled={disabled} onClick={() => setChoices(prev => ({
        ...Object.fromEntries(review.decisions.filter(d => d.verdict !== 'unresolved').map(d => [d.candidate_id, { ...d, reason: 'Author accepted suggested decision' }])),
        ...prev }))}>Dùng các quyết định LLM đã kiểm tra (trừ chưa rõ)</Button>
      {[...groups].map(([key, g]) => {
        const selected = choices[g.candidate.candidate_id];
        return <Stack key={key} gap="xs">
          <Text fw={500}>{g.candidate.surface} · {g.candidates.length} vị trí · LLM: {g.decision.verdict}</Text>
          <Group>
            <Button size="xs" disabled={disabled} onClick={() => setChoices(prev => ({ ...prev,
              ...Object.fromEntries(g.candidates.map(c => {
                const original = review.decisions.find(d => d.candidate_id === c.candidate_id)!;
                return [c.candidate_id, { ...original, verdict: 'entity',
                  canonical_name: original.canonical_name || c.surface, entity_type: original.entity_type || 'PER',
                  reason: 'Author reviewed occurrence' }];
              })) }))}>Giữ entity</Button>
            <Button size="xs" variant="light" disabled={disabled} onClick={() => choose(g.candidates.map(c => c.candidate_id), {
              candidate_id: '', verdict: 'not_entity', reason: 'Author rejected', canonical_name: '', canonical_entity_id: '',
              entity_type: null, identity_quote: '', initial_status: 'Unknown', status_quote: '' })}>Loại</Button>
            <Text size="sm">{selected?.verdict ?? 'Chưa duyệt'}</Text>
          </Group>
          {selected?.verdict === 'entity' && <>
            <TextInput label="Tên chuẩn (phải có bằng chứng trong nguồn)" value={selected.canonical_name ?? ''}
              disabled={disabled} onChange={e => {
                const name = e.currentTarget.value;
                const known = review.known_entities.find(e => e.name === name);
                choose(g.candidates.map(c => c.candidate_id), { ...selected, canonical_name: name,
                  canonical_entity_id: known?.entity_id ?? '', entity_type: known?.entity_type ?? selected.entity_type });
              }} />
            <Select label="Loại entity" data={types} value={selected.entity_type ?? 'PER'} disabled={disabled}
              onChange={value => choose(g.candidates.map(c => c.candidate_id), { ...selected, entity_type: value })} />
            <Textarea label="Bằng chứng alias (nếu đổi tên chuẩn)" value={selected.identity_quote ?? ''} disabled={disabled}
              onChange={e => choose(g.candidates.map(c => c.candidate_id), { ...selected, identity_quote: e.currentTarget.value })} />
          </>}
          <details><summary>Bằng chứng và xử lý từng occurrence</summary>{g.candidates.map(c => <Stack key={c.candidate_id} my="sm">
            <Text size="xs">[{c.start}, {c.end}) {c.context}</Text>
            <Select label={`Quyết định tại vị trí ${c.start}`} value={choices[c.candidate_id]?.verdict ?? null}
              data={[{ value: 'entity', label: 'Giữ entity' }, { value: 'not_entity', label: 'Loại occurrence' }]} disabled={disabled}
              onChange={v => choose([c.candidate_id], v === 'entity' ? { ...g.decision, verdict: 'entity',
                canonical_name: selected?.canonical_name || g.decision.canonical_name || c.surface,
                entity_type: selected?.entity_type || g.decision.entity_type || 'PER' } : {
                candidate_id: c.candidate_id, verdict: 'not_entity', reason: 'Author rejected' })} />
          </Stack>)}</details>
        </Stack>;
      })}
      <Button disabled={disabled || review.candidates.some(c => !choices[c.candidate_id])}
        onClick={() => perform(async () => { await memoryPost(`${endpoint}/review`, {
          expected_version: review.review_version, decisions: review.candidates.map(c => choices[c.candidate_id]) }); await onContinued(); })}>Lưu quyết định entity</Button>
    </>}
    <Button disabled={disabled} onClick={() => perform(async () => { await memoryPost(`${endpoint}/continue`, {}); await onContinued(); })}>
      {stale ? 'Chạy lại riêng bước entity' : review.status === 'entities_reviewed' ? '3. Tiếp tục trích xuất event/fact' : 'Kiểm tra lại checkpoint'}
    </Button>
  </Stack></Card>;
}
