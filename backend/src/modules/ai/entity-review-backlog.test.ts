import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test-local dummy configuration; no DB is reached because the head lookup is injected.
process.env.DATABASE_URL ||= 'postgres://unused/entity-review-backlog';
process.env.MONGODB_URI ||= 'mongodb://unused/entity-review-backlog';
process.env.JWT_ACCESS_SECRET ||= 'backlog-test-secret-access';
process.env.JWT_REFRESH_SECRET ||= 'backlog-test-secret-refresh';
const { onlyLatestRevisionReviews } = await import('./ai-gateway.controller.js');

test('entity review list keeps only the checkpoint of each chapter head revision', async () => {
  const heads: Record<string, string> = { ch1: 'r1b', ch2: 'r2a' };
  const lookups: string[] = [];
  const reviews = [
    { analysis_run_id: 'a', chapter_id: 'ch1', revision_id: 'r1a', status: 'waiting_entity_review' },
    { analysis_run_id: 'b', chapter_id: 'ch1', revision_id: 'r1b', status: 'waiting_entity_review' },
    { analysis_run_id: 'c', chapter_id: 'ch2', revision_id: 'r2a', status: 'entities_reviewed' },
    { analysis_run_id: 'd', chapter_id: 'ch1', revision_id: 'r1a', status: 'entities_reviewed' },
    { analysis_run_id: 'e', chapter_id: 'ch3', revision_id: 'r3a', status: 'waiting_entity_review' }
  ];
  const kept = await onlyLatestRevisionReviews(reviews, async chapterId => {
    lookups.push(chapterId);
    return heads[chapterId] ?? null;
  }) as typeof reviews;
  assert.deepEqual(kept.map(r => r.analysis_run_id), ['b', 'c']);
  assert.deepEqual(lookups, ['ch1', 'ch2', 'ch3'], 'one head lookup per chapter');
});

test('a re-analysis of the head after Canon moved hides the older checkpoint of that chapter', async () => {
  const reviews = [
    { analysis_run_id: 'old', chapter_id: 'ch1', revision_id: 'r1', brain_version: 3 },
    { analysis_run_id: 'new', chapter_id: 'ch1', revision_id: 'r1', brain_version: 5 },
    { analysis_run_id: 'other', chapter_id: 'ch2', revision_id: 'r2', brain_version: 3 }
  ];
  const kept = await onlyLatestRevisionReviews(reviews, async id => (id === 'ch1' ? 'r1' : 'r2')) as typeof reviews;
  assert.deepEqual(kept.map(r => r.analysis_run_id), ['new', 'other']);
});

test('entity review list passes through non-list payloads and legacy rows without chapter scope', async () => {
  const lookup = async () => { throw new Error('must not look up'); };
  assert.deepEqual(await onlyLatestRevisionReviews({ ok: true }, lookup), { ok: true });
  const legacy = [{ analysis_run_id: 'x', revision_id: 'r' }];
  assert.deepEqual(await onlyLatestRevisionReviews(legacy, lookup), legacy);
});
