import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { Client } = require('pg'), { MongoClient } = require('mongodb');

export async function isolatedIdeServer() {
  const controlUrl = process.env.ADMIN_TEST_POSTGRES_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  const url = new URL(controlUrl);
  assert.equal(url.pathname, '/postgres', 'Use the postgres control database, never a demo/application DB');
  const database = 'ephurin_test_pr86_browser_' + randomUUID().replaceAll('-', '');
  const control = new Client({ connectionString: controlUrl }); await control.connect();
  await control.query(`create database "${database}"`); url.pathname = '/' + database;
  let isolation, sequence = 0, logs = '';
  const child = spawn(process.execPath, ['--import', './node_modules/tsx/dist/loader.mjs', 'test-support/draft-browser-server.ts'], {
    cwd: fileURLToPath(new URL('../../../backend/', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, DATABASE_URL: url.href, MONGODB_URI: process.env.ADMIN_TEST_MONGO_URL || 'mongodb://127.0.0.1:27017/unused_test', JWT_ACCESS_SECRET: 'pr86-browser-synthetic-access', JWT_REFRESH_SECRET: 'pr86-browser-synthetic-refresh', NODE_ENV: 'test', AI_SERVICE_URL: 'http://127.0.0.1:9', LLM_PROVIDER: 'fake', DB_CONNECT_ON_START: 'false' }
  });
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  child.on('message', message => { if (message.isolation) isolation = message.isolation; });
  const close = async () => {
    try {
      if (child.exitCode === null) {
        await new Promise(resolve => {
          const timer = setTimeout(() => { child.kill(); resolve(); }, 15000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
          if (child.connected) child.send({ action: 'close' }); else child.kill();
        });
      }
      if (isolation) {
        assert.match(isolation.mongoDatabase, /^draft_browser_[a-f0-9]{32}$/);
        const mongo = new MongoClient(process.env.ADMIN_TEST_MONGO_URL || 'mongodb://127.0.0.1:27017');
        try { await mongo.connect(); await mongo.db(isolation.mongoDatabase).dropDatabase(); } finally { await mongo.close(); }
      }
    } finally {
      await control.query(`drop database "${database}" with (force)`); await control.end();
      console.log(JSON.stringify({ disposableDatabase: database, cleanedUp: true }));
    }
  };
  try {
    const config = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Isolated IDE fixture startup timed out: ' + logs)), 30000);
      child.on('message', message => { if (message.ready) { clearTimeout(timer); resolve(message); } });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${logs}`)); });
    });
    const readback = chapterId => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { child.off('message', listener); reject(new Error('Fixture readback timed out')); }, 10000);
      const listener = message => { if (message.id === id) { clearTimeout(timer); child.off('message', listener); resolve(message); } };
      child.on('message', listener); child.send({ action: 'readback', id, chapterId });
    });
    return { config, readback, close };
  } catch (error) { await close(); throw error; }
}
