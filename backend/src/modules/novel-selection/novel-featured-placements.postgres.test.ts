import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';

describe('PR-10 featured placements', () => {
  const pool = getPostgresPool();
  const adminPath = '/moderator/placements';
  const reason = 'Giới thiệu tác phẩm đủ tiêu chí trên trang chủ.';
  const day = 86_400_000;
  let api: string;
  let server: Server;
  let owner: string, mod: string, mod2: string, admin: string, finance: string;

  async function user(role: string, scope = 'SUPER_ADMIN') {
    const id = randomUUID();
    await pool.query("insert into users(user_id,email,username,role,status) values($1,$2,$3,$4,'ACTIVE')",
      [id, id + '@example.test',id,role]);
    if (role === 'ADMIN') await pool.query('insert into admin_access(user_id,scope) values($1,$2)',[id,scope]);
    return id;
  }
  async function novel() {
    const { rows: [n] } = await pool.query(`insert into novels(author_id,title,slug,synopsis,status)
      values($1,'Truyện giới thiệu',$2,$3,'PUBLISHED') returning novel_id`,[owner,randomUUID(),reason]);
    await pool.query(`insert into chapters(novel_id,title,chapter_number,status,content)
      select $1,'Chương '||i,i,'PUBLISHED',$2 from generate_series(1,3) i`,[n.novel_id,reason]);
    const { rows: [s] } = await pool.query(`insert into novel_selection_cases(novel_id,status,reviewed_branch)
      values($1,'SELECTED','STANDARD') returning case_id`,[n.novel_id]);
    return {novelId: String(n.novel_id),caseId: String(s.case_id)};
  }
  async function call(method: string, route: string, actor?: string, body?: object, key?: string) {
    const response = await fetch(api + route,{ method, headers:{
      ...(actor && {authorization:'Bearer '+jwt.sign({sub:actor,role:'READER',ver:0},env.JWT_ACCESS_SECRET)}),
      ...(body && {'content-type':'application/json'}), ...(key && {'idempotency-key':key})
    }, body: body && JSON.stringify(body) });
    const payload = JSON.parse(await response.text());
    return {status:response.status,data:payload.data,error:payload.error,headers:response.headers};
  }
  function place(caseId: string, input: object = {}, key = String(randomUUID()), actor = mod) {
    return call('POST',adminPath,actor,{caseId,startsAt:new Date(Date.now()-60_000).toISOString(),priority:0,reason,...input},key);
  }
  const feed = () => call('GET','/reading/featured-selections');
  const edit = (id: string, priority: number, version = 1, actor = mod) => call('PATCH',adminPath+'/'+id,actor,{priority,expectedVersion:version,reason});
  const cancel = (id: string, version: number) => call('DELETE',adminPath+'/'+id,mod2,{expectedVersion:version,reason});

  before(async () => {
    await validateTestDatabaseIsolation(pool,getMongoDatabase());
    env.NOVEL_SELECTION_ENABLED = env.NOVEL_FEATURED_PLACEMENTS_ENABLED = env.MODERATOR_ENABLED = true;
    [owner,mod,mod2,admin,finance] = await Promise.all([user('MODERATOR'),user('MODERATOR'),user('MODERATOR'),user('ADMIN'),user('ADMIN','FINANCE')]);
    server = createApp().listen(0,'127.0.0.1');
    await once(server,'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    api = `http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  });
  after(async () => {
    if (server) await new Promise<void>(done=>server.close(()=>done()));
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('E22: UTC windows, boundary priority, independent permission, and idempotent creation',async () => {
    const target = await novel();
    const start = Date.now()-60_000;
    const startsAt = new Date(start).toISOString();
    assert.equal((await place(target.caseId,{startsAt},undefined,owner)).status,403);
    assert.equal((await place(target.caseId,{startsAt},undefined,finance)).status,403);
    for(const priority of [-1, 100.1, 101]) assert.equal((await place(target.caseId,{startsAt,priority})).status,400);
    assert.equal((await place(target.caseId,{startsAt,endsAt:new Date(start+14*day+1).toISOString()})).status,422);
    assert.equal((await place(target.caseId,{startsAt,endsAt:startsAt})).status,422);
    const key = String(randomUUID());
    const [first,replay] = await Promise.all([place(target.caseId,{startsAt},key),place(target.caseId,{startsAt},key)]);
    assert.deepEqual([first.status,replay.status].sort(),[200,201]);
    assert.equal(first.data.placement_id,replay.data.placement_id);
    assert.equal(Date.parse(first.data.ends_at)-Date.parse(first.data.starts_at),7*day);
    assert.equal((await place(target.caseId,{startsAt,priority:1},key)).error.code,'PLACEMENT_IDEMPOTENCY');
    const nextStart = Date.parse(first.data.ends_at);
    const next = await place(target.caseId,{startsAt:new Date(nextStart).toISOString(),
      endsAt:new Date(nextStart+14*day).toISOString(),priority:100},undefined,admin);
    assert.equal(next.status,201);
    assert.equal((await pool.query("select 1 from admin_audit where target_id=$1 and action='PLACEMENT_CREATE'",[first.data.placement_id])).rowCount,1);
    await cancel(first.data.placement_id,1);
    await cancel(next.data.placement_id,1);
  });

  test('E22: overlapping creation and conflicting updates serialize, equal priority does not write',async () => {
    const target = await novel();
    const startsAt = new Date(Date.now()-60_000).toISOString();
    const attempts = await Promise.all([place(target.caseId,{startsAt},undefined,mod),place(target.caseId,{startsAt},undefined,mod2)]);
    assert.deepEqual(attempts.map(item=>item.status).sort(),[201,409]);
    const id = attempts.find(item=>item.status===201)?.data.placement_id;
    assert.equal((await edit(id,0)).data.version,1);
    const edits=await Promise.all([edit(id,20),edit(id,30,1,mod2)]);
    assert.deepEqual(edits.map(item=>item.status).sort(),[200,409]);
    assert.equal(edits.find(item=>item.status===200)?.data.starts_at,startsAt);
    const outcomes=await Promise.all([edit(id,40,2),cancel(id,2)]);
    assert.deepEqual(outcomes.map(item=>item.status).sort(),[200,409]);
    const row=(await pool.query('select version,cancelled_at from novel_featured_placements where placement_id=$1',[id])).rows[0];
    if(!row.cancelled_at) assert.equal((await cancel(id,row.version)).status,200);
    assert.equal((await pool.query("select 1 from admin_audit where target_id=$1 and action='PLACEMENT_CANCEL'",[id])).rowCount,1);
  });

  test('E13/E14/E22: filter before six, stable order, fresh reads and expiry keeps the label',async () => {
    const targets = await Promise.all(Array.from({length:8},()=>novel()));
    const fixedStart = new Date(Date.now()-120_000).toISOString();
    assert.deepEqual((await feed()).data.items,[]);
    const rows = await Promise.all(targets.map((target,index)=>place(target.caseId,{
      startsAt:index===1 ? new Date(Date.parse(fixedStart)+60_000).toISOString() : fixedStart,
      priority:index===0 ? 100 : index<4 ? 80 : 20
    })));
    assert.ok(rows.every(row=>row.status===201));
    const ordered = [...rows].sort((a,b)=>b.data.priority-a.data.priority ||
      a.data.starts_at.localeCompare(b.data.starts_at) || a.data.placement_id.localeCompare(b.data.placement_id));
    const first=await feed();
    assert.equal(first.headers.get('cache-control'),'no-store');
    assert.deepEqual(first.data.items.map((item:{placementId:string})=>item.placementId),ordered.slice(0,6).map(row=>row.data.placement_id));
    const top = rows[0].data;
    await pool.query("update novels set deleted_at=now() where novel_id=$1",[targets[0].novelId]);
    assert.deepEqual((await feed()).data.items.map((item:{placementId:string})=>item.placementId),ordered.slice(1,7).map(row=>row.data.placement_id));
    assert.equal((await edit(top.placement_id,90)).status,409);
    assert.equal((await pool.query("select 1 from admin_audit where target_id=$1 and action='PLACEMENT_AUTO_CANCEL'",[top.placement_id])).rowCount,1);
    await pool.query("update novels set deleted_at=null where novel_id=$1",[targets[0].novelId]);
    assert.equal((await pool.query('select status from novel_selection_cases where case_id=$1',[targets[0].caseId])).rows[0].status,'RECHECK');
    await pool.query("update novel_featured_placements set ends_at=statement_timestamp() where placement_id=$1",[rows[1].data.placement_id]);
    assert.ok(!(await feed()).data.items.some((item:{placementId:string})=>item.placementId===rows[1].data.placement_id));
    assert.ok((await call('GET','/reading/novels/'+targets[1].novelId)).data.selectionLabel);
    await pool.query("update novel_featured_placements set starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where placement_id=$1",[rows[1].data.placement_id]);
    assert.ok(!(await feed()).data.items.some((item:{placementId:string})=>item.placementId===rows[1].data.placement_id));
    assert.ok((await feed()).data.refreshInMs>0);
    env.NOVEL_FEATURED_PLACEMENTS_ENABLED=false;
    try {
      assert.deepEqual((await feed()).data.items,[]);
      assert.equal((await place(targets[2].caseId)).status,404);
      assert.equal((await pool.query('select 1 from novel_featured_placements where placement_id=$1',[rows[2].data.placement_id])).rowCount,1);
    } finally { env.NOVEL_FEATURED_PLACEMENTS_ENABLED=true; }
  });
});
