// Offline test-only PG transaction seams; never enabled by production config.
import { createRequire } from 'node:module';
import { readFile,writeFile,access } from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
if (!/^p123-core-[a-f0-9]{10}$/.test(process.env.WAVE1D_PROJECT??'') || process.env.P123_INTENT_TEST!=='1') throw Error('Owned test stack required');
const require=createRequire('/app/backend/package.json');const pg=require('pg');
const original=pg.Client.prototype.query;const attempts=new WeakSet();
async function config(){try{return JSON.parse(await readFile('/tmp/p3-intent-config.json','utf8'));}catch{return null;}}
async function pause(seam){
 await writeFile('/tmp/p3-intent-paused',JSON.stringify({seam}));
 const until=Date.now()+30000;
 while(Date.now()<until){try{await access('/tmp/p3-intent-release');return;}catch{} await setTimeout(25);}
 throw Error('Intent test seam expired');
}
pg.Client.prototype.query=async function(text,values,...rest){
 const sql=typeof text==='string'?text:(text?.text??'');const c=await config();
 if(c && sql.includes('from narrative.autonomous_runs') && sql.includes('for update') && values?.[0]===c.runId){
  attempts.add(this);if(c.seam==='before_fence')await pause(c.seam);
 }
 if(c && attempts.has(this) && sql.trim().toLowerCase()==='commit'){
  if(c.seam==='pre_commit')await pause(c.seam);
  const result=await original.call(this,text,values,...rest);attempts.delete(this);
  await writeFile('/tmp/p3-intent-committed','committed');
  if(c.seam==='post_commit')await pause(c.seam);
  return result;
 }
 return original.call(this,text,values,...rest);
};
