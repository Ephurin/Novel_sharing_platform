import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { MongoClient } from 'mongodb';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const name = `ephurin_test_admin_backend_${Date.now()}`;
const controlUrl =
  process.env.ADMIN_TEST_POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const pgUrl = new URL(controlUrl);
pgUrl.pathname = `/${name}`;
const mongoUrl = new URL(process.env.ADMIN_TEST_MONGO_URL || 'mongodb://localhost:27017');
mongoUrl.pathname = `/${name}`;
const control = new pg.Client({ connectionString: controlUrl });
const mongo = new MongoClient(mongoUrl.toString());
const env = {
  ...process.env,
  DOTENV_CONFIG_PATH: path.join(cwd, '.env.example'),
  DATABASE_URL: pgUrl.toString(),
  MONGODB_URI: mongoUrl.toString(),
  EPHURIN_ALLOW_TEST_DB_MUTATIONS: '1',
  EPHURIN_EXPECTED_TEST_DB: name,
  NODE_ENV: 'test'
};
const tsx = path.join(cwd, 'node_modules/tsx/dist/cli.mjs');
let result = 1;
const run = (args) =>
  spawnSync(process.execPath, [tsx, ...args], { cwd, env, windowsHide: true, stdio: 'inherit' })
    .status ?? 1;
await control.connect();
try {
  await control.query(`create database ${name}`);
  if (run(['src/core/database/migrate.ts']) !== 0) throw new Error('Migration failed');
  result = run([
    '--test',
    '--test-concurrency=1',
    ...(process.argv.slice(2).length ? process.argv.slice(2) : ['src/**/*.test.ts'])
  ]);
} finally {
  await mongo.connect();
  await mongo.db().dropDatabase();
  await mongo.close();
  await control.query(`drop database if exists ${name} with (force)`);
  await control.end();
  console.log(JSON.stringify({ isolatedDatabase: name, cleanedUp: true, exitCode: result }));
}
process.exitCode = result;
