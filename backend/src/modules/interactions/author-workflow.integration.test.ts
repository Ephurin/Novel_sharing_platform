import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';

test('author workflow: draft privacy, conflicts, revisions, idempotent imports, lifecycle and onboarding', { skip: process.env.RUN_AUTHOR_WORKFLOW_TESTS !== '1' }, async () => {
  const schema = 'comments_' + randomUUID().replaceAll('-', '');
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  let closePostgres: (() => Promise<void>) | undefined, closeMongo: (() => Promise<void>) | undefined;
  let dropMongo: (() => Promise<boolean>) | undefined;
  let server: import('node:http').Server | undefined;
  try {
    await adminPool.query(`create schema "${schema}"`);
    const dbUrl = new URL(process.env.DATABASE_URL!); dbUrl.searchParams.set('options', `-c search_path=${schema},public`); process.env.DATABASE_URL=dbUrl.href;
    const mongoUrl=new URL(process.env.MONGODB_URI!); mongoUrl.pathname='/'+schema; process.env.MONGODB_URI=mongoUrl.href;
    const pg=await import('../../core/database/postgres.js'), mongo=await import('../../core/database/mongo.js');
    closePostgres=pg.disconnectPostgres; closeMongo=mongo.disconnectMongo; dropMongo=()=>mongo.getMongoDatabase().dropDatabase();
    const pool=pg.getPostgresPool();
    for(const name of ['001_auth_user_wallet','002_novels','003_chapters','004_content_control','005_reports_description','006_reading_interactions','007_wallet_transactions','008_authoring_context','009_chapter_revisions','010_analysis_outbox','011_outbox_claim_token','012_reports_unique_open','012_novel_engagement','013_novel_review_text','014_novel_editorial_metadata','015_author_workflow','016_author_launch_checklist']) await pool.query(await readFile(new URL(`../../core/database/migrations/${name}.sql`,import.meta.url),'utf8'));
    const author=randomUUID(),reader=randomUUID(),other=randomUUID(),admin=randomUUID(),outsider=randomUUID();
    for(const [id,role] of [[author,'AUTHOR'],[reader,'READER'],[other,'READER'],[admin,'ADMIN'],[outsider,'AUTHOR']]) {
      await pool.query(`insert into users (user_id,email,username,password_hash,role) values ($1::uuid,$2,$1::text,'hash',$3)`,[id,id+'@test.invalid',role]);
      await pool.query('insert into user_profiles (user_id,display_name) values ($1,$2)',[id,'Account '+role]);
    }
    const novel=(await pool.query("insert into novels (author_id,title,slug,synopsis,status) values ($1,'Comments','comments','Test synopsis','PUBLISHED') returning novel_id",[author])).rows[0].novel_id;
    const chapter=(await pool.query("insert into chapters (novel_id,chapter_number,title,status) values ($1,1,'Chapter','PUBLISHED') returning chapter_id",[novel])).rows[0].chapter_id;
    const draft=(await pool.query("insert into chapters (novel_id,chapter_number,title,status) values ($1,2,'Draft','DRAFT') returning chapter_id",[novel])).rows[0].chapter_id;
    const repo=await import('./comments.repository.js'); await repo.ensureCommentIndexes();
    const {createApp}=await import('../../app.js'),jwt=(await import('jsonwebtoken')).default,{env}=await import('../../core/config/env.js');
    server=createApp().listen(0);await new Promise<void>(r=>server!.once('listening',r));
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
    const token=(id:string,role='READER')=>jwt.sign({sub:id,role},env.JWT_ACCESS_SECRET);
    const readerToken=token(reader),otherToken=token(other),authorToken=token(author,'AUTHOR'),adminToken=token(admin,'ADMIN'),outsiderToken=token(outsider,'AUTHOR');
    async function req(path:string,method='GET',body?:unknown,auth?:string){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.status===204?null:await r.json() as any};}

    const drafts=await import('../novels/draft-chapters.repository.js'); await drafts.ensureDraftChapterIndexes();
    await pool.query("update chapters set content='VIP secret',is_vip=true,price_coins=10 where chapter_id=$1",[chapter]);
    await drafts.upsertDraftChapter({chapterId:draft,novelId:novel,authorId:author,title:'Private',content:'private prose',wordCount:2,autosave:false});
    const cp='/novels/'+novel+'/chapters',dp='/chapters/'+draft;
    const pub=await req(cp);assert.equal(pub.status,200);assert.equal(pub.body.data.length,1);assert.equal(pub.body.data[0].content,null);
    assert.equal((await req('/chapters/'+chapter)).status,401);
    for(const t of [outsiderToken,readerToken])assert.equal((await req(dp,'GET',undefined,t)).status,403);
    assert.equal((await req('/reading/chapters/'+chapter)).status,402);
    assert.equal((await req('/reading/chapters/'+chapter,'GET',undefined,authorToken)).status,200);
    assert.equal((await req('/reading/chapters/'+chapter,'GET',undefined,outsiderToken)).status,402);
    const privateId=(await pool.query("insert into novels(author_id,title,slug,synopsis) values($1,'Private','private','Private') returning novel_id",[author])).rows[0].novel_id;
    assert.equal((await req('/novels/'+privateId)).status,404);assert.equal((await req('/novels/'+privateId+'/chapters')).status,404);
    assert.equal((await req('/novels/'+privateId,'GET',undefined,authorToken)).status,200);
    assert.equal((await req('/novels?status=DRAFT')).status,403);
    const version=(await req(dp,'GET',undefined,authorToken)).body.data.draft.version;
    assert.equal((await req(dp,'PATCH',{content:'missing version'},authorToken)).status,428);
    const writes=await Promise.all(['first prose','second prose'].map(content=>req(dp,'PATCH',{content,expectedVersion:version},authorToken)));
    assert.deepEqual(writes.map(x=>x.status).sort(),[200,409]);
    const saved=(await req(dp,'GET',undefined,authorToken)).body.data;
    assert.ok(['first prose','second prose'].includes(saved.draft.content));
    assert.equal((await req(dp,'PATCH',{content:'',expectedVersion:saved.draft.version},authorToken)).status,200);
    assert.equal((await req(dp+'/submit-publish','POST',{},authorToken)).status,409);
    assert.equal((await req(dp+'/revisions/snapshot','POST',{content:'historical prose'},authorToken)).status,201);
    assert.equal((await req(dp,'GET',undefined,authorToken)).body.data.draft.content,'');
    const bootstrap = await req(dp+'/revisions/snapshot','POST',{content:'bootstrap provenance',purpose:'MANUSCRIPT_BOOTSTRAP'},authorToken);
    assert.equal(bootstrap.status,201);
    assert.equal((await req(dp,'GET',undefined,authorToken)).body.data.draft.content,'');
    assert.equal((await pool.query('select source_type from chapter_revisions where revision_id=$1',[bootstrap.body.data.revisionId])).rows[0].source_type,'BOOTSTRAP');
    assert.equal((await pool.query('select count(*)::int as total from revision_outbox_events where revision_id=$1',[bootstrap.body.data.revisionId])).rows[0].total,0);
    assert.equal((await req(dp+'/revisions','GET',undefined,outsiderToken)).status,403);
    const payload={title:'Imported',content:'Import test',clientRequestId:'batch-one'};
    const imported=await req(cp,'POST',payload,authorToken);assert.equal(imported.status,201);
    const repeated=await req(cp,'POST',payload,authorToken);assert.equal(repeated.status,201);assert.equal(repeated.body.data.chapterId,imported.body.data.chapterId);
    assert.equal((await req(cp,'POST',{...payload,content:'Changed'},authorToken)).status,409);
    const id=imported.body.data.chapterId,order='/novels/'+novel+'/chapter-order';
    assert.equal((await req(order,'PUT',{chapterIds:[draft,chapter]},authorToken)).status,409);
    assert.equal((await req(order,'PUT',{chapterIds:[id,draft,chapter]},authorToken)).status,200);
    assert.equal((await req('/chapters/'+id+'/archive','POST',{},outsiderToken)).status,403);
    for(const action of ['archive','restore','archive'])assert.equal((await req('/chapters/'+id+'/'+action,'POST',{},authorToken)).status,200);
    assert.equal((await req('/chapters/'+id,'DELETE',undefined,authorToken)).status,200);
    assert.equal((await req(cp,'POST',{title:'Next',content:'New prose'},authorToken)).status,201);
    // Approved comments deliver to authors; replies deliver to their reader, with crash-safe retry IDs.
    const notifications=await import('./notifications.repository.js');await notifications.ensureNotificationIndexes();
    const delivery=await import('./domain-notifications.js');
    const comment=await req('/novels/'+novel+'/comments','POST',{content:'Reader feedback'},readerToken);assert.equal(comment.status,201);
    await delivery.deliverDomainNotifications();
    let inbox=await notifications.listNotifications(author,{page:1,limit:100});assert.equal(inbox.totalItems,1);
    assert.equal(inbox.items[0].type,'READER_COMMENT');
    await notifications.markNotificationRead(author,inbox.items[0].notificationId);
    await mongo.getMongoDatabase().collection('comments').updateOne({commentId:comment.body.data.commentId},{$set:{notificationPending:true}});
    await delivery.deliverDomainNotifications();inbox=await notifications.listNotifications(author,{page:1,limit:100});assert.equal(inbox.totalItems,1);assert.equal(inbox.items[0].status,'READ');
    assert.equal((await req('/comments/'+comment.body.data.commentId+'/replies','POST',{content:'Author reply'},authorToken)).status,201);
    await delivery.deliverDomainNotifications();assert.equal((await notifications.listNotifications(reader,{page:1,limit:100})).items[0].type,'AUTHOR_REPLY');
    // Purchased chapters cannot be archived or deleted.
    await pool.query('insert into wallets(user_id) values($1),($2)',[author,reader]);
    const tx=(await pool.query("insert into transactions(wallet_id,type,status,amount_coins) select wallet_id,'UNLOCK','SUCCESS',10 from wallets where user_id=$1 returning transaction_id",[reader])).rows[0].transaction_id;
    await pool.query('insert into chapter_unlocks(user_id,chapter_id,transaction_id) values($1,$2,$3)',[reader,chapter,tx]);
    assert.equal((await req('/chapters/'+chapter+'/archive','POST',{},authorToken)).status,409);
    const joined=await req('/auth/become-author','POST',{},readerToken);assert.equal(joined.status,200);assert.equal(joined.body.data.user.role,'AUTHOR');
    await pool.query("update users set status='LOCKED' where user_id=$1",[author]);
    assert.equal((await req(dp,'GET',undefined,authorToken)).status,403);
    assert.equal((await req('/auth/become-author','POST',{},authorToken)).status,403);
  } finally {
    if(server) {server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
    if(dropMongo)await dropMongo();if(closeMongo)await closeMongo();if(closePostgres)await closePostgres();
    await adminPool.query('drop schema if exists "'+schema+'" cascade');await adminPool.end();
  }
});
