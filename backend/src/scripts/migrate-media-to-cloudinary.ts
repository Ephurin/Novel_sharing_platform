import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { env } from '../core/config/env.js';
import { disconnectPostgres, getPostgresPool } from '../core/database/postgres.js';
import { mediaDirectory, uploadCloudinaryImage } from '../modules/media/media-storage.js';

type MigrationOptions = {
  apply?: boolean;
  'legacy-directory'?: string[];
  'legacy-origin'?: string[];
  'source-host'?: string[];
  'include-local-files'?: boolean;
};

type ImageReference = { source: string; count: number };
type ImageSources = {
  legacyDirectories: string[];
  legacyOrigins: ReadonlySet<string>;
  sourceHosts: ReadonlySet<string>;
};

const imageFields = [
  ['novels', 'cover_image_url'],
  ['user_profiles', 'avatar_url'],
  ['user_profiles', 'banner_url']
] as const;
const legacyFilePattern = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
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

async function readLegacyImage(fileName: string, legacyDirectories: string[]): Promise<Buffer> {
  for (const directory of legacyDirectories) {
    try {
      return await readFile(path.join(directory, fileName));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  throw new Error('Legacy image file is missing');
}

async function fetchImage(url: URL, timeout: number): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || !response.body) {
    await response.body?.cancel();
    throw new Error('URL did not return an image (HTTP ' + response.status + ')');
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Downloaded image exceeds 10 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function parseLegacyOrigin(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS origin with --legacy-origin');
  }
  return url.origin;
}

async function copyImage(source: string, config: ImageSources): Promise<string> {
  const rootRelative = source.startsWith('/') && !source.startsWith('//') && !/[\\\t\r\n]/.test(source);
  const url = rootRelative ? new URL(source, 'http://localhost') : new URL(source);
  const localOrigin = config.legacyOrigins.has(url.origin) && !url.username && !url.password;
  const fileName = rootRelative || localOrigin ? legacyFileName(url) : undefined;

  let image: Buffer;
  if (fileName) {
    image = await readLegacyImage(fileName, config.legacyDirectories);
  } else {
    if (!config.sourceHosts.has(url.hostname) || url.protocol !== 'https:' || url.port ||
        url.username || url.password) {
      throw new Error('Source is outside the allowed HTTPS hosts');
    }
    image = await fetchImage(url, 25_000);
  }

  if (image.length === 0 || image.length > maxBytes) throw new Error('Source image must be between 1 byte and 10 MB');
  const hash = createHash('sha256').update(image).digest('hex');
  const destination = await uploadCloudinaryImage(image, 'storycraft/migrated/' + hash);
  const delivered = await fetchImage(new URL(destination), 15_000);
  if (createHash('sha256').update(delivered).digest('hex') !== hash) {
    throw new Error('Cloudinary image checksum does not match the source');
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

export async function migrateImages(
  values: MigrationOptions,
  references: ImageReference[],
  replace = replaceImageReferences
): Promise<number> {
  if (!env.CLOUDINARY_URL) throw new Error('Set CLOUDINARY_URL before migrating images');
  const cloudName = new URL(env.CLOUDINARY_URL).hostname;
  const isDestination = (source: string) => source.startsWith('https://res.cloudinary.com/' + cloudName + '/');
  const config: ImageSources = {
    legacyDirectories: [mediaDirectory, ...(values['legacy-directory'] ?? [])],
    legacyOrigins: new Set([new URL(env.WEB_ORIGIN).origin, ...(values['legacy-origin'] ?? []).map(parseLegacyOrigin)]),
    sourceHosts: new Set(values['source-host'] ?? [])
  };
  const pending = references.filter(({ source }) => !isDestination(source));
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
  if (!values.apply) return 0;

  let updatedReferences = 0;
  let failed = 0;
  const queue = [...sources];
  for (let offset = 0; offset < queue.length; offset += 5) {
    const batch = queue.slice(offset, offset + 5);
    const results = await Promise.allSettled(batch.map(source => copyImage(source, config)));
    for (const [index, result] of results.entries()) {
      const source = batch[index];
      try {
        if (result.status === 'rejected') throw result.reason;
        const destination = result.value;
        const updated = await replace(source, destination);
        updatedReferences += updated;
        console.log(JSON.stringify({ source, destination, updated }));
      } catch (error) {
        failed++;
        console.error(JSON.stringify({ source, error: error instanceof Error ? error.message : 'Image migration failed' }));
      }
    }
  }
  console.log(JSON.stringify({ sources: queue.length, updatedReferences, failed }));
  return failed;
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean' },
      'legacy-directory': { type: 'string', multiple: true },
      'legacy-origin': { type: 'string', multiple: true },
      'source-host': { type: 'string', multiple: true },
      'include-local-files': { type: 'boolean' }
    }
  });
  const references = await getPostgresPool().query<{ source: string; count: number }>(
    `select source, count(*)::int as count from (
      ${imageFields.map(([table, column]) => `select ${column} as source from ${table} where ${column} is not null`).join(' union all ')}
    ) sources where btrim(source) <> '' group by source order by source`
  );
  if (await migrateImages(values, references.rows) > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Image migration failed');
    process.exitCode = 1;
  } finally {
    await disconnectPostgres();
  }
}
