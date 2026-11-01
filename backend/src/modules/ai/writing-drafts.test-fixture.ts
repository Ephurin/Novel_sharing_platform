import { createHash, randomUUID } from 'node:crypto';
import { getPostgresPool } from '../../core/database/postgres.js';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { upsertDraftChapter } from '../novels/draft-chapters.repository.js';
import { env } from '../../core/config/env.js';

export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export async function writingRecoveryFixture() {
  const pool = getPostgresPool(), mongo = getMongoDatabase();
  await validateTestDatabaseIsolation(pool, mongo);
  if (process.env.LIVE_FREE_TIER_ENABLED !== 'false' || process.env.LIVE_UPSTREAM_FORWARDING !== 'false') {
    throw Error('Both live flags must explicitly be false');
  }
  const userId = randomUUID(), otherUser = randomUUID(), novelId = randomUUID();
  const chapters: string[] = [];
  for (const id of [userId, otherUser]) await pool.query(
    "insert into users(user_id,email,username,password_hash,role) values($1::uuid,$2,$1::text,'unused','AUTHOR')", [id,id+'@test.invalid']);
  await pool.query("insert into novels(novel_id,author_id,title,slug,synopsis,status) values($1::uuid,$2,'QA Writing',$1::text,'Fictional fixture','DRAFT')", [novelId,userId]);
  await pool.query("insert into narrative.story_brains(id,tenant_id,novel_id,status,brain_version,schema_version) values($1,$2,$3,'active',2,1)", [randomUUID(),userId,novelId]);
  const originalFetch = globalThis.fetch;
  let blockedAnalysis = 0;
  // Real persistence + existing accept service; only the trusted AI read boundary
  // is adapted to the SQL fixture. Never runs a generation/provider worker.
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(env.AI_SERVICE_URL + '/')) throw Error('Unexpected outbound blocked');
    if (url.includes('/internal/v1/writing/generations/')) {
      const id = url.split('/').at(-1);
      const row = (await pool.query('select * from narrative.writing_generations where job_id=$1',[id])).rows[0];
      return Response.json(row ? {data:{...row,content_hash:row.base_content_hash,brain_version_used:row.context_summary.brain_version_used}} : {},{status:row?200:404});
    }
    if (url.includes('/v1/story-brains/by-novel/')) {
      const row = (await pool.query('select brain_version from narrative.story_brains where novel_id=$1 and tenant_id=$2',[novelId,userId])).rows[0];
      return Response.json({data:row});
    }
    blockedAnalysis++;
    return new Response('Offline fixture: analysis dispatch disabled',{status:503});
  }) as typeof fetch;
  async function chapter() {
    const chapterId = randomUUID(), revisionId = randomUUID(), content = 'Base QA prose';
    chapters.push(chapterId);
    await pool.query("insert into chapters(chapter_id,novel_id,title,chapter_number,status) values($1,$2,'QA chapter',$3,'DRAFT')",[chapterId,novelId,chapters.length]);
    await pool.query("insert into chapter_revisions(revision_id,novel_id,chapter_id,content,content_hash,source_type) values($1,$2,$3,$4,$5,'AUTHOR_MANUAL')",[revisionId,novelId,chapterId,content,hash(content)]);
    await pool.query('update chapters set latest_revision_id=$1 where chapter_id=$2',[revisionId,chapterId]);
    await upsertDraftChapter({chapterId,novelId,authorId:userId,title:'QA chapter',content,wordCount:3,autosave:false});
    return {chapterId,revisionId,content};
  }
  async function job(c: Awaited<ReturnType<typeof chapter>>, tenant = userId) {
    if (tenant !== userId) await pool.query("insert into narrative.story_brains(id,tenant_id,novel_id,status,brain_version,schema_version) values($1,$2,$3,'active',2,1) on conflict do nothing",[randomUUID(),tenant,novelId]);
    const id = randomUUID();
    await pool.query(`insert into narrative.writing_generations(id,job_id,tenant_id,novel_id,chapter_id,revision_id,base_content_hash,brain_version,
      operation,selection_start,selection_end,instruction,constraints,style,actor_id,idempotency_key,input_hash,status,stage,draft,patch,validation_status,validations,context_summary)
      values($1,$2::uuid,$3,$4,$5,$6,$7,2,'continue',0,0,'PRIVATE FIXTURE','[]','{}',$8,$2::text,$7,'completed','completed','Saved fictional draft',$9,'passed','[]',$10)`,
    [randomUUID(),id,tenant,novelId,c.chapterId,c.revisionId,hash(c.content),userId,
      JSON.stringify({start:c.content.length,end:c.content.length,replacement:' Saved fictional draft'}),JSON.stringify({brain_version_used:2,private_notes:'PRIVATE FIXTURE'})]);
    return id;
  }
  async function state(chapterId: string) {
    return {
      revisions:(await pool.query('select revision_id,content,source_generation_id from chapter_revisions where chapter_id=$1 order by revision_id',[chapterId])).rows,
      outbox:(await pool.query('select event_id,event_type,revision_id from revision_outbox_events where chapter_id=$1 order by event_id',[chapterId])).rows,
      brain:(await pool.query('select brain_version from narrative.story_brains where novel_id=$1 order by tenant_id',[novelId])).rows,
      draft:(await mongo.collection('draft_chapters').findOne({chapterId}))?.content
    };
  }
  return {pool,mongo,userId,otherUser,novelId,chapter,job,state,auth:{userId,role:'AUTHOR' as const},
    scope:(chapterId:string)=>({userId,novelId,chapterId}), originalFetch, blockedAnalysis:()=>blockedAnalysis,
    async close() {
      await new Promise(r=>setTimeout(r,100));
      globalThis.fetch=originalFetch;
      await pool.query('delete from narrative.writing_generations where novel_id=$1',[novelId]);
      await pool.query('delete from narrative.story_brains where novel_id=$1',[novelId]);
      await mongo.collection('draft_chapters').deleteMany({chapterId:{$in:chapters}});
      await pool.query('delete from novels where novel_id=$1',[novelId]);
      await pool.query('delete from users where user_id=any($1::uuid[])',[[userId,otherUser]]);
    }};
}
