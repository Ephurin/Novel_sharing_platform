// P2 live retest on main (2026-11-15), N2: brainstorm before the setup is saved ignored the idea.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withStoryIdea } from '../src/features/ai-copilot/brainstorm-api';

test('N2: the author idea leads the brainstorm direction', () => {
  assert.equal(withStoryIdea('Gợi ý nhân vật', ''), 'Gợi ý nhân vật');
  assert.equal(withStoryIdea('', '   '), '');
  assert.equal(withStoryIdea('', 'Thợ rèn nhặt kiếm gãy'),
    'Ý tưởng truyện của tác giả (chưa duyệt, chỉ để định hướng): Thợ rèn nhặt kiếm gãy');
  assert.equal(withStoryIdea('Gợi ý nhân vật', 'Thợ rèn nhặt kiếm gãy'),
    'Ý tưởng truyện của tác giả (chưa duyệt, chỉ để định hướng): Thợ rèn nhặt kiếm gãy\n\nĐịnh hướng: Gợi ý nhân vật');
  assert.equal(withStoryIdea('x', 'ý'.repeat(20000)).length, 10000);
});
