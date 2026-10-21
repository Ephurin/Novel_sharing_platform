import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';

test('author launch checklist: scheduled publication, profile metadata, notifications and comment reports', { skip: process.env.RUN_AUTHOR_WORKFLOW_TESTS !== '1' }, async () => {
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
    for(const name of ['001_auth_user_wallet','002_novels','003_chapters','004_content_control','005_reports_description','006_reading_interactions','007_wallet_transactions','008_authoring_context','009_chapter_revisions','010_analysis_outbox','011_outbox_claim_token','012_novel_engagement','013_novel_review_text','014_novel_editorial_metadata','015_author_workflow','016_author_launch_checklist']) await pool.query(await readFile(new URL(`../../core/database/migrations/${name}.sql`,import.meta.url),'utf8'));
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


    const drafts=await import('../novels/draft-chapters.repository.js');await drafts.ensureDraftChapterIndexes();
    const scheduler=await import('../novels/chapter-schedules.js');
    const create=async(content='Scheduled text')=>{const r=await req('/novels/'+novel+'/chapters','POST',{title:'Scheduled chapter',content},authorToken);assert.equal(r.status,201);return r.body.data.chapterId as string;};
    const data=async(id:string)=>(await req('/chapters/'+id,'GET',undefined,authorToken)).body.data;
    const plan=async(id:string)=>({scheduledAt:new Date(Date.now()+3600000).toISOString(),expectedVersion:(await data(id)).draft.version});
    const due=async(id:string)=>pool.query("update chapter_publication_schedules set scheduled_at=now()-interval '1 second' where chapter_id=$1",[id]);
    const profile='/users/me/profile';
    assert.equal((await req(profile,'PATCH',{displayName:'Pen name',bannerUrl:'https://example.com/banner.png',publishingSchedule:'Thứ Tư, 20:00',bio:'Biography'},authorToken)).status,200);
    const publicProfile=(await req('/authors/'+author+'/profile')).body.data;
    assert.equal(publicProfile.displayName,'Pen name');assert.equal(publicProfile.bannerUrl,'https://example.com/banner.png');assert.equal(publicProfile.publishingSchedule,'Thứ Tư, 20:00');
    await req(profile,'PATCH',{bio:null},authorToken);assert.equal((await req(profile,'GET',undefined,authorToken)).body.data.bio,null);
    assert.equal((await req(profile,'GET',undefined,authorToken)).body.data.bannerUrl,'https://example.com/banner.png');
    await req(profile,'PATCH',{bannerUrl:null,publishingSchedule:null},authorToken);assert.equal((await req('/authors/'+author+'/profile')).body.data.bannerUrl,null);
    assert.equal((await req(profile,'PATCH',{bannerUrl:'javascript:alert(1)'},authorToken)).status,400);
    const id=await create(),schedule='/chapters/'+id+'/schedule',payload=await plan(id);
    assert.equal((await req(schedule,'POST',payload)).status,401);
    assert.equal((await req(schedule,'POST',payload,readerToken)).status,403);
    assert.equal((await req(schedule,'POST',payload,outsiderToken)).status,403);
    assert.equal((await req(schedule,'POST',{...payload,scheduledAt:new Date(0).toISOString()},authorToken)).status,400);
    assert.equal((await req(schedule,'POST',{...payload,expectedVersion:0},authorToken)).status,409);
    assert.equal((await req(schedule,'POST',payload,authorToken)).status,200);
    assert.equal((await data(id)).publicationSchedule.status,'PENDING');
    assert.equal((await req('/reading/chapters/'+id)).status,404);
    await scheduler.publishDueChapters();assert.equal((await data(id)).status,'DRAFT');
    await due(id);await Promise.all([scheduler.publishDueChapters(),scheduler.publishDueChapters()]);
    assert.equal((await data(id)).status,'PUBLISHED');assert.equal((await data(id)).publicationSchedule.status,'PUBLISHED');
    assert.equal((await req('/reading/chapters/'+id)).body.data.content,'Scheduled text');
    await scheduler.publishDueChapters();assert.equal((await pool.query("select count(*)::int as n from notification_events where type='CHAPTER_SCHEDULE'")).rows[0].n,1);
    const cancelled=await create();assert.equal((await req('/chapters/'+cancelled+'/schedule','POST',await plan(cancelled),authorToken)).status,200);
    assert.equal((await req('/chapters/'+cancelled+'/schedule','DELETE',undefined,authorToken)).status,200);await due(cancelled);await scheduler.publishDueChapters();assert.equal((await data(cancelled)).status,'DRAFT');
    const edited=await create();await req('/chapters/'+edited+'/schedule','POST',await plan(edited),authorToken);
    const version=(await data(edited)).draft.version;await req('/chapters/'+edited,'PATCH',{content:'New draft',expectedVersion:version},authorToken);assert.equal((await data(edited)).publicationSchedule.status,'CANCELLED');await due(edited);await scheduler.publishDueChapters();assert.equal((await data(edited)).status,'DRAFT');
    const empty=await create('');assert.equal((await req('/chapters/'+empty+'/schedule','POST',await plan(empty),authorToken)).status,400);
    // Scheduled publication uses normal moderation and pins the exact submitted version.
    await pool.query("insert into content_filter_rules(name,pattern,category,severity) values('Scheduled rule','flagged-schedule','test','HIGH')");
    const moderated=await create('flagged-schedule original content');
    await req('/reports','POST',{targetType:'CHAPTER',targetId:moderated,reason:'Separate report workflow'},readerToken);
    await req('/chapters/'+moderated+'/schedule','POST',await plan(moderated),authorToken);await due(moderated);await scheduler.publishDueChapters();
    const pending=await data(moderated);assert.equal(pending.status,'PENDING_MODERATION');assert.equal(pending.publicationSchedule.status,'PENDING_MODERATION');
    const review=(await pool.query('select moderation_review_id from chapter_publication_schedules where chapter_id=$1',[moderated])).rows[0].moderation_review_id;
    await req('/chapters/'+moderated,'PATCH',{content:'Unreviewed new draft',expectedVersion:pending.draft.version},authorToken);
    assert.equal((await req('/admin/moderation/reviews/'+review+'/resolve','POST',{decision:'APPROVED'},adminToken)).status,200);
    const approved=await data(moderated);assert.equal(approved.content,'flagged-schedule original content');assert.equal(approved.draft.content,'Unreviewed new draft');assert.equal(approved.publicationSchedule.status,'PUBLISHED');
    // An older review cannot overwrite a newer version that has already passed publication.
    const stale=await create('flagged-schedule stale submission');await req('/chapters/'+stale+'/schedule','POST',await plan(stale),authorToken);await due(stale);await scheduler.publishDueChapters();
    const staleDraft=await data(stale);const oldReview=(await pool.query('select moderation_review_id from chapter_publication_schedules where chapter_id=$1',[stale])).rows[0].moderation_review_id;
    assert.equal((await req('/chapters/'+stale+'/archive','POST',{},authorToken)).status,409);
    await req('/chapters/'+stale,'PATCH',{content:'Clean new version',expectedVersion:staleDraft.draft.version},authorToken);
    assert.equal((await req('/chapters/'+stale+'/submit-publish','POST',{},authorToken)).status,200);
    assert.equal((await req('/admin/moderation/reviews/'+oldReview+'/resolve','POST',{decision:'APPROVED'},adminToken)).status,409);
    assert.equal((await data(stale)).content,'Clean new version');assert.equal((await data(stale)).publicationSchedule.status,'CANCELLED');
    // New reader interactions and income each create durable, recipient-scoped events.
    assert.equal((await req('/novels/'+novel+'/rating','PUT',{score:8,review:'Reader review'},readerToken)).status,200);
    await req('/novels/'+novel+'/rating','PUT',{score:8,review:'Reader review'},readerToken);
    await req('/novels/'+novel+'/follow','PUT',{},readerToken);await req('/novels/'+novel+'/follow','PUT',{},readerToken);
    assert.equal((await req('/authors/'+author+'/follow','POST',{},readerToken)).status,200);
    assert.equal((await req('/authors/'+author+'/follow','POST',{},readerToken)).status,409);
    await pool.query("update users set status='LOCKED' where user_id=$1",[reader]);
    assert.equal((await req('/authors/'+author+'/follow','POST',{},readerToken)).status,403);
    await pool.query("update users set status='ACTIVE' where user_id=$1",[reader]);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where type='READER_REVIEW'")).rows[0].n,1);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where type='NOVEL_FOLLOW'")).rows[0].n,1);
    await pool.query('insert into wallets(user_id,coins_balance) values($1,100),($2,0)',[reader,author]);
    const wallet=await import('../wallet/wallet.repository.js');await wallet.donateToAuthor(reader,author,{amountCoins:10});
    await pool.query('update chapters set is_vip=true,price_coins=5 where chapter_id=$1',[chapter]);
    const paid=(await pool.query('select c.*,n.author_id from chapters c join novels n on n.novel_id=c.novel_id where chapter_id=$1',[chapter])).rows[0];
    await wallet.unlockChapter(reader,paid);await wallet.unlockChapter(reader,paid);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where type='AUTHOR_INCOME'")).rows[0].n,2);
    const notifications=await import('./notifications.repository.js');await notifications.ensureNotificationIndexes();
    const delivery=await import('./domain-notifications.js');await delivery.deliverDomainNotifications();
    const inbox=await notifications.listNotifications(author,{page:1,limit:100});const types=new Set(inbox.items.map(item=>item.type));
    for(const type of ['READER_REVIEW','NOVEL_FOLLOW','AUTHOR_FOLLOW','AUTHOR_INCOME','CHAPTER_SCHEDULE'])assert.ok(types.has(type),type);
    await delivery.deliverDomainNotifications();assert.equal((await notifications.listNotifications(author,{page:1,limit:100})).totalItems,inbox.totalItems);
    assert.equal((await notifications.listNotifications(outsider,{page:1,limit:100})).totalItems,0);
    // The author's shared comment thread exposes reporting as well as replying/deleting.
    const comment=await req('/chapters/'+chapter+'/comments','POST',{content:'Reader chapter comment'},readerToken);
    assert.equal((await req('/reports','POST',{targetType:'COMMENT',targetId:comment.body.data.commentId,reason:'Checklist report'},authorToken)).status,201);
    const locked=await create();await req('/chapters/'+locked+'/schedule','POST',await plan(locked),authorToken);await due(locked);
    await pool.query("update users set status='LOCKED' where user_id=$1",[author]);await scheduler.publishDueChapters();assert.equal((await pool.query('select status from chapter_publication_schedules where chapter_id=$1',[locked])).rows[0].status,'FAILED');
    assert.equal((await req(profile,'PATCH',{bio:'Blocked'},authorToken)).status,403);
  } finally {
    if(server) {server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
    if(dropMongo)await dropMongo();if(closeMongo)await closeMongo();if(closePostgres)await closePostgres();
    await adminPool.query('drop schema if exists "'+schema+'" cascade');await adminPool.end();
  }
});
