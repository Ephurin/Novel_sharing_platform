import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { MongoClient } from 'mongodb';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const baseline = '6b5a58fdcb777ad43a5fcfb34237235e1243276b';
const name = `ephurin_test_pr74_upgrade_${Date.now()}`;
assert.match(name, /^ephurin_test_pr74_upgrade_\d+$/);
const controlUrl =
  process.env.ADMIN_TEST_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const databaseUrl = new URL(controlUrl);
databaseUrl.pathname = `/${name}`;
const mongoUrl = new URL(process.env.ADMIN_TEST_MONGO_URL || 'mongodb://localhost:27017');
mongoUrl.pathname = `/${name}`;
const control = new pg.Client({ connectionString: controlUrl });
const client = new pg.Client({ connectionString: databaseUrl.toString() });
const mongo = new MongoClient(mongoUrl.toString());
const seedFile = path.join(cwd, 'src/scripts', `.pr74-upgrade-${randomUUID()}.ts`);
const env = {
  ...process.env,
  DOTENV_CONFIG_PATH: path.join(cwd, '.env.example'),
  DATABASE_URL: databaseUrl.toString(),
  MONGODB_URI: mongoUrl.toString(),
  NODE_ENV: 'test',
  DB_CONNECT_ON_START: 'false'
};
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const snapshots = async () => {
  const result = {};
  for (const [table, key] of Object.entries({
    users: 'user_id',
    user_profiles: 'user_id',
    wallets: 'wallet_id',
    novels: 'novel_id',
    chapters: 'chapter_id',
    withdraw_requests: 'withdraw_request_id',
    transactions: 'transaction_id',
    reports: 'report_id',
    moderation_reviews: 'review_id'
  })) {
    result[table] = (
      await client.query(
        `select count(*)::int count,md5(string_agg(row_to_json(t)::text,',' order by ${key})) fingerprint from ${table} t`
      )
    ).rows[0];
  }
  return result;
};
let created = false,
  connected = false;
await control.connect();
try {
  await control.query(`create database ${name}`);
  created = true;
  await client.connect();
  connected = true;
  await client.query(
    'create table schema_migrations(migration_id varchar(255) primary key,applied_at timestamptz not null default now())'
  );
  const migrations = path.join(cwd, 'src/core/database/migrations');
  const apply = async (filename) => {
    await client.query('begin');
    try {
      await client.query(await readFile(path.join(migrations, filename), 'utf8'));
      await client.query('insert into schema_migrations(migration_id) values($1)', [filename]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  };
  for (const filename of (await readdir(migrations)).filter((n) => /^\d.*\.sql$/.test(n)).sort())
    if (filename < '018_') await apply(filename);
  const oldSeed = spawnSync('git', ['show', `${baseline}:backend/src/scripts/seed-admin.ts`], {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(oldSeed.status, 0, oldSeed.stderr);
  await writeFile(seedFile, oldSeed.stdout);
  run([path.join(cwd, 'node_modules/tsx/dist/cli.mjs'), seedFile]);
  const lockedAdmin = randomUUID();
  await client.query(
    "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,'test-only','ADMIN','LOCKED')",
    [lockedAdmin, `${lockedAdmin}@example.test`, `legacy-${lockedAdmin}`]
  );
  const before = await snapshots();
  assert.ok(
    before.novels.count > 0 &&
      before.wallets.count > 0 &&
      before.withdraw_requests.count > 0 &&
      before.reports.count > 0
  );
  const legacyIds = (
    await client.query("select user_id from users where role='ADMIN' order by user_id")
  ).rows.map((r) => r.user_id);
  await apply('018_admin_operations.sql');
  assert.deepEqual(
    (
      await client.query(
        "select user_id from admin_access where scope='SUPER_ADMIN' order by user_id"
      )
    ).rows.map((r) => r.user_id),
    legacyIds
  );
  const payload = {
    userId: legacyIds[0],
    type: 'UPGRADE_TEST',
    title: 'Retained job',
    content: 'Upgrade fixture'
  };
  const jobs = (
    await client.query(
      "insert into admin_jobs(kind,payload,status) values('NOTIFY',$1,'PENDING'),('NOTIFY',$1,'DONE') returning *",
      [payload]
    )
  ).rows;
  await apply('019_admin_job_retries.sql');
  for (const job of jobs) {
    const after = (await client.query('select * from admin_jobs where job_id=$1', [job.job_id]))
      .rows[0];
    for (const field of ['job_id', 'status', 'kind', 'payload', 'attempts'])
      assert.deepEqual(after[field], job[field]);
    assert.ok(after.next_attempt_at);
  }
  assert.deepEqual(
    await snapshots(),
    before,
    'populated application data must survive migration unchanged'
  );
  const missing = randomUUID();
  await client.query(
    "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,'test-only','ADMIN','ACTIVE')",
    [missing, `${missing}@example.test`, `missing-${missing}`]
  );
  const activeAdmin = (
    await client.query(
      "select user_id from users where role='ADMIN' and status='ACTIVE' order by user_id limit 1"
    )
  ).rows[0].user_id;
  const checks = run([
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `
    import assert from 'node:assert/strict';import jwt from 'jsonwebtoken';import {createApp} from './src/app.ts';import {env} from './src/core/config/env.ts';import {disconnectMongo} from './src/core/database/mongo.ts';import {disconnectPostgres} from './src/core/database/postgres.ts';
    const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    try{for(const [userId,status]of ${JSON.stringify([
      [activeAdmin, 200],
      [lockedAdmin, 403],
      [missing, 403]
    ])}){const token=jwt.sign({sub:userId,role:'ADMIN'},env.JWT_ACCESS_SECRET);const response=await fetch(base+'/admin/access',{headers:{authorization:'Bearer '+token}});assert.equal(response.status,status);}console.log('legacy-active=200 legacy-locked=403 post-upgrade-missing-scope=403');}
    finally{await new Promise(r=>server.close(r));await disconnectMongo();await disconnectPostgres();}
  `
  ]);
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  }).stdout.trim();
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        sourceSha: sha,
        baselineSeedSha: baseline,
        isolatedDatabase: name,
        legacyAdminsPreserved: legacyIds.length,
        existingJobsPreserved: jobs.length,
        before,
        applicationFingerprintUnchanged: true,
        httpChecks: checks.trim()
      },
      null,
      2
    )
  );
} finally {
  await unlink(seedFile).catch(() => {});
  if (connected) await client.end();
  if (created) {
    await mongo.connect();
    await mongo.db().dropDatabase();
    await mongo.close();
    await control.query(`drop database if exists ${name} with (force)`);
  }
  await control.end();
  console.log(JSON.stringify({ isolatedDatabase: name, cleanedUp: true }));
}
