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

test('A16 live Gateway/Python: active bootstrap rejection preserves PG/Mongo and next P1 save/outbox', {
  skip: process.env.TEST_P2A_LIVE !== '1', timeout: 90_000
}, async () => {
  const pg = getPostgresPool(), mongo = getMongoDatabase();
  assert.equal((await pg.query('select current_database() as name')).rows[0].name, 'p2a');
  assert.equal(mongo.databaseName, 'p2a');
  const [owner, foreign, novel, chapter, revision, brain, entity] = Array.from({length:7}, () => randomUUID());
  const content = 'Minh stands here.';
  const hash = createHash('sha256').update(content).digest('hex');
  const server = createApp().listen(57114, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const base = 'http://127.0.0.1:57114/api/v1';
  const token = jwt.sign({sub:owner,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
  const foreignToken = jwt.sign({sub:foreign,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
  const requests: unknown[] = [], readbacks: unknown[] = [];
  async function request(path:string, body:unknown, expected:number, actor:string|null=token, method='POST') {
    const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor}:{})},body:JSON.stringify(body)});
    const response:any=await res.json();
    requests.push({path,method,body,status:res.status,response,actor:actor===token?'owner':actor===foreignToken?'foreign':'anonymous'});
    assert.equal(res.status,expected,JSON.stringify(response));
    return response;
  }
  async function snapshot(stage:string) {
    const data:Record<string,unknown>={};
    const tables=(await pg.query("SELECT table_name FROM information_schema.columns WHERE table_schema='narrative' AND column_name IN ('tenant_id','novel_id') GROUP BY table_name HAVING count(*)=2")).rows;
    for(const {table_name} of tables) data[table_name]=(await pg.query(`SELECT * FROM narrative.${table_name} WHERE novel_id=$1 ORDER BY 1`,[novel])).rows;
    data.decisions=(await pg.query('SELECT d.* FROM narrative.proposal_decisions d JOIN narrative.proposals p ON p.id=d.proposal_id WHERE p.novel_id=$1 ORDER BY d.id',[novel])).rows;
    data.revisions=(await pg.query('SELECT * FROM chapter_revisions WHERE novel_id=$1 ORDER BY revision_id',[novel])).rows;
    data.outbox=(await pg.query('SELECT * FROM revision_outbox_events WHERE novel_id=$1 ORDER BY event_id',[novel])).rows;
    data.chapters=(await pg.query('SELECT * FROM chapters WHERE novel_id=$1 ORDER BY chapter_id',[novel])).rows;
    data.mongo=await mongo.collection('draft_chapters').find({novelId:novel}).sort({_id:1}).toArray();
    const value=JSON.parse(JSON.stringify(data)); readbacks.push({stage,data:value});return value;
  }
  try {
    for(const user of [owner,foreign]) await pg.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','AUTHOR','ACTIVE')",[user,user+'@example.test','p2a-'+user]);
    await pg.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'P2a owned',$3,'isolated')",[novel,owner,'p2a-'+novel]);
    await pg.query("INSERT INTO chapters(chapter_id,novel_id,chapter_number,title,content,word_count) VALUES($1,$2,1,'Original',$3,3)",[chapter,novel,content]);
    await pg.query("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES($1,$2,$3,$4,$5,3,'AUTHOR_MANUAL',$6)",[revision,novel,chapter,hash,content,owner]);
    await pg.query('UPDATE chapters SET latest_revision_id=$1 WHERE chapter_id=$2',[revision,chapter]);
    await pg.query("INSERT INTO narrative.story_brains(id,tenant_id,novel_id,status,baseline_revision_id,brain_version,schema_version) VALUES($1,'00000000-0000-0000-0000-000000000001',$2,'active',$3,5,1)",[brain,novel,revision]);
    await pg.query("INSERT INTO narrative.entities(id,story_brain_id,tenant_id,novel_id,entity_type,canonical_name,normalized_name,confirmation_status,static_attributes,source_type,is_locked) VALUES($1,$2,'00000000-0000-0000-0000-000000000001',$3,'PER','Minh','minh','confirmed','{}','author',false)",[entity,brain,novel]);
    await mongo.collection('draft_chapters').insertOne({chapterId:chapter,novelId:novel,authorId:owner,title:'Original',content,wordCount:3,version:1,autosave:false,createdAt:new Date(),updatedAt:new Date()});
    for(const baseline of [revision,null]) {
      await pg.query('UPDATE narrative.story_brains SET baseline_revision_id=$1 WHERE id=$2',[baseline,brain]);
      const before=await snapshot('active-'+(baseline?'P1':'setup')+'-before');
      for(const entry of ['idea','manuscript']) {
        const body=entry==='idea'?{novel_id:novel,idea:'Distinct new setup'}:{novel_id:novel,revisions:[{chapter_id:chapter,revision_id:revision,content_hash:hash}]};
        await request('/ai/story-brains/bootstrap/from-'+entry,body,401,null);
        await request('/ai/story-brains/bootstrap/from-'+entry,body,403,foreignToken);
        await request('/ai/story-brains/bootstrap/from-'+entry,{...body,novel_id:randomUUID()},404);
        const response=await request('/ai/story-brains/bootstrap/from-'+entry,body,409);
        assert.equal(response.error.code,'ALREADY_ACTIVE');
        assert.deepEqual(await snapshot('rejected-'+entry+'-'+(baseline?'P1':'setup')),before);
      }
    }
    await pg.query('UPDATE narrative.story_brains SET baseline_revision_id=$1 WHERE id=$2',[revision,brain]);
    const saved=await request('/chapters/'+chapter,{content:'Minh stands here. The door opens.',expectedVersion:1,autosave:true},200,token,'PATCH');
    assert.ok(saved.data);
    let rows:any[]=[];
    for(let i=0;i<100;i++) {
      rows=(await pg.query('SELECT * FROM revision_outbox_events WHERE novel_id=$1',[novel])).rows;
      if(rows.length===1 && rows[0].status==='COMPLETED') break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(rows.length,1);assert.equal(rows[0].status,'COMPLETED');
    const after=await snapshot('normal-P1-save-after-rejections');
    assert.equal(after.revisions.length,2);assert.equal(after.mongo[0].version,2);
    assert.equal(after.story_brains[0].status,'active');assert.equal(after.story_brains[0].brain_version,'5');
    assert.equal(after.entities[0].id,entity);
  } finally {
    if(process.env.P2A_EVIDENCE_FILE) await writeFile(process.env.P2A_EVIDENCE_FILE,JSON.stringify({requests,readbacks,providers:'none/offline; no live AI'},null,2));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await disconnectChapterWriter();await disconnectMongo();await disconnectPostgres();
  }
});
