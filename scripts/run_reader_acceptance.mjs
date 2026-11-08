import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = git(['rev-parse', 'HEAD']);
assert.equal(git(['status', '--porcelain']), '', 'Commit changes before collecting acceptance evidence');
assert.equal(process.env.EXPECTED_REVIEW_SHA, sha, 'EXPECTED_REVIEW_SHA must identify the tested commit');
assert.equal(process.env.RUN_READER_DISCOVERY_TESTS, '1', 'Reader PostgreSQL tests require explicit opt-in');
assert.equal(process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS, '1', 'Disposable database creation requires explicit opt-in');
const output = process.env.READER_EVIDENCE_DIR || await mkdtemp(path.join(tmpdir(), 'reader-acceptance-'));
await mkdir(output, { recursive: true });
const env = { ...process.env, READER_EVIDENCE_DIR: output,
  PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'chrome', LLM_PROVIDER: 'fake', LLM_ENABLED: 'false',
  ADMIN_TEST_POSTGRES_URL: process.env.ADMIN_TEST_POSTGRES_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  ADMIN_TEST_MONGO_URL: process.env.ADMIN_TEST_MONGO_URL || 'mongodb://127.0.0.1:27017' };
for (const key of Object.keys(env)) if (/(?:API_KEY|PROVIDER_TOKEN)$/.test(key)) env[key] = '';
const requiredBrowsers = [
  'reader-catalog-pagination.browser.test.mjs', 'reader-catalog.browser.test.mjs',
  'reader-detail-enhancements.browser.test.mjs', 'reader-detail.browser.test.mjs',
  'reader-home-accessibility.browser.test.mjs', 'reader-home-personalization.browser.test.mjs',
  'reader-home-recovery.browser.test.mjs', 'reader-home.browser.test.mjs'
];
const browserFiles = (await readdir(path.join(root, 'web/tests'))).filter(name => /^reader-.*\.browser\.test\.mjs$/.test(name)).sort();
for (const name of requiredBrowsers) assert.ok(browserFiles.includes(name), `Missing Reader suite: ${name}`);
const manifest = { testedSha: sha, sourceTree: git(['rev-parse', 'HEAD^{tree}']), cleanSource: true,
  startedAt: new Date().toISOString(), node: process.version, provider: 'fake; no live credentials', browserFiles, steps: [] };
await writeFile(path.join(output, 'tested-sha.txt'), sha + '\n');
const saveManifest = () => writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));

async function verifyCleanup(log) {
  const result = log.split(/\r?\n/).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.isolatedDatabase);
  assert.ok(result?.cleanedUp && /^ephurin_test_admin_backend_\d+$/.test(result.isolatedDatabase), 'Missing disposable DB teardown result');
  const requireBackend = createRequire(path.join(root, 'backend/package.json'));
  const { Client } = requireBackend('pg');
  const { MongoClient } = requireBackend('mongodb');
  const pg = new Client({ connectionString: env.ADMIN_TEST_POSTGRES_URL });
  const mongo = new MongoClient(env.ADMIN_TEST_MONGO_URL);
  try {
    await pg.connect();
    const found = await pg.query('select 1 from pg_database where datname = $1', [result.isolatedDatabase]);
    assert.equal(found.rowCount, 0, 'PostgreSQL test database was not removed');
    await mongo.connect();
    const databases = await mongo.db('admin').admin().listDatabases({ nameOnly: true });
    assert.ok(!databases.databases.some(db => db.name === result.isolatedDatabase), 'MongoDB test database was not removed');
    await writeFile(path.join(output, 'cleanup-verified.json'), JSON.stringify({ database: result.isolatedDatabase, postgresAbsent: true, mongoAbsent: true }, null, 2));
    manifest.cleanupVerified = true;
  } finally { await pg.end(); await mongo.close(); }
}

const steps = [
  ['web-typecheck', 'web', 'npm', ['run', 'typecheck']],
  ['backend-typecheck', 'backend', 'npm', ['run', 'typecheck']],
  ['web-build', 'web', 'npm', ['run', 'build']],
  ['reader-postgres', 'backend', process.execPath, ['scripts/run-isolated-tests.mjs',
    'src/modules/reading/chapter-reads.postgres.test.ts', 'src/modules/reading/reader-discovery.postgres.test.ts', 'src/modules/reading/reading-lifecycle.postgres.test.ts']],
  ['reader-browsers', 'web', process.execPath, ['--test', '--test-concurrency=1', ...browserFiles.map(name => `tests/${name}`)]],
  ['reader-contrast', 'web', process.execPath, ['--test', 'tests/contrast.test.mjs']]
];
try {
  for (const [name, cwd, command, args] of steps) {
    const chunks = [], started = Date.now();
    const exit = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: path.join(root, cwd), env, windowsHide: true,
        shell: process.platform === 'win32' && command === 'npm', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', data => { chunks.push(data); process.stdout.write(data); });
      child.stderr.on('data', data => { chunks.push(data); process.stderr.write(data); });
      child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
    });
    const log = Buffer.concat(chunks).toString('utf8');
    await writeFile(path.join(output, `${name}.log`), log);
    manifest.steps.push({ name, command: [command, ...args], exit, durationMs: Date.now() - started });
    await saveManifest();
    if (name === 'reader-postgres') await verifyCleanup(log);
    assert.equal(exit, 0, `${name} failed; see ${output}`);
  }
  manifest.passed = true;
} catch (error) { manifest.passed = false; manifest.error = error.message; process.exitCode = 1; }
finally { manifest.finishedAt = new Date().toISOString(); await saveManifest(); }
console.log(JSON.stringify({ testedSha: sha, passed: manifest.passed, cleanupVerified: manifest.cleanupVerified ?? false, evidence: output }));
