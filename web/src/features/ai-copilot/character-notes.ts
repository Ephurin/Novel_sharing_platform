import {useState} from 'react';

// Device-local notes for setup declarations (BUI-03).
// setup-v1 Declaration only carries declaration_id/entity_type/display_name/aliases
// (extra='forbid'), so the AI-proposed role/archetype/aliases/description the author
// reviewed are kept here as an editable note keyed by declaration_id. Notes are never
// sent to the server, the Story Brain or a model provider, and they are lost if this
// browser's storage is cleared.
export type CharacterNote={text:string;source:'model_proposed';updatedAt:string};
type Store={format:1;notes:Record<string,CharacterNote>};

function validNote(v:unknown):v is CharacterNote{const n=v as CharacterNote;return !!n&&typeof n.text==='string';}
function load(key:string):Record<string,CharacterNote>{
 try{
  const raw=JSON.parse(localStorage.getItem(key)??'null') as Store|null;
  if(raw?.format!==1||!raw.notes||typeof raw.notes!=='object')return {};
  return Object.fromEntries(Object.entries(raw.notes).filter(([,v])=>validNote(v)));
 }catch{return {};}
}

export function characterNoteText(c:{role?:string;archetype?:string;aliases?:string[];description?:string}){
 return [c.role&&`Vai trò: ${c.role}`,c.archetype&&`Hình mẫu: ${c.archetype}`,c.aliases?.length?`Bí danh: ${c.aliases.join(', ')}`:'',c.description?.trim()].filter(Boolean).join('\n');
}

export function useCharacterNotes(actor:string,novelId:string){
 const key=`ephurin-planning:${actor}:${novelId}:character-notes`;
 const [notes,setNotes]=useState<Record<string,CharacterNote>>(()=>load(key));
 const [error,setError]=useState('');
 function update(change:(old:Record<string,CharacterNote>)=>Record<string,CharacterNote>){
  setNotes(old=>{
   const next=change(old);
   try{localStorage.setItem(key,JSON.stringify({format:1,notes:next} satisfies Store));setError('');}
   catch{setError('Không thể lưu ghi chú nhân vật trên thiết bị. Giữ trang mở hoặc chép ghi chú ra ngoài trước khi đóng.');}
   return next;
  });
 }
 function set(id:string,text:string){update(old=>({...old,[id]:{text,source:'model_proposed',updatedAt:new Date().toISOString()}}));}
 function remove(id:string){update(old=>{if(!(id in old))return old;const next={...old};delete next[id];return next;});}
 return{notes,error,set,remove};
}
