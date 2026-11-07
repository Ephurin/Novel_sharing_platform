import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useAuthStore } from '../auth/useAuthStore';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { getSetup, submitSetup, type SetupDeclaration, type SetupSnapshot } from './setup-api';

export function SetupFoundationPanel({novelId}: {novelId: string}) {
  const account = useAuthStore(state => state.user?.userId ?? 'guest');
  return <ScopedSetupPanel key={JSON.stringify([account, novelId])} novelId={novelId}/>;
}

function ScopedSetupPanel({novelId}: {novelId: string}) {
  const [text, setText] = useState('');
  const [outline, setOutline] = useState('');
  const [rules, setRules] = useState('');
  const [declarations, setDeclarations] = useState<SetupDeclaration[]>([]);
  const [mode, setMode] = useState<'extract' | 'blueprint'>('extract');
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  useEffect(() => {active.current=true;return () => {active.current=false;};}, []);
  const operation = useRef<{fingerprint: string; key: string} | null>(null);
  function hydrate(value: SetupSnapshot) {
    setText(value.snapshot.text); setOutline(value.outline ?? ''); setMode(value.mode);
    setDeclarations(value.snapshot.declarations);
    setRules(value.snapshot.world_rules.map(r => r.text).join('\n'));
  }
  useEffect(() => {
    let cancelled = false;
    setPending(true);
    getSetup(novelId).then(value => {if (!cancelled) {setSnapshot(value); hydrate(value);}})
      .catch(e => {if (!cancelled && !(e instanceof ApiClientError && e.status===404)) setMessage(getApiErrorMessage(e));})
      .finally(() => {if (!cancelled) setPending(false);});
    return () => {cancelled=true;};
  }, [novelId]);
  async function reload() {
    setPending(true); setMessage('');
    try {const value = await getSetup(novelId); if (active.current) {setSnapshot(value); hydrate(value);}}
    catch(e) {if (active.current) setMessage(getApiErrorMessage(e));} finally {if (active.current) setPending(false);}
  }
  async function submit() {
    setPending(true); setMessage('');
    const body = {contract_version:'setup-v1' as const, novel_id:novelId, mode,
      expected_setup_version:snapshot?.setup_version ?? 0,
      setup:{text, declarations, world_rules:rules.split('\n').filter(r=>r.trim()).map((rule,i)=>({declaration_id:`rule_${i}`,text:rule})),
        initial_conditions:snapshot?.snapshot.initial_conditions ?? []}, outline, hints:snapshot?.hints ?? [], preferences:snapshot?.preferences ?? {}, locale:'vi-VN'};
    const fingerprint = JSON.stringify(body);
    if (operation.current?.fingerprint !== fingerprint) operation.current={fingerprint,key:crypto.randomUUID()};
    try {
      await submitSetup({...body,idempotency_key:operation.current!.key});
      if (!active.current) return;
      const value = await getSetup(novelId);
      if (!active.current) return;
      setSnapshot(value);
      setMessage(value.job_status==='failed' ? 'Tác vụ đã thất bại. Bản nguồn vẫn được lưu; không có dữ liệu nào được duyệt.' : 'Đã lưu bản thiết lập chờ duyệt.');
    } catch(e) {
      if (!active.current) return;
      setMessage(e instanceof ApiClientError && e.status===409
        ? `${getApiErrorMessage(e)}. Hãy tải bản đã lưu để đối chiếu trước khi gửi lại.` : getApiErrorMessage(e));
    } finally {if (active.current) setPending(false);}
  }
  return <Stack gap="xs">
    <Text fw={600}>Thiết lập thế giới trước khi viết</Text>
    <Alert color="blue">Bản thiết lập được lưu riêng với dàn ý tương lai. Hiện chỉ lưu đề xuất chờ duyệt; chức năng duyệt, sửa và kích hoạt chưa khả dụng. Chưa có dữ liệu nào trở thành Canon.</Alert>
    <Select label="Cách xử lý" value={mode} onChange={v=>setMode(v as typeof mode)} data={[{value:'extract',label:'Chỉ trích xuất điều đã khai báo'},{value:'blueprint',label:'Yêu cầu gợi ý sáng tạo (mẫu thử offline)'}]} allowDeselect={false}/>
    <Textarea label="Thiết lập rõ ràng (tùy chọn)" value={text} onChange={e=>setText(e.currentTarget.value)} minRows={3}
      description="Offline: nhập tên qua các thẻ bên dưới. Bộ trích xuất fake chỉ hiểu [character:Minh], [location:An Thành]; văn xuôi khác báo provider chưa hỗ trợ."/>
    {declarations.map((d,i)=><Group key={d.declaration_id} align="end">
      <TextInput label="Tên" value={d.display_name} onChange={e=>{const name=e.currentTarget.value;setDeclarations(all=>all.map((x,j)=>i===j?{...x,display_name:name}:x));}}/>
      <Select label="Loại" value={d.entity_type} allowDeselect={false} data={[{value:'character',label:'Nhân vật'},{value:'location',label:'Địa danh'}]} onChange={v=>setDeclarations(all=>all.map((x,j)=>i===j?{...x,entity_type:v as SetupDeclaration['entity_type']}:x))}/>
      <Button variant="subtle" onClick={()=>setDeclarations(all=>all.filter((_,j)=>j!==i))}>Bỏ thẻ</Button>
    </Group>)}
    <Button variant="light" onClick={()=>setDeclarations(all=>[...all,{declaration_id:'decl_'+crypto.randomUUID().replaceAll('-',''),display_name:'',entity_type:'character'}])}>Thêm nhân vật hoặc địa danh</Button>
    <Textarea label="Quy tắc thế giới (mỗi dòng một quy tắc)" value={rules} onChange={e=>setRules(e.currentTarget.value)}/>
    <Textarea label="Dàn ý tương lai (có thể bỏ trống)" value={outline} onChange={e=>setOutline(e.currentTarget.value)} description="Tên và sự kiện chỉ nằm ở đây không được trích xuất thành lịch sử."/>
    <Group><Button onClick={submit} loading={pending} disabled={declarations.some(d=>!d.display_name.trim())}>Lưu và xử lý thiết lập</Button>
      <Button variant="default" onClick={reload} disabled={pending}>Tải bản đã lưu</Button></Group>
    {message && <Alert role="alert">{message}</Alert>}
    {snapshot && <><Text size="sm">Bản {snapshot.setup_version} · {snapshot.job_status==='waiting_review'?'Chờ duyệt':snapshot.job_status==='failed'?'Thất bại':'Đang xử lý'} · {snapshot.proposals.length} đề xuất</Text>
      {snapshot.proposals.map(card=><Card withBorder key={card.proposal_id}>
        <Group><Badge>{card.origin==='author_declared'?'Tác giả khai báo':card.origin==='extracted_explicit'?'Từ nguồn rõ ràng':'Provider gợi ý'}</Badge><Badge color="yellow">Chờ duyệt</Badge></Group>
        <Text>{String(card.payload.canonical_name ?? card.payload.fact_value ?? card.payload.attribute_key ?? '')}</Text>
        <Text size="xs" c="dimmed">{card.source_refs.map(ref=>String(ref.field_path ?? 'Gợi ý sáng tạo')).join(', ')}</Text>
      </Card>)}</>}
  </Stack>;
}
