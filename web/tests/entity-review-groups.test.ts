import test from 'node:test';
import assert from 'node:assert/strict';
import { knownIdentity, newIdentity, rejectOccurrence, type Decision, type EntityReview, type KnownEntity } from '../src/features/ai-copilot/author-memory-api';
import {
  applyToGroup, conflictingOccurrences, groupBySurface, summarizeGroup
} from '../src/features/ai-copilot/entity-review-groups';

type Candidate = EntityReview['candidates'][number];
const cand = (id: string, surface: string, start: number): Candidate =>
  ({ candidate_id: id, surface, start, end: start + surface.length, context: `… ${surface} …` } as Candidate);
const base = { canonical_entity_id: '', provisional_identity_key: '', identity_quote: '', initial_status: 'Unknown',
  status_quote: '', confidence: 0.9, reason: 'r' } as const;
const machine = (id: string, verdict: Decision['verdict'], name = '', type: Decision['entity_type'] = 'PER'): Decision =>
  ({ ...base, candidate_id: id, verdict, canonical_name: name, entity_type: verdict === 'entity' ? type : null }) as Decision;
const review = { provisional_identity_scope: 'scope' } as EntityReview;
const linh: KnownEntity = { entity_id: 'e-linh', name: 'Linh', entity_type: 'PER' } as KnownEntity;

const candidates = [cand('c3', 'linh', 40), cand('c1', 'Linh', 0), cand('c2', 'Ba Lắm', 10), cand('c4', 'Linh', 60)];
const machines: Record<string, Decision> = {
  c1: machine('c1', 'entity', 'Linh'), c2: machine('c2', 'entity', 'Ba Lắm'),
  c3: machine('c3', 'unresolved'), c4: machine('c4', 'entity', 'Linh', 'LOC')
};
const machineFor = (id: string) => machines[id];

test('occurrences are grouped by surface, case-insensitive, in text order', () => {
  const groups = groupBySurface(candidates);
  assert.deepEqual(groups.map(g => [g.surface, g.candidates.map(c => c.candidate_id)]),
    [['Linh', ['c1', 'c3', 'c4']], ['Ba Lắm', ['c2']]]);
});

test('a group action decides every occurrence and keeps per-occurrence evidence quotes', () => {
  const [group] = groupBySurface(candidates);
  const choices = { c3: { ...machine('c3', 'entity', 'Linh'), identity_quote: 'q3', canonical_entity_id: 'e-linh' } as Decision };
  const updates = applyToGroup(group, choices, machineFor, m => knownIdentity(m, linh));
  assert.deepEqual(Object.keys(updates).sort(), ['c1', 'c3', 'c4']);
  assert.ok(Object.values(updates).every(d => d.canonical_entity_id === 'e-linh' && d.verdict === 'entity'));
  assert.equal(updates.c3.identity_quote, 'q3');
  const rejected = applyToGroup(group, choices, machineFor, m => rejectOccurrence(m));
  assert.equal(rejected.c3.identity_quote, '');
});

test('replacing a different identity needs confirmation; the same identity or no decision does not', () => {
  const [group] = groupBySurface(candidates);
  const asKnown = knownIdentity(machines.c1, linh);
  const asNew = newIdentity(review, machines.c1, 'linh_other');
  const choices: Record<string, Decision> = { c1: asKnown, c3: rejectOccurrence(machines.c3) };
  assert.equal(conflictingOccurrences(group, choices, asKnown).length, 0);
  assert.deepEqual(conflictingOccurrences(group, choices, asNew).map(c => c.candidate_id), ['c1']);
  assert.deepEqual(conflictingOccurrences(group, choices, rejectOccurrence(machines.c1)).map(c => c.candidate_id), ['c1']);
});

test('summary shows progress, a shared decision, machine counts and the usual type', () => {
  const [group] = groupBySurface(candidates);
  const partial = summarizeGroup(group, { c1: knownIdentity(machines.c1, linh) }, machineFor);
  assert.equal(partial.resolved, 1);
  assert.equal(partial.shared, undefined);
  assert.deepEqual(partial.machine, [
    { label: 'entity [PER]', count: 1 }, { label: 'unresolved', count: 1 }, { label: 'entity [LOC]', count: 1 }]);
  const all = applyToGroup(group, {}, machineFor, m => knownIdentity(m, linh));
  assert.equal(summarizeGroup(group, all, machineFor).shared?.canonical_entity_id, 'e-linh');
  const [, single] = groupBySurface(candidates);
  assert.equal(summarizeGroup(single, {}, machineFor).suggestedType, 'PER');
});

test('R3: a short name linked to a known entity gets a sentence naming both as evidence', async () => {
  const { aliasEvidence, needsAliasEvidence } = await import('../src/features/ai-copilot/entity-review-groups');
  assert.equal(needsAliasEvidence('Lôi Long', 'Thượng cổ Lôi Long'), true);
  assert.equal(needsAliasEvidence('Chị Mai', 'Mai'), false);
  assert.equal(needsAliasEvidence('linh', 'Linh'), false);
  const context = '… trời tối sầm. Thượng cổ Lôi Long gầm lên giữa mây. Lôi Long quẫy đuôi …';
  assert.equal(aliasEvidence(context, 'Lôi Long', 'Thượng cổ Lôi Long'), 'Thượng cổ Lôi Long gầm lên giữa mây.');
  assert.equal(aliasEvidence('Lôi Long quẫy đuôi trên đỉnh núi.', 'Lôi Long', 'Thượng cổ Lôi Long'), null);
});
