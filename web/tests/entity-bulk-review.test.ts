import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptMachineSuggestions, groupLabelFor, shortNameHints, type Decision, type EntityReview } from '../src/features/ai-copilot/author-memory-api';

const base = { canonical_entity_id: '', provisional_identity_key: '', identity_quote: '', initial_status: 'Unknown', status_quote: '', confidence: 0.9, reason: 'r' } as const;
const d = (id: string, verdict: Decision['verdict'], name = '', extra: Partial<Decision> = {}): Decision =>
  ({ ...base, candidate_id: id, verdict, canonical_name: name, entity_type: verdict === 'entity' ? 'PER' : null, ...extra }) as Decision;
const review = { provisional_identity_scope: 'scope' } as EntityReview;

test('group labels are ASCII, valid and stable per name', () => {
  const label = groupLabelFor('Ông Hòa Đức');
  assert.match(label, /^[A-Za-z0-9_-]{1,64}$/);
  assert.equal(label, groupLabelFor('Ông Hòa Đức'));
  assert.notEqual(groupLabelFor('Hòa'), groupLabelFor('Hoa'));
});

test('accepting suggestions links, groups by name, rejects, and leaves unresolved and decided ones alone', () => {
  const machine = [
    d('c1', 'entity', 'Duy'), d('c2', 'entity', 'Duy'), d('c3', 'not_entity'),
    d('c4', 'entity', 'Bà Sâm', { canonical_entity_id: 'e-1' }), d('c5', 'unresolved', 'Chị'), d('c6', 'entity', 'Mai')];
  const existing = { c6: d('c6', 'not_entity') };
  const out = acceptMachineSuggestions(review, machine, existing);
  assert.deepEqual(Object.keys(out).sort(), ['c1', 'c2', 'c3', 'c4']);
  assert.equal(out.c1.provisional_identity_key, out.c2.provisional_identity_key);
  assert.ok(out.c1.provisional_identity_key.startsWith('scope/'));
  assert.equal(out.c3.verdict, 'not_entity');
  assert.equal(out.c4.canonical_entity_id, 'e-1');
  assert.equal(out.c4.provisional_identity_key, '');
});

test('occurrences of one identity that disagree on life status fall back to Unknown', () => {
  const out = acceptMachineSuggestions(review, [
    d('a', 'entity', 'An', { initial_status: 'Dead', status_quote: 'An đã mất' }), d('b', 'entity', 'An')], {});
  assert.equal(out.a.initial_status, 'Unknown');
  assert.equal(out.a.status_quote, '');
});

test('short-name hints pair a fragment with a longer name, never the other way', () => {
  const hints = shortNameHints(['Mai', 'Mai Linh', 'Vũ', 'Duy'], ['Nguyễn Vũ']);
  assert.deepEqual(hints, [['Mai', 'Mai Linh'], ['Vũ', 'Nguyễn Vũ']]);
});
