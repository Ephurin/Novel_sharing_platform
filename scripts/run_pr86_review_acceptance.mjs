import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = git(['rev-parse', 'HEAD']), status = git(['status', '--porcelain']);
if (process.env.EXPECTED_REVIEW_SHA) assert.equal(sha, process.env.EXPECTED_REVIEW_SHA);
assert.ok(!status || process.env.REVIEW_ALLOW_DIRTY === '1', 'Commit source first: acceptance evidence must identify a clean tested SHA');
const output = process.env.P1_EVIDENCE_DIR || await mkdtemp(path.join(tmpdir(), 'pr86-review-acceptance-'));
await mkdir(output, { recursive: true });
const python = process.env.PYTHON || 'python';
const env = { ...process.env, P1_EVIDENCE_DIR: output, PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'chrome', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', RUN_DRAFT_BROWSER_TESTS: '1', RUN_NOVEL_GENRE_TESTS: '1', LLM_PROVIDER: 'fake', LLM_ENABLED: 'false', GOOGLE_API_KEY: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', CURSOR_POSTGRES_CONTROL_URL: process.env.CURSOR_POSTGRES_CONTROL_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' };
const steps = [
  ['web-typecheck', '.', 'npm', ['run', 'typecheck', '--prefix', 'web']],
  ['backend-typecheck', '.', 'npm', ['run', 'typecheck', '--prefix', 'backend']],
  ['web-build', '.', 'npm', ['run', 'build', '--prefix', 'web']],
  ['ai-cursor-sqlite', 'ai-service', python, ['-m', 'pytest', 'tests/test_writing_cursor_persistence.py', 'tests/test_writing_validation_golden.py', '-q', '--basetemp', path.join(output, 'pytest-sqlite')]],
  ['ai-cursor-postgres', 'ai-service', python, ['-m', 'pytest', '-o', 'addopts=', '-m', 'postgres_integration', 'tests/test_writing_cursor_postgres.py', '-q', '--basetemp', path.join(output, 'pytest-postgres')]],
  ['backend-accept-rejection', 'backend', process.execPath, ['scripts/run-isolated-tests.mjs', 'src/modules/novels/accept-draft-contract.test.ts']],
  ['backend-create-genre', 'backend', process.execPath, ['scripts/run-isolated-tests.mjs', 'src/modules/novels/novels-genre.postgres.test.ts']],
  ['browser-acceptance', 'web', process.execPath, ['--test', '--test-concurrency=1', 'tests/rich-manuscript-serialization.browser.test.mjs', 'tests/rich-manuscript-durability.browser.test.mjs', 'tests/author-ide-caret.browser.test.mjs', 'tests/author-notes.browser.test.mjs', 'tests/studio-notes-layout.browser.test.mjs', 'tests/studio-polish.browser.test.mjs']],
  ['main-reader-ui', 'web', process.execPath, ['--test', 'tests/main-ui-integration.browser.test.mjs']]
];
const manifest = { testedSha: sha, sourceTree: git(['rev-parse', 'HEAD^{tree}']), cleanSource: !status, startedAt: new Date().toISOString(), node: process.version, python: execFileSync(python, ['--version'], { encoding: 'utf8' }).trim(), llm: 'fake; provider-free fixtures only', steps: [] };
await writeFile(path.join(output, 'tested-sha.txt'), sha + '\n');
console.log(`PR86 acceptance source ${sha}; evidence ${output}`);
for (const [name, cwd, command, args] of steps) {
  const chunks = [], started = Date.now();
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: path.join(root, cwd), env, windowsHide: true, shell: process.platform === 'win32' && command === 'npm', stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { chunks.push(data); process.stdout.write(data); });
    child.stderr.on('data', data => { chunks.push(data); process.stderr.write(data); });
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
  await writeFile(path.join(output, name + '.log'), Buffer.concat(chunks));
  manifest.steps.push({ name, cwd, command: [command, ...args], exit, durationMs: Date.now() - started });
  manifest.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (exit !== 0) { process.exitCode = exit; break; }
}
console.log(JSON.stringify({ testedSha: sha, passed: manifest.steps.filter(step => step.exit === 0).length, expected: steps.length, evidence: output }));
