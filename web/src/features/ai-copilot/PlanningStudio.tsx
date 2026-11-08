import {useEffect,useRef,useState} from 'react';
import {Alert,Badge,Button,Card,Group,Stack,Text,Title} from '@mantine/core';
import {apiClient,ApiClientError,getApiErrorMessage,type ApiEnvelope} from '../../shared/api/api-client';
import {SetupFoundationPanel} from './SetupFoundationPanel';
import {StoryPlanEditor} from './StoryPlanEditor';
import {getSetup,getSetupM0Readiness,type SetupM0Readiness,type SetupSnapshot} from './setup-api';
import {usePlanningScope} from './planning-draft';
import type {StoryBrainSummary} from '../manuscript-import/manuscript-import-api';
export type PlanningStep='idea'|'rules'|'characters'|'chapters'|'write';
const steps:{id:PlanningStep;label:string}[]=[{id:'idea',label:'Ý tưởng'},{id:'rules',label:'Thế giới'},{id:'characters',label:'Nhân vật'},{id:'chapters',label:'Dàn ý chương'},{id:'write',label:'Bắt đầu viết'}];
type Props={novelId:string;title:string;step:PlanningStep;onStep:(s:PlanningStep)=>void;chapters:{chapterId:string;title:string}[];onWrite:(chapterId?:string)=>void;onCreate:()=>void;creating:boolean;onMemory:()=>void};
export function PlanningStudio({novelId,title,step,onStep,chapters,onWrite,onCreate,creating,onMemory}:Props){
 const scope=usePlanningScope(),readSequence=useRef(0),panel=useRef<HTMLElement>(null);
 useEffect(()=>{panel.current?.scrollTo({top:0});},[step]);
 const [extraction,setExtraction]=useState<{chapter_id:string;chapter_number:number;status:string|null}[]|null>(null);
 const [snapshot,setSnapshot]=useState<SetupSnapshot|null>(null),[m0,setM0]=useState<SetupM0Readiness|null>(null),[brain,setBrain]=useState<StoryBrainSummary|null>(null),[error,setError]=useState(''),[read,setRead]=useState(false);
 async function refresh(){const request=++readSequence.current;const signal=scope.signal;scope.assertCurrent();setError('');
  try{
   const [s,b]=await Promise.all([getSetup(novelId,undefined,signal).catch(e=>{if(e instanceof ApiClientError&&e.status===404)return null;throw e;}),apiClient.get<ApiEnvelope<StoryBrainSummary>>(`/ai/story-brains/by-novel/${novelId}`,{signal}).then(r=>r.data.data).catch(e=>{if(e instanceof ApiClientError&&e.status===404)return null;throw e;})]);
   const a=s?await getSetupM0Readiness(novelId,s.snapshot_id,signal):null;
   const x=await apiClient.get<ApiEnvelope<{chapter_id:string;chapter_number:number;status:string|null}[]>>(`/ai/story-brains/${novelId}/extraction-status`,{signal}).then(r=>r.data.data).catch(()=>null);
   if(signal.aborted||request!==readSequence.current)return;setExtraction(x);setSnapshot(s);setBrain(b);setM0(a);setRead(true);
  }catch(e){if(!signal.aborted&&request===readSequence.current){setRead(false);setError(getApiErrorMessage(e));}}
 }
 useEffect(()=>{void refresh();},[novelId,step]);
 const active=read&&(!!m0?.activation||(brain?.status==='active'&&!!brain.baseline_revision_id));
 return <section ref={panel} aria-label="Planning Studio" style={{flex:1,minHeight:0,overflowY:'auto',padding:'clamp(12px,3vw,32px)',userSelect:'text'}}>
 <Stack maw={960} mx="auto" gap="lg">
  <Group justify="space-between"><div><Text size="sm" c="dimmed">Phòng lập kế hoạch · {title}</Text><Title order={2}>Từ ý tưởng đến trang viết đầu tiên</Title></div><Button variant="default" onClick={()=>void refresh()}>Đọc trạng thái mới</Button></Group>
  <nav aria-label="Các bước lập kế hoạch" style={{position:"sticky",top:0,zIndex:5,background:"var(--mantine-color-body)",paddingBlock:8}}><Group gap="xs">{steps.map((s,i)=><Button key={s.id} variant={step===s.id?'filled':'light'} aria-current={step===s.id?'step':undefined} onClick={()=>onStep(s.id)}>{i+1}. {s.label}</Button>)}</Group></nav>
  <Card withBorder><Stack gap="xs"><Group><Badge color={active?'green':'gray'}>{read?(active?'Bộ nhớ truyện đang hoạt động':'Chưa kích hoạt thiết lập'):'Chưa xác minh trạng thái'}</Badge><Badge variant="light">{snapshot?.review?'Đã đọc quyết định thiết lập':snapshot?'Thiết lập đang chờ duyệt':'Chưa có bản thiết lập'}</Badge></Group>
  <Text size="sm">{active?'Chương đã lưu dùng luồng phân tích và duyệt hiện có. Sự kiện tương lai vẫn chỉ là kế hoạch.':'Bạn vẫn có thể viết bản nháp. Trước khi bộ nhớ truyện được kích hoạt, lưu bản nháp không tự tạo lịch sử hay tự phân tích.'}</Text>
  {m0?.first_saved_revision&&<Text size="sm">Đã xác minh bản lưu đầu tiên: {m0.first_saved_revision.revision_id}</Text>}
  {brain&&<Text size="sm">Đề xuất chờ duyệt: {brain.counts.pending_proposals}. Sự kiện đã ghi nhận: {brain.counts.events}.</Text>}
  <Text size="sm">{extraction===null?'Chưa đọc được trạng thái phân tích chương. Mở Bộ nhớ truyện để kiểm tra.':extraction.length?extraction.map(x=>`Chương ${x.chapter_number}: ${x.status??'chưa phân tích'}`).join(' · '):'Chưa có trạng thái phân tích chương. Không tự xác nhận hoàn tất.'}</Text>
  <Button variant="subtle" onClick={onMemory}>Mở Bộ nhớ truyện & duyệt diễn biến</Button></Stack></Card>
  {error&&<Alert color="red" role="alert">Không xác minh được trạng thái: {error}</Alert>}
  <div hidden={!['idea','rules','characters'].includes(step)}><SetupFoundationPanel novelId={novelId} planningStep={['idea','rules','characters'].includes(step)?step as 'idea'|'rules'|'characters':'characters'} onServerChange={()=>void refresh()}/></div>
  <div hidden={step!=='chapters'}><StoryPlanEditor novelId={novelId}/></div>
  <div hidden={step!=='write'}><Stack><Title order={3}>Viết khi bạn sẵn sàng</Title><Text>Không bắt buộc có dàn ý. Mở chương có sẵn hoặc chủ động tạo một bản nháp trong trình soạn thảo hiện tại.</Text>
  {chapters.map(c=><Button key={c.chapterId} variant="default" onClick={()=>onWrite(c.chapterId)} style={{height:'auto',minHeight:36,whiteSpace:'normal'}}>{c.title}</Button>)}
  <Button onClick={onCreate} loading={creating}>Tạo bản nháp chương mới</Button><Button variant="subtle" onClick={()=>onWrite()}>Bỏ qua dàn ý, mở trang viết</Button>
  <Text size="sm" c="dimmed">Điều hướng không tạo chương, revision hay sự kiện. Bản nháp được lưu qua Writer hiện có; mọi diễn biến Canon vẫn cần bạn duyệt.</Text></Stack></div>
 </Stack></section>;
}
