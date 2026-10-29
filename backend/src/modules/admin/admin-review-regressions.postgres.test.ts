import { before, after, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { isContentAdmin } from '../../core/security/auth-context.js';
import { adminAccess } from './admin-access.js';
import { drainAdminJobs } from './admin-jobs.js';
import {
  createNotification,
  ensureNotificationIndexes
} from '../interactions/notifications.repository.js';

describe('PR74: queue liveness and fail-closed Admin entitlements', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const root = randomUUID(),
    missing = randomUUID(),
    promoted = randomUUID();
  const jobs = new Set<string>();
  let server: Server;
  let base: string;
  const token = (userId: string) => jwt.sign({ sub: userId, role: 'ADMIN' }, env.JWT_ACCESS_SECRET);
  const request = async (path: string, userId = root, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body ? 'PATCH' : 'GET',
      headers: { authorization: `Bearer ${token(userId)}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: (await response.json()) as { data: any } };
  };
  const enqueue = async (kind: string, payload: unknown) => {
    const row = (
      await pool.query('insert into admin_jobs(kind,payload) values($1,$2) returning *', [
        kind,
        payload
      ])
    ).rows[0];
    jobs.add(row.job_id);
    return row;
  };
  const notification = () => ({
    userId: root,
    type: 'PR74_TEST',
    title: 'Independent delivery',
    content: 'Isolated regression'
  });
  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    for (const [id, role] of [
      [root, 'ADMIN'],
      [missing, 'ADMIN'],
      [promoted, 'READER']
    ])
      await pool.query(
        "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,'test-only',$4,'ACTIVE')",
        [id, `pr74-${id}@example.test`, `pr74-${id}`, role]
      );
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [root]);
    await ensureNotificationIndexes();
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  });
  afterEach(async () => {
    if (jobs.size)
      await pool.query('delete from admin_jobs where job_id=any($1::uuid[])', [[...jobs]]);
    jobs.clear();
  });
  after(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve()))
      );
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('R74-01 RED regression: a poison first job does not starve a healthy second job', async () => {
    const poison = await enqueue('COMMENT_SYNC', { sanctionId: 'invalid-uuid' });
    const healthy = await enqueue('NOTIFY', notification());
    await drainAdminJobs();
    const rows = (
      await pool.query('select * from admin_jobs where job_id=any($1::uuid[])', [
        [poison.job_id, healthy.job_id]
      ])
    ).rows;
    assert.equal(
      rows.find((r) => r.job_id === healthy.job_id).status,
      'DONE',
      'healthy job must progress despite preceding permanent failure'
    );
    const failed = rows.find((r) => r.job_id === poison.job_id);
    assert.equal(failed.attempts, 1);
    assert.ok(failed.error);
    assert.ok(new Date(failed.next_attempt_at).getTime() > Date.now(), 'failed job must back off');
  });

  test('R74-01: poison job reaches quarantine, remains inspectable and can be explicitly retried', async () => {
    const poison = await enqueue('COMMENT_SYNC', { sanctionId: 'invalid-uuid' });
    let row: any;
    for (let i = 0; i < 12; i++) {
      await pool.query(
        "update admin_jobs set next_attempt_at=now()-interval '1 second' where job_id=$1",
        [poison.job_id]
      );
      await drainAdminJobs();
      row = (await pool.query('select * from admin_jobs where job_id=$1', [poison.job_id])).rows[0];
      if (row.status === 'FAILED') break;
      assert.ok(
        new Date(row.next_attempt_at).getTime() - Date.now() <= 301000,
        'retry delay must be bounded'
      );
    }
    assert.equal(row.status, 'FAILED');
    assert.ok(row.attempts > 1 && row.attempts <= 10);
    assert.ok(row.error);
    assert.ok(row.failed_at);
    const healthy = await enqueue('NOTIFY', notification());
    await drainAdminJobs();
    assert.equal(
      (await pool.query('select status from admin_jobs where job_id=$1', [healthy.job_id])).rows[0]
        .status,
      'DONE'
    );
    const listed = await request('/admin/jobs');
    assert.equal(listed.status, 200);
    assert.ok(
      listed.body.data.some((j: any) => j.job_id === poison.job_id && j.status === 'FAILED')
    );
    const response = await fetch(`${base}/admin/jobs/${poison.job_id}/retry`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token(root)}`, 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    const retried = (await pool.query('select * from admin_jobs where job_id=$1', [poison.job_id]))
      .rows[0];
    assert.equal(retried.status, 'PENDING');
    assert.equal(retried.retry_count, 1);
    assert.ok(retried.attempts <= 1);
  });

  test('R74-01: malformed notification is isolated and does not retry before its due time', async () => {
    const poison = await enqueue('NOTIFY', { ...notification(), userId: null });
    const healthy = await enqueue('NOTIFY', notification());
    await drainAdminJobs();
    await drainAdminJobs();
    const row = (await pool.query('select * from admin_jobs where job_id=$1', [poison.job_id]))
      .rows[0];
    assert.equal(row.status, 'PENDING');
    assert.equal(row.attempts, 1);
    assert.ok(row.error);
    assert.equal(
      (await pool.query('select status from admin_jobs where job_id=$1', [healthy.job_id])).rows[0]
        .status,
      'DONE'
    );
  });

  test('R74-01: concurrent drains and restart after Mongo delivery do not duplicate notifications', async () => {
    const payload = notification();
    const job = await enqueue('NOTIFY', payload);
    // Simulate a worker crash after Mongo delivery but before acknowledging PostgreSQL.
    await createNotification({ ...payload, eventKey: `admin-job:${job.job_id}` });
    const worker = () =>
      new Promise<void>((resolve, reject) => {
        const program =
          "import {drainAdminJobs} from './src/modules/admin/admin-jobs.ts';import {disconnectPostgres} from './src/core/database/postgres.ts';import {disconnectMongo} from './src/core/database/mongo.ts';try{await drainAdminJobs();}finally{await disconnectMongo();await disconnectPostgres();}";
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '-e', program],
          {
            cwd: process.cwd(),
            env: process.env,
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe']
          }
        );
        let stderr = '';
        child.stderr.on('data', (data) => (stderr += data));
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(stderr || `Worker exited ${code}`))
        );
      });
    await Promise.all([worker(), worker()]);
    await drainAdminJobs();
    const notificationId = createHash('sha256').update(`admin-job:${job.job_id}`).digest('hex');
    assert.equal(
      await getMongoDatabase().collection('notifications').countDocuments({ notificationId }),
      1
    );
    assert.equal(
      (await pool.query('select status from admin_jobs where job_id=$1', [job.job_id])).rows[0]
        .status,
      'DONE'
    );
  });

  test('R74-02 RED regression: missing entitlement never means SUPER_ADMIN', async () => {
    await assert.rejects(adminAccess({ userId: missing, role: 'ADMIN' }), { httpStatus: 403 });
  });
  test('R74-02 RED regression: missing-row Admin JWT is denied at HTTP authentication', async () => {
    assert.equal((await request('/admin/access', missing)).status, 403);
    assert.equal((await request('/users/me/profile', missing)).status, 403);
  });
  test('R74-02 RED regression: a scope-less internal context has no content-admin privilege', () => {
    assert.equal(isContentAdmin({ userId: missing, role: 'ADMIN' }), false);
  });
  test('R74-02: explicit promotion and scope demotion take effect for stale tokens', async () => {
    assert.equal(
      (
        await request(`/admin/users/${promoted}/access`, root, {
          role: 'ADMIN',
          scope: 'MODERATOR',
          reason: 'Explicit promotion'
        })
      ).status,
      200
    );
    const staleReaderToken = jwt.sign({ sub: promoted, role: 'READER' }, env.JWT_ACCESS_SECRET);
    assert.equal(
      (
        await fetch(base + '/admin/access', {
          headers: { authorization: `Bearer ${staleReaderToken}` }
        })
      ).status,
      200
    );
    assert.equal((await request('/admin/access', promoted)).body.data.scope, 'MODERATOR');
    assert.equal(
      (
        await request(`/admin/users/${promoted}/access`, root, {
          role: 'ADMIN',
          scope: 'FINANCE',
          reason: 'Scope demotion'
        })
      ).status,
      200
    );
    assert.equal((await request('/admin/moderation/reviews', promoted)).status, 403);
    assert.equal((await request('/admin/withdraw-requests', promoted)).status, 200);
    await pool.query('delete from admin_access where user_id=$1', [promoted]);
    assert.equal((await request('/admin/access', promoted)).status, 403);
  });
  test('R74-02: concurrent changes retain an explicitly entitled last SUPER_ADMIN', async () => {
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [
      promoted
    ]);
    const responses = await Promise.all([
      request(`/admin/users/${promoted}/access`, root, {
        role: 'ADMIN',
        scope: 'MODERATOR',
        reason: 'Concurrent demotion'
      }),
      request(`/admin/users/${root}/access`, promoted, {
        role: 'ADMIN',
        scope: 'MODERATOR',
        reason: 'Concurrent demotion'
      })
    ]);
    assert.equal(responses.filter((r) => r.status === 200).length, 1);
    assert.ok(responses.some((r) => [403, 409].includes(r.status)));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from admin_access a join users u using(user_id) where a.user_id=any($1::uuid[]) and a.scope='SUPER_ADMIN' and u.status='ACTIVE'",
          [[root, promoted]]
        )
      ).rows[0].n,
      1
    );
  });
});
