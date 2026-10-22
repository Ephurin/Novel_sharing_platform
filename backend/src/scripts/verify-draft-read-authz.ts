// Explicit opt-in integration probe; never run against a shared database.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { getPostgresPool, disconnectPostgres } from '../core/database/postgres.js';
import { getMongoDatabase, connectMongo, disconnectMongo } from '../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../core/database/test-db-guard.js';
import { getChapter } from '../modules/novels/chapters.service.js';
import { env } from '../core/config/env.js';

const out = process.env.AUTHZ_EVIDENCE_DIR;
assert.ok(out, 'AUTHZ_EVIDENCE_DIR required');
assert.equal(process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS, '1');
const red = process.env.AUTHZ_EXPECT_RED === '1';
const pool = getPostgresPool();
const mongo = getMongoDatabase();
const traces: unknown[] = [];
const checks: string[] = [];
let providerCalls = 0;
const fake = createServer((_req, res) => { providerCalls++; res.writeHead(503).end('{}'); });
await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
env.AI_SERVICE_URL = `http://127.0.0.1:${(fake.address() as {port:number}).port}`;
env.AI_LLM_BASE_URL = env.AI_SERVICE_URL;
env.AI_LLM_API_KEY = undefined;
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api/v1`;
let identity: unknown;
let failure: string | undefined;
const snapshots: unknown[] = [];
async function api(method: string, path: string, token: string | undefined, expected: number, body?: unknown) {
  const response = await fetch(base + path, {method, headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json() as any;
  traces.push({method,path,status:response.status,actor:token ? 'authenticated' : 'anonymous',response:path.startsWith('/auth/') ? {redacted:true} : result});
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
  checks.push(`${method} ${path} ${expected}`);
  return result.data;
}
async function snapshot() {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const state: Record<string,unknown> = {};
  for (const {tablename} of tables) {
    const rows = (await pool.query(`select row_to_json(t) as row from "${tablename}" t`)).rows.map(r => JSON.stringify(r.row)).sort();
    state[tablename] = rows;
  }
  for (const {name} of await mongo.listCollections().toArray()) state[`mongo:${name}`] = (await mongo.collection(name).find().toArray()).map(r => JSON.stringify(r)).sort();
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
try {
  identity = await validateTestDatabaseIsolation(pool,mongo);
  await connectMongo();
  const accounts: any[] = [];
  for (const role of ['AUTHOR','AUTHOR','READER','ADMIN']) {
    const username = 'authz_' + randomUUID().replaceAll('-','');
    const password = 'FixtureA9_' + randomUUID();
    const registration = await api('POST','/auth/register',undefined,201,{username,email:username+'@example.test',password});
    await pool.query('update users set role=$1 where user_id=$2',[role,registration.user.userId]);
    accounts.push(await api('POST','/auth/login',undefined,200,{identifier:username,password}));
  }
  const [a,b,reader,admin] = accounts;
  const novel = await api('POST','/novels',a.accessToken,201,{title:'Private authz fixture',synopsis:'Synthetic isolated fixture'});
  const marker = 'ASTRA_PRIVATE_DRAFT_' + randomUUID();
  const chapter = await api('POST',`/novels/${novel.novelId}/chapters`,a.accessToken,201,{title:'Private chapter',content:marker});
  const path = `/chapters/${chapter.chapterId}`;
  const list = `/novels/${novel.novelId}/chapters`;
  const owner = await api('GET',path,a.accessToken,200);
  assert.equal(owner.draft.content,marker);
  assert.equal(owner.draft.version,chapter.draftVersion);
  const before = await snapshot();
  for (const token of [undefined,b.accessToken]) {
    const result = await api('GET',path,token,red ? 200 : token ? 403 : 401);
    if (red) assert.equal(result.draft.content,marker);
  }
  if (red) {
    const rows = await api('GET',list,undefined,200);
    assert.ok(rows.some((r:any) => r.chapterId === chapter.chapterId && r.status === 'DRAFT'));
    checks.push('RED public list discloses unpublished title/id/status');
  } else {
    for (const token of [undefined,b.accessToken,reader.accessToken]) await api('GET',list,token,token ? 403 : 401);
    assert.equal((await api('GET',list,a.accessToken,200))[0].chapterId,chapter.chapterId);
    await api('GET',path,reader.accessToken,403);
    await api('GET',path,'invalid-token',401);
    await api('GET',path+'?authorId='+a.user.userId+'&novel_id='+novel.novelId,b.accessToken,403);
    await api('GET','/chapters/'+randomUUID(),a.accessToken,404);
    await api('GET',path,admin.accessToken,200);
    for (const auth of [undefined,{userId:b.user.userId,role:'AUTHOR'},{userId:a.user.userId,role:'READER'}]) {
      await assert.rejects(() => (getChapter as Function)(chapter.chapterId,auth),(e:any) => e.httpStatus === (auth ? 403 : 401));
    }
    assert.equal((await (getChapter as Function)(chapter.chapterId,{userId:a.user.userId,role:'AUTHOR'})).draft.content,marker);
    checks.push('direct service denies absent/foreign/reader auth; owner succeeds');
  }
  const after = await snapshot();
  snapshots.push({stage:'private GET/list matrix',before,after});
  assert.equal(after,before,'read requests must not mutate any PG/Mongo table');
  for (const status of ['REJECTED','PENDING_MODERATION','ARCHIVED','PUBLISHED']) {
    await pool.query('update chapters set status=$1, content=$2 where chapter_id=$3',[status,'CANONICAL_PUBLIC_FIXTURE',chapter.chapterId]);
    // Test-only database state fixtures, not publication via product API.
    const start = await snapshot();
    await api('GET',path,undefined,red ? 200 : 401);
    await api('GET',path,b.accessToken,red ? 200 : 403);
    const view = await api('GET',path,a.accessToken,200);
    assert.deepEqual(view.draft,owner.draft);
    assert.equal(await snapshot(),start);
    snapshots.push({stage:status,before:start,after:start});
  }
  await api('GET',`/reading/chapters/${chapter.chapterId}`,undefined,404);
  await pool.query("update novels set status='PUBLISHED' where novel_id=$1",[novel.novelId]);
  const publicView = await api('GET',`/reading/chapters/${chapter.chapterId}`,undefined,200);
  assert.equal(publicView.content,'CANONICAL_PUBLIC_FIXTURE');
  assert.ok(!JSON.stringify(publicView).includes(marker));
  await pool.query('update chapters set is_vip=true, price_coins=5 where chapter_id=$1',[chapter.chapterId]);
  const vipBefore = await snapshot();
  for (const token of [undefined,reader.accessToken,b.accessToken]) await api('GET',`/reading/chapters/${chapter.chapterId}`,token,402);
  assert.equal(await snapshot(),vipBefore);
  const catalog = await api('GET',`/reading/novels/${novel.novelId}`,undefined,200);
  assert.ok(!JSON.stringify(catalog).includes(marker));
  assert.ok(!JSON.stringify(catalog).includes('CANONICAL_PUBLIC_FIXTURE'));
  const novelPublic = await api('GET',`/novels/${novel.novelId}`,undefined,200);
  assert.ok(!JSON.stringify(novelPublic).includes(marker));
  if (red) {
    const rows = await api('GET',list,undefined,200);
    assert.equal(rows[0].content,'CANONICAL_PUBLIC_FIXTURE');
    checks.push('RED public list bypasses locked VIP canonical body gate');
  } else {
    for (const status of ['LOCKED','DELETED']) {
      await pool.query('update users set status=$1 where user_id=$2',[status,a.user.userId]);
      await api('GET',path,a.accessToken,403);
    }
    await pool.query("update users set status='ACTIVE', deleted_at=now() where user_id=$1",[a.user.userId]);
    await api('GET',path,a.accessToken,401);
    await pool.query('update users set deleted_at=null where user_id=$1',[a.user.userId]);
    await pool.query('update novels set deleted_at=now() where novel_id=$1',[novel.novelId]);
    await api('GET',path,admin.accessToken,404);
  }
  assert.equal(providerCalls,0);
} catch (error) {
  failure = String(error);
  process.exitCode = 1;
} finally {
  await mkdir(out,{recursive:true});
  await writeFile(`${out}/http-trace.jsonl`,traces.map(x=>JSON.stringify(x)).join('\n')+'\n');
  await writeFile(`${out}/validation.json`,JSON.stringify({mode:red?'RED':'GREEN',passed:!failure,failure,identity,checks,snapshots,providerCalls},null,2));
  await new Promise<void>(r=>server.close(()=>r()));
  await new Promise<void>(r=>fake.close(()=>r()));
  await disconnectPostgres();
  await disconnectMongo();
}
if (failure) console.error(failure);
