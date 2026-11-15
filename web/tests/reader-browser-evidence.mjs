import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function readerEvidence(prefix) {
  if (!process.env.READER_EVIDENCE_DIR) return mkdtemp(path.join(os.tmpdir(), prefix));
  const directory = path.join(process.env.READER_EVIDENCE_DIR, 'screenshots', prefix);
  await mkdir(directory, { recursive: true });
  return directory;
}
