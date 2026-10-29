import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findText, replaceMatches, manuscriptScenes, studioStatistics } from '../src/features/author-ide/studio-tools.ts';
import { passageAnchor, moveAnchor, locateAnchor } from '../src/features/author-ide/studio-annotations.ts';

test('search uses literal text, Vietnamese whole-word boundaries and UTF-16 editor offsets', () => {
  const text = '🌙 An ăn. Anam AN ăn. [a+b]';
  assert.deepEqual(findText(text, 'an', false, true).matches, [{ start: 3, end: 5 }, { start: 15, end: 17 }]);
  assert.equal(findText(text, 'An', true, true).matches.length, 1);
  assert.equal(findText(text, '[a+b]').matches.length, 1);
  assert.equal(findText(text, 'ăn', false, true).matches.length, 2);
  assert.deepEqual(findText(text, '').matches, []);
});
test('replacement treats dollar signs as prose and reports capped searches', () => {
  const text = 'An An';
  assert.equal(replaceMatches(text, findText(text, 'An').matches, '$&'), '$& $&');
  const capped = findText('a'.repeat(12), 'a', false, false, 10);
  assert.equal(capped.matches.length, 10); assert.equal(capped.truncated, true);
});
test('scene navigation retains real editor offsets and statistics count code points', () => {
  const text = 'Cảnh một\n\n---\n\nCảnh hai 🌙';
  const scenes = manuscriptScenes(text);
  assert.equal(scenes.length, 2);
  assert.equal(text.slice(scenes[1].start, scenes[1].end), 'Cảnh hai 🌙');
  assert.deepEqual(studioStatistics('🌙 An\n\nBình'), { words: 3, characters: 10, withoutSpaces: 7, paragraphs: 2 });
});
test('passage notes follow edits before and inside their range, but retain deleted quotes as detached', () => {
  const text = 'Mở đầu.\n\nĐoạn cần sửa 🌙.\n\nKết thúc.';
  const start = text.indexOf('Đoạn'), end = text.indexOf('\n\nKết');
  const anchor = passageAnchor(text, start, end);
  const prefixed = 'Lời dẫn. ' + text;
  const moved = moveAnchor(anchor, text, prefixed);
  assert.equal(moved.start, start + 'Lời dẫn. '.length);
  assert.equal(prefixed.slice(moved.start, moved.end), anchor.quote);
  const inside = text.replace('cần sửa', 'vừa sửa xong');
  const extended = moveAnchor(anchor, text, inside);
  assert.equal(extended.quote, 'Đoạn vừa sửa xong 🌙.');
  assert.equal(moveAnchor(anchor, text, text.slice(0, start) + text.slice(end)).detached, true);
  assert.equal(locateAnchor(anchor, prefixed).start, moved.start);
});
test('notes never guess between repeated short text after reloading', () => {
  assert.equal(locateAnchor({start:0,end:2,quote:'An',before:'',after:''}, 'x An y An').detached, true);
});
test('formatting a passage does not detach its comment', () => {
  const before = 'An gặp Bình', after = '**An** gặp Bình';
  const anchor = passageAnchor(before, 0, 2);
  const moved = moveAnchor(anchor, before, after);
  assert.equal(moved.detached, undefined);assert.equal(after.slice(moved.start, moved.end), 'An');
});
