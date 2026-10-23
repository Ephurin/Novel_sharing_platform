// Test-only probe: explicit mutation opt-in and newly provisioned databases required.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../app.js';
import { getPostgresPool, disconnectPostgres } from '../core/database/postgres.js';
import { getMongoDatabase, connectMongo, disconnectMongo } from '../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../core/database/test-db-guard.js';

const out=process.env.INTERNAL_AUTHZ_LIVE_EVIDENCE;
assert.ok(out); assert.equal(process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS,'1');
await mkdir(out,{recursive:false});
const pool=getPostgresPool(),mongo=getMongoDatabase();
const originalToken=process.env.PLATFORM_SERVICE_TOKEN,secret=randomUUID();
const server=createApp().listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',r));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
const matrix:unknown[]=[];let failure:string|undefined;let readbacks:unknown;let identity:unknown;
async function api(path:string,method:string,body?:unknown,token?:string){
 const r=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json() as any;assert.ok(r.ok,`${path}: ${JSON.stringify(j)}`);return j.data;
}
try{
 identity=await validateTestDatabaseIsolation(pool,mongo);await connectMongo();
 const username='revision_authz_'+randomUUID().replaceAll('-',''),password='FixtureA9_'+randomUUID();
 const registration=await api('/auth/register','POST',{username,email:username+'@example.test',password});
 await pool.query("update users set role='AUTHOR' where user_id=$1",[registration.user.userId]);
 const author=await api('/auth/login','POST',{identifier:username,password});
 const novel=await api('/novels','POST',{title:'Internal revision authz isolated fixture',synopsis:'Synthetic offline test'},author.accessToken);
 const content='Immutable bootstrap revision for isolated service authorization';
 const chapter=await api(`/novels/${novel.novelId}/chapters`,'POST',{title:'Chapter 1',content},author.accessToken);
 const revision=await api(`/chapters/${chapter.chapterId}/revisions/snapshot`,'POST',{purpose:'MANUSCRIPT_BOOTSTRAP'},author.accessToken);
 const durable=async()=>({revision:(await pool.query('select * from chapter_revisions where revision_id=$1',[revision.revisionId])).rows,chapter:(await pool.query('select * from chapters where chapter_id=$1',[chapter.chapterId])).rows,outbox:(await pool.query('select * from analysis_outbox')).rows,mongo:await mongo.collection('draft_chapters').find().toArray()});
 const before=await durable();assert.equal(before.revision[0].content,content);assert.equal(before.revision[0].content_hash,createHash('sha256').update(content).digest('hex'));assert.ok(before.mongo.length>0);
 for(const configuration of ['missing','empty','whitespace','configured']){
  if(configuration==='missing')delete process.env.PLATFORM_SERVICE_TOKEN;else process.env.PLATFORM_SERVICE_TOKEN=configuration==='empty'?'':configuration==='whitespace'?'   ':secret;
  for(const [scenario,headers,valid] of [['anonymous',{},false],['arbitrary_Bearer',{Authorization:'Bearer arbitrary'},false],['empty_Bearer',{Authorization:'Bearer '},false],['wrong_token',{'X-Service-Token':'wrong'},false],['empty_token',{'X-Service-Token':''},false],['correct_Bearer',{Authorization:`Bearer ${secret}`},true],['correct_service_header',{'X-Service-Token':secret},true],['correct_legacy_header',{'X-Internal-Service-Key':secret},true]] as const){
   const r=await fetch(base+'/internal/v1/revisions/'+revision.revisionId,{headers:headers as Record<string,string>});const j=await r.json() as any;const expected=configuration==='configured'&&valid?200:401;
   matrix.push({configuration,scenario,status:r.status,expected});assert.equal(r.status,expected);
   if(expected===200)assert.deepEqual(j.data,{revision_id:revision.revisionId,novel_id:novel.novelId,chapter_id:chapter.chapterId,chapter_number:1,content,content_hash:before.revision[0].content_hash});
   else assert.equal(j.error.code,'AUTH_002');
  }
 }
 process.env.PLATFORM_SERVICE_TOKEN=secret;
 for(const valid of [true,false]){const r=await fetch(base+'/internal/v1/revisions/'+randomUUID(),{headers:{Authorization:`Bearer ${valid?secret:'wrong'}`}});matrix.push({scenario:valid?'missing_revision_valid':'missing_revision_invalid',status:r.status,expected:valid?404:401});assert.equal(r.status,valid?404:401);}
 // Run the actual AI adapter against this HTTP server; no AI model or embedding client is involved.
 const python=`import os,json
from infrastructure.revision_content_provider import PlatformRevisionClient
r=PlatformRevisionClient(os.environ['AUTHZ_BASE'],os.environ['AUTHZ_TOKEN']).get_revision(tenant_id='isolated-test',novel_id=os.environ['AUTHZ_NOVEL'],chapter_id=os.environ['AUTHZ_CHAPTER'],revision_id=os.environ['AUTHZ_REVISION'])
assert r.content==os.environ['AUTHZ_CONTENT']
assert r.content_hash==os.environ['AUTHZ_HASH']
assert r.chapter_number==1
print(json.dumps({'adapter':'PlatformRevisionClient','passed':True,'revision_id':r.revision_id,'content_hash':r.content_hash}))`;
 const result=await new Promise<string>((resolve,reject)=>{const child=spawn('python',['-c',python],{env:{...process.env,PYTHONPATH:process.cwd()+'/../ai-service',AUTHZ_BASE:base,AUTHZ_TOKEN:secret,AUTHZ_NOVEL:novel.novelId,AUTHZ_CHAPTER:chapter.chapterId,AUTHZ_REVISION:revision.revisionId,AUTHZ_CONTENT:content,AUTHZ_HASH:before.revision[0].content_hash}});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(`AI adapter exit ${code}: ${stderr}`)));});
 matrix.push(JSON.parse(result));const after=await durable();assert.deepEqual(after,before);readbacks={before,after,unchanged:true};
}catch(error){failure=String(error);process.exitCode=1;}
finally{
 await writeFile(out+'/readbacks.json',JSON.stringify(readbacks??null,null,2));await writeFile(out+'/result.json',JSON.stringify({passed:!failure,failure,identity,matrix,proof:'Real HTTP + fresh PostgreSQL/MongoDB + actual Python AI revision adapter; no provider'},null,2));
 if(originalToken===undefined)delete process.env.PLATFORM_SERVICE_TOKEN;else process.env.PLATFORM_SERVICE_TOKEN=originalToken;
 server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await disconnectPostgres();await disconnectMongo();
}
if(failure)console.error(failure);
