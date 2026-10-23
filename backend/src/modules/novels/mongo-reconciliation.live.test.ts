import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { connectMongo, disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { findLatestRevisionByChapterId } from './chapter-revisions.repository.js';
import { createSnapshot } from './chapter-revisions.service.js';
import { syncDraftFromRevisionConditional, findDraftChapterByChapterId, upsertDraftChapter } from './draft-chapters.repository.js';

describe('Live MongoDB Draft Reconciliation Probe (P6.5 Hardening)', () => {
  const pool = getPostgresPool();
  const db = getMongoDatabase();
  const authorId = randomUUID();
  const novelId = randomUUID();
  const sentinelAuthorId = randomUUID();
  // Deliberately resembles the old cleanup prefix: it must survive fixture cleanup.
  const sentinelChapterId = `live-test-chap-sentinel-${randomUUID()}`;
  const fixtures = Array.from({ length: 3 }, (_, index) => ({
    chapterId: randomUUID(), parentId: randomUUID(), revisionId: randomUUID(),
    title: `Reconciliation fixture ${index + 1}`, content: `Accepted canonical body ${index + 1}`,
    acceptedAt: new Date(Date.now() - 10_000),
  }));
  const chapterIds = fixtures.map(f => f.chapterId);
  const revisionIds = fixtures.flatMap(f => [f.parentId, f.revisionId]);
  let seeded = false;
  let mongoSentinelInserted = false;
  let sentinelPg: unknown;
  let sentinelMongo: unknown;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');

  async function ownedSnapshot() {
    return {
      users: (await pool.query('select user_id from users where user_id=$1', [authorId])).rows,
      novels: (await pool.query('select novel_id from novels where novel_id=$1', [novelId])).rows,
      chapters: (await pool.query('select chapter_id,latest_revision_id from chapters where chapter_id=any($1::uuid[]) order by chapter_id', [chapterIds])).rows,
      revisions: (await pool.query('select revision_id,parent_revision_id,content_hash from chapter_revisions where revision_id=any($1::uuid[]) order by revision_id', [revisionIds])).rows,
      drafts: await db.collection('draft_chapters').find({chapterId: {$in: chapterIds}}).sort({chapterId:1}).toArray(),
    };
  }

  before(async () => {
    // Validate live targets before indexes, inserts, or cleanup can mutate either store.
    const identity = await validateTestDatabaseIsolation(pool, db);
    await connectMongo();
    const beforeSetup = await ownedSnapshot();
    assert.ok(Object.values(beforeSetup).every(rows => rows.length === 0));
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const id of [authorId, sentinelAuthorId]) {
        await client.query("insert into users(user_id,email,username,role) values($1,$2,$3,'AUTHOR')", [id,`${id}@example.test`,`reconcile_${id}`]);
      }
      await client.query("insert into novels(novel_id,author_id,title,slug,synopsis) values($1,$2,'Reconciliation fixture',$3,'Synthetic test only')", [novelId,authorId,`reconcile-${novelId}`]);
      for (const [index, f] of fixtures.entries()) {
        await client.query('insert into chapters(chapter_id,novel_id,chapter_number,title,content,word_count) values($1,$2,$3,$4,$5,4)', [f.chapterId,novelId,index+1,f.title,f.content]);
        for (const parent of [true,false]) {
          const content = parent ? 'Previous canonical body' : f.content;
          await client.query(`insert into chapter_revisions(revision_id,novel_id,chapter_id,parent_revision_id,content_hash,content,word_count,source_type,created_by,created_at)
            values($1,$2,$3,$4,$5,$6,4,'AUTHOR_MANUAL',$7,$8)`,
          [parent ? f.parentId : f.revisionId,novelId,f.chapterId,parent ? null : f.parentId,hash(content),content,authorId,new Date(f.acceptedAt.getTime()-(parent ? 10_000 : 0))]);
        }
        await client.query('update chapters set latest_revision_id=$1 where chapter_id=$2',[f.revisionId,f.chapterId]);
      }
      await client.query('commit');
      seeded = true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
    sentinelPg = (await pool.query('select * from users where user_id=$1',[sentinelAuthorId])).rows[0];
    await db.collection('draft_chapters').insertOne({chapterId:sentinelChapterId,content:'Unrelated sentinel; never reconcile or prefix-delete',version:7});
    mongoSentinelInserted = true;
    sentinelMongo = await db.collection('draft_chapters').findOne({chapterId:sentinelChapterId});
    console.log(JSON.stringify({stage:'fixture_setup',identity,beforeSetup,afterSetup:await ownedSnapshot()}));
  });

  after(async () => {
    try {
      if (seeded) {
        const beforeCleanup = await ownedSnapshot();
        await db.collection('draft_chapters').deleteMany({chapterId:{$in:chapterIds}});
        await pool.query('update chapters set latest_revision_id=null where chapter_id=any($1::uuid[])',[chapterIds]);
        await pool.query('delete from chapter_revisions where revision_id=any($1::uuid[])',[revisionIds]);
        await pool.query('delete from chapters where chapter_id=any($1::uuid[])',[chapterIds]);
        await pool.query('delete from novels where novel_id=$1',[novelId]);
        await pool.query('delete from users where user_id=$1',[authorId]);
        const afterCleanup = await ownedSnapshot();
        assert.ok(Object.values(afterCleanup).every(rows => rows.length===0),'exact fixture cleanup must remove every owned row/document');
        try {
          if (sentinelPg) assert.deepEqual((await pool.query('select * from users where user_id=$1',[sentinelAuthorId])).rows[0],sentinelPg);
          if (sentinelMongo) assert.deepEqual(await db.collection('draft_chapters').findOne({chapterId:sentinelChapterId}),sentinelMongo);
          console.log(JSON.stringify({stage:'fixture_cleanup',beforeCleanup,afterCleanup,sentinelsPreserved:!!sentinelPg && !!sentinelMongo}));
        } finally {
          // Sentinel teardown is separate and occurs only after preservation assertions.
          if (mongoSentinelInserted) await db.collection('draft_chapters').deleteOne({chapterId:sentinelChapterId});
          await pool.query('delete from users where user_id=$1',[sentinelAuthorId]);
        }
      }
    } finally {
      await Promise.all([disconnectMongo(),disconnectPostgres()]);
    }
  });

  async function acceptedInput(index: number) {
    const f = fixtures[index];
    const revision = await findLatestRevisionByChapterId(undefined,f.chapterId);
    assert.ok(revision,'a real latest PG revision must exist; latest=null is not this test');
    assert.equal(revision.revisionId,f.revisionId);
    assert.equal(revision.parentRevisionId,f.parentId);
    assert.equal(revision.novelId,novelId);
    assert.equal(revision.createdBy,authorId);
    assert.equal(revision.contentHash,hash(f.content));
    assert.equal(revision.content,f.content);
    return {chapterId:f.chapterId,novelId:revision.novelId,authorId:revision.createdBy!,revisionId:revision.revisionId,title:f.title,content:revision.content,wordCount:revision.wordCount,acceptTimestamp:revision.createdAt};
  }

  test('Targeted Probe 1: Older draft is cleanly updated by accepted revision', async (t) => {
    const input = await acceptedInput(0);
    const original = await upsertDraftChapter({...input,content:'Older editor buffer',autosave:false});
    assert.ok(original);
    await db.collection('draft_chapters').updateOne({chapterId:input.chapterId},{$set:{updatedAt:new Date(input.acceptTimestamp.getTime()-1000)}});
    const result = await syncDraftFromRevisionConditional(input);
    assert.equal(result.status,'synced');
    const stored = await findDraftChapterByChapterId(input.chapterId);
    assert.deepEqual(result.draft,stored);
    assert.equal(stored?.content,input.content);
    assert.equal(stored?.lastAcceptedRevisionId,input.revisionId);
    assert.equal(stored?.lastAcceptedAt?.getTime(),input.acceptTimestamp.getTime());
    assert.equal(stored?.version,original.version+1);
    assert.equal(stored?.novelId,novelId);
    assert.equal(stored?.authorId,authorId);
    t.diagnostic(JSON.stringify({probe:1,latestRevision:input.revisionId,parentRevision:fixtures[0].parentId,draft:stored}));
  });

  test('Targeted Probe 2: Newer manual draft edit is NOT overwritten by delayed revision sync', async (t) => {
    const input = await acceptedInput(1);
    await upsertDraftChapter({...input,content:'Newer manual edit must survive',autosave:false});
    const before = await findDraftChapterByChapterId(input.chapterId);
    assert.ok(before && before.updatedAt>input.acceptTimestamp);
    // Incoming revision IS latest: reach the timestamp guard, not the PG superseded guard.
    const delayed = await syncDraftFromRevisionConditional(input);
    assert.equal(delayed.status,'skipped_newer_draft');
    assert.deepEqual(delayed.draft,before);
    assert.deepEqual(await findDraftChapterByChapterId(input.chapterId),before);
    assert.notEqual(before.lastAcceptedRevisionId,input.revisionId);
    // A superseded revision must also be rejected even with a newer timestamp.
    const superseded = await syncDraftFromRevisionConditional({...input,revisionId:fixtures[1].parentId,acceptTimestamp:new Date(before.updatedAt.getTime()+1000)});
    assert.equal(superseded.status,'skipped_newer_draft');
    assert.equal(superseded.draft,undefined);
    const after = await findDraftChapterByChapterId(input.chapterId);
    assert.deepEqual(after,before);
    t.diagnostic(JSON.stringify({probe:2,latestRevision:input.revisionId,before,after,supersededStatus:superseded.status}));
  });

  test('Targeted Probe 3: No-draft recovery creates document with trusted ownership and version', async (t) => {
    const input = await acceptedInput(2);
    assert.equal(await findDraftChapterByChapterId(input.chapterId),null);
    const result = await syncDraftFromRevisionConditional(input);
    assert.equal(result.status,'synced');
    const stored = await findDraftChapterByChapterId(input.chapterId);
    assert.deepEqual(result.draft,stored);
    assert.equal(stored?.chapterId,input.chapterId);
    assert.equal(stored?.novelId,novelId);
    assert.equal(stored?.authorId,authorId);
    assert.equal(stored?.version,1);
    assert.equal(stored?.content,input.content);
    assert.equal(stored?.lastAcceptedRevisionId,input.revisionId);
    assert.equal(stored?.lastAcceptedAt?.getTime(),input.acceptTimestamp.getTime());
    t.diagnostic(JSON.stringify({probe:3,before:null,latestRevision:input.revisionId,draft:stored}));
  });
  test('Targeted Probe 4: Same applied revision is a no-op, including timestamps', async (t) => {
    const input = await acceptedInput(0);
    const before = await findDraftChapterByChapterId(input.chapterId);
    assert.ok(before?.lastAcceptedAt);
    // A later delivery timestamp does not turn the same revision into a new write.
    const result = await syncDraftFromRevisionConditional({...input,acceptTimestamp:new Date(before.updatedAt.getTime()+1000)});
    assert.equal(result.status,'synced');
    assert.deepEqual(result.draft,before);
    assert.deepEqual(await findDraftChapterByChapterId(input.chapterId),before);
    t.diagnostic(JSON.stringify({probe:4,before,after:result.draft}));
  });

  test('Targeted Probe 5: Identical prose from a different accepted revision still advances provenance', async (t) => {
    const input = await acceptedInput(0);
    await db.collection('draft_chapters').updateOne({chapterId:input.chapterId},{$set:{lastAcceptedRevisionId:fixtures[0].parentId,updatedAt:new Date(input.acceptTimestamp.getTime()-1000)}});
    const before = await findDraftChapterByChapterId(input.chapterId);
    assert.ok(before);
    const result = await syncDraftFromRevisionConditional(input);
    assert.equal(result.status,'synced');
    assert.equal(result.draft?.lastAcceptedRevisionId,input.revisionId);
    assert.equal(result.draft?.version,before.version+1);
    assert.equal(result.draft?.content,before.content);
    t.diagnostic(JSON.stringify({probe:5,before,after:result.draft}));
  });

  test('Targeted Probe 6: Reusing an old immutable snapshot cannot acquire a new timestamp over a manual draft', async (t) => {
    const input = await acceptedInput(1);
    const before = await findDraftChapterByChapterId(input.chapterId);
    assert.ok(before && before.updatedAt > input.acceptTimestamp);
    const revision = await createSnapshot({userId:authorId,role:'AUTHOR'},input.chapterId,
      {content:input.content,purpose:'AUTHOR_SNAPSHOT'});
    const after = await findDraftChapterByChapterId(input.chapterId);
    assert.equal(revision.revisionId,input.revisionId);
    assert.deepEqual(after,before);
    t.diagnostic(JSON.stringify({probe:6,revision:revision.revisionId,revisionCreatedAt:revision.createdAt,before,after}));
  });

});
