import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Drawer, Group, NumberInput, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage, ApiClientError } from '../../shared/api/api-client';
import { getChapter, listChapters } from '../novels/novel-api';
import { listChapterRevisions } from './ai-copilot-api';
import { AuthorMemoryRepair } from './AuthorMemoryRepair';
import { acceptProposalGroup, activateBaseline, getBootstrapJob, getReviewQueue, getStoryBrainSummary,
  rejectProposal, resumeBootstrapJob, startManuscriptBootstrap } from '../manuscript-import/manuscript-import-api';
import { getApprovedMemory, memoryGet, memoryPost, runAuthorOperation, saveFuturePlan,
  type AutoRun, type AuthorPlan, type ConsistencyFinding, type FutureEvent, type MemoryEvent } from './author-memory-api';

export function AuthorMemoryPanel({ novelId, chapterId, content, opened, onClose, saved }: {
  novelId: string; chapterId: string; content: string; opened: boolean; onClose: () => void; saved: boolean;
}) {
  const qc = useQueryClient();
  const [setup, setSetup] = useState('');
  const [direction, setDirection] = useState('');
  const [events, setEvents] = useState<FutureEvent[]>([]);
  const [findings, setFindings] = useState<ConsistencyFinding[] | null>(null);
  const [message, setMessage] = useState('');
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const storageKey = `ephurin-bootstrap-${novelId}`;
  const [jobId, setJobId] = useState<string | null>(() => localStorage.getItem(storageKey));
  useEffect(() => { setJobId(localStorage.getItem(storageKey)); setEvents([]); setFindings(null); }, [storageKey]);
  const enabled = opened && Boolean(novelId);
  const brain = useQuery({ queryKey: ['story-brain-summary', novelId], queryFn: () => getStoryBrainSummary(novelId), enabled, refetchInterval: enabled ? 3000 : false });
  const memory = useQuery({ queryKey: ['approved-memory', novelId], queryFn: () => getApprovedMemory(novelId), enabled, refetchInterval: enabled ? 3000 : false });
  const queue = useQuery({ queryKey: ['memory-review', novelId], queryFn: () => getReviewQueue(novelId), enabled, refetchInterval: enabled ? 3000 : false });
  const extraction = useQuery({ queryKey: ['memory-extraction', novelId], enabled, refetchInterval: enabled ? 3000 : false,
    queryFn: () => memoryGet<{ chapter_id: string; chapter_number: number; status: string | null; retry_count: number }[]>(`/ai/story-brains/${novelId}/extraction-status`) });
  const job = useQuery({ queryKey: ['memory-job', jobId], queryFn: () => getBootstrapJob(jobId!), enabled: enabled && Boolean(jobId),
    refetchInterval: q => ['queued', 'running'].includes(q.state.data?.status ?? '') ? 1500 : false });
  const plan = useQuery({ queryKey: ['author-plan', novelId], queryFn: async () => {
    try { return await memoryGet<AuthorPlan>(`/ai/story-plans/by-novel/${novelId}/active`); }
    catch (e) { if (e instanceof ApiClientError && e.status === 404) return null; throw e; }
  }, enabled });
  const auto = useQuery({ queryKey: ['author-auto', novelId], queryFn: async () => {
    try {
      const lastRun = localStorage.getItem(`ephurin-auto-${novelId}`);
      return await memoryGet<AutoRun>(lastRun ? `/ai/autonomous/runs/${lastRun}` : `/ai/autonomous/by-novel/${novelId}/active`);
    }
    catch (e) { if (e instanceof ApiClientError && e.status === 404) return null; throw e; }
  }, enabled, refetchInterval: enabled ? 3000 : false });
  useEffect(() => {
    if (!auto.data) return;
    void qc.invalidateQueries({ queryKey: ['author', 'chapters', novelId] });
    void qc.invalidateQueries({ queryKey: ['author', 'chapter', chapterId] });
  }, [auto.data?.current_iteration, auto.data?.status, novelId, chapterId, qc]);
  const refresh = async () => { await Promise.all([
    qc.invalidateQueries({ queryKey: ['approved-memory', novelId] }), qc.invalidateQueries({ queryKey: ['story-brain-summary', novelId] }),
    qc.invalidateQueries({ queryKey: ['memory-review', novelId] }), qc.invalidateQueries({ queryKey: ['author-plan', novelId] }),
    qc.invalidateQueries({ queryKey: ['author-auto', novelId] })]); };
  const action = useMutation({ mutationFn: async (fn: () => Promise<unknown>) => fn(), onSuccess: refresh,
    onError: e => { setMessage(getApiErrorMessage(e)); } });
  const perform = (fn: () => Promise<unknown>) => { setMessage(''); action.mutate(fn); };
  const rememberJob = (id: string) => { localStorage.setItem(storageKey, id); setJobId(id); };
  const bootstrap = async () => {
    if (!saved) throw new Error('Hãy đợi lưu bản nháp trước khi trích xuất.');
    const chapters = await listChapters(novelId);
    const revisions = [];
    for (const ch of chapters) {
      const detail = await getChapter(ch.chapterId);
      const body = detail.draft?.content ?? detail.content ?? '';
      if (!body.trim()) continue;
      const rev = await memoryPost<{ revisionId: string; contentHash: string }>(`/chapters/${ch.chapterId}/revisions/snapshot`,
        { content: body, purpose: 'MANUSCRIPT_BOOTSTRAP' });
      revisions.push({ chapter_id: ch.chapterId, revision_id: rev.revisionId, content_hash: rev.contentHash });
    }
    if (!revisions.length) throw new Error('Chưa có nội dung chương để trích xuất.');
    const result = await startManuscriptBootstrap(novelId, revisions); rememberJob(result.job_id);
  };
  const check = async () => {
    if (!saved) throw new Error('Hãy lưu nội dung trước khi kiểm tra.');
    const revisions = await listChapterRevisions(chapterId);
    const revision = revisions[0];
    if (!revision || revision.content !== content) throw new Error('Nội dung chưa có phiên bản đã lưu tương ứng.');
    const result = await runAuthorOperation<{ findings: ConsistencyFinding[] }>(novelId,
      { operation: 'check_consistency', content, revision_id: revision.revisionId });
    setFindings(result.findings);
  };
  const correction = async (event: MemoryEvent, summary: string) => {
    await memoryPost(`/ai/story-brains/${novelId}/events/${event.event_id}/corrections`, {
      expected_brain_version: brain.data!.brain_version,
      replacement: { event_type: event.event_type, participants: event.participants, summary, chapter: event.chapter },
      transitions: memory.data?.transitions.filter(t => t.event_id === event.event_id)
        .map(t => ({ entity_id: t.entity_id, attribute_key: t.attribute_key, new_value: t.new_value })) ?? [] });
    setMessage('Đã tạo đề xuất cập nhật. Kiểm tra và duyệt trong tab Chờ duyệt.');
  };
  const pending = action.isPending;
  const grouped = new Map<string, NonNullable<typeof queue.data>>();
  for (const p of queue.data ?? []) { const key = p.dependency_group_id; grouped.set(key, [...(grouped.get(key) ?? []), p]); }
  const category = (types: string[]) => memory.data?.entities.filter(e => types.includes(e.entity_type.toLowerCase())) ?? [];

  return <Drawer opened={opened} onClose={onClose} position="left" size="lg" title="Bộ nhớ và định hướng tiểu thuyết">
    <Stack>
      <Text size="sm">Bộ nhớ chính thức v{brain.data?.brain_version ?? '…'} · {brain.data?.status ?? 'đang tải'}. Đề xuất chưa duyệt chưa được dùng làm sự thật.</Text>
      {(message || action.error || memory.error || queue.error || extraction.error || plan.error || auto.error || job.error)
        && <Alert>{message || getApiErrorMessage(memory.error ?? queue.error ?? extraction.error ?? plan.error ?? auto.error ?? job.error)}</Alert>}
      <Tabs defaultValue="review">
        <Tabs.List>{[['review', `Chờ duyệt (${queue.data?.length ?? 0})`], ['characters', 'Nhân vật'], ['locations', 'Địa danh'], ['items', 'Vật phẩm'], ['history', 'Sự kiện'], ['setup', 'Trích xuất'], ['plan', 'Định hướng'], ['auto', 'Full auto']].map(([value, label]) => <Tabs.Tab key={value} value={value}>{label}</Tabs.Tab>)}</Tabs.List>
        <Tabs.List><Tabs.Tab value="facts">Dữ kiện</Tabs.Tab></Tabs.List>
        <Tabs.Panel value="facts" pt="md"><Stack>{memory.data?.facts.map((fact, index) =>
          <Card withBorder key={String(fact.fact_id ?? index)}><Text fw={600}>{String(fact.fact_key)}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{typeof fact.fact_value === 'string' ? fact.fact_value : JSON.stringify(fact.fact_value, null, 2)}</Text>
            <Text size="xs">Chương {String(fact.chapter_number ?? '—')} · Thực thể {String(fact.subject_entity_id ?? 'chung')}</Text></Card>)}</Stack></Tabs.Panel>
        <Tabs.Panel value="review" pt="md"><Stack>
          {brain.data && <AuthorMemoryRepair novelId={novelId} version={brain.data.brain_version}
            entities={memory.data?.entities ?? []} disabled={pending} perform={perform} />}
          <Text size="sm">Lưu chương sau khi kích hoạt bộ nhớ sẽ tự trích xuất. Duyệt các nhóm dưới đây để cập nhật bộ nhớ.</Text>
          <Button variant="light" disabled={pending || !saved} onClick={() => perform(async () => {
            const revisions = await listChapterRevisions(chapterId);
            if (!revisions[0]) throw new Error('Chưa có bản lưu để phân tích.');
            await memoryPost(`/ai/story-brains/${novelId}/reanalyse`, { revision_id: revisions[0].revisionId });
            setMessage('Đã phân tích lại bản lưu theo canon hiện tại. Kiểm tra nhóm mới; loại các nhóm cũ không còn dùng.');
          })}>Phân tích lại chương đang mở</Button>
          {extraction.data?.filter(e => e.status && e.status !== 'COMPLETED').map(e => <Alert key={e.chapter_id} color={e.status === 'FAILED' ? 'red' : 'blue'}>
            Chương {e.chapter_number}: {e.status === 'FAILED' ? 'Trích xuất thất bại' : 'Đang xử lý trích xuất'} · đã thử lại {e.retry_count ?? 0} lần
          </Alert>)}
          {[...grouped].map(([id, proposals]) => <Card withBorder key={id}><Stack>
            {proposals.map(p => <ProposalReview key={p.proposal_id} proposal={{ ...p, payload: edits[p.proposal_id] ?? p.payload }}
              disabled={pending} onEdit={payload => setEdits({ ...edits, [p.proposal_id]: payload })}
              onReject={() => perform(() => rejectProposal(p.proposal_id))} />)}
            <Button disabled={pending || !brain.data} onClick={() => perform(async () => {
              await memoryPost(`/ai/proposal-groups/${id}/accept`, { proposal_ids: proposals.map(p => p.proposal_id),
                expected_brain_version: brain.data!.brain_version, reason: 'Author reviewed in editor',
                edited_payloads: Object.fromEntries(proposals.filter(p => edits[p.proposal_id]).map(p => [p.proposal_id, edits[p.proposal_id]])) });
              setEdits({});
            })}>Duyệt nhóm đã kiểm tra</Button>
          </Stack></Card>)}
          {!queue.data?.length && <Text>Không có đề xuất đang chờ.</Text>}
          {job.data?.status === 'failed' && (
            <Alert color="red" title="Trích xuất gián đoạn">
              <Text size="sm">
                Tiến trình trích xuất dừng lại tại chương {job.data.progress?.current ?? '?'}/{job.data.progress?.total ?? '?'}: {job.data.error?.message ?? ''}
              </Text>
              <Button mt="xs" size="xs" color="orange" disabled={pending} onClick={() => perform(async () => { await resumeBootstrapJob(jobId!); await job.refetch(); })}>
                Tiếp tục trích xuất từ chương chưa xong
              </Button>
            </Alert>
          )}
          {job.data?.status === 'waiting_review' && <Button disabled={pending || Boolean(queue.data?.length)} onClick={() => perform(() => activateBaseline(novelId, jobId!))}>Kích hoạt bộ nhớ sau duyệt</Button>}
        </Stack></Tabs.Panel>
        {([['characters', ['character', 'per', 'person']], ['locations', ['location', 'loc', 'place']], ['items', ['item', 'object', 'obj']]] as [string, string[]][]).map(([tab, types]) => <Tabs.Panel value={tab} pt="md" key={tab}><Stack>{category(types).map(e => <Card withBorder key={e.entity_id}><Text fw={600}>{e.name}</Text><Text size="sm">{e.status} · {e.location}</Text></Card>)}{!category(types).length && <Text>Chưa có dữ liệu đã duyệt.</Text>}</Stack></Tabs.Panel>)}
        <Tabs.Panel value="history" pt="md"><Stack>
          <Button disabled={pending || !saved} onClick={() => perform(check)}>Kiểm tra nhất quán chương đang mở</Button>
          {findings !== null && <Alert>{findings.length ? findings.map((f, i) => <Text key={i}>{f.description} — “{f.evidence}”</Text>) : 'Không tìm thấy mâu thuẫn trong lần kiểm tra này.'}</Alert>}
          {memory.data?.events.filter(e => !e.metadata?.is_retired && !memory.data?.events.some(other => other.metadata?.supersedes_id === e.event_id)).map(e => <EventReview key={e.event_id} event={e} disabled={pending} onCorrect={text => perform(() => correction(e, text))} />)}
        </Stack></Tabs.Panel>
        <Tabs.Panel value="setup" pt="md"><Stack>
          <Text size="sm">Lần đầu: chọn chương đã lưu hoặc nhập thiết lập. Sau kích hoạt, các lần lưu chương tự tạo đề xuất.</Text>
          <Button disabled={pending || !saved || brain.data?.status === 'active' && Boolean(brain.data.baseline_revision_id)} onClick={() => perform(bootstrap)}>Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu</Button>
          <Textarea label="Ý tưởng / thiết lập ban đầu" value={setup} onChange={e => setSetup(e.currentTarget.value)} minRows={5} />
          <Button disabled={pending || !setup.trim()} onClick={() => perform(async () => {
            const result = await memoryPost<{ job_id: string }>('/ai/story-brains/bootstrap/from-idea', { novel_id: novelId, idea: setup, mode: 'extract' }); rememberJob(result.job_id);
          })}>Trích xuất nhân vật và địa danh</Button>
          {job.data && <Alert>Trích xuất: {job.data.status} {job.data.error?.message ?? ''}</Alert>}
          {job.data?.status === 'failed' && (
            <Button color="orange" disabled={pending} onClick={() => perform(async () => { await resumeBootstrapJob(jobId!); await job.refetch(); })}>
              Tiếp tục trích xuất từ chương chưa xong
            </Button>
          )}
        </Stack></Tabs.Panel>
        <Tabs.Panel value="plan" pt="md"><Stack>
          <Textarea label="Định hướng mong muốn (tùy chọn)" value={direction} onChange={e => setDirection(e.currentTarget.value)} minRows={4} />
          <Button disabled={pending} onClick={() => perform(async () => { const result = await runAuthorOperation<{ events: FutureEvent[] }>(novelId, { operation: 'suggest_events', instruction: direction }); setEvents(result.events); })}>Gợi ý event tiếp theo</Button>
          <Text size="sm">Đây là kế hoạch tương lai. Chỉnh sửa hoặc bỏ các event trước khi xác nhận; chúng chưa trở thành lịch sử truyện.</Text>
          {events.map((e, i) => <Card withBorder key={i}><Stack>
            <TextInput label="Sự kiện dự kiến" value={e.title} onChange={ev => setEvents(events.map((x, n) => n === i ? { ...x, title: ev.currentTarget.value } : x))} />
            <Textarea label="Diễn biến / tiêu chí đạt" value={e.description} onChange={ev => setEvents(events.map((x, n) => n === i ? { ...x, description: ev.currentTarget.value } : x))} />
            <NumberInput label="Chương" min={1} value={e.target_chapter} onChange={v => setEvents(events.map((x, n) => n === i ? { ...x, target_chapter: Number(v) } : x))} />
            <NumberInput label="Số từ tối thiểu của chương" min={1} value={e.min_words} onChange={v => setEvents(events.map((x, n) => n === i ? { ...x, min_words: Number(v) } : x))} />
            <Checkbox label="Kết thúc truyện" checked={e.ending} onChange={ev => setEvents(events.map((x, n) => n === i ? { ...x, ending: ev.currentTarget.checked } : x))} />
            <Button variant="subtle" onClick={() => setEvents(events.filter((_, n) => n !== i))}>Bỏ gợi ý</Button>
          </Stack></Card>)}
          <Group><Button variant="default" onClick={() => setEvents([...events, { title: '', description: '', target_chapter: 1, min_words: 1000, ending: false }])}>Thêm event</Button>
          <Button disabled={pending || !events.length || auto.data?.status === 'running' || events.some(e => !e.title.trim() || !e.description.trim())} onClick={() => perform(async () => { await saveFuturePlan(novelId, events, direction); setEvents([]); })}>Xác nhận và lưu định hướng</Button></Group>
          {plan.data?.objectives.map((o, i) => <Card key={i} withBorder><Badge>{o.status}</Badge><Text>Chương {o.target_chapter}: {o.title}</Text><Text size="sm">{o.description}</Text></Card>)}
          <Button disabled={!plan.data || pending} variant="default" onClick={() => setEvents(plan.data!.objectives.filter(o => o.status !== 'completed').map(o => ({ ...o,
            min_words: o.metadata?.min_words ?? 1000, ending: o.metadata?.is_terminal === true || ['ending', 'terminal'].includes(o.objective_type) })))}>Điều chỉnh phần định hướng còn lại</Button>
        </Stack></Tabs.Panel>
        <Tabs.Panel value="auto" pt="md"><Stack>
          <Alert>AI được tự duyệt bộ nhớ và viết/lưu chương nháp. Xuất bản vẫn do bạn quyết định. Khuyến cáo chuẩn bị định hướng; nếu chưa có, hệ thống sẽ tự lập kế hoạch.</Alert>
          {auto.data && <Text>{auto.data.status} · lượt {auto.data.current_iteration} · {auto.data.stop_reason}</Text>}
          <Button disabled={pending || !brain.data?.baseline_revision_id || auto.data?.status === 'running'} onClick={() => perform(async () => {
            if (auto.data?.status !== 'running') {
              const run = await memoryPost<AutoRun>('/ai/autonomous/runs', { novel_id: novelId, max_iterations: 100 });
              localStorage.setItem(`ephurin-auto-${novelId}`, run.run_id);
            }
          })}>{auto.data?.status === 'running' ? 'Full auto đang chạy' : 'Bật full auto'}</Button>
          <Button variant="default" disabled={auto.data?.status !== 'running'} onClick={() => { perform(() => memoryPost(`/ai/autonomous/runs/${auto.data!.run_id}/stop`, { reason: 'author_stopped' })); }}>Dừng full auto</Button>
          <Text size="sm">Tiến trình chạy trên máy chủ. Bạn có thể rời trang rồi quay lại theo dõi.</Text>
        </Stack></Tabs.Panel>
      </Tabs>
    </Stack>
  </Drawer>;
}

function ProposalReview({ proposal, disabled, onReject, onEdit }: { proposal: { proposal_type: string; payload: Record<string, unknown>; evidence?: { revision_id?: string; start?: number; end?: number; quote?: string }[] }; disabled: boolean; onReject: () => void; onEdit: (payload: Record<string, unknown>) => void }) {
  const p = proposal.payload;
  if (p.reuse_artifact_id) return <Stack gap="xs"><Badge>Đã có trong canon — giữ nguyên</Badge>
    <Text>{String(p.summary ?? p.fact_key ?? '')}: {typeof p.fact_value === 'string' ? p.fact_value : p.fact_value === undefined ? '' : JSON.stringify(p.fact_value)}</Text>
    <Text size="xs">Bản ghi {String(p.reuse_artifact_id)} · {String(p.reconciliation_reason ?? '')}</Text>
    <Text size="xs">Duyệt sẽ giữ bản ghi hiện có và lưu quyết định, không tạo canon trùng.</Text>
    <Button variant="subtle" color="red" disabled={disabled} onClick={onReject}>Loại đề xuất</Button></Stack>;
  const editable = ['canonical_name', 'summary', 'fact_value'].find(k => typeof p[k] === 'string');
  return <Stack gap="xs"><Badge>{proposal.proposal_type}</Badge>
    {p.supersedes_id ? <Alert>{p.is_retired ? 'Đề xuất gỡ khỏi canon hiện hành; vẫn giữ lịch sử.' : 'Đề xuất thay thế phiên bản cũ; vẫn giữ lịch sử.'} Nguồn cũ: {String(p.supersedes_id)}</Alert> : null}
    {proposal.proposal_type === 'fact' && <Text size="sm">{String(p.subject_name ?? p.subject_entity_name ?? 'Dữ kiện chung')} · {String(p.fact_key)} · {String(p.certainty ?? 'tác giả xác nhận')}</Text>}
    {typeof p.subject_entity_name === 'string' && <TextInput label="Thực thể của dữ kiện (tên chính xác)" value={p.subject_entity_name} disabled={disabled}
      onChange={e => onEdit({ ...p, subject_entity_name: e.currentTarget.value })} />}
    {proposal.proposal_type === 'state_transition' && typeof p.new_value === 'string' && <TextInput label="Giá trị trạng thái" value={p.new_value} disabled={disabled}
      onChange={e => onEdit({ ...p, new_value: e.currentTarget.value })} />}
    {proposal.proposal_type === 'state_transition' && typeof p.new_value === 'number' && <NumberInput label="Giá trị trạng thái" value={p.new_value} disabled={disabled}
      onChange={value => { if (typeof value === 'number') onEdit({ ...p, new_value: value }); }} />}
    {editable ? <Textarea label={editable === 'canonical_name' ? 'Tên được trích xuất' : 'Nội dung được trích xuất'}
      value={String(p[editable])} disabled={disabled} onChange={e => onEdit({ ...p, [editable]: e.currentTarget.value,
        ...(editable === 'canonical_name' ? { normalized_name: e.currentTarget.value.trim().toLocaleLowerCase() } : {}) })} />
      : <Text style={{ whiteSpace: 'pre-wrap' }}>{String(p.attribute_key ?? p.fact_key ?? 'Cập nhật trạng thái')}: {JSON.stringify(p.new_value ?? p.fact_value ?? '', null, 2)}</Text>}
    {proposal.proposal_type === 'entity' && <TextInput label="Trạng thái ban đầu (Alive / Dead / Unknown)" value={String(p.initial_status ?? 'Unknown')} disabled={disabled}
      onChange={e => onEdit({ ...p, initial_status: e.currentTarget.value })} />}
    {Array.isArray(p.participants) && <TextInput label="Nhân vật tham gia (ngăn cách bằng dấu phẩy)" disabled={disabled}
      value={p.participants.join(', ')} onChange={e => onEdit({ ...p, participants: e.currentTarget.value.split(',').map(x => x.trim()).filter(Boolean) })} />}
    {Array.isArray(p.locations) && <TextInput label="Địa điểm xảy ra (ngăn cách bằng dấu phẩy)" disabled={disabled}
      value={p.locations.join(', ')} onChange={e => onEdit({ ...p, locations: e.currentTarget.value.split(',').map(x => x.trim()).filter(Boolean) })} />}
    {p.new_value !== null && typeof p.new_value === 'object' && !Array.isArray(p.new_value) && Object.entries(p.new_value as Record<string, unknown>).map(([key, value]) =>
      <TextInput key={key} label={`Quan hệ / thuộc tính: ${key}`} value={String(value)} disabled={disabled}
        onChange={e => onEdit({ ...p, new_value: { ...(p.new_value as Record<string, unknown>), [key]: e.currentTarget.value } })} />)}
    {proposal.evidence?.map((ev, i) => <Text key={i} size="xs" c="dimmed">Nguồn: bản lưu {ev.revision_id?.slice(0, 8)} · vị trí {ev.start ?? '—'}–{ev.end ?? '—'}{ev.quote ? ` · “${ev.quote}”` : ' · Đề xuất cũ: xem bản lưu nguồn để kiểm tra vị trí'}</Text>)}
    <Button variant="subtle" color="red" disabled={disabled} onClick={onReject}>Loại đề xuất</Button></Stack>;
}

function EventReview({ event, disabled, onCorrect }: { event: MemoryEvent; disabled: boolean; onCorrect: (text: string) => void }) {
  const [text, setText] = useState(event.summary);
  return <Card withBorder><Stack><Text size="sm">Chương {event.chapter} · đã xảy ra</Text>
    <Textarea label="Diễn biến đã ghi nhận" value={text} onChange={e => setText(e.currentTarget.value)} />
    <Button disabled={disabled || !text.trim() || text === event.summary} onClick={() => onCorrect(text)}>Đề xuất cập nhật thế giới</Button></Stack></Card>;
}
