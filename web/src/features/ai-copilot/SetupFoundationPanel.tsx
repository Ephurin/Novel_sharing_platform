import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Divider, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useAuthStore } from '../auth/useAuthStore';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { usePlanningDraft, usePlanningScope } from './planning-draft';
import { getSetup, submitSetup, reviewSetup, getSetupM0Readiness, activateSetupM0, type SetupM0Readiness, type SetupReviewDecision, type SetupDeclaration, type SetupSnapshot, type SetupSource } from './setup-api';
import { WorldRuleAmendmentManager } from './WorldRuleAmendmentManager';
import { BrainstormingModal } from './BrainstormingModal';
import type { BrainstormTarget } from './brainstorm-api';
type Props={novelId:string;planningStep?:'idea'|'rules'|'characters';onServerChange?:()=>void;allowOfflineBlueprint?:boolean};
type Draft={base:number;text:string;outline:string;rules:SetupSource['world_rules'];declarations:SetupDeclaration[];mode:'extract'|'blueprint'};
function valid(v:unknown):v is Draft{const d=v as Draft;return !!d&&Number.isInteger(d.base)&&typeof d.text==='string'&&typeof d.outline==='string'&&Array.isArray(d.rules)&&d.rules.every(r=>typeof r.declaration_id==='string'&&typeof r.text==='string')&&Array.isArray(d.declarations)&&d.declarations.every(e=>typeof e.declaration_id==='string'&&typeof e.display_name==='string');}
export function SetupFoundationPanel(props:Props){const actor=useAuthStore(s=>s.user?.userId??'guest');return <ScopedSetupPanel key={JSON.stringify([actor,props.novelId])} {...props}/>;}
function ScopedSetupPanel({novelId,planningStep,onServerChange,allowOfflineBlueprint=false}:Props){
 const scope=usePlanningScope();
 const local=usePlanningDraft<Draft>(`ephurin-planning:${scope.actor}:${novelId}:setup`,{base:0,text:'',outline:'',rules:[],declarations:[],mode:'extract'},valid);
 const {text,outline,rules,declarations,mode}=local.value;
 const [snapshot,setSnapshot]=useState<SetupSnapshot|null>(null),[message,setMessage]=useState(''),[pending,setPending]=useState(false),[loaded,setLoaded]=useState(false);
 const [brainstormTarget,setBrainstormTarget]=useState<BrainstormTarget|null>(null);
 function fromServer(v:SetupSnapshot|null):Draft{return{base:v?.setup_version??0,text:v?.snapshot.text??'',outline:v?.outline??'',rules:v?.snapshot.world_rules??[],declarations:v?.snapshot.declarations??[],mode:v?.mode??'extract'};}
 async function reload(replace=false){
  const signal=scope.signal;scope.assertCurrent();setPending(true);setMessage('');
  try{let value:SetupSnapshot|null=null;try{value=await getSetup(novelId,undefined,signal);}catch(e){if(!(e instanceof ApiClientError&&e.status===404))throw e;}
   if(signal.aborted)return;setSnapshot(value);setLoaded(true);
   if(replace)local.accept(fromServer(value));else if(!local.dirtyRef.current)local.hydrate(fromServer(value));else setMessage('Đã đọc bản máy chủ. Bản sửa của bạn vẫn được giữ; chọn bỏ bản sửa nếu muốn dùng bản máy chủ.');
   onServerChange?.();
  }catch(e){if(!signal.aborted)setMessage(getApiErrorMessage(e));}finally{if(!signal.aborted)setPending(false);}
 }
 useEffect(()=>{void reload();},[novelId]);
 async function submit(){
  scope.assertCurrent();const signal=scope.signal;setPending(true);setMessage('');
  const body={contract_version:'setup-v1' as const,novel_id:novelId,mode:allowOfflineBlueprint?mode:'extract' as const,expected_setup_version:local.value.base,
   setup:{text:allowOfflineBlueprint?text:'',declarations,world_rules:rules,initial_conditions:snapshot?.snapshot.initial_conditions??[]},outline,
   hints:snapshot?.hints??[],preferences:snapshot?.preferences??{},locale:'vi-VN'};
  try{await submitSetup({...body,idempotency_key:local.operationKey(body)},signal);if(signal.aborted)return;
   const value=await getSetup(novelId,undefined,signal);if(signal.aborted)return;setSnapshot(value);local.accept(fromServer(value));onServerChange?.();
   setMessage(value.job_status==='failed'?'Tác vụ thất bại. Nguồn đã lưu, chưa được duyệt.':value.proposals.length?'Đã lưu bản thiết lập chờ duyệt.':'Đã đọc lại ý tưởng. Chưa có thẻ thế giới để duyệt.');
  }catch(e){if(!signal.aborted)setMessage(getApiErrorMessage(e)+(e instanceof ApiClientError&&e.status===409?'. Giữ bản sửa để đối chiếu; không tự gửi lại.':''));}finally{if(!signal.aborted)setPending(false);}
 }
 const sourceLocked=!allowOfflineBlueprint&&!!snapshot?.proposals.length;
 const locked=pending||sourceLocked||!!local.backup;
 const idea=!planningStep||planningStep==='idea',world=!planningStep||planningStep==='rules',people=!planningStep||planningStep==='characters';
 return <Stack gap="sm">
  <Text fw={600}>Thiết lập thế giới trước khi viết</Text>
  <Alert color="blue">Ý tưởng và dàn ý là dự định tương lai. Nhân vật và quy tắc chỉ trở thành thiết lập sau khi bạn duyệt. Diễn biến chương vẫn qua quy trình duyệt riêng.</Alert>
  {!loaded&&<Text>Đang đọc thiết lập được cấp quyền…</Text>}
  {loaded&&local.backup&&<Alert color="orange" title="Có bản sửa thiết lập trên thiết bị"><Group><Button onClick={local.recover}>Khôi phục thiết lập</Button><Button variant="default" onClick={local.clear}>Bỏ bản dự phòng thiết lập</Button></Group></Alert>}
  {local.error&&<Alert color="red">{local.error}</Alert>}
  <div hidden={!idea}><Stack>
   <Textarea label={allowOfflineBlueprint?"Dàn ý tương lai (có thể bỏ trống)":"Ý tưởng & hướng đi (tương lai)"} value={outline} disabled={!loaded||locked} onChange={e=>local.edit({outline:e.currentTarget.value})} minRows={5} description="Có thể bắt đầu bằng vài câu. Không tự trích xuất thành lịch sử. Lưu ý tưởng hoặc chuyển sang viết bất cứ lúc nào."/>
   <Button disabled={!loaded||locked} variant="light" onClick={()=>setBrainstormTarget('all')} data-testid="brainstorm-open-idea-btn">AI gợi ý ý tưởng & thiết lập</Button>
   <Text size="sm">Bạn có thể tự nhập và tổ chức các thẻ ở bước Thế giới và Nhân vật.</Text>
   {allowOfflineBlueprint&&<><Select label="Cách xử lý" value={mode} onChange={v=>local.edit({mode:v as Draft['mode']})} data={['extract','blueprint']} allowDeselect={false}/><Textarea label="Thiết lập rõ ràng (tùy chọn)" value={text} onChange={e=>local.edit({text:e.currentTarget.value})} description="Chỉ môi trường thử nghiệm offline; không bật trong IDE."/></>}
   {!allowOfflineBlueprint&&text&&<Card withBorder><Text size="sm">Nguồn đã nhập (chỉ đọc)</Text><Text style={{whiteSpace:'pre-wrap'}}>{text}</Text></Card>}
  </Stack></div>
  <div hidden={!world}><Stack>
   <Text fw={600}>Quy tắc thế giới</Text>
   {rules.map((r,i)=><Card withBorder key={r.declaration_id}><Textarea label={`Quy tắc ${i+1}`} value={r.text} disabled={!loaded||locked} onChange={e=>{const text=e.currentTarget.value;local.edit(d=>({...d,rules:d.rules.map(x=>x.declaration_id===r.declaration_id?{...x,text}:x)}));}}/><Button disabled={locked} variant="subtle" onClick={()=>local.edit(d=>({...d,rules:d.rules.filter(x=>x.declaration_id!==r.declaration_id)}))}>Bỏ quy tắc {i+1}</Button></Card>)}
   <Group><Button disabled={!loaded||locked} variant="light" onClick={()=>local.edit(d=>({...d,rules:[...d.rules,{declaration_id:'rule_'+crypto.randomUUID().replaceAll('-',''),text:''}]}))}>Thêm quy tắc</Button><Button disabled={!loaded||locked} variant="default" onClick={()=>setBrainstormTarget('world_rules')} data-testid="brainstorm-open-rules-btn">AI gợi ý quy tắc</Button></Group>
   <Text size="sm">Bạn có thể để trống. Sau khi lưu và xử lý, bạn có thể duyệt quy tắc trực tiếp tại đây hoặc ở bước Nhân vật.</Text>
  </Stack></div>
  <div hidden={!people}><Stack>
   <Text fw={600}>Nhân vật & địa danh</Text>
   {declarations.map((d,i)=><Card withBorder key={d.declaration_id}><Stack><TextInput label={allowOfflineBlueprint?"Tên":`Tên ${i+1}`} value={d.display_name} disabled={!loaded||locked} onChange={e=>{const name=e.currentTarget.value;local.edit(old=>({...old,declarations:old.declarations.map(x=>x.declaration_id===d.declaration_id?{...x,display_name:name}:x)}));}}/>
    <Select label={`Loại ${i+1}`} value={d.entity_type} disabled={locked} allowDeselect={false} data={[{value:'character',label:'Nhân vật'},{value:'location',label:'Địa danh'}]} onChange={v=>local.edit(old=>({...old,declarations:old.declarations.map(x=>x.declaration_id===d.declaration_id?{...x,entity_type:v as SetupDeclaration['entity_type']}:x)}))}/>
    <Button disabled={locked} variant="subtle" onClick={()=>local.edit(old=>({...old,declarations:old.declarations.filter(x=>x.declaration_id!==d.declaration_id)}))}>Bỏ thẻ {i+1}</Button></Stack></Card>)}
   <Group><Button variant="light" disabled={!loaded||locked} onClick={()=>local.edit(old=>({...old,declarations:[...old.declarations,{declaration_id:'decl_'+crypto.randomUUID().replaceAll('-',''),display_name:'',entity_type:'character'}]}))}>Thêm nhân vật hoặc địa danh</Button><Button variant="default" disabled={!loaded||locked} onClick={()=>setBrainstormTarget('characters')} data-testid="brainstorm-open-characters-btn">AI gợi ý nhân vật</Button></Group>
  </Stack></div>
  {sourceLocked&&<Alert color="blue">Đã gửi nguồn để duyệt. Sửa nội dung trong nhóm duyệt bên dưới; dữ liệu đã chấp nhận chỉ đọc tại đây. Nhân vật đã duyệt có thể hiệu chỉnh qua Hồ sơ trong Bộ nhớ truyện. Để hiệu chỉnh quy tắc thế giới sau khi đã duyệt, sử dụng bảng Quản lý Quy tắc Thế giới bên dưới. Không gửi lại nguồn để ghi đè.</Alert>}
  <Group><Button onClick={submit} loading={pending} disabled={!loaded||locked||!!local.backup||declarations.some(d=>!d.display_name.trim())||rules.some(r=>!r.text.trim())||(!outline.trim()&&!declarations.length&&!rules.length&&!(allowOfflineBlueprint&&text.trim()))}>Lưu và xử lý thiết lập</Button>
   <Button variant="default" disabled={pending} onClick={()=>void reload()}>Tải bản đã lưu</Button>
   {local.dirty&&<><Button variant="subtle" onClick={()=>void reload(true)}>Bỏ bản sửa, dùng thiết lập máy chủ</Button><Button variant="subtle" onClick={local.exportDraft}>Xuất bản sửa thiết lập</Button></>}</Group>
  <Text size="sm" c="dimmed">{local.dirty?'Bản sửa trên thiết bị — chưa lưu máy chủ.':loaded?'Đã đọc trạng thái máy chủ.':''}</Text>
  {message&&<Alert role="alert">{message}</Alert>}
  {snapshot&&<><Text size="sm">Bản {snapshot.setup_version} · {snapshot.review?'Đã lưu quyết định':snapshot.job_status==='waiting_review'?'Chờ duyệt':snapshot.job_status} · {snapshot.proposals.length} đề xuất</Text>
   <div hidden={!(world || people)}><SetupReviewGroup key={`${snapshot.snapshot_id}:${snapshot.review_version}`} snapshot={snapshot} onReload={()=>reload()}/></div>
   {snapshot.review&&<SetupM0Activation key={`${snapshot.snapshot_id}:${snapshot.brain_version}`} snapshot={snapshot} onReload={()=>reload()}/>}
   {snapshot.proposals.filter(c=>!planningStep||(world?c.card_type==='world_rule':people?c.card_type!=='world_rule':false)).map(c=><Card withBorder key={c.proposal_id}><Group><Badge>{c.origin==='author_declared'?'Tác giả khai báo':c.origin==='extracted_explicit'?'Từ nguồn rõ ràng':'AI đề xuất'}</Badge><Badge>{c.unresolved?'Chưa hỗ trợ':c.status==='accepted'?'Đã duyệt':c.status==='rejected'?'Đã loại':'Chờ duyệt'}</Badge></Group><Text>{String(c.reviewed_payload?.canonical_name??c.reviewed_payload?.fact_value??c.payload.canonical_name??c.payload.fact_value??'')}</Text><Text size="sm" c="dimmed">Ban đầu: {String(c.payload.canonical_name??c.payload.fact_value??c.payload.attribute_key??"")}</Text><Text size="xs">Nguồn: {c.source_refs.map(r=>String(r.field_path??'gợi ý')).join(', ')}</Text></Card>)}</>}
  <div hidden={!world}>
    <Divider my="md" label="Hiệu chỉnh Quy tắc Thế giới sau M0 (UX-05)" labelPosition="center" />
    <WorldRuleAmendmentManager
      novelId={novelId}
      brainVersion={snapshot?.brain_version}
      m0Active={Boolean(
        snapshot?.job_status === 'active' ||
        snapshot?.job_status === 'completed' ||
        snapshot?.job_status === 'succeeded' ||
        (snapshot?.review && ['active', 'completed', 'succeeded'].includes(snapshot?.job_status || ''))
      )}
      onServerChange={onServerChange}
    />
  </div>
  <BrainstormingModal
    opened={brainstormTarget !== null}
    onClose={()=>setBrainstormTarget(null)}
    novelId={novelId}
    defaultTarget={brainstormTarget ?? 'all'}
    expectedBrainVersion={snapshot?.brain_version}
    onAdoptWorldRule={rule=>{
      local.edit(d=>({
        ...d,
        rules:[
          ...d.rules,
          {
            declaration_id: rule.declaration_id || ('rule_' + crypto.randomUUID().replaceAll('-', '')),
            text: rule.text
          }
        ]
      }));
    }}
    onAdoptCharacter={char=>{
      local.edit(old=>({
        ...old,
        declarations:[
          ...old.declarations,
          {
            declaration_id: char.declaration_id || ('decl_' + crypto.randomUUID().replaceAll('-', '')),
            display_name: char.display_name,
            entity_type: 'character'
          }
        ]
      }));
    }}
  />
 </Stack>;
}

function SetupM0Activation({snapshot,onReload}:{snapshot:SetupSnapshot;onReload:()=>Promise<void>}){
  const scope=usePlanningScope();
  const [readiness,setReadiness]=useState<SetupM0Readiness|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const active=useRef(true),key=useRef(crypto.randomUUID());
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{let cancelled=false;setReadiness(null);setError('');getSetupM0Readiness(snapshot.novel_id,snapshot.snapshot_id,scope.signal)
    .then(value=>{if(!cancelled&&active.current)setReadiness(value);}).catch(e=>{if(!cancelled&&active.current)setError(getApiErrorMessage(e));});
    return()=>{cancelled=true;};},[snapshot]);
  async function activate(){
    if(!readiness?.eligible)return;
    scope.assertCurrent();const signal=scope.signal;
    setPending(true);setError('');
    try{
      await activateSetupM0(snapshot.novel_id,snapshot.snapshot_id,{contract_version:'setup-m0-v1',idempotency_key:key.current,
        setup_hash:readiness.setup_hash!,expected_setup_version:readiness.expected_setup_version!,expected_review_version:readiness.expected_review_version!,expected_brain_version:readiness.expected_brain_version!},signal);
      if(active.current&&!signal.aborted)await onReload();
    }catch(e){if(active.current)setError(e instanceof ApiClientError&&e.status===409?'Thiết lập đã thay đổi. Tải bản đã lưu rồi kiểm tra lại trước khi kích hoạt.':getApiErrorMessage(e));}
    finally{if(active.current)setPending(false);}
  }
  return <Stack gap="xs">
    {readiness?.activation?<Alert color="green">{readiness.first_saved_revision?'Đã lưu chương đầu tiên vào bản lưu bất biến.':'Thiết lập đã được kích hoạt. Bạn có thể viết và lưu chương đầu tiên; không cần có dàn ý.'} Diễn biến mới vẫn cần tác giả duyệt.</Alert>:
      <><Text size="sm">Kích hoạt riêng thiết lập đã duyệt trước khi viết. Thao tác này không tạo chương hay lịch sử truyện.</Text>
      <Button onClick={activate} disabled={!readiness?.eligible} loading={pending}>Kích hoạt thiết lập để bắt đầu viết</Button>
      {readiness&&!readiness.eligible&&<Text size="sm">Chưa thể kích hoạt: hãy hoàn tất duyệt bản thiết lập mới nhất với ít nhất một nhân vật hoặc quy tắc được chấp nhận.</Text>}</>}
    {error&&<Alert role="alert">{error}</Alert>}
  </Stack>;
}


function SetupReviewGroup({snapshot, onReload}:{snapshot:SetupSnapshot; onReload:()=>Promise<void>}) {
  const cards=snapshot.proposals.filter(c=>c.card_type!=='initial_condition');
  const scope=usePlanningScope();
  type Choices=Record<string,{decision:string;identity:string;value:string}>;
  const draft=usePlanningDraft<{brain:number;choices:Choices}>(`ephurin-planning:${scope.actor}:${snapshot.novel_id}:review:${snapshot.snapshot_id}`,{brain:snapshot.brain_version,choices:{}},(v):v is {brain:number;choices:Choices}=>!!v&&typeof (v as {brain:number}).brain==='number'&&typeof (v as {choices:Choices}).choices==='object');
  const choices=draft.value.choices;
  const [pending,setPending]=useState(false), [error,setError]=useState('');
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  function choice(id:string, field:string, value:string) {
    draft.edit(old=>({...old,choices:{...old.choices,[id]:{...(old.choices[id]??{decision:'',identity:'',value:''}),[field]:value}}}));
  }
  if(snapshot.review) return <Alert color="green">{(draft.dirty||draft.backup)&&<Group><Text>Máy chủ đã có quyết định. Bản sửa cục bộ không được tự gửi lại.</Text><Button variant="subtle" onClick={()=>{if(draft.backup)draft.recover();else draft.exportDraft();}}>Khôi phục để xuất bản sửa</Button><Button variant="subtle" onClick={draft.exportDraft}>Xuất quyết định trên máy</Button><Button variant="subtle" onClick={()=>draft.accept({brain:snapshot.brain_version,choices:{}})}>Bỏ quyết định cũ trên máy</Button></Group>}Đã lưu quyết định duyệt. Kích hoạt thiết lập là bước riêng bên dưới. {snapshot.review.status==='reviewed_with_unresolved'?'Còn điều kiện chưa hỗ trợ.':''}</Alert>;
  if(!cards.length || snapshot.job_status!=='waiting_review') return null;
  const ready=cards.every(c=>choices[c.proposal_id]?.decision && (choices[c.proposal_id].decision==='reject' ||
    (choices[c.proposal_id].value.trim() && (c.card_type!=='entity'||choices[c.proposal_id].identity))));
  async function decide() {
    scope.assertCurrent();const signal=scope.signal;
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
      expected_brain_version:draft.value.brain,decisions};
    try {
      await reviewSetup(snapshot.novel_id,snapshot.snapshot_id,{...body,idempotency_key:draft.operationKey(body)},signal);
      if(active.current&&!signal.aborted){await onReload();draft.clear();}
    } catch(e) {if(active.current) setError(e instanceof ApiClientError && e.status===409
      ? `${getApiErrorMessage(e)}. Hãy tải bản đã lưu và đối chiếu; không tự gửi lại bản cũ.`:getApiErrorMessage(e));}
    finally {if(active.current)setPending(false);}
  }
  const hasRules = cards.some(c=>c.card_type==='world_rule');
  const hasEntities = cards.some(c=>c.card_type==='entity');
  const isMixed = hasRules && hasEntities;

  return <Card withBorder><Stack>
    <Text fw={600}>Duyệt toàn bộ nhóm thiết lập</Text>{draft.backup&&<Alert title="Có quyết định chưa gửi"><Button onClick={draft.recover}>Khôi phục quyết định</Button><Button variant="subtle" onClick={draft.clear}>Bỏ quyết định trên máy</Button></Alert>}{draft.error&&<Alert color="red">{draft.error}</Alert>}
    {isMixed ? (
      <Alert color="blue" title="Nhóm phụ thuộc hỗn hợp (Quy tắc & Nhân vật)">
        Nhóm thiết lập này bao gồm cả quy tắc thế giới và nhân vật/địa danh. Theo quy chuẩn nguyên khối (atomic dependency group), quyết định duyệt áp dụng đồng thời cho toàn bộ nhóm; bạn cần chọn duyệt hoặc loại cho tất cả các thẻ trước khi lưu.
      </Alert>
    ) : hasRules ? (
      <Text size="sm">Nhóm thiết lập chỉ bao gồm quy tắc thế giới. Chọn duyệt hoặc loại cho từng thẻ; toàn bộ nhóm được lưu cùng lúc.</Text>
    ) : (
      <Text size="sm">Chọn duyệt hoặc loại cho từng thẻ. Toàn bộ nhóm được lưu cùng lúc. Tên giống nhau không có nghĩa là cùng nhân vật.</Text>
    )}
    {cards.map((c,i)=>{
      const id=c.proposal_id,v=choices[id];
      const value=String(c.payload.canonical_name??c.payload.fact_value??'');
      return <Stack gap="xs" key={id}>
        <Group justify="space-between">
          <Text fw={500}>{i+1}. {value}</Text>
          <Badge size="xs" variant="light" color={c.card_type==='world_rule'?'teal':'blue'}>
            {c.card_type==='world_rule'?'Quy tắc thế giới':'Nhân vật / Địa danh'}
          </Badge>
        </Group>
        <Select label={`Quyết định thẻ ${i+1}`} value={v?.decision||null} allowDeselect={false} disabled={pending||!!draft.backup}
          data={[{value:'accept',label:'Duyệt'},{value:'reject',label:'Loại'}]}
          onChange={d=>{choice(id,'decision',d??'');if(!v?.value)choice(id,'value',value);}}/>
        {v?.decision==='accept' && <>
          <TextInput label={`Nội dung thẻ ${i+1}`} value={v.value} disabled={pending||!!draft.backup||(c.card_type==='entity'&&!!v.identity&&v.identity!=='new')} onChange={e=>choice(id,'value',e.currentTarget.value)}/>
          {c.card_type==='entity' && <Select label={`Danh tính thẻ ${i+1}`} value={v.identity||null} allowDeselect={false} disabled={pending||!!draft.backup}
            data={[{value:'new',label:'Tạo danh tính mới (ID server)'},...(snapshot.approved_identities??[]).filter(e=>e.entity_type===c.payload.entity_type).map(e=>({value:e.entity_id,label:`${e.canonical_name} · ${e.entity_id}`}))]}
            onChange={identity=>choice(id,'identity',identity??'')}/>}
        </>}
      </Stack>;
    })}
    <Button variant="subtle" disabled={pending} onClick={()=>draft.accept({brain:snapshot.brain_version,choices:{}})}>Bỏ quyết định trên máy, dùng phiên bản vừa đọc</Button>
    <Button onClick={decide} disabled={!ready||!!draft.backup} loading={pending}>Lưu quyết định toàn nhóm</Button>
    {error&&<Alert color="red" role="alert">{error}</Alert>}
  </Stack></Card>;
}
