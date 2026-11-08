import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Group,Select,Stack,Text,Textarea,TextInput} from '@mantine/core';
import {useAuthStore} from '../auth/useAuthStore';
import {apiClient,type ApiEnvelope,getApiErrorMessage,ApiClientError} from '../../shared/api/api-client';
type Objective={objective_id:string;intent_version:number;target_chapter:number;title:string;description:string;events:{event_id:string;text:string;participants:{name_hint?:string|null;entity_id?:string|null}[]}[];dependencies:string[]};
type Plan={plan_id:string;plan_version:number;status:string;source_outline:string;private_notes?:string;objectives:Objective[];action:string;effective_status?:string;snapshot_status?:string;is_historical?:boolean;can_save?:boolean;can_activate?:boolean;can_fork?:boolean;can_archive?:boolean};
type Plans={head_version:number;active_plan_id:string|null;active_plan_unavailable?:boolean;plans:Plan[]};
export function StoryPlanEditor({novelId}:{novelId:string}) {
 const account=useAuthStore(s=>s.user?.userId??'guest');
 return <Editor key={JSON.stringify([account,novelId])} novelId={novelId}/>;
}
function Editor({novelId}:{novelId:string}) {
 const [list,setList]=useState<Plans>({head_version:0,active_plan_id:null,plans:[]});
 const [selected,setSelected]=useState<string|null>(null),[outline,setOutline]=useState(''),[notes,setNotes]=useState('');
 const [chapters,setChapters]=useState<Objective[]>([]),[message,setMessage]=useState(''),[pending,setPending]=useState(false);
 const active=useRef(true),operation=useRef<{fingerprint:string;key:string}|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const path=`/ai/story-plans/edit-v1/${novelId}`;
 function hydrate(p:Plan|undefined) {setSelected(p?.plan_id??null);setOutline(p?.source_outline??'');setNotes(p?.private_notes??'');setChapters(p?.objectives??[]);}
 async function reload(id?:string) {
  setPending(true);
  try {const data=(await apiClient.get<ApiEnvelope<Plans>>(path)).data.data;if(!active.current)return;setList(data);hydrate(data.plans.find(p=>p.plan_id===id)??data.plans.at(-1));}
  catch(e){if(active.current)setMessage(getApiErrorMessage(e));}finally{if(active.current)setPending(false);}
 }
 useEffect(()=>{void reload();},[novelId]);
 const stored=list.plans.find(p=>p.plan_id===selected);
 const archived=stored?.effective_status==='archived';
 const canSave=!stored||(stored.can_save??(stored.plan_version===list.head_version&&!['deleted','skipped'].includes(stored.status)));
 const canFork=stored&&(stored.can_fork??!['deleted','skipped'].includes(stored.status));
 const canActivate=stored&&(stored.can_activate??(!archived&&!!stored.objectives.length));
 const canArchive=stored&&(stored.can_archive??(!archived&&!['deleted','skipped'].includes(stored.status)));
 const readOnly=!!stored&&!canSave;
 async function send(action:'save'|'fork'|'activate'|'skip'|'delete') {
  setPending(true);setMessage('');
  const body={contract_version:'plan-edit-v1',action,expected_plan_version:list.head_version,
   ...(selected?{source_plan_id:selected}:{}),...(action==='save'||action==='fork'?{source_outline:outline,private_notes:notes,
   objectives:chapters.map((o,i)=>({...o,intent_version:undefined,expected_intent_version:o.intent_version,target_chapter:i+1}))}:{})};
  const fingerprint=JSON.stringify(body);
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  try {const data=(await apiClient.post<ApiEnvelope<Plan>>(path,{...body,idempotency_key:operation.current!.key})).data.data;
   if(!active.current)return;await reload(data.plan_id);if(active.current)setMessage(action==='delete'?'Đã lưu trữ bản đã chọn. Nội dung lịch sử vẫn được giữ.':'Đã lưu phiên bản dàn ý. Không thay đổi lịch sử truyện.');}
  catch(e){if(active.current)setMessage(e instanceof ApiClientError&&e.status===409?`${getApiErrorMessage(e)}. Hãy tải lại và đối chiếu; không tự ghi đè.`:getApiErrorMessage(e));}
  finally{if(active.current)setPending(false);}
 }
 function patch(i:number,value:Partial<Objective>){setChapters(all=>all.map((o,j)=>j===i?{...o,...value}:o));}
 function editEvent(objectiveId:string,eventId:string,text:string){setChapters(all=>all.map(o=>o.objective_id===objectiveId?{...o,events:o.events.map(e=>e.event_id===eventId?{...e,text}:e)}:o));}
 function removeEvent(objectiveId:string,eventId:string){setChapters(all=>all.map(o=>o.objective_id===objectiveId?{...o,events:o.events.filter(e=>e.event_id!==eventId)}:o));}
 function moveEvent(objectiveId:string,eventId:string,delta:number){setChapters(all=>all.map(o=>{
  if(o.objective_id!==objectiveId)return o;const events=[...o.events],i=events.findIndex(e=>e.event_id===eventId);
  if(i<0||i+delta<0||i+delta>=events.length)return o;[events[i],events[i+delta]]=[events[i+delta],events[i]];return {...o,events};
 }));}
 function addEvent(objectiveId:string){const event={event_id:crypto.randomUUID(),text:'',participants:[]};setChapters(all=>all.map(o=>o.objective_id===objectiveId?{...o,events:[...o.events,event]}:o));}
 function move(i:number,delta:number){setChapters(all=>{const next=[...all];[next[i],next[i+delta]]=[next[i+delta],next[i]];return next;});}
 return <Stack>
  <Alert>Dàn ý tương lai — chưa phải Canon đã viết. Có thể bỏ qua kế hoạch; thao tác này không kích hoạt Story Brain hoặc tự viết chương.</Alert>
  <Group><Button variant="default" onClick={()=>hydrate(undefined)} disabled={pending}>Dàn ý mới</Button><Button variant="default" onClick={()=>reload()} disabled={pending}>Tải lại dàn ý</Button><Button variant="subtle" onClick={()=>send('skip')} disabled={pending}>Không dùng kế hoạch</Button></Group>
  <Text size="sm">{list.active_plan_unavailable?'Có kế hoạch legacy ngoài phạm vi hiển thị; cần bàn giao trước khi chuyển kế hoạch':list.active_plan_id?'Đang dùng một phiên bản kế hoạch tương lai':'Không có kế hoạch đang dùng'} · Version {list.head_version}</Text>
  <Select label="Phiên bản đã lưu" disabled={pending} value={selected} data={list.plans.map(p=>({value:p.plan_id,label:`v${p.plan_version} · ${p.effective_status??p.status}${p.is_historical?' · lịch sử':''}`}))} onChange={id=>hydrate(list.plans.find(p=>p.plan_id===id))}/>
  {readOnly&&<Alert>{archived?'Bản đã lưu trữ · chỉ đọc. Nội dung lịch sử được giữ; chỉ khôi phục bằng một bản nháp mới.':stored?.effective_status==='tombstone'?'Biên nhận lưu trữ · chỉ đọc. Chọn bản gốc trong lịch sử để xem hoặc khôi phục.':'Bản lịch sử hoặc biên nhận · chỉ đọc. Tạo một phiên bản mới để chỉnh sửa.'}</Alert>}
  {stored&&<Text size="xs">Trạng thái khi lưu: {stored.snapshot_status??stored.status} · Hiện tại: {stored.effective_status??stored.status}</Text>}
  <Textarea label="Dán hoặc nhập dàn ý tương lai" disabled={pending||readOnly} value={outline} onChange={e=>setOutline(e.currentTarget.value)} minRows={3}/>
  <Textarea label="Ghi chú kế hoạch riêng tư" disabled={pending||readOnly} description="Không gửi tới provider hoặc ngữ cảnh viết." value={notes} onChange={e=>setNotes(e.currentTarget.value)}/>
  {chapters.map((o,i)=><Card withBorder key={o.objective_id}><Stack gap="xs">
   <Text>Chương {i+1}</Text><TextInput label={`Tiêu đề chương ${i+1}`} disabled={pending||readOnly} value={o.title} onChange={e=>patch(i,{title:e.currentTarget.value})}/>
   <Textarea label={`Mục tiêu chương ${i+1}`} disabled={pending||readOnly} value={o.description} onChange={e=>patch(i,{description:e.currentTarget.value})}/>
   {o.events.map((event,j)=><Card withBorder key={event.event_id}>
    <Textarea label={`Sự kiện ${j+1} chương ${i+1}`} disabled={pending||readOnly} value={event.text}
      onChange={e=>editEvent(o.objective_id,event.event_id,e.currentTarget.value)}/>
    <Text size="xs">{event.participants.map(p=>p.entity_id?`ID: ${p.entity_id}`:`Chưa xác định: ${p.name_hint??''}`).join(', ')}</Text>
    <Group><Button size="xs" variant="default" disabled={pending||readOnly||j===0} onClick={()=>moveEvent(o.objective_id,event.event_id,-1)}>Lên sự kiện {j+1} chương {i+1}</Button>
     <Button size="xs" variant="default" disabled={pending||readOnly||j===o.events.length-1} onClick={()=>moveEvent(o.objective_id,event.event_id,1)}>Xuống sự kiện {j+1} chương {i+1}</Button>
     <Button size="xs" color="red" disabled={pending||readOnly} onClick={()=>removeEvent(o.objective_id,event.event_id)}>Xóa sự kiện {j+1} chương {i+1}</Button></Group>
   </Card>)}
   <Button variant="light" disabled={pending||readOnly} onClick={()=>addEvent(o.objective_id)}>Thêm sự kiện chương {i+1}</Button>
   <Group><Button size="xs" variant="default" disabled={pending||readOnly||i===0} onClick={()=>move(i,-1)}>Lên chương {i+1}</Button><Button size="xs" variant="default" disabled={pending||readOnly||i===chapters.length-1} onClick={()=>move(i,1)}>Xuống chương {i+1}</Button><Button size="xs" disabled={pending||readOnly} color="red" onClick={()=>setChapters(all=>all.filter((_,j)=>j!==i).map(x=>({...x,dependencies:x.dependencies.filter(d=>d!==o.objective_id)})))}>Xóa chương {i+1}</Button></Group>
  </Stack></Card>)}
  <Button variant="light" disabled={pending||readOnly} onClick={()=>setChapters(all=>[...all,{objective_id:crypto.randomUUID(),intent_version:0,target_chapter:all.length+1,title:`Chương ${all.length+1}`,description:'',events:[],dependencies:[]}])}>Thêm chương dự kiến</Button>
  <Group><Button onClick={()=>send('save')} loading={pending} disabled={!canSave}>Lưu bản nháp dàn ý</Button>
   {canFork&&<Button variant="light" onClick={()=>send('fork')} disabled={pending}>{archived?'Khôi phục thành bản nháp mới':'Tạo phiên bản từ bản đã chọn'}</Button>}
   {stored&&<Button onClick={()=>send('activate')} disabled={pending||!canActivate}>Dùng bản đã lưu</Button>}
   {canArchive&&<Button color="red" variant="subtle" onClick={()=>send('delete')} disabled={pending}>Lưu trữ bản kế hoạch</Button>}
  </Group>{message&&<Alert role="alert">{message}</Alert>}
 </Stack>;
}
