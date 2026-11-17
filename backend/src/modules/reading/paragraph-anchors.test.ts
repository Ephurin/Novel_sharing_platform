import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterParagraphs,makeAnchor,resolveAnchor } from './paragraph-anchors.js';

test('paragraph anchors preserve source indices and detach ambiguous or changed passages',()=>{
  const content='First\n\n---\n\n[^1]: Footnote\n\nSecond\n\nLast';
  const source=chapterParagraphs(content);
  assert.deepEqual(source.paragraphs.map(p=>p.paragraphIndex),[0,3,4]);
  const anchor=makeAnchor(content,{contentVersion:source.contentVersion,paragraphId:source.paragraphs[1].paragraphId});
  assert.equal(resolveAnchor('Inserted\n\n'+content,anchor).detached,false);
  assert.equal(resolveAnchor(content.replace('Second','Rewritten'),anchor).detached,true);
  assert.throws(()=>makeAnchor(content,{contentVersion:'0'.repeat(64),paragraphId:source.paragraphs[0].paragraphId}));
  const repeated='Same\n\nSame';
  const duplicates=chapterParagraphs(repeated);
  const duplicateAnchor=makeAnchor(repeated,{contentVersion:duplicates.contentVersion,paragraphId:duplicates.paragraphs[0].paragraphId});
  assert.equal(resolveAnchor(repeated,duplicateAnchor).detached,false);
  assert.equal(resolveAnchor('Same\n\nSame\n\nSame',duplicateAnchor).detached,true);
});
