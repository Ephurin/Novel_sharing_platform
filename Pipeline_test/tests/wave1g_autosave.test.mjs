// Executes the actual source in a deterministic clock/API/React-hook test double.
// This is source-level regression, NOT browser or real backend acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const ts = require('typescript');
const root = new URL('../../', import.meta.url);
const hookText = readFileSync(new URL('Pipeline_test/reviews/2026-10-22-p1-wave-1g/sources/pr55-useDraftPersistence.ts', root), 'utf8');
const oldText = readFileSync(new URL('web/src/features/author-ide/AuthorWritingIde.tsx', root), 'utf8');
const B = { title:'Saved title B', content:'Saved body B', isVip:true, priceCoins:5 };
function runtime(kind, manual=false) {
  let time=0, seq=0, stored={...B}, version=1;
  const timers=new Map(), calls=[], refs=[], states=[], storage=new Map(), cleanups=[];
  let cursor=0, stateCursor=0, initialized=false;
  class ApiClientError extends Error { constructor(status) {super('conflict');this.status=status;} }
  const api=(id,value)=>{
    let resolve,reject;
    const promise=new Promise((a,b)=>{resolve=a;reject=b;});
    const call={id,value:{...value},resolve:()=>{stored={title:value.title,content:value.content,isVip:value.isVip,priceCoins:value.priceCoins};version++;resolve({draftVersion:version});},reject};
    calls.push(call); if(!manual)call.resolve();return promise;
  };
  const sandbox={exports:{},setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,due:time+delay});return id;},clearTimeout:id=>timers.delete(id),
    useRef:value=>{const i=cursor++;return refs[i]??=( {current:value});},
    useState:value=>{const i=stateCursor++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=v;}];},
    useEffect:fn=>{if(!initialized)cleanups.push(fn());},useBlocker:()=>({state:'unblocked'}),
    updateChapter:api,ApiClientError,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window:{addEventListener(){},removeEventListener(){}},
    activeChapterId:'chapter-X',activeNovelId:'novel-X',lastSavedSnapshot:{current:{...B}},autosaveTimeoutRef:{current:undefined},
    setAutosaveStatus:v=>{states[0]=v;},saveMutation:{mutate:value=>{calls.push({id:value.targetChapterId,value});stored={...value};}},
  };
  vm.createContext(sandbox);
  const body=kind==='old' ? oldText.slice(oldText.indexOf('  const triggerAutosave ='),oldText.indexOf('  const handleTitleChange ='))+'\nexports.triggerAutosave=triggerAutosave;' : hookText.replace(/^import .*;\r?\n/gm,'');
  vm.runInContext(ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  const render=(user='user-1',chapter='chapter-X')=>{
    cursor=0;stateCursor=0;
    const h=sandbox.exports.useDraftPersistence(user,chapter);initialized=true;return h;
  };
  let hook=kind==='hook'?render():null;
  const initialize=(id='chapter-X')=>hook.initialize({chapterId:id,title:B.title,isVip:B.isVip,priceCoins:B.priceCoins,draft:{...B,version:1}});
  if(hook)initialize();
  const queue=value=>hook?hook.queue(value):sandbox.exports.triggerAutosave(value.title,value.content,value.isVip,value.priceCoins);
  const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  return {queue,calls,storage,ApiClientError,initialize,
    async advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.due<=time){timers.delete(id);t.fn();}await settle();},
    async settle(){await settle();},
    flush:()=>hook.flush(), get stored(){return stored;},get states(){return states;},
    switch(user,chapter){hook=render(user,chapter);},
    dispose(){for(const fn of cleanups)fn?.();},
  };
}

for(const field of ['title','content','isVip','priceCoins']) {
  const alternate={...B,[field]:field==='isVip'?false:field==='priceCoins'?9:'Temporary A'};
  for(const kind of ['old','hook'])test(`${kind}: ${field} B→A→B before debounce sends zero stale writes`,async()=>{
    const r=runtime(kind);r.queue(alternate);await r.advance(264);r.queue(B);await r.advance(1500);
    assert.equal(r.calls.length,0,'A must never dispatch after reverting to saved B');
    assert.equal(r.stored[field],B[field]);assert.equal(r.states[0],'saved');
  });
}
for(const kind of ['old','hook'])test(`${kind}: A→C within debounce persists only C`,async()=>{
  const r=runtime(kind);r.queue({...B,content:'A'});await r.advance(264);r.queue({...B,content:'C'});await r.advance(1500);
  assert.equal(r.calls.length,1);assert.equal(r.stored.content,'C');
});
test('hook: dispatched A then B converges serially; not saved while B unresolved',async()=>{
  const r=runtime('hook',true);r.queue({...B,content:'A'});await r.advance(1200);r.queue(B);
  await r.advance(1200);assert.equal(r.calls.length,1,'B cannot race ahead of unresolved A');
  r.calls[0].resolve();await r.settle();assert.equal(r.calls.length,2);assert.equal(r.calls[1].value.content,B.content);
  assert.notEqual(r.states[0],'saved','B still unresolved must not show saved');
  r.calls[1].resolve();await r.settle();assert.equal(r.stored.content,B.content);assert.equal(r.states[0],'saved');
});
test('hook: 409 preserves pending local buffer and blocks automatic retry',async()=>{
  const r=runtime('hook',true);r.queue({...B,content:'A'});await r.advance(1200);
  r.calls[0].reject(new r.ApiClientError(409));await r.settle();assert.equal(r.states[0],'error');assert.equal(r.storage.size,1);
  await assert.rejects(r.flush());assert.equal(r.calls.length,1);assert.equal(r.stored.content,B.content);
});
test('hook: identical queue/flush creates no duplicate requests',async()=>{
  const r=runtime('hook');r.queue(B);await r.advance(1200);await r.flush();await r.flush();assert.equal(r.calls.length,0);
});
test('hook: chapter switch flush keeps exact source chapter ownership',async()=>{
  const r=runtime('hook');r.queue({...B,content:'X text'});r.switch('user-1','chapter-Y');r.initialize('chapter-Y');r.queue({...B,content:'Y text'});await r.flush();
  assert.deepEqual(r.calls.map(x=>[x.id,x.value.content]),[['chapter-X','X text'],['chapter-Y','Y text']]);
});
test('hook: account change with same chapter ID must not recover prior account buffer',()=>{
  const r=runtime('hook');r.queue({...B,content:'private user-1 text'});r.switch('user-2','chapter-X');
  assert.equal(r.initialize().content,B.content,'slot map must not cross user identity');
});
test('hook: restore B after acknowledgment of A sends a new versioned write',async()=>{
  const r=runtime('hook');r.queue({...B,content:'A'});await r.advance(1200);
  assert.equal(r.stored.content,'A');r.queue(B);await r.advance(1200);
  assert.deepEqual(r.calls.map(x=>x.value.expectedVersion),[1,2]);assert.equal(r.stored.content,B.content);
});
test('hook: unmount cancels undispatched timer and preserves local recovery buffer',async()=>{
  const r=runtime('hook');r.queue({...B,content:'A'});await r.advance(264);r.dispose();await r.advance(1500);
  assert.equal(r.calls.length,0);assert.equal(r.storage.size,1);
});
