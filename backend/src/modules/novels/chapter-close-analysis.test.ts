import test from 'node:test';
import assert from 'node:assert/strict';
import { closeChapterAnalysis } from './chapter-lifecycle.js';

// Live check R4 (BB3): archiving or deleting a chapter closes its open analysis in the AI service.
test('archiving or deleting a chapter asks the AI service to close its analysis', async () => {
  const calls: any[] = [];
  await closeChapterAnalysis('novel-1', 'chapter-1', 'user-1', (async (options: any) => { calls.push(options); return {}; }) as any);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/v1/story-brains/novel-1/chapters/chapter-1/close-analysis');
  assert.equal(calls[0].userId, 'user-1');
});

test('an unreachable AI service does not undo the chapter change', async () => {
  await assert.doesNotReject(closeChapterAnalysis('novel-1', 'chapter-1', 'user-1',
    (async () => { throw new Error('AI service down'); }) as any));
});
