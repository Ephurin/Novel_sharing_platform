import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Canonicalize a root directory path using the filesystem's native casing.
 * Vite's html-inline-proxy plugin does a case-sensitive string replace against
 * `config.root`, which breaks on Windows when the caller's cwd uses a lowercase
 * drive letter while module resolution canonicalizes to uppercase.
 */
function canonicalizeRoot(dirPath) {
  const resolved = path.resolve(dirPath);
  try {
    const real = fs.realpathSync.native(resolved);
    // Preserve mapped network drive letters when native realpath expands to a UNC share.
    if (process.platform === 'win32' && real.startsWith('\\\\') && !resolved.startsWith('\\\\')) {
      return fs.realpathSync(resolved);
    }
    return real;
  } catch {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
}

export default defineConfig({
  root: canonicalizeRoot(packageRoot),
  plugins: [
    {
      name: 'storycraft-canonical-root',
      config(userConfig) {
        const canonical = canonicalizeRoot(userConfig.root ?? packageRoot);
        if (canonical !== userConfig.root) {
          return { root: canonical };
        }
        return undefined;
      },
    },
  ],
});
