import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveAutonomousMemory, objectiveIsComplete } from './autonomous-memory.service.js';

function harness() {
  const accepted: string[] = [];
  return { accepted, deps: {
    analysisStatus: async () => 'COMPLETED', brainVersion: async () => 5,
    entityReviews: async (): Promise<{ revision_id: string }[]> => [],
    proposals: async () => [
      { proposal_id: 'p1', dependency_group_id: 'g1', evidence: [{ revision_id: 'target' }] },
      { proposal_id: 'p2', dependency_group_id: 'other', evidence: [{ revision_id: 'unrelated' }] }],
    assertCurrent: async (_ids: string[]) => {},
    accept: async (group: string, ids: string[], version: number) => {
      assert.deepEqual(ids, ['p1']); assert.equal(version, 5); accepted.push(group); return 6;
    }
  } };
}
test('empty queue cannot hide incomplete extraction', async () => {
  const h = harness(); h.deps.analysisStatus = async () => 'PROCESSING'; h.deps.proposals = async () => [];
  await assert.rejects(approveAutonomousMemory('target', h.deps), /not completed/);
  assert.deepEqual(h.accepted, []);
});
test('only the generated revision is approved and fresh version is returned', async () => {
  const h = harness(); assert.equal(await approveAutonomousMemory('target', h.deps), 6);
  assert.deepEqual(h.accepted, ['g1']);
});

test('delivered outbox and empty proposals cannot bypass author entity review', async () => {
  const h = harness(); h.deps.entityReviews = async () => [{ revision_id: 'target' }];
  h.deps.proposals = async () => [];
  h.deps.brainVersion = async () => { throw new Error('must not reach canon approval'); };
  await assert.rejects(approveAutonomousMemory('target', h.deps), /entity review is required/);
  assert.deepEqual(h.accepted, []);
});

test('an unrelated chapter checkpoint does not block this generated revision', async () => {
  const h = harness(); h.deps.entityReviews = async () => [{ revision_id: 'unrelated' }];
  assert.equal(await approveAutonomousMemory('target', h.deps), 6);
});
test('approval failures and stale evidence propagate to the controller', async () => {
  const h = harness(); h.deps.assertCurrent = async () => { throw new Error('stale source'); };
  await assert.rejects(approveAutonomousMemory('target', h.deps), /stale source/);
  assert.deepEqual(h.accepted, []);
  h.deps.assertCurrent = async () => {};
  h.deps.accept = async () => { throw new Error('database conflict'); };
  await assert.rejects(approveAutonomousMemory('target', h.deps), /database conflict/);
});
test('short prose never completes even if the evaluator would approve it', async () => {
  assert.equal(await objectiveIsComplete('brief outline', 1000, false, async () => { throw new Error('must not evaluate'); }), false);
});
test('ending requires achieved objective and resolved ending', async () => {
  assert.equal(await objectiveIsComplete('actual prose', 2, true, async () => ({ achieved: true, ending_resolved: false })), false);
  assert.equal(await objectiveIsComplete('actual prose', 2, true, async () => ({ achieved: true, ending_resolved: true })), true);
  assert.equal(await objectiveIsComplete('actual prose', 2, false, async () => ({ achieved: false, ending_resolved: true })), false);
});
