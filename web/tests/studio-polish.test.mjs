import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertStudioSymbol, studioSymbolGroups } from '../src/features/author-ide/studio-symbols.ts';
import { passageAnchor, moveAnchorThroughEdits } from '../src/features/author-ide/studio-annotations.ts';

test('paired symbols wrap selected Vietnamese text and leave an empty pair ready for typing', () => {
  const symbol = studioSymbolGroups[0].symbols[0], source = 'Anh Hùng Goblin 🌙 xuất hiện.';
  const wrapped = insertStudioSymbol(source, 0, 'Anh Hùng Goblin'.length, symbol);
  assert.equal(wrapped.text, '「Anh Hùng Goblin」 🌙 xuất hiện.');
  assert.equal(wrapped.text.slice(wrapped.start, wrapped.end), 'Anh Hùng Goblin');
  const empty = insertStudioSymbol(source, source.length, source.length, symbol);
  assert.equal(empty.text, source + '「」');
  assert.equal(empty.start, source.length + 1); assert.equal(empty.end, empty.start);
});

test('symbol insertion preserves private passage anchors and rejects stale bounds', () => {
  const source = 'Anh Hùng Goblin xuất hiện.', anchor = passageAnchor(source, 0, 14);
  const wrapped = insertStudioSymbol(source, 0, 14, { name: 'Ngoặc Nhật', text: '「', close: '」' });
  const moved = moveAnchorThroughEdits(anchor, wrapped.text, wrapped.edits);
  assert.equal(moved.detached, undefined); assert.equal(moved.quote, anchor.quote);
  const single = insertStudioSymbol(source, 0, 3, { name: 'Sao', text: '✦' });
  assert.equal(single.text, '✦ Hùng Goblin xuất hiện.');
  assert.equal(single.start, 1); assert.equal(single.end, 1);
  assert.throws(() => insertStudioSymbol(source, 0, 1000, { name: 'Sao', text: '✦' }));
});
