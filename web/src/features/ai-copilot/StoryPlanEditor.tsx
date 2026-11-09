import {useEffect,useState} from 'react';
import {Alert,Button,Card,Group,MultiSelect,NumberInput,Select,Stack,Text,Textarea,TextInput} from '@mantine/core';
import {useAuthStore} from '../auth/useAuthStore';
import {apiClient,type ApiEnvelope,getApiErrorMessage,ApiClientError} from '../../shared/api/api-client';
import {usePlanningDraft,usePlanningScope} from './planning-draft';
type Participant={name_hint?:string|null;entity_id?:string|null};
type FutureEvent={event_id:string;text:string;participants:Participant[]};
type Objective={objective_id:string;intent_version:number;target_chapter:number;title:string;description:string;events:FutureEvent[];dependencies:string[]};
type Plan={plan_id:string;plan_version:number;status:string;source_outline:string;private_notes?:string;objectives:Objective[];action:string;effective_status?:string;snapshot_status?:string;is_historical?:boolean;can_save?:boolean;can_activate?:boolean;can_fork?:boolean;can_archive?:boolean};
type Plans={head_version:number;active_plan_id:string|null;active_plan_unavailable?:boolean;plans:Plan[]};
type Draft={selected:string|null;head:number;outline:string;notes:string;chapters:Objective[]};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function valid(value:unknown):value is Draft{
 const d=value as Draft;
 return !!d&&typeof d.outline==='string'&&typeof d.notes==='string'&&Number.isInteger(d.head)&&Array.isArray(d.chapters)&&d.chapters.every(o=>typeof o.objective_id==='string'&&typeof o.title==='string'&&typeof o.description==='string'&&Array.isArray(o.dependencies)&&Array.isArray(o.events)&&o.events.every(e=>typeof e.event_id==='string'&&typeof e.text==='string'&&Array.isArray(e.participants)&&e.participants.every(p=>!!p&&(typeof p.entity_id==='string'||typeof p.name_hint==='string'))));
}
export function StoryPlanEditor({novelId,onServerChange}:{novelId:string;onServerChange?:()=>void}){
 const account=useAuthStore(s=>s.user?.userId??'guest');
 return <Editor key={JSON.stringify([account,novelId])} novelId={novelId} onServerChange={onServerChange}/>;
}
function Editor({novelId,onServerChange}:{novelId:string;onServerChange?:()=>void}){
 const scope=usePlanningScope(),key=`ephurin-planning:${scope.actor}:${novelId}:plan`;
 const local=usePlanningDraft<Draft>(key,{selected:null,head:0,outline:'',notes:'',chapters:[]},valid);
 const {selected,outline,notes,chapters,head}=local.value;
 const [list,setList]=useState<Plans>({head_version:0,active_plan_id:null,plans:[]});
 const [message,setMessage]=useState(''),[pending,setPending]=useState(false),[loaded,setLoaded]=useState(false),[size,setSize]=useState('5');
 const path=`/ai/story-plans/edit-v1/${novelId}`;
 function draft(p:Plan|undefined,data=list):Draft{return{selected:p?.plan_id??null,head:data.head_version,outline:p?.source_outline??'',notes:p?.private_notes??'',chapters:p?.objectives??[]};}
 function remember(id:string|null){try{localStorage.setItem(key+':selection',id??'');}catch{}}
 async function reload(id?:string,replace=false){
  scope.assertCurrent();const signal=scope.signal;setPending(true);
  try{
   const data=(await apiClient.get<ApiEnvelope<Plans>>(path,{signal})).data.data;if(signal.aborted)return;
   scope.assertCurrent();setList(data);setLoaded(true);
   let preferred=id;
   if(preferred===undefined)try{preferred=localStorage.getItem(key+':selection')??undefined;}catch{}
   const p=data.plans.find(p=>p.plan_id===preferred)??data.plans.at(-1);
   if(replace){local.accept(draft(p,data));remember(p?.plan_id??null);}
   else if(!local.dirtyRef.current)local.hydrate(draft(p,data));
   else setMessage('Đã đọc phiên bản máy chủ mới. Bản sửa trên máy vẫn được giữ để đối chiếu.');
  }catch(e){if(!signal.aborted)setMessage(getApiErrorMessage(e));}
  finally{if(!signal.aborted)setPending(false);}
 }
 useEffect(()=>{void reload();},[novelId]);
 const stored=list.plans.find(p=>p.plan_id===selected),archived=stored?.effective_status==='archived';
 const canSave=!stored||(stored.can_save??(stored.plan_version===list.head_version&&!['deleted','skipped'].includes(stored.status)));
 const canFork=stored&&(stored.can_fork??!['deleted','skipped'].includes(stored.status));
 const canActivate=stored&&(stored.can_activate??(!archived&&!!stored.objectives.length));
 const canArchive=stored&&(stored.can_archive??(!archived&&!['deleted','skipped'].includes(stored.status)));
 const awaitingRecovery=!!local.backup;
 const serverReadOnly=!!stored&&!canSave&&!local.dirty;
 const readOnly=serverReadOnly||awaitingRecovery;
 const invalid=chapters.some(o=>!o.title.trim()||o.target_chapter<1||o.events.some(e=>e.participants.some(p=>p.entity_id?!uuid.test(p.entity_id):!p.name_hint?.trim())))||new Set(chapters.map(o=>o.target_chapter)).size!==chapters.length;
 async function send(action:'save'|'fork'|'activate'|'skip'|'delete',expected=head){
  scope.assertCurrent();if(local.backup)return;const signal=scope.signal;setPending(true);setMessage('');
  const body={contract_version:'plan-edit-v1',action,expected_plan_version:expected,
   ...(selected?{source_plan_id:selected}:{}),...(action==='save'||action==='fork'?{source_outline:outline,private_notes:notes,
    objectives:chapters.map(o=>({...o,intent_version:undefined,expected_intent_version:o.intent_version}))}:{})};
  try{
   const data=(await apiClient.post<ApiEnvelope<Plan>>(path,{...body,idempotency_key:local.operationKey(body)},{signal})).data.data;
   if(signal.aborted)return;scope.assertCurrent();
   const server=(await apiClient.get<ApiEnvelope<Plans>>(path,{signal})).data.data;if(signal.aborted)return;
   setList(server);local.accept(draft(server.plans.find(p=>p.plan_id===data.plan_id),server));remember(data.plan_id);onServerChange?.();
   setMessage(action==='delete'?'Đã lưu trữ bản đã chọn. Nội dung lịch sử vẫn được giữ.':action==='skip'?'Máy chủ xác nhận không dùng kế hoạch.':'Đã lưu phiên bản dàn ý. Không thay đổi lịch sử truyện.');
  }catch(e){if(!signal.aborted)setMessage(e instanceof ApiClientError&&e.status===409?`${getApiErrorMessage(e)}. Bản sửa được giữ. Đọc máy chủ để đối chiếu; không tự ghi đè.`:getApiErrorMessage(e));}
  finally{if(!signal.aborted)setPending(false);}
 }
 function patch(i:number,value:Partial<Objective>){local.edit(d=>({...d,chapters:d.chapters.map((o,j)=>i===j?{...o,...value}:o)}));}
 function events(id:string,update:(events:FutureEvent[])=>FutureEvent[]){local.edit(d=>({...d,chapters:d.chapters.map(o=>o.objective_id===id?{...o,events:update(o.events)}:o)}));}
 function moveEvent(id:string,event:string,delta:number){events(id,all=>{const next=[...all],i=next.findIndex(e=>e.event_id===event);if(i>=0&&i+delta>=0&&i+delta<next.length)[next[i],next[i+delta]]=[next[i+delta],next[i]];return next;});}
 function add(count:number,titles?:string[]){if(count+chapters.length>500){setMessage("Maximum 500 chương mỗi kế hoạch. Hãy chia thành các giai đoạn.");return;}local.edit(d=>{const start=Math.max(0,...d.chapters.map(o=>o.target_chapter));return{...d,chapters:[...d.chapters,...Array.from({length:count},(_,i)=>({objective_id:crypto.randomUUID(),intent_version:0,target_chapter:start+i+1,title:titles?.[i]?.slice(0,255)||`Chương ${start+i+1}`,description:titles?.[i]??'',events:[],dependencies:[]}))]};});}
 function move(i:number,delta:number){local.edit(d=>{const next=[...d.chapters];[next[i],next[i+delta]]=[next[i+delta],next[i]];return{...d,chapters:next};});}
 return <Stack>
  <Alert>Dàn ý tương lai — chưa phải Canon đã viết. Có thể bỏ qua kế hoạch; thao tác này không kích hoạt Story Brain hoặc tự viết chương.</Alert>
  <Text role="status" aria-live="polite" size="sm">{local.dirty?'Bản sửa trên thiết bị · chưa xác nhận với máy chủ':loaded?'Đang xem bản đã đọc từ máy chủ':'Đang tải dàn ý…'}</Text>
  {local.error&&<Alert color="red">{local.error}</Alert>}
  {loaded&&local.backup&&<Alert color="orange" title="Có bản sửa dàn ý trên thiết bị"><Text>Bản máy chủ vẫn nguyên vẹn. Chỉ khôi phục khi bạn muốn tiếp tục bản sửa này.</Text><Group><Button onClick={local.recover}>Khôi phục bản sửa dàn ý</Button><Button variant="default" onClick={()=>local.clear()}>Bỏ bản sửa dàn ý trên thiết bị</Button></Group></Alert>}
  <Group><Button variant="default" onClick={()=>{if(!local.dirty){local.hydrate(draft(undefined));remember(null);}}} disabled={pending||local.dirty||!loaded||awaitingRecovery}>Dàn ý mới</Button><Button variant="default" onClick={()=>reload()} disabled={pending}>Tải lại dàn ý</Button><Button variant="subtle" onClick={()=>send('skip')} disabled={pending||local.dirty||!loaded||awaitingRecovery}>Không dùng kế hoạch</Button></Group>
  <Text size="sm">{!loaded?'Chưa đọc được kế hoạch máy chủ':list.active_plan_unavailable?'Có kế hoạch legacy ngoài phạm vi hiển thị; không tự nhận quyền với dữ liệu cũ':list.active_plan_id?'Đang dùng một phiên bản kế hoạch tương lai':'Không có kế hoạch đang dùng'} · Version {list.head_version}</Text>
  <Select allowDeselect={false} label="Phiên bản đã lưu" disabled={pending||local.dirty||awaitingRecovery} value={selected} data={list.plans.map(p=>({value:p.plan_id,label:`v${p.plan_version} · ${p.effective_status??p.status}${p.is_historical?' · lịch sử':''}`}))} onChange={id=>{local.hydrate(draft(list.plans.find(p=>p.plan_id===id)));remember(id);}}/>
  {local.dirty&&<Alert color="orange">Bản sửa chưa được xác nhận. Chuyển bước vẫn giữ bản sửa; lưu hoặc xuất trước khi đổi phiên bản.<Group mt="xs"><Button variant="default" onClick={local.exportDraft}>Xuất bản sửa dàn ý</Button><Button variant="default" disabled={pending} onClick={()=>reload(selected??undefined,true)}>Dùng bản máy chủ, bỏ bản sửa</Button>{head!==list.head_version&&canFork&&<Button disabled={pending||invalid} onClick={()=>send('fork',list.head_version)}>Giữ nội dung, tạo phiên bản từ bản nguồn</Button>}</Group></Alert>}
  {serverReadOnly&&<Alert>{archived?'Bản đã lưu trữ · chỉ đọc. Nội dung lịch sử được giữ; chỉ khôi phục bằng một bản nháp mới.':stored?.effective_status==='tombstone'?'Biên nhận lưu trữ · chỉ đọc. Chọn bản gốc trong lịch sử để xem hoặc khôi phục.':'Bản lịch sử hoặc biên nhận · chỉ đọc. Tạo một phiên bản mới để chỉnh sửa.'}</Alert>}
  {stored&&<Text size="xs">Trạng thái khi lưu: {stored.snapshot_status??stored.status} · Hiện tại: {stored.effective_status??stored.status}</Text>}
  <Textarea label="Dán hoặc nhập dàn ý tương lai" disabled={pending||readOnly||!loaded} value={outline} onChange={e=>local.edit({outline:e.currentTarget.value})} minRows={3}/>
  <Group><Select disabled={pending||readOnly||!loaded} allowDeselect={false} label="Số chương khởi đầu" value={size} onChange={n=>setSize(n??'0')} data={['0','5','10','15','20']}/><Button variant="light" disabled={pending||readOnly||!loaded||size==='0'} onClick={()=>add(Number(size))}>Thêm {size} thẻ chương</Button><Button variant="default" disabled={pending||readOnly||!!chapters.length||!outline.trim()} onClick={()=>add(outline.split('\n').filter(s=>s.trim()).length,outline.split('\n').filter(s=>s.trim()))}>Tách dàn ý thành thẻ theo dòng</Button></Group>
  <Text size="xs">Tự nhập, không dùng AI. Mục tiêu và kết quả mong muốn được giữ trong nội dung mục tiêu. Có thể thêm hơn 20 chương; thứ tự thẻ và chương dự kiến là hai lựa chọn riêng.</Text>
  <Textarea label="Ghi chú kế hoạch riêng tư" disabled={pending||readOnly||!loaded} description="Không gửi tới provider hoặc ngữ cảnh viết." value={notes} onChange={e=>local.edit({notes:e.currentTarget.value})}/>
  {chapters.map((o,i)=><Card withBorder key={o.objective_id}><Stack gap="xs">
   <Text fw={600}>Thẻ {i+1} · Dự kiến chương {o.target_chapter}</Text><NumberInput label={`Chương dự kiến thẻ ${i+1}`} min={1} allowDecimal={false} disabled={pending||readOnly} value={o.target_chapter} onChange={n=>patch(i,{target_chapter:Number(n)||1})}/>
   <TextInput label={`Tiêu đề chương ${i+1}`} maxLength={255} disabled={pending||readOnly} value={o.title} onChange={e=>patch(i,{title:e.currentTarget.value})}/>
   <Textarea label={`Mục tiêu chương ${i+1}`} disabled={pending||readOnly} value={o.description} onChange={e=>patch(i,{description:e.currentTarget.value})}/>
   <MultiSelect label={`Phụ thuộc thẻ ${i+1}`} value={o.dependencies} disabled={pending||readOnly} data={chapters.filter(x=>x.objective_id!==o.objective_id).map(x=>({value:x.objective_id,label:`Chương ${x.target_chapter} · ${x.title}`}))} onChange={dependencies=>patch(i,{dependencies})}/>
   {o.events.map((event,j)=><Card withBorder key={event.event_id}>
    <Textarea label={`Sự kiện ${j+1} chương ${i+1}`} disabled={pending||readOnly} value={event.text} onChange={e=>{const text=e.currentTarget.value;events(o.objective_id,all=>all.map(x=>x.event_id===event.event_id?{...x,text}:x));}}/>
    <Text size="xs">{event.participants.map(p=>p.entity_id?`ID: ${p.entity_id}`:`Chưa xác định: ${p.name_hint??''}`).join(', ')}</Text>
    {event.participants.map((p,k)=><Group key={k} align="end"><Select label={`Loại người tham gia ${k+1} sự kiện ${j+1} chương ${i+1}`} disabled={pending||readOnly} value={p.entity_id!==undefined&&p.entity_id!==null?'id':'hint'} data={[{value:'hint',label:'Tên gợi nhớ, chưa xác định'},{value:'id',label:'ID danh tính đã xác nhận'}]} onChange={kind=>events(o.objective_id,all=>all.map(e=>e.event_id===event.event_id?{...e,participants:e.participants.map((x,n)=>n===k?(kind==='id'?{entity_id:''}:{name_hint:''}):x)}:e))}/><TextInput label={`Người tham gia ${k+1} sự kiện ${j+1} chương ${i+1}`} disabled={pending||readOnly} value={p.entity_id??p.name_hint??''} onChange={ev=>{const value=ev.currentTarget.value;events(o.objective_id,all=>all.map(e=>e.event_id===event.event_id?{...e,participants:e.participants.map((x,n)=>n===k?(x.entity_id!==undefined&&x.entity_id!==null?{entity_id:value}:{name_hint:value}):x)}:e));}}/><Button color="red" variant="subtle" disabled={pending||readOnly} onClick={()=>events(o.objective_id,all=>all.map(e=>e.event_id===event.event_id?{...e,participants:e.participants.filter((_,n)=>n!==k)}:e))}>Bỏ người tham gia {k+1} sự kiện {j+1} chương {i+1}</Button></Group>)}
    <Group><Button size="xs" variant="light" disabled={pending||readOnly} onClick={()=>events(o.objective_id,all=>all.map(e=>e.event_id===event.event_id?{...e,participants:[...e.participants,{name_hint:''}]}:e))}>Thêm người tham gia sự kiện {j+1} chương {i+1}</Button><Button size="xs" variant="default" disabled={pending||readOnly||j===0} onClick={()=>moveEvent(o.objective_id,event.event_id,-1)}>Lên sự kiện {j+1} chương {i+1}</Button><Button size="xs" variant="default" disabled={pending||readOnly||j===o.events.length-1} onClick={()=>moveEvent(o.objective_id,event.event_id,1)}>Xuống sự kiện {j+1} chương {i+1}</Button><Button size="xs" color="red" disabled={pending||readOnly} onClick={()=>events(o.objective_id,all=>all.filter(e=>e.event_id!==event.event_id))}>Xóa sự kiện {j+1} chương {i+1}</Button></Group>
   </Card>)}
   <Button variant="light" disabled={pending||readOnly} onClick={()=>events(o.objective_id,all=>[...all,{event_id:crypto.randomUUID(),text:'',participants:[]}])}>Thêm sự kiện chương {i+1}</Button>
   <Group><Button size="xs" variant="default" disabled={pending||readOnly||i===0} onClick={()=>move(i,-1)}>Lên chương {i+1}</Button><Button size="xs" variant="default" disabled={pending||readOnly||i===chapters.length-1} onClick={()=>move(i,1)}>Xuống chương {i+1}</Button><Button size="xs" disabled={pending||readOnly} color="red" onClick={()=>local.edit(d=>({...d,chapters:d.chapters.filter((_,n)=>n!==i).map(x=>({...x,dependencies:x.dependencies.filter(id=>id!==o.objective_id)}))}))}>Xóa chương {i+1}</Button></Group>
  </Stack></Card>)}
  <Button variant="light" disabled={pending||readOnly||!loaded} onClick={()=>add(1)}>Thêm chương dự kiến</Button>
  {invalid&&<Text c="red" size="sm">Kiểm tra tiêu đề, số chương trùng hoặc tên/ID người tham gia chưa đầy đủ trước khi lưu.</Text>}
  <Group><Button onClick={()=>send('save')} loading={pending} disabled={!loaded||!canSave||invalid||awaitingRecovery}>Lưu bản nháp dàn ý</Button>
   {canFork&&<Button variant="light" onClick={()=>send('fork')} disabled={pending||invalid||awaitingRecovery}>{archived?'Khôi phục thành bản nháp mới':'Tạo phiên bản từ bản đã chọn'}</Button>}
   {stored&&<Button onClick={()=>send('activate')} disabled={pending||local.dirty||!canActivate||awaitingRecovery}>Dùng bản đã lưu</Button>}
   {canArchive&&<Button color="red" variant="subtle" onClick={()=>send('delete')} disabled={pending||local.dirty||awaitingRecovery}>Lưu trữ bản kế hoạch</Button>}
  </Group>{message&&<Alert role="alert">{message}</Alert>}
 </Stack>;
}
