import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortChapters } from '../src/features/author-projects/chapter-sorting.ts';

test('chapter display sorts use the whole list without mutating publication order', () => {
  const chapters = [
    { chapterId: 'a', chapterNumber: 1, wordCount: 500, updatedAt: '2026-10-01' },
    { chapterId: 'b', chapterNumber: 2, wordCount: 100, updatedAt: '2026-10-03' },
    { chapterId: 'c', chapterNumber: 3, wordCount: 900, updatedAt: '2026-10-02', draft: { updatedAt: '2026-10-04' } }
  ];
  const original = structuredClone(chapters);
  for (const [order, expected] of Object.entries({
    'number-asc': ['a', 'b', 'c'], 'number-desc': ['c', 'b', 'a'],
    'updated-desc': ['c', 'b', 'a'], 'updated-asc': ['a', 'b', 'c'],
    'words-desc': ['c', 'a', 'b'], 'words-asc': ['b', 'a', 'c']
  })) {
    assert.deepEqual(sortChapters(chapters, order).map(ch => ch.chapterId), expected);
  }
  assert.deepEqual(chapters, original);
});

test('tied metrics fall back to chapter number regardless of API input order', () => {
  const chapters = [3, 1, 2].map(chapterNumber => ({ chapterId: String(chapterNumber), chapterNumber, wordCount: 0, updatedAt: 'invalid' }));
  for (const order of ['words-desc', 'words-asc', 'updated-desc', 'updated-asc']) {
    assert.deepEqual(sortChapters(chapters, order).map(ch => ch.chapterNumber), [1, 2, 3]);
  }
});
