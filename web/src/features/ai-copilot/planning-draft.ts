import {useEffect,useRef,useState} from 'react';
import {useAuthStore} from '../auth/useAuthStore';

type Operation={fingerprint:string;key:string};
type Backup<T>={format:1;value:T;operation:Operation|null;savedAt:string};
// Device-local recovery only, never an alternative to server CAS/readback.
// The memory copy survives in-app unmount if browser storage is unavailable.
const memory=new Map<string,Backup<unknown>>();
let listening=false;
function guardUnload(){
 if(listening||typeof window==='undefined')return;listening=true;
 window.addEventListener('beforeunload',event=>{if(memory.size){event.preventDefault();event.returnValue='';}});
}
export function usePlanningScope(){
 const actor=useAuthStore(s=>s.user?.userId??'guest');
 const controller=useRef(new AbortController());
 useEffect(()=>{
  if(controller.current.signal.aborted)controller.current=new AbortController();
  const stop=useAuthStore.subscribe(s=>{if((s.user?.userId??'guest')!==actor)controller.current.abort();});
  return()=>{controller.current.abort();stop();};
 },[actor]);
 function assertCurrent(){
  if((useAuthStore.getState().user?.userId??'guest')!==actor||controller.current.signal.aborted)throw Error('Phiên làm việc đã thay đổi.');
 }
 return{actor,get signal(){return controller.current.signal;},assertCurrent};
}

export function usePlanningDraft<T>(key:string,empty:T,valid:(value:unknown)=>value is T){
 const initial=useRef<Backup<T>|null|undefined>(undefined);
 if(initial.current===undefined){
  try{
   const candidate=memory.get(key)??JSON.parse(localStorage.getItem(key)??'null');
   initial.current=candidate?.format===1&&valid(candidate.value)?candidate as Backup<T>:null;
  }catch{initial.current=null;}
 }
 const [value,setValue]=useState(empty),[backup,setBackup]=useState(initial.current),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const dirtyRef=useRef(false);
 const current=useRef(empty),operation=useRef<Operation|null>(initial.current?.operation??null);
 // #135: tabs of the same author/novel share this key. When another tab discards or accepts it while
 // this tab still has unsaved edits, put this tab's copy back at once and tell the author.
 useEffect(()=>{
  const onStorage=(e:StorageEvent)=>{
   if(e.storageArea!==localStorage||e.key!==key||!dirtyRef.current)return;
   if(e.newValue===null){persist(current.current);setNotice('Một tab khác vừa bỏ bản dự phòng trên thiết bị. Bản sửa chưa lưu của tab này đã được ghi lại; hãy lưu lên máy chủ.');}
   else setNotice('Một tab khác cũng đang sửa nội dung này. Thiết bị chỉ giữ một bản dự phòng; hãy lưu lên máy chủ từ một tab.');
  };
  window.addEventListener('storage',onStorage);
  return()=>window.removeEventListener('storage',onStorage);
 },[key]);
 function persist(next:T){
  const record:Backup<T>={format:1,value:next,operation:operation.current,savedAt:new Date().toISOString()};
  memory.set(key,record);guardUnload();
  try{localStorage.setItem(key,JSON.stringify(record));setError('');}
  catch{setError('Không thể lưu dự phòng trên thiết bị. Giữ trang mở hoặc xuất bản sửa trước khi đóng.');}
 }
 function edit(change:Partial<T>|((old:T)=>T)){
  const next=typeof change==='function'?change(current.current):{...current.current,...change};
  current.current=next;setValue(next);setDirty(true);dirtyRef.current=true;persist(next);
 }
 function hydrate(next:T){current.current=next;setValue(next);setDirty(false);dirtyRef.current=false;setNotice('');}
 function clear(){memory.delete(key);try{localStorage.removeItem(key);}catch{}setBackup(null);operation.current=null;setError('');}
 function accept(next:T){clear();hydrate(next);}
 function recover(){if(backup){hydrate(backup.value);setDirty(true);dirtyRef.current=true;persist(backup.value);setBackup(null);}}
 function operationKey(body:unknown){
  const fingerprint=JSON.stringify(body);
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  persist(current.current);return operation.current!.key;
 }
 function exportDraft(){
  const url=URL.createObjectURL(new Blob([JSON.stringify(current.current,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='ban-sua-ke-hoach.json';link.click();URL.revokeObjectURL(url);
 }
 return{value,current,backup,dirty,dirtyRef,error,notice,edit,hydrate,accept,clear,recover,operationKey,exportDraft};
}
