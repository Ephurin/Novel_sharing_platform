import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { boundedArray } from './bounded-array.js';
import { createNovelSchema, updateNovelSchema, MAX_NOVEL_TAGS } from '../../modules/novels/novels.schemas.js';

// SEC-01 / GHSA-mrhx-c7xc-m3w5: oversized arrays must fail before per-element validation.
const ONE_MB_OF_INVALID_ITEMS = Array.from({ length: Math.floor((1024 * 1024 - 12) / 3) }, () => '');

test('boundedArray rejects oversized input with a single fatal issue', () => {
  const schema = boundedArray(z.string().min(1), 20);
  const result = schema.safeParse(ONE_MB_OF_INVALID_ITEMS);
  assert.equal(result.success, false);
  assert.equal(result.error?.issues.length, 1);
  assert.equal(result.error?.issues[0].code, 'too_big');
});

test('boundedArray keeps normal array semantics within the bound', () => {
  const schema = boundedArray(z.string().min(1), 3);
  assert.deepEqual(schema.parse(['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.equal(schema.safeParse(['a', 'b', 'c', 'd']).success, false);
  assert.deepEqual(schema.safeParse(['a', '']).error?.issues.map(i => i.path), [[1]]);
  assert.equal(schema.safeParse('a').success, false);
});

test('boundedArray honours min and max', () => {
  const schema = boundedArray(z.string().uuid(), 2, { min: 1 });
  assert.equal(schema.safeParse([]).success, false);
  assert.equal(schema.safeParse(['00000000-0000-4000-8000-000000000000']).success, true);
  assert.equal(schema.safeParse(ONE_MB_OF_INVALID_ITEMS).error?.issues.length, 1);
});

test('novel genres reject oversized input before element validation', () => {
  const body = { title: 'T', synopsis: 'Ten or more characters', genres: ONE_MB_OF_INVALID_ITEMS };
  const result = createNovelSchema.safeParse({ body });
  assert.equal(result.success, false);
  assert.equal(result.error?.issues.filter(i => i.path.includes('genres')).length, 1);
  assert.equal(createNovelSchema.safeParse({ body: { ...body, genres: ['a', 'b', 'c', 'd', 'e'] } }).success, true);
});

test('novel create/update tags are bounded and keep defaults', () => {
  const body = { title: 'T', synopsis: 'Ten or more characters' };
  assert.deepEqual(createNovelSchema.parse({ body }).body.tags, []);
  assert.equal(createNovelSchema.safeParse({ body: { ...body, tags: Array(MAX_NOVEL_TAGS).fill('x') } }).success, true);
  const tooMany = createNovelSchema.safeParse({ body: { ...body, tags: ONE_MB_OF_INVALID_ITEMS } });
  assert.equal(tooMany.success, false);
  assert.equal(tooMany.error?.issues.length, 1);
  const update = updateNovelSchema.safeParse({ params: { novelId: '00000000-0000-4000-8000-000000000000' }, body: { tags: ONE_MB_OF_INVALID_ITEMS } });
  assert.equal(update.success, false);
  assert.equal(update.error?.issues.filter(i => i.path.includes('tags')).length, 1);
});
