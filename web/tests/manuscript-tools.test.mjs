import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateChapterGroups, splitPatternError, splitPresetsValid } from '../src/features/manuscript-import/manuscript-tools.ts';

test('duplicate detection ignores incidental whitespace and Unicode composition without merging different prose', () => {
  assert.deepEqual(duplicateChapterGroups([
    { id: 'a', content: '  Tiếng nói\n\n trong đêm. ' },
    { id: 'b', content: 'Tiếng nói trong đêm.'.normalize('NFD') },
    { id: 'c', content: 'Tiếng nói trong đêm!' },
    { id: 'd', content: 'tiếng nói trong đêm.' },
    { id: 'e', content: '   ' },
    { id: 'f', content: '' }
  ]), [['a', 'b']]);
});

test('split pattern validation rejects invalid syntax, invalid flags and empty matches', () => {
  for (const pattern of ['', '[', '/chapter/gz', '/.*/g', '/^/gm']) assert.equal(typeof splitPatternError(pattern), 'string', pattern);
  for (const pattern of ['/Chương\\s+\\d+:.*/gim', 'Chapter\\s+\\d+']) assert.equal(splitPatternError(pattern), null, pattern);
});

test('saved presets require names, bounded patterns and actual boolean options', () => {
  const preset = { name: 'Tệp tiếng Việt', pattern: '/Chương\\s+\\d+.*/gim', normalizePunctuation: true, removeExtraBlankLines: false, preserveDialogue: true };
  assert.equal(splitPresetsValid([preset]), true);
  assert.equal(splitPresetsValid([{ ...preset, name: '' }]), false);
  assert.equal(splitPresetsValid([{ ...preset, preserveDialogue: 'false' }]), false);
  assert.equal(splitPresetsValid([{ ...preset, pattern: 'a'.repeat(2001) }]), false);
  assert.equal(splitPresetsValid(Array(21).fill(preset)), false);
  assert.equal(splitPresetsValid([null]), false);
});
