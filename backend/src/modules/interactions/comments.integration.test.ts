import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { Collection } from 'mongodb';
import type { AddressInfo } from 'node:net';

test('novel/chapter comments: permissions, moderation, pagination and isolation', { skip: process.env.RUN_COMMENT_TESTS !== '1' }, async (t) => {
  const schema = 'comments_' + randomUUID().replaceAll('-', '');
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  let closePostgres: (() => Promise<void>) | undefined, closeMongo: (() => Promise<void>) | undefined;
  let dropMongo: (() => Promise<boolean>) | undefined;
  let server: import('node:http').Server | undefined;
  let uploadedGif: string | undefined;
  let restoreGiphyConfig: (() => void) | undefined;
  try {
    await adminPool.query(`create schema "${schema}"`);
    const dbUrl = new URL(process.env.DATABASE_URL!); dbUrl.searchParams.set('options', `-c search_path=${schema},public`); process.env.DATABASE_URL=dbUrl.href;
    const mongoUrl=new URL(process.env.MONGODB_URI!); mongoUrl.pathname='/'+schema; process.env.MONGODB_URI=mongoUrl.href;
    const pg=await import('../../core/database/postgres.js'), mongo=await import('../../core/database/mongo.js');
    closePostgres=pg.disconnectPostgres; closeMongo=mongo.disconnectMongo; dropMongo=()=>mongo.getMongoDatabase().dropDatabase();
    const pool=pg.getPostgresPool();
    for(const name of ['001_auth_user_wallet','002_novels','003_chapters','004_content_control','005_reports_description','006_reading_interactions','012_reports_unique_open','012_novel_engagement','013_novel_review_text','014_novel_editorial_metadata','015_author_workflow','016_author_launch_checklist','017_transactional_moderation_evidence','021_novel_notification_subscriptions']) await pool.query(await readFile(new URL(`../../core/database/migrations/${name}.sql`,import.meta.url),'utf8'));
    const author=randomUUID(),reader=randomUUID(),other=randomUUID(),admin=randomUUID(),outsider=randomUUID();
    for(const [id,role] of [[author,'AUTHOR'],[reader,'READER'],[other,'READER'],[admin,'ADMIN'],[outsider,'AUTHOR']]) {
      await pool.query(`insert into users (user_id,email,username,password_hash,role) values ($1::uuid,$2,$1::text,'hash',$3)`,[id,id+'@test.invalid',role]);
      await pool.query('insert into user_profiles (user_id,display_name) values ($1,$2)',[id,'Account '+role]);
    }
    const novel=(await pool.query("insert into novels (author_id,title,slug,synopsis,status) values ($1,'Comments','comments','Test synopsis','PUBLISHED') returning novel_id",[author])).rows[0].novel_id;
    const chapter=(await pool.query("insert into chapters (novel_id,chapter_number,title,status) values ($1,1,'Chapter','PUBLISHED') returning chapter_id",[novel])).rows[0].chapter_id;
    const draft=(await pool.query("insert into chapters (novel_id,chapter_number,title,status) values ($1,2,'Draft','DRAFT') returning chapter_id",[novel])).rows[0].chapter_id;
    await pool.query(await readFile(new URL('../../core/database/migrations/018_admin_operations.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../core/database/migrations/019_admin_job_retries.sql', import.meta.url), 'utf8'));
    await pool.query("insert into admin_access (user_id, scope) values ($1, 'MODERATOR') on conflict (user_id) do update set scope='MODERATOR'", [admin]);
    const repo=await import('./comments.repository.js'); await repo.ensureCommentIndexes();
    const {createApp}=await import('../../app.js'),jwt=(await import('jsonwebtoken')).default,{env}=await import('../../core/config/env.js');
    const originalKeys = { privateKey: env.GIPHY_API_KEY, publicKey: env.GIPHY_PUBLIC_API_KEY };
    env.GIPHY_API_KEY = 'fixture-private-key';
    env.GIPHY_PUBLIC_API_KEY = 'fixture-public-key';
    restoreGiphyConfig = () => { env.GIPHY_API_KEY = originalKeys.privateKey; env.GIPHY_PUBLIC_API_KEY = originalKeys.publicKey; };
    const originalFetch = globalThis.fetch;
    let providerUnavailable = false;
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== 'https://api.giphy.com') return originalFetch(input, init);
      assert.equal(url.searchParams.get('api_key'), 'fixture-private-key');
      if (providerUnavailable) return Response.json({}, { status: 503 });
      const id = url.pathname.split('/').at(-1)!;
      if (!['testGifId123', 'testGifId456', 'unsafeGif', 'unratedGif'].includes(id)) return Response.json({}, { status: 404 });
      return Response.json({ data: { id, type: 'gif', ...(id === 'unratedGif' ? {} : { rating: id === 'unsafeGif' ? 'r' : 'pg' }) } });
    });
    server=createApp().listen(0);await new Promise<void>(r=>server!.once('listening',r));
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
    const token=(id:string,role='READER')=>jwt.sign({sub:id,role},env.JWT_ACCESS_SECRET);
    const readerToken=token(reader),otherToken=token(other),authorToken=token(author,'AUTHOR'),adminToken=token(admin,'ADMIN'),outsiderToken=token(outsider,'AUTHOR');
    async function req(path:string,method='GET',body?:unknown,auth?:string){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.status===204?null:await r.json() as any};}
    const n='/novels/'+novel+'/comments',c='/chapters/'+chapter+'/comments';
    assert.equal((await req(n,'POST',{content:'guest'})).status,401);
    for(const content of ['', '   ', 'x'.repeat(2001)])assert.equal((await req(n,'POST',{content},readerToken)).status,400);
    const config = await req('/media/giphy-config');
    assert.equal(config.status, 200);
    assert.equal(config.body.data.apiKey, 'fixture-public-key');
    assert.equal(JSON.stringify(config.body).includes('fixture-private-key'), false);
    env.GIPHY_PUBLIC_API_KEY = undefined;
    assert.equal((await req('/media/giphy-config')).body.data.apiKey, null);
    env.GIPHY_PUBLIC_API_KEY = 'fixture-public-key';
    for (const gifId of ['arbitraryUnknownId', 'unsafeGif', 'unratedGif', 'https://example.invalid/meme.gif']) {
      assert.equal((await req(n, 'POST', { content: 'Clean text', gifId }, readerToken)).status, 400);
    }
    providerUnavailable = true;
    assert.equal((await req(n, 'POST', { content: '', gifId: 'testGifId123' }, readerToken)).status, 503);
    providerUnavailable = false;
    assert.equal((await req(n)).body.meta.totalItems, 0);
    const resolve = (reviewId: string) => req('/admin/moderation/reviews/' + reviewId + '/resolve', 'POST', { decision: 'APPROVED' }, adminToken);
    async function failCommentProjection(commentId: string, reviewId: string, decision = 'APPROVED') {
      const originalUpdate = Collection.prototype.updateOne;
      let failures = 0;
      const projection = t.mock.method(Collection.prototype, 'updateOne', async function (this: Collection, ...args: Parameters<Collection['updateOne']>) {
        if (this.collectionName === 'comments' && args[0].commentId === commentId && !Array.isArray(args[1]) && args[1].$set?.status === decision) {
          assert.equal((await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])).rows[0].status, decision,
            'Inject the Mongo failure only after the PostgreSQL decision is committed');
          failures++;
          throw new Error('Injected comment projection failure');
        }
        return originalUpdate.apply(this, args);
      });
      try {
        const result = await req('/admin/moderation/reviews/' + reviewId + '/resolve', 'POST', {
          decision, ...(decision === 'REJECTED' ? { reason: 'Fixture rejection' } : {})
        }, adminToken);
        assert.equal(result.status, 500);
        assert.equal(failures, 1);
        const pending = await repo.findCommentById(commentId);
        assert.equal(pending?.status, 'PENDING_MODERATION');
        assert.equal(pending?.moderationReviewId, reviewId);
        assert.equal(pending?.mediaApproved, false);
      } finally {
        projection.mock.restore();
      }
    }
    await t.test('retry the same committed review after Mongo failure without duplicate decisions', async () => {
      const pending = await req(n, 'POST', { content: 'Recovery fixture', gifId: 'testGifId123' }, readerToken);
      assert.equal(pending.status, 201);
      const { commentId, moderationReviewId } = pending.body.data;
      await failCommentProjection(commentId, moderationReviewId);
      assert.equal((await req(n)).body.meta.totalItems, 0);
      assert.equal((await req('/admin/moderation/reviews/' + moderationReviewId + '/resolve', 'POST', {
        decision: 'REJECTED', reason: 'Cannot change a committed decision'
      }, adminToken)).status, 409);
      providerUnavailable = true;
      try {
        assert.equal((await resolve(moderationReviewId)).status, 503);
      } finally {
        providerUnavailable = false;
      }
      assert.equal((await req(n)).body.meta.totalItems, 0);
      const retries = await Promise.all(Array.from({ length: 4 }, () => resolve(moderationReviewId)));
      assert.ok(retries.every(result => result.status === 200));
      assert.ok(retries.every(result => result.body.data.reviewId === moderationReviewId));
      assert.equal((await repo.findCommentById(commentId))?.mediaApproved, true);
      assert.equal((await req(n)).body.data[0].commentId, commentId);
      assert.equal((await pool.query("select count(*)::int as total from admin_audit where target_id=$1 and action='PUBLICATION_APPROVED'", [commentId])).rows[0].total, 1);
      await mongo.getMongoDatabase().collection('comments').updateOne({ commentId }, { $set: { notificationPending: false } });
      const beforeRetry = await repo.findCommentById(commentId);
      assert.equal((await resolve(moderationReviewId)).status, 200);
      assert.deepEqual(await repo.findCommentById(commentId), beforeRetry, 'An applied decision must not reset timestamps or notifications');
      await req('/comments/' + commentId, 'DELETE', undefined, readerToken);
    });
    await t.test('recovery cannot publish an edited or deleted comment with an old review', async () => {
      for (const action of ['edit', 'delete']) {
        const pending = await req(n, 'POST', { content: 'Stale recovery fixture', gifId: 'testGifId123' }, readerToken);
        assert.equal(pending.status, 201);
        const { commentId, moderationReviewId } = pending.body.data;
        await failCommentProjection(commentId, moderationReviewId);
        if (action === 'edit') {
          const edited = await req('/comments/' + commentId, 'PATCH', { content: 'Changed after committed decision', gifId: 'testGifId456' }, readerToken);
          assert.equal(edited.status, 200);
          assert.notEqual(edited.body.data.moderationReviewId, moderationReviewId);
        } else {
          assert.equal((await req('/comments/' + commentId, 'DELETE', undefined, readerToken)).status, 204);
        }
        const beforeRetry = await repo.findCommentRecordById(commentId);
        assert.equal((await resolve(moderationReviewId)).status, 409);
        assert.deepEqual(await repo.findCommentRecordById(commentId), beforeRetry);
        assert.equal((await req(n)).body.meta.totalItems, 0);
        await req('/comments/' + commentId, 'DELETE', undefined, readerToken);
      }
    });
    await t.test('retry a committed rejection after Mongo failure using its original decision', async () => {
      const pending = await req(n, 'POST', { content: 'Rejection recovery fixture', gifId: 'testGifId123' }, readerToken);
      assert.equal(pending.status, 201);
      const { commentId, moderationReviewId } = pending.body.data;
      await failCommentProjection(commentId, moderationReviewId, 'REJECTED');
      assert.equal((await resolve(moderationReviewId)).status, 409);
      const retry = await req('/admin/moderation/reviews/' + moderationReviewId + '/resolve', 'POST', {
        decision: 'REJECTED', reason: 'Fixture rejection'
      }, adminToken);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.data.reviewId, moderationReviewId);
      assert.equal((await repo.findCommentById(commentId))?.status, 'REJECTED');
      assert.equal((await req(n)).body.meta.totalItems, 0);
      await req('/comments/' + commentId, 'DELETE', undefined, readerToken);
    });
    const remoteGif = await req(n, 'POST', { content: '', gifId: 'testGifId123' }, readerToken);
    assert.equal(remoteGif.status, 201);
    assert.equal(remoteGif.body.data.status, 'PENDING_MODERATION');
    assert.equal((await req(n)).body.meta.totalItems, 0);
    assert.equal((await req(n, 'GET', undefined, otherToken)).body.meta.totalItems, 0);
    assert.equal((await req(n, 'GET', undefined, readerToken)).body.data[0].gifId, 'testGifId123');
    const firstReview = remoteGif.body.data.moderationReviewId;
    const reviewDetail = await req('/admin/moderation/reviews/' + firstReview, 'GET', undefined, adminToken);
    assert.equal(reviewDetail.body.data.target.gifId, 'testGifId123');
    providerUnavailable = true;
    assert.equal((await resolve(firstReview)).status, 503);
    assert.equal((await req(n)).body.meta.totalItems, 0);
    providerUnavailable = false;
    assert.equal((await resolve(firstReview)).status, 200);
    assert.equal((await req(n)).body.data[0].gifId, 'testGifId123');
    const remotePath = '/comments/' + remoteGif.body.data.commentId;
    const editedGif = await req(remotePath, 'PATCH', { content: 'Legacy edit keeps GIF ID' }, readerToken);
    assert.equal(editedGif.body.data.status, 'PENDING_MODERATION');
    assert.equal((await req(n)).body.meta.totalItems, 0);
    const changedGif = await req(remotePath, 'PATCH', { content: '', gifId: 'testGifId456' }, readerToken);
    assert.equal(changedGif.body.data.status, 'PENDING_MODERATION');
    assert.notEqual(changedGif.body.data.moderationReviewId, editedGif.body.data.moderationReviewId);
    assert.equal((await resolve(editedGif.body.data.moderationReviewId)).status, 409);
    assert.equal((await req(n)).body.meta.totalItems, 0);
    assert.equal((await resolve(changedGif.body.data.moderationReviewId)).status, 200);
    assert.equal((await req(n)).body.data[0].gifId, 'testGifId456');
    const repliesPath = remotePath + '/replies';
    const gifReply = await req(repliesPath, 'POST', { content: '', gifId: 'testGifId123' }, otherToken);
    assert.equal(gifReply.body.data.status, 'PENDING_MODERATION');
    assert.equal((await req(repliesPath)).body.meta.totalItems, 0);
    assert.equal((await req(n)).body.data[0].repliesCount, 0);
    const replyRecord = await repo.findCommentById(gifReply.body.data.commentId);
    assert.equal((await resolve(replyRecord!.moderationReviewId!)).status, 200);
    assert.equal((await req(repliesPath)).body.meta.totalItems, 1);
    assert.equal((await req(n)).body.data[0].repliesCount, 1);
    await mongo.getMongoDatabase().collection('comments').updateOne({ commentId: remoteGif.body.data.commentId }, { $unset: { mediaApproved: '' } });
    assert.equal((await req(n)).body.meta.totalItems, 0, 'Legacy media approval requires explicit media review');
    assert.equal((await req(remotePath + '/reaction', 'PUT', { reaction: 'LIKE' }, otherToken)).status, 404);
    assert.equal((await req(n, 'GET', undefined, readerToken)).body.data[0].status, 'PENDING_MODERATION');
    const concurrentEdits = await Promise.all(Array.from({ length: 12 }, (_, index) => req(remotePath, 'PATCH', {
      content: 'Concurrent edit', gifId: index % 2 ? 'testGifId123' : 'testGifId456'
    }, readerToken)));
    assert.ok(concurrentEdits.every(result => result.body.data.status === 'PENDING_MODERATION'));
    const current = await repo.findCommentById(remoteGif.body.data.commentId);
    const stale = concurrentEdits.find(result => result.body.data.moderationReviewId !== current!.moderationReviewId)!;
    assert.equal((await resolve(stale.body.data.moderationReviewId)).status, 409);
    assert.equal((await req(n)).body.meta.totalItems, 0);
    const approvalRace = await Promise.all([
      resolve(current!.moderationReviewId!),
      req(remotePath, 'PATCH', { content: 'Edited during approval', gifId: 'testGifId123' }, readerToken)
    ]);
    assert.ok([200, 409].includes(approvalRace[0].status));
    assert.equal(approvalRace[1].body.data.status, 'PENDING_MODERATION');
    assert.equal((await req(n)).body.meta.totalItems, 0);
    const removedGif = await req(remotePath, 'PATCH', { content: 'Text after removing GIF', gifId: null }, readerToken);
    assert.equal(removedGif.body.data.status, 'APPROVED');
    await req(remotePath, 'DELETE', undefined, readerToken);
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    const media = await req('/media', 'POST', { data: gif.toString('base64') }, readerToken);
    assert.equal(media.status, 400);
    assert.equal(media.body.error.code, 'GIF_UPLOAD_DISABLED');
    const legacyPath = '/api/v1/media/' + randomUUID() + '.gif';
    const directory = (await import('../media/media.routes.js')).mediaDirectory;
    await mkdir(directory, { recursive: true });
    uploadedGif = path.join(directory, path.basename(legacyPath));
    await writeFile(uploadedGif, gif);
    const legacyFile = await fetch(base.replace('/api/v1', '') + legacyPath);
    assert.equal(legacyFile.status, 404);
    assert.equal(legacyFile.headers.get('cache-control'), 'no-store');
    for (const content of ['', 'Clean text']) {
      assert.equal((await req(n, 'POST', { content, imageUrl: legacyPath }, readerToken)).status, 400);
    }
    assert.equal((await req(n, 'POST', { content: 'bad media', imageUrl: 'https://example.invalid/test.gif' }, readerToken)).status, 400);
    assert.equal((await req('/chapters/'+draft+'/comments')).status,404);
    const created=await req(n,'POST',{content:'  Hello novel  ',isSpoiler:true},readerToken);assert.equal(created.status,201);assert.equal(created.body.data.status,'APPROVED');const id=created.body.data.commentId;
    const list=await req(n);assert.equal(list.body.data[0].content,'Hello novel');assert.equal(list.body.data[0].displayName,'Account READER');assert.equal(list.body.data[0].chapterId,null);assert.equal(list.body.data[0].email,undefined);
    assert.equal(list.body.data[0].isSpoiler, true);
    assert.equal(list.body.data[0].imageUrl, null);
    assert.equal(list.body.data[0].likesCount, 0);
    const reactionPath = '/comments/' + id + '/reaction';
    assert.equal((await req(reactionPath, 'PUT', { reaction: 'LIKE' })).status, 401);
    await Promise.all(Array.from({ length: 8 }, () => req(reactionPath, 'PUT', { reaction: 'LIKE' }, readerToken)));
    assert.deepEqual((await req(reactionPath, 'PUT', { reaction: 'LIKE' }, readerToken)).body.data, { likesCount: 1, dislikesCount: 0, myReaction: 'LIKE' });
    assert.deepEqual((await req(reactionPath, 'PUT', { reaction: 'DISLIKE' }, readerToken)).body.data, { likesCount: 0, dislikesCount: 1, myReaction: 'DISLIKE' });
    assert.deepEqual((await req(reactionPath, 'PUT', { reaction: 'LIKE' }, otherToken)).body.data, { likesCount: 1, dislikesCount: 1, myReaction: 'LIKE' });
    assert.equal((await req(n, 'GET', undefined, readerToken)).body.data[0].myReaction, 'DISLIKE');
    assert.equal((await req(n)).body.data[0].myReaction, null);
    assert.deepEqual((await req(reactionPath, 'PUT', { reaction: null }, readerToken)).body.data, { likesCount: 1, dislikesCount: 0, myReaction: null });
    assert.equal((await req(c)).body.meta.totalItems,0);
    assert.equal((await req(n+'/manage')).status,401);
    assert.equal((await req(n+'/manage','GET',undefined,readerToken)).status,403);
    assert.equal((await req(n+'/manage','GET',undefined,outsiderToken)).status,403);
    const management=await req(n+'/manage','GET',undefined,authorToken);
    assert.equal(management.status,200);assert.equal(management.body.data[0].canDelete,true);assert.equal(management.body.data[0].canReply,true);
    const replies='/comments/'+id+'/replies';
    assert.equal((await req(replies,'POST',{content:'guest'})).status,401);
    for (const auth of [readerToken, outsiderToken]) {
      const readerReply = await req(replies, 'POST', { content: 'Reader reply' }, auth);
      assert.equal(readerReply.status, 201);
      assert.equal((await req(n, 'GET', undefined, auth)).body.data[0].canReply, true);
      assert.equal((await req('/comments/' + readerReply.body.data.commentId, 'DELETE', undefined, auth)).status, 204);
    }
    assert.equal((await req(replies,'POST',{content:'  '},authorToken)).status,400);
    let replyId='';
    for(let i=0;i<6;i++) { const reply=await req(replies,'POST',{content:'Author reply '+i},authorToken);assert.equal(reply.status,201);replyId=reply.body.data.commentId; }
    const replyPage=await req(replies+'?limit=5');
    assert.equal(replyPage.body.meta.totalPages,2);assert.equal(replyPage.body.data[0].isAuthor,true);
    assert.equal(replyPage.body.data[0].parentCommentId,id);
    assert.equal(replyPage.body.data[0].isSpoiler, true);
    const peerReply = await req(replies, 'POST', { content: 'Reply from another reader' }, otherToken);
    assert.equal(peerReply.status, 201);
    const notifications = await import('./notifications.repository.js');
    await notifications.ensureNotificationIndexes();
    await (await import('./domain-notifications.js')).deliverDomainNotifications();
    const peerNotice = (await notifications.listNotifications(reader, { page: 1, limit: 100 })).items.find(item => item.type === 'COMMENT_REPLY');
    assert.equal(peerNotice?.title, 'Có trả lời bình luận mới');
    assert.equal(peerNotice?.payload.href, '/public/novels/' + novel);
    await req('/comments/' + peerReply.body.data.commentId, 'DELETE', undefined, otherToken);
    assert.equal((await req(n)).body.meta.totalItems,1);assert.equal((await req(n)).body.data[0].repliesCount,6);
    assert.equal((await req('/comments/'+replyId+'/replies','POST',{content:'Nested'},authorToken)).status,404);
    assert.equal((await req('/comments/'+replyId,'PATCH',{content:'Hijack reply'},readerToken)).status,403);
    assert.equal((await req('/comments/'+replyId,'PATCH',{content:'Edited reply'},authorToken)).status,200);

    const chapterComment=await req(c,'POST',{content:'Hello chapter'},authorToken);assert.equal(chapterComment.status,201);assert.equal((await req(n)).body.meta.totalItems,1);
    await mongo.getMongoDatabase().collection('comments').updateOne({ commentId: chapterComment.body.data.commentId }, { $unset: { isSpoiler: '', imageUrl: '' } });
    assert.equal((await req(c)).body.data[0].isSpoiler, false);
    assert.equal((await req(c)).body.data[0].imageUrl, null);
    assert.equal((await req(n + '?scope=ALL')).body.meta.totalItems, 2);
    const chapterSource = (await req(n + '?scope=ALL')).body.data.find((item: any) => item.chapterId === chapter);
    assert.equal(chapterSource.chapterNumber, 1);
    assert.equal(chapterSource.chapterTitle, 'Chapter');
    await pool.query("update chapters set status='DRAFT' where chapter_id=$1", [chapter]);
    assert.equal((await req(n + '?scope=ALL')).body.meta.totalItems, 1);
    assert.equal((await req('/comments/' + chapterComment.body.data.commentId + '/reaction', 'PUT', { reaction: 'LIKE' }, readerToken)).status, 404);
    await pool.query("update chapters set status='PUBLISHED' where chapter_id=$1", [chapter]);
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
    assert.equal((await req(reactionPath, 'PUT', { reaction: 'LIKE' }, readerToken)).status, 404);
    assert.equal((await req('/comments/' + replyId + '/reaction', 'PUT', { reaction: 'LIKE' }, readerToken)).status, 404);
    assert.equal((await req(n)).body.meta.totalItems,0);assert.equal((await req(n,'GET',undefined,otherToken)).body.meta.totalItems,0);assert.equal((await req(n,'GET',undefined,readerToken)).body.data[0].status,'PENDING_MODERATION');
    assert.equal((await req(n+'/manage?scope=NOVEL','GET',undefined,authorToken)).body.meta.totalItems,0);
    const review=flagged.body.data.moderationReviewId;
    assert.equal((await req('/comments/'+id,'PATCH',{content:'Clean edit'},readerToken)).body.data.status,'APPROVED');
    assert.equal((await req(n)).body.data[0].isSpoiler, true, 'Legacy edits preserve spoiler and attachment');
    assert.equal((await req(n)).body.data[0].imageUrl, null);
    assert.equal((await req('/admin/moderation/reviews/'+review+'/resolve','POST',{decision:'REJECTED',reason:'Rejected by QA moderator'},adminToken)).status,200);assert.equal((await repo.findCommentById(id))?.status,'APPROVED');
    await req(n,'POST',{content:'Second'},otherToken);
    const p1=await req(n+'?page=1&limit=1'),p2=await req(n+'?page=2&limit=1');assert.equal(p1.body.meta.totalPages,2);assert.notEqual(p1.body.data[0].commentId,p2.body.data[0].commentId);
    await pool.query("update users set status='LOCKED' where user_id=$1",[reader]);assert.equal((await req(n,'POST',{content:'locked'},readerToken)).status,403);assert.equal((await req('/comments/'+id,'DELETE',undefined,readerToken)).status,403);
    assert.equal((await req(reactionPath, 'PUT', { reaction: 'LIKE' }, readerToken)).status, 403);
    assert.equal((await req(replies, 'POST', { content: 'Locked reply' }, readerToken)).status, 403);
    await pool.query("update users set status='ACTIVE',role='AUTHOR' where user_id=$1",[reader]);
    const refreshedRole = await req(n, 'POST', { content: 'Current database role' }, readerToken);
    assert.equal(refreshedRole.status, 201, 'HTTP authentication refreshes the current role from the database');
    await req('/comments/' + refreshedRole.body.data.commentId, 'DELETE', undefined, readerToken);
    const service = await import('./comments.service.js');
    await assert.rejects(service.createNovelComment({ userId: reader, role: 'READER' }, novel, { content: 'Stale service context' }), { httpStatus: 403 });
    await pool.query("update users set role='READER',deleted_at=now() where user_id=$1",[reader]);assert.equal((await req(n,'POST',{content:'deleted'},readerToken)).status,403);await pool.query('update users set deleted_at=null where user_id=$1',[reader]);
    assert.equal((await req('/comments/'+id,'DELETE',undefined,readerToken)).status,204);await repo.updateCommentModerationStatus(id,'APPROVED',review);assert.equal(await repo.findCommentById(id),null);assert.equal(await repo.findCommentById(replyId),null);assert.equal((await req(replies)).status,404);
    assert.equal((await req(n)).body.meta.totalItems,1);
    assert.equal((await req('/comments/'+chapterComment.body.data.commentId,'DELETE',undefined,adminToken)).status,204);
    const remaining=(await req(n)).body.data[0].commentId;
    const report=await req('/reports','POST',{targetType:'COMMENT',targetId:remaining,reason:'Test report'},readerToken);
    assert.equal(report.status,201);
    assert.equal((await req('/admin/moderation/reviews/'+report.body.data.moderationReviewId+'/resolve','POST',{decision:'APPROVED',reason:'Confirmed report in isolated QA'},adminToken)).status,200);
    assert.equal((await req(n)).body.meta.totalItems,0);
    const pending=await req(n,'POST',{content:'qa-blocked fresh comment'},readerToken);
    assert.equal(pending.body.data.status,'PENDING_MODERATION');
    assert.equal((await req('/admin/moderation/reviews/'+pending.body.data.moderationReviewId+'/resolve','POST',{decision:'REJECTED',reason:'Rejected by QA moderator'},adminToken)).status,200);
    assert.equal((await req(n)).body.meta.totalItems,0);
    assert.equal((await req(n,'GET',undefined,readerToken)).body.data[0].status,'REJECTED');
    await pool.query("update novels set status='DRAFT' where novel_id=$1",[novel]);assert.equal((await req(c)).status,404);assert.equal((await req(n)).status,404);
    for (let attempt = 0; attempt < 20; attempt++) assert.equal((await req('/media', 'POST', { data: '' }, outsiderToken)).status, 400);
    assert.equal((await req('/media', 'POST', { data: '' }, outsiderToken)).status, 429);
  } finally {
    if(server)await new Promise<void>(r=>server!.close(()=>r()));
    if(dropMongo)await dropMongo();if(closeMongo)await closeMongo();if(closePostgres)await closePostgres();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);await adminPool.end();
    if (uploadedGif) await unlink(uploadedGif);
    restoreGiphyConfig?.();
  }
});
