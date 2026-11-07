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
  const [owner,foreign,novel,other,foreignNovel,admin]=Array.from({length:6},()=>randomUUID());
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
    result.revisions=(await pg.query('SELECT * FROM chapter_revisions WHERE novel_id=$1',[novel])).rows;
    result.mongo=await mongo.collection('draft_chapters').find({novelId:novel}).toArray();
    const value=JSON.parse(JSON.stringify(result));
    evidence.push({stage,sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex'),
      counts:Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,(rows as unknown[]).length]))});
    return value;
  }
  try {
    for(const user of [owner,foreign]) await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','AUTHOR','ACTIVE')",[user,user+'@example.test','p202-'+user]);
    await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','ADMIN','ACTIVE')",[admin,admin+'@example.test','p202-'+admin]);
    await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'foreign setup',$3,'isolated')",[foreignNovel,foreign,'p202-'+foreignNovel]);
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
    // Unsupported free prose fails visibly and stores an auditable failed version.
    const failed=await request(path,503,{...body,idempotency_key:'unsupported',expected_setup_version:1,
      setup:{...body.setup,text:'Natural prose unsupported by the offline fixture grammar'}});
    assert.equal(failed.error.code,'SETUP_EXTRACT_PROVIDER_UNAVAILABLE');
    const latest=await request(`/story-brains/${novel}/setup`,200);
    assert.equal(latest.data.setup_version,2);assert.equal(latest.data.job_status,'failed');
    assert.deepEqual((await request(`/story-brains/${novel}/setup?snapshot_id=${created.data.job_id}`,200)).data,loaded.data);
    evidence.push({homonym_candidate_ids_distinct:true,private_readbacks_redacted:true,history_unchanged:true,
      failed_source_preserved:true,source_version:2});
  } finally {
    if(process.env.P202_EVIDENCE_FILE) await writeFile(process.env.P202_EVIDENCE_FILE,JSON.stringify(evidence,null,2));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await disconnectChapterWriter();await disconnectMongo();await disconnectPostgres();
  }
});
