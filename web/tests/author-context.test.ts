import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthorContext, resolveAuthorContext, writeAuthorContext } from '../src/features/author-ide/author-context';

test('author contexts are paired, account scoped, and never inherit global legacy values', () => {
  const data = new Map([['ephurin_author_novel_id', 'foreign'], ['ephurin_author_chapter_id', 'foreign-chapter']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.deepEqual(readAuthorContext('B', storage), { novelId: '', chapterId: '' });
  writeAuthorContext('A', { novelId: 'novel-A', chapterId: 'chapter-A' }, storage);
  assert.deepEqual(readAuthorContext('B', storage), { novelId: '', chapterId: '' });
  assert.deepEqual(resolveAuthorContext('A', new URLSearchParams('novelId=novel-B'), storage), { novelId: 'novel-B', chapterId: '' });
  assert.deepEqual(resolveAuthorContext('A', new URLSearchParams('novelId=novel-A'), storage), { novelId: 'novel-A', chapterId: 'chapter-A' });
  assert.deepEqual(resolveAuthorContext('A', new URLSearchParams('novelId=novel-B&chapterId=chapter-B'), storage), { novelId: 'novel-B', chapterId: 'chapter-B' });
  assert.deepEqual(resolveAuthorContext('A', new URLSearchParams(), storage), { novelId: 'novel-A', chapterId: 'chapter-A' });
  data.set('ephurin_author_context:A', '{broken');
  assert.deepEqual(readAuthorContext('A', storage), { novelId: '', chapterId: '' });
  assert.deepEqual(readAuthorContext('', storage), { novelId: '', chapterId: '' });
});
