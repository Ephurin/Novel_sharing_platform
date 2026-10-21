import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';

test('novel/chapter comments: permissions, moderation, pagination and isolation', { skip: process.env.RUN_COMMENT_TESTS !== '1' }, async () => {
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
    for(const name of ['001_auth_user_wallet','002_novels','003_chapters','004_content_control','005_reports_description','006_reading_interactions','012_novel_engagement','013_novel_review_text','014_novel_editorial_metadata','015_author_workflow','016_author_launch_checklist']) await pool.query(await readFile(new URL(`../../core/database/migrations/${name}.sql`,import.meta.url),'utf8'));
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
    const n='/novels/'+novel+'/comments',c='/chapters/'+chapter+'/comments';
    assert.equal((await req(n,'POST',{content:'guest'})).status,401);
    for(const content of ['', '   ', 'x'.repeat(2001)])assert.equal((await req(n,'POST',{content},readerToken)).status,400);
    assert.equal((await req('/chapters/'+draft+'/comments')).status,404);
    const created=await req(n,'POST',{content:'  Hello novel  '},readerToken);assert.equal(created.status,201);assert.equal(created.body.data.status,'APPROVED');const id=created.body.data.commentId;
    const list=await req(n);assert.equal(list.body.data[0].content,'Hello novel');assert.equal(list.body.data[0].displayName,'Account READER');assert.equal(list.body.data[0].chapterId,null);assert.equal(list.body.data[0].email,undefined);
    assert.equal((await req(c)).body.meta.totalItems,0);
    assert.equal((await req(n+'/manage')).status,401);
    assert.equal((await req(n+'/manage','GET',undefined,readerToken)).status,403);
    assert.equal((await req(n+'/manage','GET',undefined,outsiderToken)).status,403);
    const management=await req(n+'/manage','GET',undefined,authorToken);
    assert.equal(management.status,200);assert.equal(management.body.data[0].canDelete,true);assert.equal(management.body.data[0].canReply,true);
    const replies='/comments/'+id+'/replies';
    assert.equal((await req(replies,'POST',{content:'guest'})).status,401);
    assert.equal((await req(replies,'POST',{content:'reader'},readerToken)).status,403);
    assert.equal((await req(replies,'POST',{content:'wrong author'},outsiderToken)).status,403);
    assert.equal((await req(replies,'POST',{content:'  '},authorToken)).status,400);
    let replyId='';
    for(let i=0;i<6;i++) { const reply=await req(replies,'POST',{content:'Author reply '+i},authorToken);assert.equal(reply.status,201);replyId=reply.body.data.commentId; }
    const replyPage=await req(replies+'?limit=5');
    assert.equal(replyPage.body.meta.totalPages,2);assert.equal(replyPage.body.data[0].isAuthor,true);
    assert.equal(replyPage.body.data[0].parentCommentId,id);
    assert.equal((await req(n)).body.meta.totalItems,1);assert.equal((await req(n)).body.data[0].repliesCount,6);
    assert.equal((await req('/comments/'+replyId+'/replies','POST',{content:'Nested'},authorToken)).status,404);
    assert.equal((await req('/comments/'+replyId,'PATCH',{content:'Hijack reply'},readerToken)).status,403);
    assert.equal((await req('/comments/'+replyId,'PATCH',{content:'Edited reply'},authorToken)).status,200);

    const chapterComment=await req(c,'POST',{content:'Hello chapter'},authorToken);assert.equal(chapterComment.status,201);assert.equal((await req(n)).body.meta.totalItems,1);
    assert.equal((await req(n+'/manage?scope=ALL','GET',undefined,authorToken)).body.meta.totalItems,2);
    assert.equal((await req(n+'/manage?scope=NOVEL','GET',undefined,authorToken)).body.meta.totalItems,1);
    assert.equal((await req(n+'/manage?scope=CHAPTER&chapterId='+chapter,'GET',undefined,authorToken)).body.meta.totalItems,1);
    const unrelatedNovel=(await pool.query("insert into novels (author_id,title,slug,synopsis,status) values ($1,'Other','other','Other','PUBLISHED') returning novel_id",[outsider])).rows[0].novel_id;
    const unrelatedChapter=(await pool.query("insert into chapters (novel_id,chapter_number,title,status) values ($1,1,'Other chapter','PUBLISHED') returning chapter_id",[unrelatedNovel])).rows[0].chapter_id;
    assert.equal((await req(n+'/manage?scope=CHAPTER&chapterId='+unrelatedChapter,'GET',undefined,authorToken)).status,404);
    const readerOnChapter=await req(c,'POST',{content:'Reader for owner removal'},readerToken);
    assert.equal((await req('/comments/'+readerOnChapter.body.data.commentId,'DELETE',undefined,outsiderToken)).status,403);
    assert.equal((await req('/comments/'+readerOnChapter.body.data.commentId,'DELETE',undefined,authorToken)).status,204);

    for(const t of [authorToken,adminToken])assert.equal((await req('/comments/'+id,'PATCH',{content:'hijack'},t)).status,403);
    assert.equal((await req('/comments/'+id,'DELETE',undefined,otherToken)).status,403);
    await pool.query("insert into content_filter_rules (name,pattern,category,severity) values ('Test','qa-blocked','TEST','HIGH')");
    const flagged=await req('/comments/'+id,'PATCH',{content:'qa-blocked text'},readerToken);assert.equal(flagged.body.data.status,'PENDING_MODERATION');
    assert.equal((await req(n)).body.meta.totalItems,0);assert.equal((await req(n,'GET',undefined,otherToken)).body.meta.totalItems,0);assert.equal((await req(n,'GET',undefined,readerToken)).body.data[0].status,'PENDING_MODERATION');
    assert.equal((await req(n+'/manage?scope=NOVEL','GET',undefined,authorToken)).body.meta.totalItems,0);
    const review=flagged.body.data.moderationReviewId;
    assert.equal((await req('/comments/'+id,'PATCH',{content:'Clean edit'},readerToken)).body.data.status,'APPROVED');
    assert.equal((await req('/admin/moderation/reviews/'+review+'/resolve','POST',{decision:'REJECTED',reason:'Rejected by QA moderator'},adminToken)).status,200);assert.equal((await repo.findCommentById(id))?.status,'APPROVED');
    await req(n,'POST',{content:'Second'},otherToken);
    const p1=await req(n+'?page=1&limit=1'),p2=await req(n+'?page=2&limit=1');assert.equal(p1.body.meta.totalPages,2);assert.notEqual(p1.body.data[0].commentId,p2.body.data[0].commentId);
    await pool.query("update users set status='LOCKED' where user_id=$1",[reader]);assert.equal((await req(n,'POST',{content:'locked'},readerToken)).status,403);assert.equal((await req('/comments/'+id,'DELETE',undefined,readerToken)).status,403);
    await pool.query("update users set status='ACTIVE',role='AUTHOR' where user_id=$1",[reader]);assert.equal((await req(n,'POST',{content:'stale'},readerToken)).status,403);
    await pool.query("update users set role='READER',deleted_at=now() where user_id=$1",[reader]);assert.equal((await req(n,'POST',{content:'deleted'},readerToken)).status,403);await pool.query('update users set deleted_at=null where user_id=$1',[reader]);
    assert.equal((await req('/comments/'+id,'DELETE',undefined,readerToken)).status,204);await repo.updateCommentModerationStatus(id,'APPROVED',review);assert.equal(await repo.findCommentById(id),null);assert.equal(await repo.findCommentById(replyId),null);assert.equal((await req(replies)).status,404);
    assert.equal((await req(n)).body.meta.totalItems,1);
    assert.equal((await req('/comments/'+chapterComment.body.data.commentId,'DELETE',undefined,adminToken)).status,204);
    const remaining=(await req(n)).body.data[0].commentId;
    const report=await req('/reports','POST',{targetType:'COMMENT',targetId:remaining,reason:'Test report'},readerToken);
    assert.equal(report.status,201);
    assert.equal((await req('/admin/moderation/reviews/'+report.body.data.moderationReviewId+'/resolve','POST',{decision:'APPROVED'},adminToken)).status,200);
    assert.equal((await req(n)).body.meta.totalItems,0);
    const pending=await req(n,'POST',{content:'qa-blocked fresh comment'},readerToken);
    assert.equal(pending.body.data.status,'PENDING_MODERATION');
    assert.equal((await req('/admin/moderation/reviews/'+pending.body.data.moderationReviewId+'/resolve','POST',{decision:'REJECTED',reason:'Rejected by QA moderator'},adminToken)).status,200);
    assert.equal((await req(n)).body.meta.totalItems,0);
    assert.equal((await req(n,'GET',undefined,readerToken)).body.data[0].status,'REJECTED');
    await pool.query("update novels set status='DRAFT' where novel_id=$1",[novel]);assert.equal((await req(c)).status,404);assert.equal((await req(n)).status,404);
  } finally {
    if(server)await new Promise<void>(r=>server!.close(()=>r()));
    if(dropMongo)await dropMongo();if(closeMongo)await closeMongo();if(closePostgres)await closePostgres();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);await adminPool.end();
  }
});
