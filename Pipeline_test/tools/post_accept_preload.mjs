// Explicit owned offline stack only. Production never imports this module.
import './intent_fence_preload.mjs';
import {readFile, writeFile, access} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
const original=globalThis.fetch;
globalThis.fetch=async function(url,options){
 let c;try{c=JSON.parse(await readFile('/tmp/p3-intent-config.json','utf8'));}catch{}
 const path=String(url);let body;try{body=JSON.parse(options?.body??'{}');}catch{}
 const match=c && ((c.seam==='pre_approval' && path.includes('/proposal-groups/') && path.endsWith('/accept')) ||
  (c.seam==='pre_progress' && path.includes('/objectives/') && body?.status==='completed'));
 if(match){
  await writeFile('/tmp/p3-intent-paused',JSON.stringify({seam:c.seam,path,body}));
  let released=false;const deadline=Date.now()+30000;
  while(Date.now()<deadline){try{await access('/tmp/p3-intent-release');released=true;break;}catch{}await setTimeout(25);}
  if(!released)throw Error('Post accept seam expired');
 }
 return original.call(this,url,options);
};
