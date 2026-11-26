import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, test, type TestContext } from 'node:test';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../core/config/env.js';

const directory = await mkdtemp(path.join(tmpdir(), 'storycraft-media-test-'));
process.env.MEDIA_DIRECTORY = directory;
const { storeUploadedImage } = await import('./media-storage.js');
const { migrateImages } = await import('../../scripts/migrate-media-to-cloudinary.js');
const fileName = '00000000-0000-0000-0000-000000000001.png';
const local = '/api/v1/media/' + fileName;
const image = Buffer.from('fixture image bytes');
const cloudPrefix = 'https://res.cloudinary.com/fixture/image/upload/';
const configuredUrl = 'cloudinary://key:secret@fixture';
after(() => rm(directory, { recursive: true, force: true }));

function mockStorage(t: TestContext, fail = false) {
  const assets = new Map<string, Buffer>();
  const upload = t.mock.method(cloudinary.uploader, 'upload_stream', (
    options: { public_id: string; overwrite: boolean },
    callback: (error?: { http_code: number }, result?: { secure_url: string }) => void
  ) => {
    assert.equal(options.overwrite, false);
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      if (fail) { callback({ http_code: 503 }); return; }
      const url = cloudPrefix + options.public_id + '.png';
      if (!assets.has(url)) assets.set(url, Buffer.concat(chunks));
      callback(undefined, { secure_url: url });
    });
    return stream;
  });
  return { assets, upload };
}

test('an unconfigured backend writes a local file and returns its legacy URL', async () => {
  env.CLOUDINARY_URL = undefined;
  const url = await storeUploadedImage(image, 'png');
  assert.match(url, /^\/api\/v1\/media\/.+\.png$/);
  assert.deepEqual(await readFile(path.join(directory, path.basename(url))), image);
});

test('configured uploads return a Cloudinary URL and a provider failure leaves no local file', async (t) => {
  env.CLOUDINARY_URL = configuredUrl;
  const initialFiles = await readdir(directory);
  const provider = mockStorage(t);
  const url = await storeUploadedImage(image, 'png');
  assert.ok(url.startsWith(cloudPrefix + 'storycraft/uploads/'));
  assert.deepEqual(provider.assets.get(url), image);
  provider.upload.mock.restore();
  mockStorage(t, true);
  await assert.rejects(storeUploadedImage(image, 'png'), { httpStatus: 502, code: 'MEDIA_STORAGE_UNAVAILABLE' });
  assert.deepEqual(await readdir(directory), initialFiles);
});

test('migration restricts local sources and preserves references for missing and corrupt images', async (t) => {
  env.CLOUDINARY_URL = configuredUrl;
  await writeFile(path.join(directory, fileName), image);
  const { assets, upload } = mockStorage(t);
  const approved = 'https://approved.example' + local;
  const unrelated = 'https://other.example' + local;
  const legacy = 'http://localhost:8080' + local;
  const protocolRelative = '//other.example' + local;
  const disguisedOrigin = '/\t/other.example' + local;
  const missing = '/api/v1/media/00000000-0000-0000-0000-000000000002.png';
  const corrupt = 'https://approved.example/corrupt.png';
  const externalBytes = Buffer.from('approved image, different from local');
  const corruptBytes = Buffer.from('original bytes for corrupt fixture');
  const http = t.mock.method(globalThis, 'fetch', async (input: string | URL, options?: RequestInit) => {
    const url = String(input);
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    const bytes = url === approved ? externalBytes : url === corrupt ? corruptBytes : assets.get(url);
    assert.ok(bytes, 'only approved sources and generated delivery URLs are fetched');
    const delivered = bytes.equals(corruptBytes) && url.startsWith(cloudPrefix)
      ? Buffer.from('wrong bytes for corrupt fixture')
      : bytes;
    return new Response(options?.method === 'HEAD' ? null : new Uint8Array(delivered), {
      headers: { 'content-type': 'image/png' }
    });
  });
  const references = [approved, unrelated, protocolRelative, disguisedOrigin, legacy, local, missing, corrupt].map(source => ({ source, count: 1 }));
  const replaced = new Map<string, string>();
  const replace = async (source: string, destination: string) => {
    replaced.set(source, destination);
    return 1;
  };
  const options = { 'legacy-origin': ['http://localhost:8080'], 'source-host': ['approved.example'] };
  assert.equal(await migrateImages(options, references, replace), 0);
  assert.equal(upload.mock.callCount(), 0);
  assert.equal(http.mock.callCount(), 0);
  assert.equal(replaced.size, 0);

  assert.equal(await migrateImages({ ...options, apply: true }, references, replace), 5);
  assert.equal(replaced.size, 3);
  assert.equal(replaced.get(local), replaced.get(legacy));
  assert.deepEqual(assets.get(replaced.get(approved) ?? ''), externalBytes);
  assert.equal(replaced.has(unrelated), false);
  assert.equal(replaced.has(protocolRelative), false);
  assert.equal(replaced.has(disguisedOrigin), false);
  assert.equal(replaced.has(missing), false);
  assert.equal(replaced.has(corrupt), false);
  assert.equal(assets.size, 3);

  assert.equal(await migrateImages({ ...options, apply: true }, references, replace), 5);
  assert.equal(assets.size, 3);
  const previousUploads = upload.mock.callCount();
  const migrated = [...replaced.values()].map(source => ({ source, count: 1 }));
  assert.equal(await migrateImages({ ...options, apply: true }, migrated, replace), 0);
  assert.equal(upload.mock.callCount(), previousUploads);
});
