import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAutonomousRunsOnce } from './autonomous-processor.js';

test('server worker processes saved running tasks without a browser request', async () => {
  const calls: string[] = [];
  await processAutonomousRunsOnce({
    listRuns: async () => [{ run_id: 'r1', author_id: 'a1' }, { run_id: 'r2', author_id: 'a2' }],
    step: async (author, id) => { calls.push(`${author}:${id}`); }
  });
  assert.deepEqual(calls, ['a1:r1', 'a2:r2']);
});

test('overlapping worker ticks do not launch duplicate steps', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let steps = 0;
  const deps = { listRuns: async () => [{ run_id: 'r1', author_id: 'a1' }],
    step: async () => { steps++; await gate; } };
  const first = processAutonomousRunsOnce(deps);
  await processAutonomousRunsOnce(deps);
  finish(); await first;
  assert.equal(steps, 1);
});
