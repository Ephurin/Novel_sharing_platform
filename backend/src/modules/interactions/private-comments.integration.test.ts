import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getPostgresPool,disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase,disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { env } from '../../core/config/env.js';
import { createApp } from '../../app.js';
import { chapterParagraphs,makeAnchor,resolveAnchor } from '../reading/paragraph-anchors.js';
import { deliverDomainNotifications } from './domain-notifications.js';

test('private comment HTTP access matrix, snapshots, VIP, anchors, moderation and notification fan-out',async t=>{
  const pool=getPostgresPool(),mongo=getMongoDatabase();
  await validateTestDatabaseIsolation(pool,mongo);
  const originalFlag=env.PRIVATE_COMMENTS_ENABLED; env.PRIVATE_COMMENTS_ENABLED=true;
  const [a,b,c,outsider,author,admin]=Array.from({length:6},()=>randomUUID());
  const content='Opening paragraph.\n\nMiddle paragraph.\n\nClosing paragraph.';
  let novel:string,chapter:string,root:string,reply:string;
  const server=createApp().listen(0);await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/v1`;
  async function req(path:string,method='GET',body?:unknown,user?:string){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+jwt.sign({sub:user,role:'READER'},env.JWT_ACCESS_SECRET)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:r.status===204?null:await r.json() as any};
  }
  const connect=async(x:string,y:string)=>{await pool.query('insert into follows(follower_id,author_id) values($1,$2),($2,$1) on conflict do nothing',[x,y]);};
  const source=chapterParagraphs(content),anchor={contentVersion:source.contentVersion,paragraphId:source.paragraphs[1].paragraphId};
  try{
    for(const id of [a,b,c,outsider,author,admin]){
      await pool.query("insert into users(user_id,email,username,password_hash,role) values($1,$2,$3,'hash',$4)",[id,id+'@test.invalid','user_'+id.replaceAll('-',''),id===author?'AUTHOR':id===admin?'ADMIN':'READER']);
      await pool.query('insert into user_profiles(user_id,display_name) values($1,$2)',[id,'Person']);
    }
    await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')",[admin]);
    novel=(await pool.query("insert into novels(author_id,title,slug,synopsis,status) values($1,'Private test',$2,'Test','PUBLISHED') returning novel_id",[author,randomUUID()])).rows[0].novel_id;
    chapter=(await pool.query("insert into chapters(novel_id,chapter_number,title,content,status) values($1,1,'Chapter',$2,'PUBLISHED') returning chapter_id",[novel,content])).rows[0].chapter_id;
    await connect(a,b);await connect(a,c);
    await t.test('snapshot roots, server anchors, defaults and privacy',async()=>{
      assert.equal((await req(`/novels/${novel}/comments`,'POST',{content:'bad',audience:'FRIENDS_ALL'},a)).status,400);
      assert.equal((await req(`/chapters/${chapter}/comments`,'POST',{content:'bad',audience:'FRIENDS_ALL',anchor:{...anchor,quote:'forged'}},a)).status,400);
      const created=await req(`/chapters/${chapter}/comments`,'POST',{content:'private secret',audience:'FRIENDS_ALL',anchor},a);
      assert.equal(created.status,201,JSON.stringify(created.body));root=created.body.data.commentId;
      const raw=await mongo.collection('comments').findOne({commentId:root});
      assert.deepEqual(new Set(raw!.recipientUserIds),new Set([b,c]));assert.equal(raw!.anchor.quote,'Middle paragraph.');
      assert.equal((await req(`/chapters/${chapter}/comments`,'GET',undefined,a)).body.meta.totalItems,0);
      assert.equal((await req(`/novels/${novel}/comments/manage`,'GET',undefined,author)).body.meta.totalItems,0);
      for(const user of [undefined,outsider,author,admin])assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,user)).status,404);
      for(const user of [a,b,c])assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,user)).status,200);
      assert.equal((await req(`/chapters/${chapter}/comments?channel=FRIENDS_ALL`)).status,401);
      assert.equal((await req(`/chapters/${chapter}/comments?channel=FRIENDS_ALL&limit=1&page=2`,'GET',undefined,b)).body.meta.totalItems,1);
      assert.equal((await req(`/chapters/${chapter}/comments?channel=FRIENDS_ALL`,'GET',undefined,outsider)).body.meta.totalItems,0);
      await connect(a,outsider);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,outsider)).status,404);
    });
    await t.test('replies inherit root, lost mutual blocks every operation including own reply',async()=>{
      const created=await req(`/comments/${root}/replies`,'POST',{content:'B reply'},b);assert.equal(created.status,201);reply=created.body.data.commentId;
      assert.equal((await req(`/comments/${reply}/replies`,'POST',{content:'C reply'},c)).status,201);
      const thread=await req(`/comments/${reply}/thread?limit=1`,'GET',undefined,c);assert.equal(thread.status,200);assert.equal(thread.body.data.rootCommentId,root);
      assert.equal((await req(`/comments/${root}/replies`,'POST',{content:'forge',audience:'PUBLIC'},b)).status,400);
      assert.equal((await req(`/comments/${root}`,'PATCH',{content:'forge',recipientUserIds:[outsider]},a)).status,400);
      assert.equal((await req(`/comments/${root}`,'DELETE',undefined,author)).status,404);
      await pool.query('delete from follows where follower_id=$1 and author_id=$2',[a,b]);
      for(const [path,method,body] of [[`/comments/${reply}/thread`,'GET',undefined],[`/comments/${root}/replies`,'GET',undefined],[`/comments/${reply}`,'PATCH',{content:'edit'}],[`/comments/${reply}`,'DELETE',undefined],[`/comments/${root}/reaction`,'PUT',{reaction:'LIKE'}],[`/reports`,'POST',{targetType:'COMMENT',targetId:root,reason:'SPAM'}]] as const)
        assert.equal((await req(path,method,body,b)).status,404,path);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,c)).status,200);
      await connect(a,b);assert.equal((await req(`/comments/${reply}/thread`,'GET',undefined,b)).status,200);
    });
    await t.test('private media validation and immutable scope',async()=>{
      for(const input of [{gifId:'abc'}, {imageUrl:'/api/v1/media/'+randomUUID()+'.gif'}, {content:'![image](https://x.invalid/a)'}, {content:'<img src=x>'}]){
        assert.equal((await req(`/chapters/${chapter}/comments`,'POST',{content:'text',audience:'FRIENDS_ALL',anchor,...input},a)).status,400);
        assert.equal((await req(`/comments/${root}/replies`,'POST',{content:'text',...input},b)).status,400);
        assert.equal((await req(`/comments/${root}`,'PATCH',{content:'text',...input},a)).status,400);
      }
      const chosen=await req(`/chapters/${chapter}/comments`,'POST',{content:'chosen',audience:'FRIENDS_SELECTED',anchor,recipientUserIds:[b]},a);
      assert.equal(chosen.status,201);assert.equal((await req(`/comments/${chosen.body.data.commentId}/thread`,'GET',undefined,c)).status,404);
    });
    await t.test('author feedback sent/received and owner reply',async()=>{
      const result=await req(`/novels/${novel}/comments`,'POST',{content:'author secret',audience:'AUTHOR_PRIVATE'},b);assert.equal(result.status,201);
      const id=result.body.data.commentId;
      assert.equal((await req(`/comments/${id}/replies`,'POST',{content:'thank you'},author)).status,201);
      assert.equal((await req(`/comments/${id}/thread`,'GET',undefined,a)).status,404);
      assert.equal((await req('/author-feedback?box=sent','GET',undefined,b)).body.meta.totalItems,1);
      assert.equal((await req('/author-feedback?box=received','GET',undefined,author)).body.meta.totalItems,1);
      assert.equal((await req('/author-feedback?box=received','GET',undefined,a)).body.meta.totalItems,0);
    });
    await t.test('VIP/publication rights and permission checks do not create reading events',async()=>{
      const views=(await pool.query('select views_count from novels where novel_id=$1',[novel])).rows[0].views_count;
      assert.equal((await pool.query('select count(*)::int as n from chapter_reads where chapter_id=$1',[chapter])).rows[0].n,0);
      await pool.query('update chapters set is_vip=true,price_coins=10 where chapter_id=$1',[chapter]);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,a)).status,404);
      assert.equal((await req(`/chapters/${chapter}/comments?channel=FRIENDS_ALL`,'GET',undefined,a)).body.meta.totalItems,0);
      await pool.query('update chapters set is_vip=false where chapter_id=$1',[chapter]);
      await pool.query("update chapters set status='DRAFT' where chapter_id=$1",[chapter]);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,b)).status,404);
      await pool.query("update chapters set status='PUBLISHED' where chapter_id=$1",[chapter]);
      assert.equal((await pool.query('select views_count from novels where novel_id=$1',[novel])).rows[0].views_count,views);
    });
    await t.test('anchors reattach conservatively, flag-off preserves privacy, fan-out deduplicates',async()=>{
      const old=makeAnchor(content,anchor);
      assert.equal(resolveAnchor('New first.\n\n'+content,old).detached,false);
      await pool.query('update chapters set content=$2 where chapter_id=$1',[chapter,content.replace('Middle paragraph.','Changed.')]);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,b)).body.data.root.anchor.detached,true);
      env.PRIVATE_COMMENTS_ENABLED=false;
      assert.equal((await req(`/comments/${root}/replies`,'POST',{content:'guess'},author)).status,404);
      assert.equal((await req(`/chapters/${chapter}/comments`,'POST',{content:'x',audience:'FRIENDS_ALL',anchor},a)).status,503);
      assert.equal((await req(`/chapters/${chapter}/comments`,'GET',undefined,a)).body.meta.totalItems,0);
      assert.equal((await req(`/comments/${root}/thread`,'GET',undefined,b)).status,200);
      env.PRIVATE_COMMENTS_ENABLED=true;
      await deliverDomainNotifications();await deliverDomainNotifications();
      const notifications=await mongo.collection('notifications').find({'payload.commentId':root}).toArray();
      assert.deepEqual(new Set(notifications.map(n=>n.userId)),new Set([b,c]));assert.equal(notifications.length,2);
      assert.equal(JSON.stringify(notifications).includes('private secret'),false);
      assert.equal(JSON.stringify(notifications).includes('Middle paragraph.'),false);
    });
    await t.test('public mentions validate structured ranges and share reply dedup key',async()=>{
      const name='user_'+b.replaceAll('-','');const text='@'+name+' hello';
      const mentions=[{userId:b,start:0,end:name.length+1}];
      assert.equal((await req(`/novels/${novel}/comments`,'POST',{
        content:'@'+name,mentions:[{userId:b,start:0,end:name.length+2}]
      },a)).status,400);
      const result=await req(`/novels/${novel}/comments`,'POST',{content:text,mentions},a);assert.equal(result.status,201);
      assert.equal((await req(`/novels/${novel}/comments`,'POST',{content:'fake',mentions},a)).status,400);
      await deliverDomainNotifications();await deliverDomainNotifications();
      assert.equal(await mongo.collection('notifications').countDocuments({userId:b,'payload.commentId':result.body.data.commentId}),1);
      assert.equal(await mongo.collection('notifications').countDocuments({userId:author,'payload.commentId':result.body.data.commentId}),1);
      await req(`/comments/${result.body.data.commentId}`,'PATCH',{content:text,mentions},a);
      await deliverDomainNotifications();assert.equal(await mongo.collection('notifications').countDocuments({userId:b,'payload.commentId':result.body.data.commentId}),1);
    });
    await t.test('pending recipients, audited moderation, stale edits and unchanged snapshot',async()=>{
      await pool.query("insert into content_filter_rules(name,pattern,category,severity) values('Private test','review_private_word','TEST','HIGH')");
      const pending=await req(`/chapters/${chapter}/comments`,'POST',{content:'review_private_word',audience:'AUTHOR_PRIVATE'},a);
      assert.equal(pending.status,201);assert.equal(pending.body.data.status,'PENDING_MODERATION');
      const id=pending.body.data.commentId,reviewId=pending.body.data.moderationReviewId;
      assert.equal((await req(`/comments/${id}/thread`,'GET',undefined,a)).status,200);
      assert.equal((await req(`/comments/${id}/thread`,'GET',undefined,author)).status,404);
      assert.equal((await req(`/comments/${id}/thread`,'GET',undefined,admin)).status,404);
      assert.equal((await req(`/admin/moderation/reviews/${reviewId}`,'GET',undefined,admin)).status,200);
      assert.equal((await pool.query("select count(*)::int as n from admin_audit where action='PRIVATE_COMMENT_REVIEW_VIEW' and target_id=$1",[id])).rows[0].n,1);
      assert.equal((await req(`/admin/moderation/reviews/${reviewId}`,'GET',undefined,b)).status,403);
      await deliverDomainNotifications();assert.equal(await mongo.collection('notifications').countDocuments({'payload.commentId':id}),0);
      assert.equal((await req(`/comments/${id}`,'PATCH',{content:'review_private_word changed'},a)).status,200);
      const latest=await mongo.collection('comments').findOne({commentId:id});
      assert.notEqual(latest!.moderationReviewId,reviewId);
      assert.equal((await req(`/admin/moderation/reviews/${reviewId}/resolve`,'POST',{decision:'APPROVED'},admin)).status,409);
      assert.equal((await req(`/admin/moderation/reviews/${latest!.moderationReviewId}/resolve`,'POST',{decision:'APPROVED'},admin)).status,200);
      assert.equal((await req(`/comments/${id}/thread`,'GET',undefined,author)).status,200);
      await deliverDomainNotifications();assert.equal(await mongo.collection('notifications').countDocuments({'payload.commentId':id,userId:author}),1);
      const report=await req('/reports','POST',{targetType:'COMMENT',targetId:id,reason:'SPAM'},author);assert.equal(report.status,201);
      assert.equal((await req('/reports','POST',{targetType:'COMMENT',targetId:id,reason:'SPAM'},b)).status,404);
      const updatedSource=chapterParagraphs(content.replace('Middle paragraph.','Changed.'));
      const pendingFriends=await req(`/chapters/${chapter}/comments`,'POST',{content:'review_private_word friends',audience:'FRIENDS_ALL',anchor:{contentVersion:updatedSource.contentVersion,paragraphId:updatedSource.paragraphs[1].paragraphId}},a);
      assert.equal(pendingFriends.status,201);
      const friendId=pendingFriends.body.data.commentId;
      const snapshot=(await mongo.collection('comments').findOne({commentId:friendId}))!.recipientUserIds;
      await connect(a,author);
      await pool.query('delete from follows where follower_id=$1 and author_id=$2',[a,b]);
      assert.equal((await req(`/admin/moderation/reviews/${pendingFriends.body.data.moderationReviewId}/resolve`,'POST',{decision:'APPROVED'},admin)).status,200);
      assert.deepEqual((await mongo.collection('comments').findOne({commentId:friendId}))!.recipientUserIds,snapshot);
      assert.equal((await req(`/comments/${friendId}/thread`,'GET',undefined,author)).status,404);
      await deliverDomainNotifications();
      assert.equal(await mongo.collection('notifications').countDocuments({'payload.commentId':friendId,userId:b}),0);
      assert.equal(await mongo.collection('notifications').countDocuments({'payload.commentId':friendId,userId:c}),1);
      await connect(a,b);
    });
    await t.test('deleting root hides replies even from their writer',async()=>{
      assert.equal((await req(`/comments/${root}`,'DELETE',undefined,a)).status,204);
      assert.equal((await req(`/comments/${reply}/thread`,'GET',undefined,b)).status,404);
    });
  }finally{
    env.PRIVATE_COMMENTS_ENABLED=originalFlag;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    await disconnectMongo();await disconnectPostgres();
  }
});
