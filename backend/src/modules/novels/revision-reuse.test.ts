import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reusesLatestRevision } from './chapter-revisions.service.js';

// Live retest 3, P1: publishing a chapter whose head was an accepted AI draft created an
// AUTHOR_MANUAL copy of the same text and re-analysed the whole reviewed chapter.
test('an author snapshot of the same body as an accepted AI draft reuses that revision', () => {
  assert.equal(reusesLatestRevision({ contentHash: 'h', sourceType: 'AI_DRAFT_ACCEPT' }, 'h', 'AUTHOR_MANUAL'), true);
  assert.equal(reusesLatestRevision({ contentHash: 'h', sourceType: 'AUTHOR_MANUAL' }, 'h', 'AUTHOR_MANUAL'), true);
});

test('changed text, a bootstrap head or no head still creates a revision', () => {
  assert.equal(reusesLatestRevision({ contentHash: 'h', sourceType: 'AI_DRAFT_ACCEPT' }, 'other', 'AUTHOR_MANUAL'), false);
  assert.equal(reusesLatestRevision({ contentHash: 'h', sourceType: 'BOOTSTRAP' }, 'h', 'AUTHOR_MANUAL'), false);
  assert.equal(reusesLatestRevision({ contentHash: 'h', sourceType: 'AUTHOR_MANUAL' }, 'h', 'BOOTSTRAP'), false);
  assert.equal(reusesLatestRevision(null, 'h', 'AUTHOR_MANUAL'), false);
});
