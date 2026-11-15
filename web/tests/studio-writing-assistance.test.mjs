import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPunctuation, applyProofIssues } from '../src/features/author-ide/studio-proofreading.ts';
import { passageAnchor, moveAnchorThroughEdits, validPassageNotes, validBookmarks } from '../src/features/author-ide/studio-annotations.ts';

test('proofreading preserves formatting, line breaks, links, code, decimals and intentional punctuation', () => {
  const protectedText = 'https://example.test/a...b?x=1,2\n`An  nói...`\n```\nAn  nói...\n```\n1,23 · 18:30 · !!!!';
  const source = '**An**  ,Bình  nói...   \n\n' + protectedText;
  const result = inspectPunctuation(source);
  assert.equal(applyProofIssues(source, result.issues), '**An**, Bình nói…\n\n' + protectedText);
  assert.equal(inspectPunctuation(protectedText).issues.length, 0);
});

test('selected proofreading edits are explicit, stale edits fail, and large result sets are capped', () => {
  const source = 'An  nói...\nBình  đáp.';
  const { issues } = inspectPunctuation(source);
  const ellipsis = issues.filter(issue => issue.rule === 'ellipsis');
  assert.equal(applyProofIssues(source, ellipsis), 'An  nói…\nBình  đáp.');
  assert.throws(() => applyProofIssues('Lời dẫn. ' + source, ellipsis));
  const capped = inspectPunctuation('An  nói.\n'.repeat(600));
  assert.equal(capped.issues.length, 500); assert.equal(capped.truncated, true);
});

test('independent proofreading edits preserve notes and bookmarks between and inside changed passages', () => {
  const source = 'An  mở cửa.\n\nBình  nhìn lên... 🌙\n\nKết  thúc.';
  const { issues } = inspectPunctuation(source), after = applyProofIssues(source, issues);
  const start = source.indexOf('Bình'), end = source.indexOf('\n\nKết');
  const anchor = passageAnchor(source, start, end);
  const moved = moveAnchorThroughEdits(anchor, after, issues);
  assert.equal(moved.detached, undefined); assert.equal(after.slice(moved.start, moved.end), 'Bình nhìn lên… 🌙');
  assert.equal(moved.start, after.indexOf('Bình'));
  const untouched = passageAnchor(source, source.indexOf('🌙'), source.indexOf('🌙') + 2);
  assert.equal(moveAnchorThroughEdits(untouched, after, issues).quote, '🌙');
});

test('new note labels remain compatible with old notes and reject corrupt bookmark data', () => {
  const anchor = passageAnchor('Đoạn cần nhớ.', 0, 13);
  const note = { ...anchor, id: 'one', body: 'Việc cần sửa', resolved: false };
  assert.equal(validPassageNotes([note]), true);
  assert.equal(validPassageNotes([{ ...note, label: 'plot' }]), true);
  assert.equal(validPassageNotes([{ ...note, label: 'unknown' }]), false);
  const bookmark = { ...anchor, id: 'one', name: 'Cảnh một' };
  assert.equal(validBookmarks([bookmark]), true);
  assert.equal(validBookmarks([bookmark, bookmark]), false);
  assert.equal(validBookmarks([{ ...bookmark, start: -1 }]), false);
});
