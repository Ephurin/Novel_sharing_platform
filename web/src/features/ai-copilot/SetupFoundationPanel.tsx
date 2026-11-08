import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useAuthStore } from '../auth/useAuthStore';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { getSetup, submitSetup, reviewSetup, getSetupM0Readiness, activateSetupM0, type SetupM0Readiness, type SetupReviewDecision, type SetupDeclaration, type SetupSnapshot } from './setup-api';

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
    <Alert color="blue">Bản thiết lập được lưu riêng với dàn ý tương lai. Duyệt trọn nhóm để ghi nhân vật, địa danh và quy tắc vào thiết lập thế giới. Điều kiện ban đầu chưa hỗ trợ vẫn chờ xử lý. Duyệt không kích hoạt Story Brain và không tạo lịch sử chương.</Alert>
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
    {snapshot && <><Text size="sm">Bản {snapshot.setup_version} · {snapshot.review?'Đã lưu quyết định':snapshot.job_status==='waiting_review'?'Chờ duyệt':snapshot.job_status==='failed'?'Thất bại':'Đang xử lý'} · {snapshot.proposals.length} đề xuất</Text>
      <SetupReviewGroup key={`${snapshot.snapshot_id}:${snapshot.review_version}`} snapshot={snapshot} onReload={reload}/>
      {snapshot.review && <SetupM0Activation key={`${snapshot.snapshot_id}:${snapshot.brain_version}`} snapshot={snapshot} onReload={reload}/>}
      {snapshot.proposals.map(card=><Card withBorder key={card.proposal_id}>
        <Group><Badge>{card.origin==='author_declared'?'Tác giả khai báo':card.origin==='extracted_explicit'?'Từ nguồn rõ ràng':'Provider gợi ý'}</Badge><Badge color={card.status==='accepted'?'green':card.status==='rejected'?'red':'yellow'}>{card.unresolved?'Chưa hỗ trợ · Chờ xử lý':card.status==='accepted'?'Đã duyệt':card.status==='rejected'?'Đã loại':'Chờ duyệt'}</Badge></Group>
        <Text>{String(card.reviewed_payload?.canonical_name ?? card.reviewed_payload?.fact_value ?? card.payload.canonical_name ?? card.payload.fact_value ?? card.payload.attribute_key ?? '')}</Text>
        <Text size="xs" c="dimmed">{card.source_refs.map(ref=>String(ref.field_path ?? 'Gợi ý sáng tạo')).join(', ')}</Text>
      </Card>)}</>}
  </Stack>;
}

function SetupM0Activation({snapshot,onReload}:{snapshot:SetupSnapshot;onReload:()=>Promise<void>}){
  const [readiness,setReadiness]=useState<SetupM0Readiness|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const active=useRef(true),key=useRef(crypto.randomUUID());
  useEffect(()=>{active.current=true;getSetupM0Readiness(snapshot.novel_id,snapshot.snapshot_id)
    .then(value=>{if(active.current)setReadiness(value);}).catch(e=>{if(active.current)setError(getApiErrorMessage(e));});
    return()=>{active.current=false;};},[snapshot.novel_id,snapshot.snapshot_id]);
  async function activate(){
    if(!readiness?.eligible)return;
    setPending(true);setError('');
    try{
      await activateSetupM0(snapshot.novel_id,snapshot.snapshot_id,{contract_version:'setup-m0-v1',idempotency_key:key.current,
        setup_hash:readiness.setup_hash!,expected_setup_version:readiness.expected_setup_version!,expected_review_version:readiness.expected_review_version!,expected_brain_version:readiness.expected_brain_version!});
      if(active.current)await onReload();
    }catch(e){if(active.current)setError(e instanceof ApiClientError&&e.status===409?'Thiết lập đã thay đổi. Tải bản đã lưu rồi kiểm tra lại trước khi kích hoạt.':getApiErrorMessage(e));}
    finally{if(active.current)setPending(false);}
  }
  return <Stack gap="xs">
    {readiness?.activation?<Alert color="green">Thiết lập đã được kích hoạt. Bạn có thể viết và lưu chương đầu tiên; không cần có dàn ý. Diễn biến mới vẫn cần tác giả duyệt.</Alert>:
      <><Text size="sm">Kích hoạt riêng thiết lập đã duyệt trước khi viết. Thao tác này không tạo chương hay lịch sử truyện.</Text>
      <Button onClick={activate} disabled={!readiness?.eligible} loading={pending}>Kích hoạt thiết lập để bắt đầu viết</Button>
      {readiness&&!readiness.eligible&&<Text size="sm">Chưa thể kích hoạt: hãy hoàn tất duyệt bản thiết lập mới nhất với ít nhất một nhân vật hoặc quy tắc được chấp nhận.</Text>}</>}
    {error&&<Alert role="alert">{error}</Alert>}
  </Stack>;
}


function SetupReviewGroup({snapshot, onReload}:{snapshot:SetupSnapshot; onReload:()=>Promise<void>}) {
  const cards=snapshot.proposals.filter(c=>c.card_type!=='initial_condition');
  const [choices,setChoices]=useState<Record<string,{decision:string; identity:string; value:string}>>({});
  const [pending,setPending]=useState(false), [error,setError]=useState('');
  const operation=useRef<{fingerprint:string; key:string}|null>(null);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  function choice(id:string, field:string, value:string) {
    setChoices(all=>({...all,[id]:{...(all[id]??{decision:'',identity:'',value:''}),[field]:value}}));
  }
  if(snapshot.review) return <Alert color="green">Đã lưu quyết định duyệt. Thiết lập vẫn chưa được kích hoạt. {snapshot.review.status==='reviewed_with_unresolved'?'Còn điều kiện chưa hỗ trợ.':''}</Alert>;
  if(!cards.length || snapshot.job_status!=='waiting_review') return null;
  const ready=cards.every(c=>choices[c.proposal_id]?.decision && (choices[c.proposal_id].decision==='reject' ||
    (choices[c.proposal_id].value.trim() && (c.card_type!=='entity'||choices[c.proposal_id].identity))));
  async function decide() {
    setPending(true);setError('');
    const decisions:SetupReviewDecision[]=cards.map(c=>{
      const v=choices[c.proposal_id];
      if(v.decision==='reject') return {proposal_id:c.proposal_id,decision:'reject'};
      if(c.card_type==='entity') return {proposal_id:c.proposal_id,decision:'accept',
        identity:v.identity==='new'?{kind:'new'}:{kind:'existing',approved_entity_id:v.identity},
        ...(v.identity==='new'?{edited_entity:{canonical_name:v.value,aliases:(c.payload.aliases as string[]|undefined)??[]}}:{})};
      return {proposal_id:c.proposal_id,decision:'accept',edited_rule:{fact_key:String(c.payload.fact_key),fact_value:v.value}};
    });
    const body={dependency_group_id:cards[0].dependency_group_id,setup_hash:snapshot.setup_hash,
      expected_setup_version:snapshot.setup_version,expected_review_version:snapshot.review_version,
      expected_brain_version:snapshot.brain_version,decisions};
    const fingerprint=JSON.stringify(body);
    if(operation.current?.fingerprint!==fingerprint) operation.current={fingerprint,key:crypto.randomUUID()};
    try {
      await reviewSetup(snapshot.novel_id,snapshot.snapshot_id,{...body,idempotency_key:operation.current!.key});
      if(active.current) await onReload();
    } catch(e) {if(active.current) setError(e instanceof ApiClientError && e.status===409
      ? `${getApiErrorMessage(e)}. Hãy tải bản đã lưu và đối chiếu; không tự gửi lại bản cũ.`:getApiErrorMessage(e));}
    finally {if(active.current)setPending(false);}
  }
  return <Card withBorder><Stack>
    <Text fw={600}>Duyệt toàn bộ nhóm thiết lập</Text>
    <Text size="sm">Chọn duyệt hoặc loại cho từng thẻ. Toàn bộ nhóm được lưu cùng lúc. Tên giống nhau không có nghĩa là cùng nhân vật.</Text>
    {cards.map((c,i)=>{
      const id=c.proposal_id,v=choices[id];
      const value=String(c.payload.canonical_name??c.payload.fact_value??'');
      return <Stack gap="xs" key={id}>
        <Text>{i+1}. {value}</Text>
        <Select label={`Quyết định thẻ ${i+1}`} value={v?.decision||null} allowDeselect={false}
          data={[{value:'accept',label:'Duyệt'},{value:'reject',label:'Loại'}]}
          onChange={d=>{choice(id,'decision',d??'');if(!v?.value)choice(id,'value',value);}}/>
        {v?.decision==='accept' && <>
          <TextInput label={`Nội dung thẻ ${i+1}`} value={v.value} disabled={c.card_type==='entity'&&!!v.identity&&v.identity!=='new'} onChange={e=>choice(id,'value',e.currentTarget.value)}/>
          {c.card_type==='entity' && <Select label={`Danh tính thẻ ${i+1}`} value={v.identity||null} allowDeselect={false}
            data={[{value:'new',label:'Tạo danh tính mới (ID server)'},...(snapshot.approved_identities??[]).filter(e=>e.entity_type===c.payload.entity_type).map(e=>({value:e.entity_id,label:`${e.canonical_name} · ${e.entity_id}`}))]}
            onChange={identity=>choice(id,'identity',identity??'')}/>}
        </>}
      </Stack>;
    })}
    <Button onClick={decide} disabled={!ready} loading={pending}>Lưu quyết định toàn nhóm</Button>
    {error&&<Alert color="red" role="alert">{error}</Alert>}
  </Stack></Card>;
}
