import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Group,Select,Stack,Text,Textarea,TextInput} from '@mantine/core';
import {useAuthStore} from '../auth/useAuthStore';
import {apiClient,type ApiEnvelope,getApiErrorMessage,ApiClientError} from '../../shared/api/api-client';
type Objective={objective_id:string;intent_version:number;target_chapter:number;title:string;description:string;events:{event_id:string;text:string;participants:({name_hint:string}|{entity_id:string})[]}[];dependencies:string[]};
type Plan={plan_id:string;plan_version:number;status:string;source_outline:string;private_notes?:string;objectives:Objective[];action:string};
type Plans={head_version:number;active_plan_id:string|null;plans:Plan[]};
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
 async function send(action:'save'|'fork'|'activate'|'skip'|'delete') {
  setPending(true);setMessage('');
  const body={contract_version:'plan-edit-v1',action,expected_plan_version:list.head_version,
   ...(selected?{source_plan_id:selected}:{}),...(action==='save'||action==='fork'?{source_outline:outline,private_notes:notes,
   objectives:chapters.map((o,i)=>({...o,intent_version:undefined,expected_intent_version:o.intent_version,target_chapter:i+1}))}:{})};
  const fingerprint=JSON.stringify(body);
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  try {const data=(await apiClient.post<ApiEnvelope<Plan>>(path,{...body,idempotency_key:operation.current!.key})).data.data;
   if(!active.current)return;await reload(data.plan_id);if(active.current)setMessage('Đã lưu phiên bản dàn ý. Không thay đổi lịch sử truyện.');}
  catch(e){if(active.current)setMessage(e instanceof ApiClientError&&e.status===409?`${getApiErrorMessage(e)}. Hãy tải lại và đối chiếu; không tự ghi đè.`:getApiErrorMessage(e));}
  finally{if(active.current)setPending(false);}
 }
 function patch(i:number,value:Partial<Objective>){setChapters(all=>all.map((o,j)=>j===i?{...o,...value}:o));}
 function move(i:number,delta:number){setChapters(all=>{const next=[...all];[next[i],next[i+delta]]=[next[i+delta],next[i]];return next;});}
 return <Stack>
  <Alert>Dàn ý tương lai — chưa phải Canon đã viết. Có thể bỏ qua kế hoạch; thao tác này không kích hoạt Story Brain hoặc tự viết chương.</Alert>
  <Group><Button variant="default" onClick={()=>hydrate(undefined)} disabled={pending}>Dàn ý mới</Button><Button variant="default" onClick={()=>reload()} disabled={pending}>Tải lại dàn ý</Button><Button variant="subtle" onClick={()=>send('skip')} disabled={pending}>Không dùng kế hoạch</Button></Group>
  <Text size="sm">{list.active_plan_id?'Đang dùng một phiên bản kế hoạch tương lai':'Không có kế hoạch đang dùng'} · Version {list.head_version}</Text>
  <Select label="Phiên bản đã lưu" disabled={pending} value={selected} data={list.plans.map(p=>({value:p.plan_id,label:`v${p.plan_version} · ${p.status}`}))} onChange={id=>hydrate(list.plans.find(p=>p.plan_id===id))}/>
  <Textarea label="Dán hoặc nhập dàn ý tương lai" disabled={pending} value={outline} onChange={e=>setOutline(e.currentTarget.value)} minRows={3}/>
  <Textarea label="Ghi chú kế hoạch riêng tư" disabled={pending} description="Không gửi tới provider hoặc ngữ cảnh viết." value={notes} onChange={e=>setNotes(e.currentTarget.value)}/>
  {chapters.map((o,i)=><Card withBorder key={o.objective_id}><Stack gap="xs">
   <Text>Chương {i+1}</Text><TextInput label={`Tiêu đề chương ${i+1}`} disabled={pending} value={o.title} onChange={e=>patch(i,{title:e.currentTarget.value})}/>
   <Textarea label={`Mục tiêu chương ${i+1}`} disabled={pending} value={o.description} onChange={e=>patch(i,{description:e.currentTarget.value})}/>
   <Textarea label={`Sự kiện dự kiến chương ${i+1}`} disabled={pending} value={o.events.map(e=>e.text).join('\n')} onChange={e=>{const lines=e.currentTarget.value.split('\n');patch(i,{events:lines.filter(Boolean).map((text,j)=>({...o.events[j],event_id:o.events[j]?.event_id??crypto.randomUUID(),text,participants:o.events[j]?.participants??[]}))});}}/>
   <Group><Button size="xs" variant="default" disabled={pending||i===0} onClick={()=>move(i,-1)}>Lên chương {i+1}</Button><Button size="xs" variant="default" disabled={pending||i===chapters.length-1} onClick={()=>move(i,1)}>Xuống chương {i+1}</Button><Button size="xs" disabled={pending} color="red" onClick={()=>setChapters(all=>all.filter((_,j)=>j!==i).map(x=>({...x,dependencies:x.dependencies.filter(d=>d!==o.objective_id)})))}>Xóa chương {i+1}</Button></Group>
  </Stack></Card>)}
  <Button variant="light" disabled={pending} onClick={()=>setChapters(all=>[...all,{objective_id:crypto.randomUUID(),intent_version:0,target_chapter:all.length+1,title:`Chương ${all.length+1}`,description:'',events:[],dependencies:[]}])}>Thêm chương dự kiến</Button>
  <Group><Button onClick={()=>send('save')} loading={pending}>Lưu bản nháp dàn ý</Button>
   {selected&&<><Button variant="light" onClick={()=>send('fork')} disabled={pending}>Tạo phiên bản từ bản đã chọn</Button><Button onClick={()=>send('activate')} disabled={pending||!chapters.length}>Dùng bản đã lưu</Button><Button color="red" variant="subtle" onClick={()=>send('delete')} disabled={pending}>Gỡ bản kế hoạch</Button></>}
  </Group>{message&&<Alert role="alert">{message}</Alert>}
 </Stack>;
}
