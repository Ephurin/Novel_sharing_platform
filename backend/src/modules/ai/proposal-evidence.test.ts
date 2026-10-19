import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHistoricalAuthorCorrection } from './proposal-evidence.service.js';

test('AI reconciliation supersession must still undergo source-head checks', () => {
  assert.equal(isHistoricalAuthorCorrection([{ proposal_id: 'ai', dependency_group_id: 'g',
    proposal_type: 'event', payload: { supersedes_id: 'old-event' } }]), false);
});
test('explicit author historical correction can retain original provenance', () => {
  assert.equal(isHistoricalAuthorCorrection([{ proposal_id: 'author', dependency_group_id: 'g',
    proposal_type: 'event', payload: { supersedes_id: 'old-event', source_type: 'author' } },
  { proposal_id: 'state', dependency_group_id: 'g', proposal_type: 'state_transition' }]), true);
});
test('author correction cannot exempt unrelated extraction in the same selection', () => {
  assert.equal(isHistoricalAuthorCorrection([{ proposal_id: 'author', dependency_group_id: 'g',
    proposal_type: 'event', payload: { supersedes_id: 'old-event', source_type: 'author' } },
  { proposal_id: 'ai', dependency_group_id: 'g', proposal_type: 'fact' }]), false);
});
