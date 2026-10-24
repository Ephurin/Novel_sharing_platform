import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export async function evidenceDirectory(name) {
  let directory;
  if (process.env.P1_EVIDENCE_DIR) {
    await mkdir(process.env.P1_EVIDENCE_DIR, { recursive: true });
    directory = join(process.env.P1_EVIDENCE_DIR, name);
    await mkdir(directory); // Never replace a previous suite's artifacts.
  } else directory = await mkdtemp(join(tmpdir(), 'ephurin-' + name + '-'));
  return pathToFileURL(directory + sep);
}

export async function sanitizedTrace(context, directory, name) {
  const raw = fileURLToPath(new URL(name + '.private.zip', directory));
  const output = fileURLToPath(new URL(name + '.zip', directory));
  await context.tracing.stop({ path: raw });
  const secrets = Object.entries(process.env).filter(([key]) => /password|secret|token|api.?key/i.test(key)).map(([, value]) => value);
  const result = spawnSync(process.env.PYTHON || 'python', [
    fileURLToPath(new URL('../../../scripts/p1_sanitize_trace.py', import.meta.url)), raw, output
  ], { input: JSON.stringify(secrets), encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(result.status, 0, 'Trace sanitization failed; private raw trace must not be published');
  await writeFile(new URL(name + '-sanitization.json', directory), result.stdout);
  await unlink(raw);
}
