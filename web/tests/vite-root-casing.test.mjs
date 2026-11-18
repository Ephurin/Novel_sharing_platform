import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, normalizePath, resolveConfig } from 'vite';

const webRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const viteConfigPath = path.join(webRoot, 'vite.config.mjs');

function flipWindowsDriveCase(targetPath) {
  if (process.platform !== 'win32' || !/^[A-Za-z]:/.test(targetPath)) {
    return targetPath;
  }
  const drive = targetPath[0];
  const flipped = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
  return `${flipped}${targetPath.slice(1)}`;
}

test('vite config canonicalizes Windows drive-letter casing on resolved root', async () => {
  const realWebRoot = fs.realpathSync.native(webRoot);
  const candidateRoot = flipWindowsDriveCase(realWebRoot);

  const resolved = await resolveConfig(
    { root: candidateRoot },
    'build',
    'production'
  );

  assert.equal(resolved.root, normalizePath(realWebRoot));
});

test('vite build handles inline <style> in index.html even when root has non-canonical drive casing', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'storycraft-vite-root-'));
  try {
    await writeFile(
      path.join(tempDir, 'index.html'),
      '<!doctype html><html><head><style>.probe{color:#241915;}</style></head><body><script type="module" src="/entry.js"></script></body></html>',
      'utf8'
    );
    await writeFile(path.join(tempDir, 'entry.js'), 'export const ok = true;\n', 'utf8');

    const realTempDir = fs.realpathSync.native(tempDir);
    const candidateRoot = flipWindowsDriveCase(realTempDir);

    const output = await build({
      root: candidateRoot,
      configFile: viteConfigPath,
      logLevel: 'silent',
      build: {
        write: false,
        emptyOutDir: false,
      },
    });

    assert.ok(output, 'expected Vite build output');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
