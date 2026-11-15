import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addAuthorNote, authorNoteRemovalEdits, authorNotesPublicationSignature, parseAuthorNotes, updateAuthorNote, removeAuthorNote, reattachAuthorNote, AUTHOR_NOTE_BODY_LIMIT } from '../src/shared/lib/author-notes.ts';
import { passageAnchor, moveAnchorThroughEdits } from '../src/features/author-ide/studio-annotations.ts';
import { transformStudioRange } from '../src/features/author-ide/studio-formatting.ts';
import { inspectPunctuation, applyProofIssues } from '../src/features/author-ide/studio-proofreading.ts';

test('public footnotes preserve Unicode, inline formatting, positions and multiline bodies through serialization', () => {
  const source = '“**Huynh** 🌙”, nàng gọi.\n\nMột câu khác.';
  const end = source.indexOf('”,');
  const content = addAuthorNote(source, 1, end, 'Huynh là anh kết nghĩa.\n\nKhông phải anh ruột.', 'author-one');
  const parsed = parseAuthorNotes(content);
  assert.equal(parsed.manuscript, source.slice(0, end) + '[^author-one]' + source.slice(end));
  assert.equal(parsed.notes[0].body, 'Huynh là anh kết nghĩa.\n\nKhông phải anh ruột.');
  assert.equal(parsed.notes[0].number, 1);
  assert.equal(content.slice(parsed.notes[0].references[0], parsed.notes[0].references[0] + 13), '[^author-one]');
  const moved = parseAuthorNotes('Lời dẫn mới.\n\n' + content);
  assert.equal(moved.notes[0].references[0], content.indexOf('[^author-one]') + 'Lời dẫn mới.\n\n'.length);
});

test('numbering follows reference order, repeated references share a note, and orphan definitions stay out of the reader list', () => {
  const content = 'Câu A[^author-b]. Câu B[^author-a]. Câu C[^author-b].\n\n[^author-a]: A\n\n[^author-b]: B\n\n[^author-orphan]: Riêng chưa gắn';
  const parsed = parseAuthorNotes(content);
  assert.deepEqual(parsed.notes.map(note => [note.id, note.number, note.references.length]), [['author-b', 1, 2], ['author-a', 2, 1]]);
  assert.equal(parsed.all.length, 3);
  assert.equal(parsed.manuscript.includes('Riêng chưa gắn'), false);
  const attached = reattachAuthorNote(content, 'author-orphan', 0, 5);
  assert.equal(parseAuthorNotes(attached).notes[0].id, 'author-orphan');
});

test('editing and deleting notes preserve other notes and never inject HTML or additional definitions', () => {
  let content = addAuthorNote('Huynh và muội.', 0, 5, 'Anh kết nghĩa.', 'author-one');
  content = addAuthorNote(content, 0, 5, 'Một lời giải thích khác.', 'author-two');
  const body = '<img src=x onerror=alert(1)>\n[^author-forged]: Không phải định nghĩa mới';
  const updated = updateAuthorNote(content, 'author-one', body);
  assert.equal(parseAuthorNotes(updated).all.length, 2);
  assert.equal(parseAuthorNotes(updated).byId.get('author-one').body, body);
  const removed = removeAuthorNote(updated, 'author-one');
  assert.equal(removed.includes('[^author-one]'), false);
  assert.equal(parseAuthorNotes(removed).notes[0].id, 'author-two');
  assert.equal(parseAuthorNotes(removed).notes[0].number, 1);
});

test('invalid selections, nested markers, duplicate IDs and invalid bodies cannot corrupt the manuscript', () => {
  const content = addAuthorNote('Một câu thoại.', 0, 3, 'Giải thích.', 'author-one');
  assert.throws(() => addAuthorNote(content, 0, 2, 'Trùng', 'author-one'));
  assert.throws(() => addAuthorNote(content, content.indexOf('[^author-one]:'), content.length, 'Sai vị trí', 'author-two'));
  assert.throws(() => addAuthorNote(content, 0, 20, 'Lồng chú thích', 'author-two'));
  assert.throws(() => addAuthorNote('Câu thoại', -1, 3, 'Sai', 'author-one'));
  assert.throws(() => addAuthorNote('Câu thoại', 0, 3, ' ', 'author-one'));
  assert.throws(() => addAuthorNote('Câu thoại', 0, 3, 'x'.repeat(AUTHOR_NOTE_BODY_LIMIT + 1), 'author-one'));
  assert.throws(() => updateAuthorNote(content, 'author-missing', 'Sai'));
  assert.throws(() => reattachAuthorNote(content, 'author-one', 0, 3));
  assert.equal(parseAuthorNotes('Văn bản bình thường.\n\nKhông có chú thích.').manuscript, 'Văn bản bình thường.\n\nKhông có chú thích.');
});

test('public note insertion and removal preserve private notes between edits and literal references inside other note bodies', () => {
  const source = 'Huynh cứ yên tâm.\n\nĐoạn cần sửa riêng.\n\nPhần kết.';
  const anchor = passageAnchor(source, source.indexOf('Đoạn'), source.indexOf('\n\nPhần'));
  const id = 'author-one', marker = `[^${id}]`, annotated = addAuthorNote(source, 0, 5, 'Giải thích.', id);
  const moved = moveAnchorThroughEdits(anchor, annotated, [{ start: 5, end: 5, replacement: marker }, { start: source.length, end: source.length, replacement: annotated.slice(source.length + marker.length) }]);
  assert.equal(moved.detached, undefined); assert.equal(moved.quote, anchor.quote);
  const removed = removeAuthorNote(annotated, id);
  const restored = moveAnchorThroughEdits(moved, removed, authorNoteRemovalEdits(annotated, id));
  assert.equal(restored.start, anchor.start); assert.equal(restored.quote, anchor.quote);
  const withLiteral = addAuthorNote(annotated, 0, 5, 'Ví dụ ký hiệu [^author-one] trong lời giải thích.', 'author-two');
  assert.equal(parseAuthorNotes(removeAuthorNote(withLiteral, id)).byId.get('author-two').body, 'Ví dụ ký hiệu [^author-one] trong lời giải thích.');
});

test('case conversion and proofreading preserve reference identifiers, note bodies and multiline definitions', () => {
  const content = addAuthorNote('Huynh  nói...', 0, 5, 'Lời chú thích.\n\nMột đoạn khác...', 'author-MixedCase');
  const upper = transformStudioRange(content, 0, content.length, 'upper').text;
  assert.ok(upper.startsWith('HUYNH[^author-MixedCase]'));
  assert.equal(parseAuthorNotes(upper).notes[0].body, 'Lời chú thích.\n\nMột đoạn khác...');
  const proof = applyProofIssues(content, inspectPunctuation(content).issues);
  assert.ok(proof.includes('nói…'));
  assert.equal(parseAuthorNotes(proof).notes[0].body, 'Lời chú thích.\n\nMột đoạn khác...');
});

test('publication comparison detects added, removed, edited and relocated notes', () => {
  const original = 'Huynh cứ yên tâm.\n\nMột câu khác.';
  const annotated = addAuthorNote(original, 0, 5, 'Anh kết nghĩa.', 'author-one');
  assert.notEqual(authorNotesPublicationSignature(original), authorNotesPublicationSignature(annotated));
  assert.equal(authorNotesPublicationSignature(annotated), authorNotesPublicationSignature(annotated));
  assert.notEqual(authorNotesPublicationSignature(annotated), authorNotesPublicationSignature(updateAuthorNote(annotated, 'author-one', 'Anh ruột.')));
  assert.notEqual(authorNotesPublicationSignature(annotated), authorNotesPublicationSignature(removeAuthorNote(annotated, 'author-one')));
  const moved = reattachAuthorNote(annotated.replace('[^author-one]', ''), 'author-one', 0, 16);
  assert.notEqual(authorNotesPublicationSignature(annotated), authorNotesPublicationSignature(moved));
});

