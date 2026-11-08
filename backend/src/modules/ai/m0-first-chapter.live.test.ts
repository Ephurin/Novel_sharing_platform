import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import {createApp} from '../../app.js';
import {env} from '../../core/config/env.js';
import {getPostgresPool,disconnectPostgres} from '../../core/database/postgres.js';
import {getMongoDatabase,disconnectMongo} from '../../core/database/mongo.js';
import {disconnectChapterWriter} from '../novels/chapter-writer.js';

test('P2 M0 -> genuine Core create/PATCH/revision/outbox -> existing P1 HITL',{
  skip:process.env.TEST_P2A_LIVE!=='1',timeout:180000
},async()=>{
 const pg=getPostgresPool(),mongo=getMongoDatabase();
 assert.equal((await pg.query('select current_database() name')).rows[0].name,'p2a');assert.equal(mongo.databaseName,'p2a');
 const [owner,foreign,novel,createNovel]=Array.from({length:4},()=>randomUUID());
 const token=jwt.sign({sub:owner,role:'AUTHOR'},env.JWT_ACCESS_SECRET),foreignToken=jwt.sign({sub:foreign,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
 const server=createApp().listen(57114,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const requests:any[]=[],readbacks:any[]=[];
 async function http(path:string,method='GET',body?:unknown,expected=200,auth:string|null=token){
  const r=await fetch('http://127.0.0.1:57114/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{}),'X-Author-Id':foreign,'X-Tenant-Id':randomUUID()},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const response:any=await r.json();requests.push({path,method,status:r.status,response});assert.equal(r.status,expected,JSON.stringify(response));return response.data;
 }
 async function durable(stage:string,n:string=novel){
  const data:any={};
  const tables=(await pg.query("SELECT table_name FROM information_schema.columns WHERE table_schema='narrative' AND column_name IN ('tenant_id','novel_id') GROUP BY table_name HAVING count(*)=2 ORDER BY table_name")).rows;
  for(const {table_name} of tables)data[table_name]=(await pg.query(`SELECT * FROM narrative.${table_name} WHERE novel_id=$1 ORDER BY 1`,[n])).rows;
  for(const [name,sql]of Object.entries({chapters:'SELECT * FROM chapters WHERE novel_id=$1 ORDER BY chapter_id',revisions:'SELECT * FROM chapter_revisions WHERE novel_id=$1 ORDER BY created_at,revision_id',outbox:'SELECT * FROM revision_outbox_events WHERE novel_id=$1 ORDER BY created_at,event_id',decisions:'SELECT d.* FROM narrative.proposal_decisions d JOIN narrative.proposals p ON p.id=d.proposal_id WHERE p.novel_id=$1 ORDER BY d.id'}))data[name]=(await pg.query(sql,[n])).rows;
  data.mongo=await mongo.collection('draft_chapters').find({novelId:n}).sort({_id:1}).toArray();
  const rows=JSON.parse(JSON.stringify(data));readbacks.push({stage,novel_id:n,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),data:rows});return rows;
 }
 async function poll(n:string=novel){
  for(let i=0;i<100;i++){
   const rows=(await pg.query('SELECT * FROM revision_outbox_events WHERE novel_id=$1',[n])).rows;
   if(rows.length&&rows.every(r=>r.status==='COMPLETED'))return rows;
   await new Promise(r=>setTimeout(r,100));
  }throw new Error('Outbox did not complete');
 }
 async function setup(n:string){
  const body={contract_version:'setup-v1',novel_id:n,mode:'extract',idempotency_key:randomUUID(),expected_setup_version:0,setup:{text:'',declarations:[{declaration_id:'minh',entity_type:'character',display_name:'Minh'}],world_rules:[{declaration_id:'rule',text:'Không ai bay được.'}],initial_conditions:[]},outline:'FutureOnlyBetrayal at chapter 8',private_author_notes:['M0PrivateOnly']};
  const job=await http('/ai/story-brains/bootstrap/from-idea','POST',body,202);
  const s=await http(`/ai/story-brains/${n}/setup`);
  const review=await http(`/ai/story-brains/${n}/setup/${job.job_id}/review`,'POST',{idempotency_key:randomUUID(),dependency_group_id:s.proposals[0].dependency_group_id,setup_hash:s.setup_hash,expected_setup_version:s.setup_version,expected_review_version:s.review_version,expected_brain_version:s.brain_version,decisions:s.proposals.map((p:any)=>({proposal_id:p.proposal_id,decision:'accept',...(p.card_type==='entity'?{identity:{kind:'new'}}:{})}))});
  const path=`/ai/story-brains/${n}/setup/${job.job_id}/activate`;
  const activate={contract_version:'setup-m0-v1',idempotency_key:randomUUID(),setup_hash:s.setup_hash,expected_setup_version:s.setup_version,expected_review_version:review.review_version,expected_brain_version:review.brain_version};
  const before=await durable('reviewed-before-activation',n);
  await http(path,'POST',activate,401,null);await http(path,'POST',activate,403,foreignToken);
  assert.deepEqual(await durable('denied-activation-unchanged',n),before);
  assert.equal((await http(path)).eligible,true);
  const receipt=await http(path,'POST',activate);
  assert.equal(receipt.baseline_revision_id,null);
  const m0=await durable('M0-active',n);
  for(const table of ['revisions','outbox','events','entity_mentions','state_transitions','revision_provenances','mongo','story_plans'])assert.equal(m0[table].length,0,table);
  assert.equal(m0.entities.length,1);assert.equal(m0.facts.length,1);assert.equal(m0.entities[0].static_attributes.mentions,0);
  assert.deepEqual(await http(path,'POST',activate),receipt);
  assert.deepEqual(await durable('M0-replay',n),m0);
  assert.ok(!JSON.stringify(receipt).includes('M0PrivateOnly'));
 }
 let failureTrigger=false;
 try{
  for(const a of [owner,foreign])await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'offline','AUTHOR','ACTIVE')",[a,a+'@example.test','m0-'+a]);
  for(const n of [novel,createNovel])await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'M0 novel',$3,'isolated')",[n,owner,'m0-'+n]);
  await setup(novel);
  const empty=await http(`/novels/${novel}/chapters`,'POST',{title:'First chapter',content:'',clientRequestId:randomUUID()},201);
  assert.equal(empty.analysisRevisionId,null);
  await http(`/chapters/${empty.chapterId}`,'PATCH',{content:'   ',expectedVersion:1},200);
  assert.equal((await durable('empty-not-history')).revisions.length,0);
  const content='Minh gặp Minh. lan.';
  const saved=await http(`/chapters/${empty.chapterId}`,'PATCH',{content,expectedVersion:2},200);
  assert.ok(saved.analysisRevisionId);await poll();
  const first=await durable('M-FIRST-saved');
  assert.equal(first.revisions.length,1);assert.equal(first.outbox.length,1);assert.equal(first.revisions[0].content_hash,createHash('sha256').update(content).digest('hex'));
  assert.equal(first.revisions[0].created_by,owner);assert.equal(first.revisions[0].parent_revision_id,null);assert.equal(first.revisions[0].source_type,'AUTHOR_MANUAL');
  assert.equal(first.story_brains[0].baseline_revision_id,null);assert.equal(first.events.length,0);
  const repeated=await http(`/chapters/${empty.chapterId}`,'PATCH',{content,expectedVersion:2},200);assert.equal(repeated.analysisRevisionId,saved.analysisRevisionId);
  assert.equal((await durable('M-FIRST-identical-retry')).revisions.length,1);
  const run=first.analysis_runs.find((r:any)=>r.operation==='incremental_story_analysis');assert.ok(run);assert.equal(run.entity_candidate_audit.status,'waiting_entity_review');
  const base=`/ai/story-brains/${novel}`;
  const audit=await http(`${base}/entity-candidate-audits/${run.id}`);
  await http(`${base}/entity-reviews/${run.id}/continue`,'POST',{},409);
  const choices=audit.decisions.map((d:any)=>d.verdict==='entity'&&!d.canonical_entity_id?{...d,provisional_identity_key:`${audit.provisional_identity_scope}/${d.candidate_id}`}:d);
  await http(`${base}/entity-reviews/${run.id}/review`,'POST',{expected_version:audit.review_version,decisions:choices});
  await http(`${base}/entity-reviews/${run.id}/continue`,'POST',{});
  const proposals=(await http(`${base}/review-queue`)).filter((p:any)=>p.analysis_run_id===run.id);
  assert.ok(proposals.some((p:any)=>p.proposal_type==='event'));
  assert.ok(proposals.every((p:any)=>p.status==='pending'));
  assert.equal((await durable('M-FIRST-before-author-Canon')).events.length,0);
  const brain=(await pg.query('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1',[novel])).rows[0];
  await http(`/ai/proposal-groups/${proposals[0].dependency_group_id}/accept`,'POST',{proposal_ids:proposals.map((p:any)=>p.proposal_id),expected_brain_version:Number(brain.brain_version)});
  const canon=await durable('M-FIRST-author-approved-Canon');assert.ok(canon.events.length>0);assert.ok(!JSON.stringify(canon.events).includes('FutureOnlyBetrayal'));
  // Real SQL failure rolls revision/outbox back while Mongo remains recoverable.
  await pg.query(`CREATE FUNCTION public.m0_outbox_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.novel_id='${novel}'::uuid THEN RAISE EXCEPTION 'isolated M0 outbox failure'; END IF; RETURN NEW; END $$`);
  await pg.query('CREATE TRIGGER m0_outbox_fail BEFORE INSERT ON revision_outbox_events FOR EACH ROW EXECUTE FUNCTION public.m0_outbox_fail()');failureTrigger=true;
  await http(`/chapters/${empty.chapterId}`,'PATCH',{content:content+' A door opens.',expectedVersion:3},500);
  assert.equal((await durable('failed-outbox-rollback')).revisions.length,1);
  await pg.query('DROP TRIGGER m0_outbox_fail ON revision_outbox_events');await pg.query('DROP FUNCTION public.m0_outbox_fail()');failureTrigger=false;
  const repaired=await http(`/chapters/${empty.chapterId}`,'PATCH',{content:content+' A door opens.',expectedVersion:3});await poll();
  const lineage=await durable('outbox-reconciled');assert.equal(lineage.revisions.length,2);assert.equal(lineage.revisions[1].parent_revision_id,saved.analysisRevisionId);assert.equal(lineage.outbox.length,2);
  const concurrent=await Promise.all([' left',' right'].map(async suffix=>{
   const r=await fetch(`http://127.0.0.1:57114/api/v1/chapters/${empty.chapterId}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({content:content+suffix,expectedVersion:repaired.draftVersion})});return r.status;
  }));assert.deepEqual(concurrent.sort(),[200,409]);await poll();
  assert.equal((await durable('concurrent-CAS')).revisions.length,3);
  await setup(createNovel);
  const createBody={title:'Meaningful create',content:'Minh gặp Minh.',clientRequestId:randomUUID()};
  const created=await http(`/novels/${createNovel}/chapters`,'POST',createBody,201);assert.ok(created.analysisRevisionId);await poll(createNovel);
  const retried=await http(`/novels/${createNovel}/chapters`,'POST',createBody,201);assert.equal(retried.chapterId,created.chapterId);assert.equal(retried.analysisRevisionId,created.analysisRevisionId);
  const createdState=await durable('meaningful-create-and-retry',createNovel);assert.equal(createdState.revisions.length,1);assert.equal(createdState.outbox.length,1);assert.equal(createdState.mongo[0].version,1);
  // A real fake-provider generation is based on the genuine saved revision;
  // no synthetic writing job or source revision is inserted by the fixture.
  const revision=createdState.revisions[0];
  const brainVersion=Number(createdState.story_brains[0].brain_version);
  const genBody={novel_id:createNovel,chapter_id:created.chapterId,revision_id:revision.revision_id,content_hash:revision.content_hash,operation:'continuation',selection:{start:Array.from(createBody.content).length,end:Array.from(createBody.content).length,cursor:Array.from(createBody.content).length},instruction:'Continue the scene.',expected_brain_version:brainVersion,idempotency_key:randomUUID()};
  const generation=await http('/ai/writing/generations','POST',genBody,202);
  let completed:any;
  for(let i=0;i<100;i++){
    completed=await http('/ai/jobs/'+generation.job_id);
    if(['completed','failed'].includes(completed.status))break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(completed.status,'completed');assert.equal(completed.validation_status,'passed');
  const accepted=await http(`/chapters/${created.chapterId}/revisions/accept-draft`,'POST',{generationId:generation.job_id});
  await poll(createNovel);
  const acceptedState=await durable('real-AI-accept-after-genuine-base',createNovel);
  assert.equal(acceptedState.revisions.length,2);assert.equal(acceptedState.revisions[1].source_type,'AI_DRAFT_ACCEPT');assert.equal(acceptedState.revisions[1].parent_revision_id,revision.revision_id);
  // P1's exact-generation retry is an idempotent receipt, not a second accept.
  const repeatedAccept=await http(`/chapters/${created.chapterId}/revisions/accept-draft`,'POST',{generationId:generation.job_id});
  assert.equal(repeatedAccept.revision.revisionId,accepted.revision.revisionId);
  assert.equal((await durable('AI-accept-exact-retry',createNovel)).revisions.length,2);
 }finally{
  if(failureTrigger){await pg.query('DROP TRIGGER IF EXISTS m0_outbox_fail ON revision_outbox_events');await pg.query('DROP FUNCTION IF EXISTS public.m0_outbox_fail()');}
  if(process.env.P204_EVIDENCE_FILE)await writeFile(process.env.P204_EVIDENCE_FILE,JSON.stringify({providers:'fake only',requests,readbacks},null,2));
  server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await disconnectChapterWriter();await disconnectMongo();await disconnectPostgres();
 }
});
