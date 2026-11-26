import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import type { UserRole } from '../../shared/constants/roles.js';

describe('PR-09: independent selection reconsiderations', () => {
  const pool = getPostgresPool();
  const reason = 'Đề nghị xem lại hồ sơ dựa trên phiên bản tác phẩm đã công khai và các thông tin bổ sung.';
  const adminPath = '/admin/selection-reconsiderations';
  type Fixture = { novelId: string; caseId: string; owner: string };
  let server: Server;
  let base: string;
  let reviewer: string, admin1: string, admin2: string, reader: string, finance: string;

  async function user(role: UserRole, scope = 'SUPER_ADMIN') {
    const id = randomUUID();
    await pool.query("insert into users(user_id,email,username,role,status) values($1,$2,$3,$4,'ACTIVE')", [id, `${id}@example.test`, id, role]);
    if (role === 'ADMIN') await pool.query('insert into admin_access(user_id,scope) values($1,$2)', [id, scope]);
    return id;
  }

  async function fixture(owner: string, status: 'REJECTED' | 'REVOKED' = 'REJECTED', decider = reviewer): Promise<Fixture> {
    const { rows: [novel] } = await pool.query<{ novel_id: string }>(`insert into novels(author_id,title,synopsis,slug,status)
      values($1,'Truyện xét lại',$2,$3,'PUBLISHED') returning novel_id`, [owner, reason, randomUUID()]);
    await pool.query(`insert into chapters(novel_id,chapter_number,title,content,status)
      select $1,n,'Chương '||n,$2,'PUBLISHED' from generate_series(1,3) n`, [novel.novel_id, reason]);
    const { rows: [item] } = await pool.query<{ case_id: string }>(`insert into novel_selection_cases(novel_id,status,terminal_at)
      values($1,$2,clock_timestamp()) returning case_id`, [novel.novel_id, status]);
    await pool.query(`insert into novel_selection_events(case_id,version,actor_id,action,reason)
      values($1,1,$2,$3,$4)`, [item.case_id, decider, status === 'REJECTED' ? 'REJECT' : 'REVOKE', 'Quyết định gốc']);
    return { novelId: novel.novel_id, caseId: item.case_id, owner };
  }

  async function call(method: string, path: string, actor?: string, body?: object, key?: string) {
    const response = await fetch(base + path, { method, headers: {
      ...(actor ? { authorization: `Bearer ${jwt.sign({ sub: actor, role: 'READER', ver: 0 }, env.JWT_ACCESS_SECRET)}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {})
    }, body: body && JSON.stringify(body) });
    const value = JSON.parse(await response.text());
    return { status: response.status, data: value.data, error: value.error };
  }

  const submit = (target: Fixture, actor = target.owner, decisionVersion = 1) => call('POST',
    `/novels/${target.novelId}/selections/${target.caseId}/reconsiderations`, actor, { decisionVersion, reason });
  const resolve = (id: string, actor: string, outcome: 'ACCEPTED' | 'REJECTED' = 'ACCEPTED', expectedVersion = 1) =>
    call('POST', `${adminPath}/${id}/resolve`, actor, { outcome, expectedVersion, reason });
  const authorDetail = (target: Fixture) => call('GET', `/author/novels/${target.novelId}/selection`, target.owner);
  const publicDetail = (target: Fixture) => call('GET', `/reading/novels/${target.novelId}`);

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    env.NOVEL_SELECTION_ENABLED = true;
    env.NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED = true;
    env.MODERATOR_ENABLED = true;
    [reviewer, admin1, admin2, reader, finance] = await Promise.all([
      user('MODERATOR'), user('ADMIN'), user('ADMIN'), user('READER'), user('ADMIN', 'FINANCE')
    ]);
    server = createApp().listen(0, '127.0.0.1');
    await once(server,'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  });
  after(async () => {
    if (server) await new Promise<void>((done) => server.close(() => done()));
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('E20: only the owner can submit and only one submission is saved for a decision', async () => {
    const owner = await user('AUTHOR');
    const outsider = await user('AUTHOR');
    const target = await fixture(owner);
    assert.equal((await submit(target, reader)).status, 403);
    assert.equal((await submit(target, outsider)).status, 403);
    assert.equal((await submit(target, owner, 2)).status, 409);
    assert.equal((await authorDetail(target)).data.reconsiderationWindow.canSubmit, true);
    const results = await Promise.all([submit(target),submit(target)]);
    assert.deepEqual(results.map((response) => response.status).sort(), [201,409]);
    const readback = (await authorDetail(target)).data;
    assert.equal(readback.reconsiderationWindow.submitted, true);
    assert.equal(readback.reconsiderationWindow.canSubmit, false);
    assert.equal(readback.reconsiderations.length, 1);
    assert.equal(readback.reconsiderations[0].decision_status, 'REJECTED');
    assert.equal((await call('GET', adminPath, reader)).status, 403);
    assert.equal((await call('GET', adminPath, finance)).status, 403);
  });

  test('E20: UTC deadline includes one microsecond before day 14 and excludes the deadline itself', async () => {
    const { rows: [windows] } = await pool.query(`select
      selection_reconsideration_in_window(t,t) as starts,
      selection_reconsideration_in_window(t,t+interval '336 hours'-interval '1 microsecond') as before,
      selection_reconsideration_in_window(t,t+interval '336 hours') as at,
      selection_reconsideration_in_window(t,t-interval '1 microsecond') as early
      from (select '2026-03-07T08:00:00Z'::timestamptz as t) date`);
    assert.deepEqual(windows,{ starts:true,before:true,at:false,early:false });
    const owner = await user('AUTHOR');
    const open = await fixture(owner);
    await pool.query("update novel_selection_cases set terminal_at=clock_timestamp()-interval '336 hours'+interval '10 seconds' where case_id=$1", [open.caseId]);
    assert.equal((await submit(open)).status, 201);
    const expired = await fixture(owner);
    await pool.query("update novel_selection_cases set terminal_at=clock_timestamp()-interval '336 hours' where case_id=$1", [expired.caseId]);
    assert.equal((await submit(expired)).error.code, 'RECONSIDERATION_EXPIRED');
    assert.equal((await authorDetail(expired)).data.reconsiderationWindow.inWindow, false);
    const blocked = await fixture(owner);
    const lock = await pool.connect();
    try {
      await lock.query('begin');
      await lock.query('select novel_id from novels where novel_id=$1 for update', [blocked.novelId]);
      await lock.query("update novel_selection_cases set terminal_at=clock_timestamp()-interval '336 hours'+interval '250 milliseconds' where case_id=$1", [blocked.caseId]);
      const request = submit(blocked);
      await delay(400);
      await lock.query('commit');
      assert.equal((await request).status, 422);
    } finally {
      await lock.query('rollback');
      lock.release();
    }
  });

  test('E20: concurrent requests across novels share three attempts and entries at the 24 hour boundary age out', async () => {
    const owner = await user('AUTHOR');
    const targets = await Promise.all(Array.from({ length: 4 }, () => fixture(owner)));
    const responses = await Promise.all(targets.map((target) => submit(target)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [201,201,201,429]);
    const rejected = targets[responses.findIndex((response) => response.status === 429)];
    await pool.query(`update novel_selection_reconsiderations set created_at=clock_timestamp()-interval '24 hours'
      where reconsideration_id=(select reconsideration_id from novel_selection_reconsiderations where requester_id=$1 order by created_at limit 1)`, [owner]);
    assert.equal((await submit(rejected)).status, 201);
    assert.equal((await pool.query('select 1 from novel_selection_reconsiderations where requester_id=$1', [owner])).rowCount, 4);
  });

  test('E20: original actor remains barred after role change and an independent resolution happens once, even after expiry', async () => {
    const owner = await user('MODERATOR');
    const decider = await user('MODERATOR');
    const target = await fixture(owner, 'REVOKED', decider);
    assert.equal((await call('GET', adminPath, owner)).status, 403);
    const { data: { reconsiderationId } } = await submit(target);
    await pool.query("update users set role='ADMIN' where user_id=$1", [decider]);
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [decider]);
    const shown = (await call('GET',adminPath,decider)).data.items.find((entry: { reconsideration_id: string }) => entry.reconsideration_id===reconsiderationId);
    assert.equal(shown.can_resolve,false);
    assert.equal((await resolve(reconsiderationId,decider)).error.code,'MOD_CONFLICT');
    const nominator = await user('ADMIN');
    await pool.query(`insert into novel_nominations(case_id,nominator_id,kind,reason,idempotency_key,submitted_status)
      values($1,$2,'READER',$3,$4,'PENDING')`, [target.caseId,nominator,reason,randomUUID()]);
    assert.equal((await resolve(reconsiderationId,nominator)).error.code,'MOD_CONFLICT');
    await pool.query("update novel_selection_cases set terminal_at=clock_timestamp()-interval '337 hours' where case_id=$1", [target.caseId]);
    const appealsBefore = (await pool.query('select count(*)::int as n from admin_appeals')).rows[0].n;
    const resolutions = await Promise.all([resolve(reconsiderationId,admin1),resolve(reconsiderationId,admin2)]);
    assert.deepEqual(resolutions.map((result)=>result.status).sort(),[200,409]);
    assert.equal((await authorDetail(target)).data.item.status,'RECHECK');
    assert.equal((await publicDetail(target)).data.selectionLabel,undefined);
    assert.equal((await pool.query("select 1 from novel_selection_events where case_id=$1 and version=1 and action='REVOKE'", [target.caseId])).rowCount,1);
    assert.equal((await pool.query("select 1 from admin_audit where target_id=$1 and action='SELECTION_RECONSIDERATION_ACCEPTED'", [reconsiderationId])).rowCount,1);
    assert.equal((await pool.query('select 1 from notification_events where event_key=$1', [`selection-reconsideration:${reconsiderationId}`])).rowCount,1);
    assert.equal((await pool.query('select count(*)::int as n from admin_appeals')).rows[0].n,appealsBefore);
  });

  test('an open request blocks a new case, rejection preserves the original and stale or ineligible cases cannot be reopened', async () => {
    const owner = await user('AUTHOR');
    const target = await fixture(owner);
    const { data: { reconsiderationId } } = await submit(target);
    await pool.query("update novel_selection_cases set terminal_at=clock_timestamp()-interval '31 days' where case_id=$1", [target.caseId]);
    const nomination = () => call('POST',`/novels/${target.novelId}/nominations`,reader,{ reason },randomUUID());
    assert.equal((await nomination()).error.code,'RECONSIDERATION_OPEN');
    await pool.query('update novels set deleted_at=now() where novel_id=$1', [target.novelId]);
    assert.equal((await resolve(reconsiderationId,admin1)).status,409);
    assert.equal((await resolve(reconsiderationId,admin1,'REJECTED')).data.status,'REJECTED');
    assert.equal((await authorDetail(target)).data.item.status,'REJECTED');
    await pool.query('update novels set deleted_at=null where novel_id=$1', [target.novelId]);
    assert.equal((await nomination()).status,201);
    assert.equal((await submit(target)).status,409);
    const stale = await fixture(owner);
    const staleRequest = await submit(stale);
    await pool.query('insert into novel_selection_cases(novel_id,created_at) values($1,clock_timestamp())', [stale.novelId]);
    assert.equal((await resolve(staleRequest.data.reconsiderationId,admin1)).status,409);
    assert.equal((await authorDetail(stale)).data.reconsiderations.length,1);
  });

  test('rollback pauses new submissions while existing requests remain readable and resolvable', async () => {
    const owner = await user('AUTHOR');
    const existing = await fixture(owner);
    const fresh = await fixture(owner);
    const { data: { reconsiderationId } } = await submit(existing);
    env.NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED = false;
    try {
      assert.equal((await submit(fresh)).status,503);
      assert.equal((await authorDetail(fresh)).data.reconsiderationWindow.canSubmit,false);
      assert.equal((await authorDetail(existing)).data.reconsiderations.length,1);
      assert.equal((await resolve(reconsiderationId,admin1,'REJECTED')).status,200);
    } finally {
      env.NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED = true;
    }
  });
});
