import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { env } from '../core/config/env.js';
import { disconnectPostgres, getPostgresPool } from '../core/database/postgres.js';
import { mediaDirectory, uploadCloudinaryImage } from '../modules/media/media-storage.js';

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean' },
    'legacy-directory': { type: 'string', multiple: true },
    'source-host': { type: 'string', multiple: true },
    'include-local-files': { type: 'boolean' }
  }
});

const imageFields = [
  ['novels', 'cover_image_url'],
  ['user_profiles', 'avatar_url'],
  ['user_profiles', 'banner_url']
] as const;
const legacyFilePattern = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
const legacyDirectories = [mediaDirectory, ...(values['legacy-directory'] ?? [])];
const sourceHosts = new Set(values['source-host'] ?? []);
const maxBytes = 10 * 1024 * 1024;

function legacyFileName(source: URL): string | undefined {
  for (const prefix of new Set([env.API_PREFIX, '/api/v1'])) {
    const mediaPath = prefix + '/media/';
    if (source.pathname.startsWith(mediaPath)) {
      const fileName = source.pathname.slice(mediaPath.length);
      if (legacyFilePattern.test(fileName)) return fileName;
    }
  }
  return undefined;
}

async function readLegacyImage(fileName: string): Promise<Buffer> {
  for (const directory of legacyDirectories) {
    try {
      return await readFile(path.join(directory, fileName));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  throw new Error('Legacy image file is missing');
}

async function downloadImage(source: URL): Promise<Buffer> {
  if (!sourceHosts.has(source.hostname) || source.protocol !== 'https:' || source.port ||
      source.username || source.password) {
    throw new Error('Source is outside the allowed HTTPS hosts');
  }
  const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || !response.body) {
    await response.body?.cancel();
    throw new Error('Source did not return an image (HTTP ' + response.status + ')');
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Source image exceeds 10 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function copyImage(source: string): Promise<string> {
  const url = new URL(source, 'http://localhost');
  const fileName = legacyFileName(url);
  const image = fileName ? await readLegacyImage(fileName) : await downloadImage(url);
  if (image.length === 0 || image.length > maxBytes) throw new Error('Source image must be between 1 byte and 10 MB');
  const hash = createHash('sha256').update(image).digest('hex');
  const destination = await uploadCloudinaryImage(image, 'storycraft/migrated/' + hash);
  const response = await fetch(destination, {
    method: 'HEAD',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error('Cloudinary delivery failed (HTTP ' + response.status + ')');
  }
  return destination;
}

async function replaceImageReferences(source: string, destination: string): Promise<number> {
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    let updated = 0;
    for (const [table, column] of imageFields) {
      const result = await client.query(
        `update ${table} set ${column} = $2 where ${column} = $1`,
        [source, destination]
      );
      updated += result.rowCount ?? 0;
    }
    await client.query('commit');
    return updated;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function migrateImages(): Promise<void> {
  if (!env.CLOUDINARY_URL) throw new Error('Set CLOUDINARY_URL before migrating images');
  const cloudName = new URL(env.CLOUDINARY_URL).hostname;
  const isDestination = (source: string) => source.startsWith('https://res.cloudinary.com/' + cloudName + '/');
  const references = await getPostgresPool().query<{ source: string; count: number }>(
    `select source, count(*)::int as count from (
      ${imageFields.map(([table, column]) => `select ${column} as source from ${table} where ${column} is not null`).join(' union all ')}
    ) sources where btrim(source) <> '' group by source order by source`
  );
  const pending = references.rows.filter(({ source }) => !isDestination(source));
  const sources = new Set(pending.map(({ source }) => source));
  if (values['include-local-files']) {
    for (const file of await readdir(mediaDirectory, { withFileTypes: true })) {
      if (file.isFile() && legacyFilePattern.test(file.name)) sources.add(env.API_PREFIX + '/media/' + file.name);
    }
  }

  console.log(JSON.stringify({
    mode: values.apply ? 'apply' : 'preview',
    pendingReferences: pending.reduce((total, item) => total + item.count, 0),
    sources: sources.size
  }));
  if (!values.apply) return;

  let updatedReferences = 0;
  let failed = 0;
  const queue = [...sources];
  for (let offset = 0; offset < queue.length; offset += 5) {
    const batch = queue.slice(offset, offset + 5);
    const results = await Promise.allSettled(batch.map(copyImage));
    for (const [index, result] of results.entries()) {
      const source = batch[index];
      try {
        if (result.status === 'rejected') throw result.reason;
        const destination = result.value;
        const updated = await replaceImageReferences(source, destination);
        updatedReferences += updated;
        console.log(JSON.stringify({ source, destination, updated }));
      } catch (error) {
        failed++;
        console.error(JSON.stringify({ source, error: error instanceof Error ? error.message : 'Image migration failed' }));
      }
    }
  }
  console.log(JSON.stringify({ sources: queue.length, updatedReferences, failed }));
  if (failed > 0) process.exitCode = 1;
}

try {
  await migrateImages();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Image migration failed');
  process.exitCode = 1;
} finally {
  await disconnectPostgres();
}
