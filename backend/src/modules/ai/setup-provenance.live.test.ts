import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from '../novels/chapter-writer.js';

test('setup-v1 live owner Gateway -> Python -> PostgreSQL immutable readback', {
  skip: process.env.TEST_P2A_LIVE !== '1', timeout: 90000
}, async () => {
  const pg=getPostgresPool(), mongo=getMongoDatabase();
  assert.equal((await pg.query('select current_database() as name')).rows[0].name,'p2a');
  assert.equal(mongo.databaseName,'p2a');
  const [owner,foreign,novel,other,foreignNovel,admin,adminNovel]=Array.from({length:7},()=>randomUUID());
  const token=jwt.sign({sub:owner,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
  const adminToken=jwt.sign({sub:admin,role:'ADMIN'},env.JWT_ACCESS_SECRET);
  const foreignToken=jwt.sign({sub:foreign,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
  const server=createApp().listen(57114,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const evidence: unknown[]=[];
  async function request(path:string,status:number,body?:unknown,actor:string|null=token) {
    const res=await fetch('http://127.0.0.1:57114/api/v1/ai'+path,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor}:{}),
        // Browser-provided tenant/author cannot override the Gateway's trusted scope.
        'X-Tenant-Id':randomUUID(),'X-Author-Id':foreign},body:body===undefined?undefined:JSON.stringify(body)});
    const data:any=await res.json();
    assert.equal(res.status,status,JSON.stringify(data));
    evidence.push({path,status:res.status,code:data.error?.code});return data;
  }
  async function snapshot(stage:string) {
    const result:Record<string,unknown>={};
    for(const table of ['bootstrap_jobs','proposals','analysis_runs','entities','facts','events','state_transitions','revision_provenances']) {
      result[table]=(await pg.query(`SELECT * FROM narrative.${table} WHERE novel_id=$1 ORDER BY id`,[novel])).rows;
    }
    result.plans=(await pg.query('SELECT * FROM narrative.story_plans WHERE novel_id=$1 ORDER BY plan_version',[novel])).rows;
    result.objectives=(await pg.query('SELECT * FROM narrative.story_plan_objectives WHERE novel_id=$1 ORDER BY id',[novel])).rows;
    result.outbox=(await pg.query('SELECT * FROM revision_outbox_events WHERE novel_id=$1 ORDER BY event_id',[novel])).rows;
    result.revisions=(await pg.query('SELECT * FROM chapter_revisions WHERE novel_id=$1',[novel])).rows;
    result.mongo=await mongo.collection('draft_chapters').find({novelId:novel}).toArray();
    const value=JSON.parse(JSON.stringify(result));
    evidence.push({stage,sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex'),
      canonical_sha256:createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='plans'&&k!=='objectives')))).digest('hex'),
      counts:Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,(rows as unknown[]).length]))});
    return value;
  }
  try {
    for(const user of [owner,foreign]) await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','AUTHOR','ACTIVE')",[user,user+'@example.test','p202-'+user]);
    await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','ADMIN','ACTIVE')",[admin,admin+'@example.test','p202-'+admin]);
    await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'foreign setup',$3,'isolated')",[foreignNovel,foreign,'p202-'+foreignNovel]);
    await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'admin owned',$3,'isolated')",[adminNovel,admin,'p202-'+adminNovel]);
    for(const id of [novel,other]) await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'setup test',$3,'isolated')",[id,owner,'p202-'+id]);
    const body={contract_version:'setup-v1',novel_id:novel,mode:'extract',idempotency_key:'source-one',expected_setup_version:0,
      setup:{text:'',declarations:[{declaration_id:'one',entity_type:'character',display_name:'Minh'},
        {declaration_id:'two',entity_type:'character',display_name:'Minh'}],world_rules:[{declaration_id:'rule',text:'No flight'}],initial_conditions:[]},
      outline:'FutureOnly betrays someone in chapter 8',hints:[{name:'HintOnly'}],private_author_notes:['PrivateOnly'],author_constraints:['ConstraintOnly']};
    const path='/story-brains/bootstrap/from-idea';
    await request(path,401,body,null);await request(path,403,body,foreignToken);
    await request(path,422,{...body,novel_id:'invalid-uuid'});
    await request('/story-brains/invalid-uuid/setup',422);
    const created=await request(path,202,body);
    const loaded=await request(`/story-brains/${novel}/setup`,200);
    assert.equal(loaded.data.setup_version,1);assert.equal(loaded.data.snapshot_id,created.data.job_id);
    assert.equal(loaded.data.proposals.length,3);
    assert.equal(new Set(loaded.data.proposals.filter((p:any)=>p.card_type==='entity').map((p:any)=>p.payload.entity_id)).size,2);
    assert.ok(!JSON.stringify(loaded).includes('PrivateOnly'));
    assert.ok(!JSON.stringify(loaded).includes('ConstraintOnly'));
    const adminSource=await request(path,202,{...body,novel_id:adminNovel},adminToken);
    await request(`/story-brains/${adminNovel}/setup`,200,undefined,adminToken);
    await request(`/jobs/${adminSource.data.job_id}`,200,undefined,adminToken);
    // Snapshot creator and current novel owner are separate fences, even for ADMIN.
    await pg.query('UPDATE novels SET author_id=$1 WHERE novel_id=$2',[foreign,adminNovel]);
    await request(`/story-brains/${adminNovel}/setup`,403,undefined,adminToken);
    await request(`/jobs/${adminSource.data.job_id}`,403,undefined,adminToken);
    await request(`/story-brains/${adminNovel}/setup`,404,undefined,foreignToken);
    await request(`/jobs/${adminSource.data.job_id}`,404,undefined,foreignToken);
    await pg.query('UPDATE novels SET author_id=$1 WHERE novel_id=$2',[admin,adminNovel]);
    await request(`/story-brains/${adminNovel}/setup`,200,undefined,adminToken);
    const otherSource=await request(path,202,{...body,novel_id:foreignNovel},foreignToken);
    await request(`/story-brains/${foreignNovel}/setup`,200,undefined,foreignToken);
    await request(`/story-brains/${foreignNovel}/setup`,403);
    await request(`/story-brains/${novel}/setup`,403,undefined,adminToken);
    await request(path,403,{...body,idempotency_key:'admin-forgery'},adminToken);
    await request(`/jobs/${created.data.job_id}`,404,undefined,foreignToken);
    await request(`/jobs/${created.data.job_id}/resume`,404,{},foreignToken);
    await request(`/jobs/${created.data.job_id}`,404,undefined,adminToken);
    await request(`/jobs/${otherSource.data.job_id}`,404);
    await request(`/story-brains/${novel}/setup?snapshot_id=${otherSource.data.job_id}`,404);
    const before=await snapshot('accepted-snapshot-before-rejections');
    assert.equal((await request(path,202,body)).data.job_id,created.data.job_id);
    await request(path,409,{...body,mode:'blueprint'});
    await request(path,409,{...body,idempotency_key:'stale'});
    await request(path,422,{...body,setup:{...body.setup,entities:[]}});
    await request(`/story-brains/${novel}/setup`,403,undefined,foreignToken);
    await request(`/story-brains/${other}/setup?snapshot_id=${created.data.job_id}`,404);
    const job=await request('/jobs/'+created.data.job_id,200);
    assert.ok(!JSON.stringify(job).includes('PrivateOnly'));
    assert.ok(!JSON.stringify(job).includes('ConstraintOnly'));
    assert.ok(!JSON.stringify(job).includes('setup_cards'));
    assert.ok(!JSON.stringify(job).includes('reservation_token'));
    await request(`/jobs/${created.data.job_id}/resume`,202,{});
    const card=loaded.data.proposals[0];
    await request(`/proposal-groups/${card.dependency_group_id}/accept`,409,{expected_brain_version:1,
      proposal_ids:loaded.data.proposals.map((p:any)=>p.proposal_id)});
    await request(`/story-brains/${novel}/baseline/activate`,409,{job_id:created.data.job_id});
    assert.deepEqual(await snapshot('after-rejections'),before);
    for(const table of ['entities','facts','events','state_transitions','revision_provenances','revisions','mongo']) assert.deepEqual(before[table],[]);
    const reviewBody={idempotency_key:'group-review',dependency_group_id:card.dependency_group_id,
      setup_hash:loaded.data.setup_hash,expected_setup_version:1,expected_review_version:0,
      expected_brain_version:loaded.data.brain_version,
      decisions:loaded.data.proposals.map((p:any,i:number)=>({proposal_id:p.proposal_id,
        decision:i===1?'reject':'accept',...(p.card_type==='entity'&&i!==1?{identity:{kind:'new'},
          edited_entity:{canonical_name:'Reviewed Minh',aliases:[]}}:{})}))};
    const reviewPath=`/story-brains/${novel}/setup/${created.data.job_id}/review`;
    await request(reviewPath,401,reviewBody,null);
    await request(reviewPath,403,reviewBody,foreignToken);
    await request(reviewPath,403,reviewBody,adminToken);
    await request(`/story-brains/${other}/setup/${created.data.job_id}/review`,404,reviewBody);
    await request(reviewPath,409,{...reviewBody,decisions:reviewBody.decisions.slice(1)});
    assert.deepEqual(await snapshot('review-negative-after'),before);
    const reviewed=await request(reviewPath,200,reviewBody);
    assert.equal(reviewed.data.status,'review_complete');
    const reviewedSnapshot=await snapshot('review-materialized');
    assert.equal(reviewedSnapshot.entities.length,1);assert.equal(reviewedSnapshot.facts.length,1);
    assert.equal(reviewedSnapshot.entities[0].source_type,'author_setup');
    assert.equal(reviewedSnapshot.entities[0].static_attributes.mentions,0);
    assert.equal(reviewedSnapshot.facts[0].chapter_number,null);
    for(const table of ['events','state_transitions','revision_provenances','revisions','mongo','outbox']) assert.deepEqual(reviewedSnapshot[table],[]);
    assert.deepEqual((await request(reviewPath,200,reviewBody)).data,reviewed.data);
    await request(reviewPath,409,{...reviewBody,expected_brain_version:999});
    assert.deepEqual(await snapshot('review-idempotent-after'),reviewedSnapshot);
    const reviewedLoaded=await request(`/story-brains/${novel}/setup`,200);
    assert.equal(reviewedLoaded.data.proposals[0].status,'accepted');
    assert.equal(reviewedLoaded.data.proposals[0].reviewed_payload.canonical_name,'Reviewed Minh');
    assert.equal(reviewedLoaded.data.proposals[1].status,'rejected');
    assert.ok(!JSON.stringify(reviewedLoaded).includes('PrivateOnly'));
    const planPath=`/story-plans/edit-v1/${novel}`;
    const planBody={contract_version:'plan-edit-v1',action:'save',idempotency_key:'future-plan',expected_plan_version:0,
      source_outline:'Future chapter 8 betrayal',private_notes:'PlanPrivateOnly',objectives:Array.from({length:25},(_,i)=>({
        objective_id:randomUUID(),expected_intent_version:0,target_chapter:i+1,title:`Chapter ${i+1}`,description:'Future goal',
        events:[{event_id:randomUUID(),text:'Planned event',participants:[{name_hint:'Minh'}]}]}))};
    const canonBefore=await snapshot('plan-canon-before');
    assert.equal((await request(planPath,200)).data.head_version,0);
    await request(planPath,403,planBody,foreignToken);await request(planPath,403,planBody,adminToken);
    const planned=(await request(planPath,200,planBody)).data;
    assert.equal(planned.objectives.length,25);assert.ok(!JSON.stringify(planned).includes('PlanPrivateOnly'));
    assert.deepEqual((await request(planPath,200,planBody)).data,planned);
    await request(`/story-plans/${planned.plan_id}`,404,undefined,foreignToken);
    await request(`/story-plans/${planned.plan_id}`,404,undefined,adminToken);
    const legacy=(await request(`/story-plans/${planned.plan_id}`,200)).data;
    assert.ok(!JSON.stringify(legacy).includes('PlanPrivateOnly'));
    await request(`/story-plans/${planned.plan_id}/activate?novel_id=${novel}`,409,{});
    await request(planPath,409,{...planBody,idempotency_key:'stale-plan'});
    const activePlan=(await request(planPath,200,{contract_version:'plan-edit-v1',action:'activate',idempotency_key:'activate-plan',
      expected_plan_version:planned.plan_version,source_plan_id:planned.plan_id})).data;
    assert.equal(activePlan.status,'active');
    const listed=(await request(planPath,200)).data;
    assert.equal(listed.active_plan_id,activePlan.plan_id);assert.equal(listed.plans[0].private_notes,'PlanPrivateOnly');
    const canonAfter=await snapshot('plan-canon-after');
    for(const key of Object.keys(canonBefore))if(key!=='plans'&&key!=='objectives')assert.deepEqual(canonAfter[key],canonBefore[key]);
    assert.equal(canonAfter.plans.filter((p:any)=>p.status==='active').length,1);
    evidence.push({plan_25_objectives:true,plan_private_legacy_redacted:true,plan_canon_unchanged:true});
    const archiveBody={contract_version:'plan-edit-v1',action:'delete',idempotency_key:'archive-active',expected_plan_version:activePlan.plan_version,source_plan_id:activePlan.plan_id};
    const archiveBefore=await snapshot('fix-gateway-archive-before');
    const archived=(await request(planPath,200,archiveBody)).data;
    const archiveRead=(await request(`${planPath}/${activePlan.plan_id}`,200)).data;
    assert.equal(archiveRead.effective_status,'archived');assert.equal(archiveRead.can_activate,false);
    assert.equal(archiveRead.snapshot_status,'active');
    await request(planPath,409,{...archiveBody,idempotency_key:'no-reactivate',action:'activate',expected_plan_version:archived.plan_version});
    assert.deepEqual((await request(planPath,200,archiveBody)).data,archived);
    const restoreBody={...planBody,action:'fork',idempotency_key:'restore-archive',expected_plan_version:archived.plan_version,source_plan_id:activePlan.plan_id,
      objectives:activePlan.objectives.map((o:any)=>{const {intent_version,...fields}=o;return {...fields,expected_intent_version:intent_version};})};
    const restored=(await request(planPath,200,restoreBody)).data;
    assert.equal(restored.status,'draft');assert.notEqual(restored.plan_id,activePlan.plan_id);
    assert.equal((await request(`${planPath}/${activePlan.plan_id}`,200)).data.effective_status,'archived');
    const archiveAfter=await snapshot('fix-gateway-archive-after');
    for(const key of Object.keys(archiveBefore))if(key!=='plans'&&key!=='objectives')assert.deepEqual(archiveAfter[key],archiveBefore[key]);
    const legacyId=randomUUID();
    await pg.query(`INSERT INTO narrative.story_plans(id,tenant_id,novel_id,plan_version,status,source_outline,source_outline_hash,input_hash,created_by,edit_metadata)
      VALUES($1,'00000000-0000-0000-0000-000000000001',$2,1,'draft','LegacyOutlinePrivate','','',NULL,'{"private_notes":"LegacyPrivateOnly"}'::jsonb)`,[legacyId,other]);
    const legacyBefore=(await pg.query('SELECT * FROM narrative.story_plans WHERE id=$1',[legacyId])).rows[0];
    const coexistPath=`/story-plans/edit-v1/${other}`;
    assert.deepEqual((await request(coexistPath,200)).data.plans,[]);
    await request(`/story-plans/${legacyId}`,404);
    await request(`/story-plans/${legacyId}`,200,undefined,adminToken); // Pinned legacy read-only ADMIN exception.
    const coexistBody={...planBody,idempotency_key:'coexist',expected_plan_version:1,
      objectives:planBody.objectives.map((o:any)=>({...o,objective_id:randomUUID(),events:o.events.map((e:any)=>({...e,event_id:randomUUID()}))}))};
    const coexist=(await request(coexistPath,200,coexistBody)).data;
    assert.equal(coexist.plan_version,2);
    await request(coexistPath,403,undefined,foreignToken);await request(coexistPath,403,undefined,adminToken);
    await request(`${coexistPath}/${legacyId}`,404);
    const coexistActive=(await request(coexistPath,200,{contract_version:'plan-edit-v1',action:'activate',idempotency_key:'coexist-active',expected_plan_version:2,source_plan_id:coexist.plan_id})).data;
    assert.equal(coexistActive.plan_version,3);
    await request(`/story-plans/by-novel/${other}/active`,200);
    const coexistRead=(await request(coexistPath,200)).data;
    assert.equal(coexistRead.plans.length,2);assert.ok(!JSON.stringify(coexistRead).includes('LegacyPrivateOnly'));assert.ok(!JSON.stringify(coexistRead).includes('LegacyOutlinePrivate'));
    const legacyAfter=(await pg.query('SELECT * FROM narrative.story_plans WHERE id=$1',[legacyId])).rows[0];
    assert.deepEqual(legacyAfter,legacyBefore);
    evidence.push({stage:'fix-gateway-legacy-coexist',legacy_before:legacyBefore,legacy_after:legacyAfter,visible_ids:coexistRead.plans.map((p:any)=>p.plan_id),head_version:coexistRead.head_version});
    // Unsupported free prose fails visibly and stores an auditable failed version.
    const failed=await request(path,503,{...body,idempotency_key:'unsupported',expected_setup_version:1,
      setup:{...body.setup,text:'Natural prose unsupported by the offline fixture grammar'}});
    assert.equal(failed.error.code,'SETUP_EXTRACT_PROVIDER_UNAVAILABLE');
    const latest=await request(`/story-brains/${novel}/setup`,200);
    assert.equal(latest.data.setup_version,2);assert.equal(latest.data.job_status,'failed');
    assert.deepEqual((await request(`/story-brains/${novel}/setup?snapshot_id=${created.data.job_id}`,200)).data,reviewedLoaded.data);
    evidence.push({homonym_candidate_ids_distinct:true,private_readbacks_redacted:true,history_unchanged:true,
      failed_source_preserved:true,source_version:2});
  } finally {
    if(process.env.P202_EVIDENCE_FILE) await writeFile(process.env.P202_EVIDENCE_FILE,JSON.stringify(evidence,null,2));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await disconnectChapterWriter();await disconnectMongo();await disconnectPostgres();
  }
});
