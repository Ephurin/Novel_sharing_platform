import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const scenario of [
  { name: 'missing opt-in', optIn: '', pg: 'ephurin_test_g03', mongo: 'ephurin_test_g03', reason: 'missing required external opt-in' },
  { name: 'forbidden PostgreSQL', optIn: '1', pg: 'ephurin', mongo: 'ephurin_test_g03', reason: 'PostgreSQL target' },
  { name: 'forbidden MongoDB', optIn: '1', pg: 'ephurin_test_g03', mongo: 'ephurin', reason: 'MongoDB target' },
]) {
  test(`Denied live reconciliation teardown: ${scenario.name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'g03-denial-'));
    try {
      const log = join(dir, 'calls.json');
      const childEnv = { ...process.env };
      delete childEnv.NODE_TEST_CONTEXT; // Child is an independent runner, not a recursive test.
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--import', new URL('./mongo-reconciliation-denial.preload.mjs', import.meta.url).href,
        '--test', '--test-reporter=tap', fileURLToPath(new URL('./mongo-reconciliation.live.test.ts', import.meta.url)),
      ], {
        encoding: 'utf8', timeout: 30000,
        env: { ...childEnv, NODE_ENV: 'test', CI: 'true',
          EPHURIN_ALLOW_TEST_DB_MUTATIONS: scenario.optIn, EXPECTED_TEST_DB_NAME: '',
          DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/ephurin_test_g03',
          MONGODB_URI: `mongodb://127.0.0.1:9/${scenario.mongo}`,
          JWT_ACCESS_SECRET: 'g03-isolated-access-secret', JWT_REFRESH_SECRET: 'g03-isolated-refresh-secret',
          G03_PG_IDENTITY: scenario.pg, G03_CALL_LOG: log },
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(scenario.reason), result.stdout + result.stderr);
      const calls = JSON.parse(readFileSync(log, 'utf8'));
      console.log(JSON.stringify({ scenario: scenario.name, childExit: result.status, calls }));
      assert.equal(calls.identity, 1, 'Actual before hook must run the isolation guard');
      assert.equal(calls.mongoClose, 1, 'Actual after hook must close Mongo despite failed before');
      assert.equal(calls.pgEnd, 2, 'Actual after hook must close PostgreSQL and writer pools despite failed before');
      assert.equal(calls.mongoConnect, 0);
      assert.deepEqual(calls.writes, [], 'Denied teardown must make zero Mongo write attempts, including deleteMany/deleteOne');
      assert.deepEqual(calls.reads, [], 'Denied teardown must not run Mongo cleanup readbacks');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
