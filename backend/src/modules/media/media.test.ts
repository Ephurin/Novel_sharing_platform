import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExtension } from './media.routes.js';
import { env } from '../../core/config/env.js';
import { validateGiphyGif } from './giphy.service.js';
import { limitGiphyLookups, limitMediaUploads } from './media-limits.js';
import type { Request, Response as ExpressResponse, NextFunction } from 'express';
test('image uploads reject HTML, SVG and fake extensions by inspecting bytes', () => {
  for (const text of ['<svg onload="alert(1)"></svg>', '<html>not a JPEG</html>', '', 'data:image/png;base64,anything']) assert.throws(() => imageExtension(Buffer.from(text)));
  assert.equal(imageExtension(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6r8AAAAASUVORK5CYII=', 'base64')), 'png');
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  assert.equal(imageExtension(gif), 'gif');
  assert.throws(() => imageExtension(gif.subarray(0, gif.length - 1)));
  const invalidSize = Buffer.from(gif);
  invalidSize.writeUInt16LE(0, 6);
  assert.throws(() => imageExtension(invalidSize));
});

test('GIPHY validation fails closed for missing, unrated, mismatched and restricted provider metadata', async (t) => {
  const original = { privateKey: env.GIPHY_API_KEY, publicKey: env.GIPHY_PUBLIC_API_KEY };
  env.GIPHY_API_KEY = 'fixture-server-key';
  env.GIPHY_PUBLIC_API_KEY = 'fixture-browser-key';
  let data: unknown = { data: { id: 'safeGif', type: 'gif', rating: 'pg-13' } };
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    assert.equal(input.origin, 'https://api.giphy.com');
    assert.equal(input.searchParams.get('api_key'), 'fixture-server-key');
    return Response.json(data, { status });
  });
  try {
    await validateGiphyGif('safeGif', 'metadata-fixture');
    for (const invalid of [null, {}, { data: {} }, { data: { id: 'other', type: 'gif', rating: 'g' } },
      { data: { id: 'safeGif', type: 'gif', rating: 'r' } }, { data: { id: 'safeGif', type: 'gif' } }]) {
      data = invalid;
      await assert.rejects(validateGiphyGif('safeGif', 'metadata-fixture'), { httpStatus: 400 });
    }
    status = 404;
    await assert.rejects(validateGiphyGif('safeGif', 'metadata-fixture'), { httpStatus: 400 });
    status = 429;
    await assert.rejects(validateGiphyGif('safeGif', 'metadata-fixture'), { httpStatus: 503 });
    env.GIPHY_API_KEY = undefined;
    env.GIPHY_PUBLIC_API_KEY = undefined;
    await assert.rejects(validateGiphyGif('safeGif', 'metadata-fixture'), { httpStatus: 503 });
  } finally {
    env.GIPHY_API_KEY = original.privateKey;
    env.GIPHY_PUBLIC_API_KEY = original.publicKey;
  }
});

test('media uploads limit attempts by account and expire the fixed window', (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const request = { auth: { userId: 'media-limit-fixture' } } as Request;
  const headers = new Map<string, unknown>();
  const response = { setHeader: (name: string, value: unknown) => headers.set(name, value) } as unknown as ExpressResponse;
  let error: unknown;
  const next = ((value?: unknown) => { error = value; }) as NextFunction;
  for (let index = 0; index < 20; index++) { limitMediaUploads(request, response, next); assert.equal(error, undefined); }
  limitMediaUploads(request, response, next);
  assert.equal((error as { httpStatus: number }).httpStatus, 429);
  assert.equal(headers.get('Retry-After'), 600);
  now += 600_001;
  limitMediaUploads(request, response, next);
  assert.equal(error, undefined);
  for (let index = 0; index < 60; index++) limitGiphyLookups('provider-limit-fixture');
  assert.throws(() => limitGiphyLookups('provider-limit-fixture'), { httpStatus: 429 });
});
