import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Divider, Group, Paper, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useAuthStore } from '../auth/useAuthStore';
import { ApiClientError } from '../../shared/api/api-client';
import { getEntityProfile, updateEntityProfile, type EntityProfile, type EntityProfilePatch, type MemoryEntity } from './author-memory-api';
import { PROFILE_FIELDS, buildProfilePatch, canonicalChanged, codePointCount, emptyProfileDraft, profileDraft, type ProfileDraft } from './entity-profile-form';

type Props = { novelId: string; entities: MemoryEntity[]; active: boolean; onSaved: () => Promise<unknown> };
const LABELS = { description: 'Mô tả', appearance: 'Ngoại hình', personality: 'Tính cách', background: 'Bối cảnh xuất thân' };

/** Private view is unmounted on close/account/novel change, never cached globally. */
export function EntityProfileEditor(props: Props) {
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.accessToken);
  const session = useRef({ token, epoch: 0 });
  if (session.current.token !== token) session.current = { token, epoch: session.current.epoch + 1 };
  if (!props.active) return null;
  if (!token || !user || user.status !== 'ACTIVE' || !['AUTHOR', 'ADMIN'].includes(user.role)) {
    return <Alert color="orange">Đăng nhập bằng tài khoản tác giả đang hoạt động để sửa hồ sơ.</Alert>;
  }
  return <ProfileSelection key={JSON.stringify([user.userId, session.current.epoch, props.novelId])} {...props} />;
}

function ProfileSelection({ novelId, entities, onSaved }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const entity = entities.find(e => e.entity_id === selected);
  return <Stack gap="sm">
    <Text fw={600}>Hồ sơ entity đã xác nhận</Text>
    <Text size="xs" c="dimmed">Đổi entity, truyện hoặc phiên tài khoản sẽ xóa bản nhập riêng tư chưa lưu.</Text>
    <Select label="Chọn entity theo UUID" placeholder="Chọn hồ sơ trong Canon" searchable clearable
      data={entities.map(e => ({ value: e.entity_id, label: `${e.name} · ${e.entity_type} · ${e.entity_id}` }))}
      value={entity?.entity_id ?? null} onChange={setSelected} />
    {!entities.length && <Text size="sm" c="dimmed">Chưa có entity đã duyệt để chỉnh hồ sơ.</Text>}
    {entity && <PrivateProfileForm key={entity.entity_id} novelId={novelId} entity={entity} onSaved={onSaved} />}
  </Stack>;
}

function profileError(error: unknown): string {
  const status = error instanceof ApiClientError ? error.status : 0;
  // Never render arbitrary upstream messages/details that may echo private input.
  return ({ 401: 'Phiên đăng nhập hết hiệu lực. Đã xóa nội dung riêng tư.',
    403: 'Bạn không có quyền xem/sửa hồ sơ này. Đã xóa nội dung riêng tư.',
    404: 'Không tìm thấy hồ sơ đã xác nhận trong truyện này.',
    422: 'Dữ liệu hoặc điều kiện phiên bản không hợp lệ. Kiểm tra lại trước khi lưu.',
    503: 'Dịch vụ hồ sơ tạm không khả dụng. Nội dung chưa được xác nhận lưu.' } as Record<number, string>)[status]
    ?? 'Không xác nhận được kết quả kết nối. Có thể thử lại đúng yêu cầu cũ.';
}

type Phase = 'loading' | 'ready' | 'saving' | 'retry' | 'conflict' | 'reconcile' | 'blocked' | 'load-error' | 'readback-error';
function PrivateProfileForm({ novelId, entity, onSaved }: { novelId: string; entity: MemoryEntity; onSaved: Props['onSaved'] }) {
  const [base, setBase] = useState<EntityProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const live = useRef(false);
  const busy = useRef(false);
  const ownerSession = useRef(useAuthStore.getState());
  const isCurrent = () => live.current &&
    useAuthStore.getState().user?.userId === ownerSession.current.user?.userId &&
    useAuthStore.getState().accessToken === ownerSession.current.accessToken;
  const intent = useRef<{ key: string; patch: EntityProfilePatch } | null>(null);

  function failed(error: unknown, reading = false) {
    const status = error instanceof ApiClientError ? error.status : 0;
    setSuccess(false);
    if (status === 401 || status === 403) {
      setBase(null); setDraft(emptyProfileDraft()); intent.current = null; setPhase('blocked');
    } else if (status === 409) {
      intent.current = null; setPhase('conflict');
    } else if (reading) {
      setPhase(base ? 'readback-error' : 'load-error');
    } else if (status === 422 || status === 404) {
      intent.current = null; setPhase('ready');
    } else setPhase('retry');
    setMessage(status === 409 ? 'Xung đột phiên bản (409). Bản nhập của bạn được giữ nguyên; tải phiên bản server để đối chiếu trước khi lưu lại.' : profileError(error));
  }

  async function load(mode: 'replace' | 'reconcile' = 'replace') {
    if (busy.current || !isCurrent()) return;
    busy.current = true; setPhase('loading'); setSuccess(false); setMessage('');
    try {
      const current = await getEntityProfile(novelId, entity.entity_id);
      if (!isCurrent()) return;
      setBase(current); intent.current = null;
      if (mode === 'replace') setDraft(profileDraft(current));
      setPhase(mode === 'reconcile' ? 'reconcile' : 'ready');
      if (mode === 'reconcile') setMessage('Đã tải phiên bản server. Bản nhập vẫn được giữ; đối chiếu trước khi xác nhận lưu.');
      else if (phase === 'readback-error') { setSuccess(true); setMessage('Đã đọc lại hồ sơ hiện tại từ máy chủ sau lưu.'); }
    } catch (error) { if (isCurrent()) {
      const status = error instanceof ApiClientError ? error.status : 0;
      if (mode === 'reconcile' && status !== 401 && status !== 403) {
        setPhase('conflict'); setMessage('Chưa tải được phiên bản đối chiếu. Bản nhập vẫn được giữ. ' + profileError(error));
      } else failed(error, true);
    } }
    finally { busy.current = false; }
  }
  useEffect(() => {
    live.current = true;
    void load();
    return () => { live.current = false; intent.current = null; };
    // A fresh keyed instance owns one account/novel/UUID for its entire lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(key: keyof ProfileDraft, value: string) {
    intent.current = null; setSuccess(false); setMessage('');
    setDraft(old => ({ ...old, [key]: value }));
    if (phase === 'retry') setPhase('ready');
  }
  const result = base ? buildProfilePatch(base, draft) : {};
  const editing = ['ready', 'retry', 'conflict', 'reconcile'].includes(phase);

  async function save(retry = false) {
    if (!isCurrent() || !base || busy.current || !['ready', 'reconcile', 'retry'].includes(phase)) return;
    const request = retry ? intent.current : result.patch ? { key: crypto.randomUUID(), patch: { ...result.patch } } : null;
    if (!request || (!retry && result.error)) return;
    intent.current = request; busy.current = true; setPhase('saving'); setSuccess(false); setMessage('');
    let committed = false;
    try {
      await updateEntityProfile(novelId, entity.entity_id, request.patch, request.key);
      if (!isCurrent()) return;
      committed = true; intent.current = null;
      // Approved memory never receives the private response object.
      void onSaved().catch(() => { /* Existing public queries expose their own reload errors. */ });
      const current = await getEntityProfile(novelId, entity.entity_id);
      if (!isCurrent()) return;
      setBase(current); setDraft(profileDraft(current)); setPhase('ready'); setSuccess(true);
      setMessage('Đã lưu và đọc lại hồ sơ hiện tại từ máy chủ.');
    } catch (error) {
      if (isCurrent()) failed(error, committed);
    } finally { busy.current = false; }
  }

  return <Stack gap="sm" data-testid="entity-profile-editor">
    <Group><Text fw={600}>{entity.name} · {entity.entity_type}</Text>{base && <Badge>Profile v{base.version} · Brain v{base.brain_version}</Badge>}</Group>
    <Text size="xs" ff="monospace">UUID: {entity.entity_id}</Text>
    {message && <Paper withBorder p="sm" role={success ? 'status' : 'alert'} aria-live={success ? 'polite' : 'assertive'}><Text size="sm" c={success ? 'teal' : 'orange'}>{message}</Text></Paper>}
    {phase === 'loading' && <Text role="status">Đang tải hồ sơ riêng tư…</Text>}
    {phase === 'load-error' && <Button variant="light" onClick={() => void load()}>Tải lại hồ sơ</Button>}
    {base && <>
      <Text size="sm" fw={600}>Canon Profile — thông tin nền do tác giả xác nhận</Text>
      <Text size="xs" c="dimmed">Có thể được chọn vào AI context khi phù hợp. Sửa hồ sơ không tạo sự kiện lịch sử.</Text>
      {PROFILE_FIELDS.map(key => <Textarea key={key} label={LABELS[key]} autoComplete="off" autosize minRows={2} maxRows={8}
        value={draft[key]} disabled={!editing} onChange={e => change(key, e.currentTarget.value)}
        description={`${codePointCount(draft[key])}/4.000 ký tự Unicode`} />)}
      <TextInput label="Chương bắt đầu có hiệu lực" type="number" inputMode="numeric" min={1} max={1000000} step={1}
        value={draft.cutoff} disabled={!editing || !canonicalChanged(base, draft)} onChange={e => change('cutoff', e.currentTarget.value)} />
      <Text size="xs" c="dimmed">Chương hiệu lực áp dụng cho toàn bộ snapshot hiện tại, kể cả các trường giữ nguyên. Không tái dựng profile cũ ở các chương trước. Đổi chương cùng một thay đổi Canon.</Text>
      <Divider />
      <Textarea label="Private Author Notes — ghi chú riêng" autoComplete="off" autosize minRows={3} maxRows={10} value={draft.author_notes}
        disabled={!editing} onChange={e => change('author_notes', e.currentTarget.value)}
        description={`${codePointCount(draft.author_notes)}/8.000 ký tự Unicode · Không đưa vào AI context hoặc approved memory.`} />
      <Text size="xs" c="dimmed">Historical Events/State: thay đổi diễn ra trong truyện dùng Event Correction/Canon review hiện có. Future Plans: tiếp tục dùng Story Plan.</Text>
      {phase === 'reconcile' && <Paper withBorder p="sm" data-testid="profile-server-comparison">
        <Text fw={600}>Phiên bản server để đối chiếu</Text>
        {PROFILE_FIELDS.map(key => <Text key={key} size="sm" style={{ whiteSpace: 'pre-wrap' }}>{LABELS[key]}: {base.profile[key] || '(trống)'}</Text>)}
        <Text size="sm">Chương hiệu lực: {base.effective_from_chapter ?? 'chưa đặt'}</Text>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>Ghi chú riêng trên server: {base.author_notes || '(trống)'}</Text>
        <Button size="xs" variant="light" mt="xs" onClick={() => { setDraft(profileDraft(base)); setPhase('ready'); setMessage('Đã chọn phiên bản server; chưa gửi thay đổi mới.'); }}>Dùng phiên bản server</Button>
      </Paper>}
      {result.error && <Text c="red" size="sm" role="alert">{result.error}</Text>}
      <Group>
        <Button disabled={!result.patch || Boolean(result.error) || !['ready', 'reconcile'].includes(phase)} onClick={() => void save()}>
          {phase === 'reconcile' ? 'Lưu bản đã đối chiếu' : 'Lưu thay đổi'}
        </Button>
        {phase === 'retry' && <Button variant="light" onClick={() => void save(true)}>Thử lại đúng yêu cầu cũ</Button>}
        {phase === 'conflict' && <Button variant="light" onClick={() => void load('reconcile')}>Tải phiên bản server để đối chiếu</Button>}
        {phase === 'readback-error' && <Button variant="light" onClick={() => void load()}>Đọc lại sau lưu</Button>}
        {editing && <Button variant="subtle" onClick={() => { setDraft(profileDraft(base)); intent.current = null; setSuccess(false); setMessage('Đã hoàn tác bản nhập.'); if (phase === 'retry') setPhase('ready'); }}>Hoàn tác bản nhập</Button>}
      </Group>
    </>}
  </Stack>;
}
