import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writingRecoveryFixture } from './writing-drafts.test-fixture.js';
import { recoverWritingDraft, dismissWritingDraft } from './writing-drafts.service.js';
import { acceptDraft } from '../novels/chapter-revisions.service.js';
import { disconnectPostgres } from '../../core/database/postgres.js';
import { disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from '../novels/chapter-writer.js';

test('DB01–DB12 real SQL persistence, review integrity and concurrent admission', {timeout:60000}, async t => {
  const f = await writingRecoveryFixture();
  try {
    const a = await f.chapter(), id = await f.job(a), scope=f.scope(a.chapterId);
    await t.test('DB01/02 completed recovery and repeated read are read-only, JSON context redacted',async()=>{
      const before=await f.state(a.chapterId), first=await recoverWritingDraft(scope);
      assert.equal(first.job?.job_id,id); assert.equal(first.job?.stale_reason,null);
      assert.equal(JSON.stringify(first).includes('PRIVATE FIXTURE'),false);
      assert.deepEqual(await recoverWritingDraft(scope),first); assert.deepEqual(await f.state(a.chapterId),before);
    });
    await t.test('DB03/04/07 reject persists, never reappears or accepts; manuscript/Canon/outbox unchanged',async()=>{
      const before=await f.state(a.chapterId); await dismissWritingDraft(scope,id);
      assert.equal((await f.pool.query('select status from narrative.writing_generations where job_id=$1',[id])).rows[0].status,'dismissed');
      assert.equal((await recoverWritingDraft(scope)).job,null);
      await assert.rejects(acceptDraft(f.auth,a.chapterId,{generationId:id}),(e:any)=>e.code==='GENERATION_NOT_COMPLETED');
      assert.deepEqual(await f.state(a.chapterId),before);
    });
    await t.test('DB05/06/08 valid accept creates one immutable revision/outbox; duplicate no-op; reject refused',async()=>{
      const c=await f.chapter(), job=await f.job(c), before=await f.state(c.chapterId);
      const first=await acceptDraft(f.auth,c.chapterId,{generationId:job});
      const second=await acceptDraft(f.auth,c.chapterId,{generationId:job});
      assert.equal(first.revision.revisionId,second.revision.revisionId);
      const after=await f.state(c.chapterId);
      assert.equal(after.revisions.length,before.revisions.length+1); assert.equal(after.outbox.length,1);
      assert.equal(after.outbox[0].event_type,'INCREMENTAL_ANALYSIS'); assert.equal(after.draft,c.content+' Saved fictional draft');
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job,null);
      await assert.rejects(dismissWritingDraft(f.scope(c.chapterId),job),(e:any)=>e.code==='GENERATION_ALREADY_ACCEPTED');
      assert.deepEqual(await f.state(c.chapterId),after);
    });
    await t.test('DB09/10 SQL chapter, actor and tenant isolation, including system-tenant legacy job',async()=>{
      const c=await f.chapter(), job=await f.job(c);
      assert.equal((await recoverWritingDraft({...f.scope(c.chapterId),userId:f.otherUser})).job,null);
      assert.equal((await recoverWritingDraft({...f.scope(c.chapterId),chapterId:a.chapterId})).job,null);
      await assert.rejects(dismissWritingDraft({...f.scope(c.chapterId),userId:f.otherUser},job),(e:any)=>e.code==='GENERATION_NOT_FOUND');
      const sys=await f.chapter(), sid=await f.job(sys,'00000000-0000-0000-0000-000000000001');
      assert.equal((await recoverWritingDraft(f.scope(sys.chapterId))).job?.job_id,sid);
    });
    await t.test('DB11 stale Canon/hash/revision and authoritative pointer are fail-closed',async()=>{
      const c=await f.chapter(), job=await f.job(c);
      await f.pool.query("update narrative.writing_generations set base_content_hash=repeat('0',64) where job_id=$1",[job]);
      const hashBefore=await f.state(c.chapterId);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job?.stale_reason,'CONTENT_HASH_MISMATCH');
      await assert.rejects(acceptDraft(f.auth,c.chapterId,{generationId:job}),(e:any)=>e.code==='CONTENT_HASH_MISMATCH');
      assert.deepEqual(await f.state(c.chapterId),hashBefore);
      await f.pool.query('update narrative.writing_generations set base_content_hash=(select content_hash from chapter_revisions where revision_id=$2) where job_id=$1',[job,c.revisionId]);
      await f.pool.query('update narrative.story_brains set brain_version=3 where novel_id=$1',[f.novelId]);
      const before=await f.state(c.chapterId);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job?.stale_reason,'BRAIN_VERSION_CONFLICT');
      await assert.rejects(acceptDraft(f.auth,c.chapterId,{generationId:job}),(e:any)=>e.code==='BRAIN_VERSION_CONFLICT');
      assert.deepEqual(await f.state(c.chapterId),before);
      await f.pool.query('update narrative.story_brains set brain_version=2 where novel_id=$1',[f.novelId]);
      // Pointer can reference a different revision whose timestamp predates the job base.
      const older=(await f.pool.query(`insert into chapter_revisions(novel_id,chapter_id,content,content_hash,created_at)
        select novel_id,chapter_id,content,content_hash,created_at-interval '1 day' from chapter_revisions where revision_id=$1 returning revision_id`,[c.revisionId])).rows[0].revision_id;
      await f.pool.query('update chapters set latest_revision_id=$1 where chapter_id=$2',[older,c.chapterId]);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job?.stale_reason,'STALE_BASE_REVISION');
      const pointerBefore=await f.state(c.chapterId);
      await assert.rejects(acceptDraft(f.auth,c.chapterId,{generationId:job}),(e:any)=>e.code==='STALE_BASE_REVISION');
      assert.deepEqual(await f.state(c.chapterId),pointerBefore);
    });
    await t.test('newest scoped job uses SQL ordering and actor/tenant filters',async()=>{
      const c=await f.chapter(), old=await f.job(c), latest=await f.job(c);
      await f.pool.query("update narrative.writing_generations set created_at=now()-interval '1 day' where job_id=$1",[old]);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job?.job_id,latest);
      await dismissWritingDraft(f.scope(c.chapterId),latest);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job,null);
      await f.pool.query('update narrative.writing_generations set actor_id=$1 where chapter_id=$2',[f.otherUser,c.chapterId]);
      assert.equal((await recoverWritingDraft(f.scope(c.chapterId))).job,null);
    });
    await t.test('DB12 concurrent Accept/Reject cannot both commit',async()=>{
      for (let i=0;i<4;i++) {
        const c=await f.chapter(), job=await f.job(c);
        const results=await Promise.allSettled(i%2 ? [dismissWritingDraft(f.scope(c.chapterId),job),acceptDraft(f.auth,c.chapterId,{generationId:job})]
          : [acceptDraft(f.auth,c.chapterId,{generationId:job}),dismissWritingDraft(f.scope(c.chapterId),job)]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        const row=(await f.pool.query('select status from narrative.writing_generations where job_id=$1',[job])).rows[0];
        const state=await f.state(c.chapterId);
        if(row.status==='dismissed') {assert.equal(state.revisions.length,1);assert.equal(state.outbox.length,0);assert.equal(state.draft,c.content);}
        else {assert.equal(state.revisions.length,2);assert.equal(state.outbox.length,1);}
      }
    });
  } finally {await f.close(); await disconnectChapterWriter();await disconnectPostgres();await disconnectMongo();}
});
