import test from 'node:test';
import assert from 'node:assert/strict';
import { entityOptionLabel, entityTypeLabel, eventTypeLabel, factKeyLabel, stateValueLabel } from '../src/features/ai-copilot/event-labels';

// UI walkthrough (UI-5) and its recheck: the author sees Vietnamese labels and names, never codes or IDs.
test('labels hide codes, hashes and IDs', () => {
  assert.equal(eventTypeLabel('SUPPRESSION'), 'Trấn áp');
  assert.equal(eventTypeLabel('SECRET_MEETING'), 'secret meeting');
  assert.equal(entityTypeLabel('PER'), 'Nhân vật');
  assert.equal(entityTypeLabel('character'), 'Nhân vật');
  assert.equal(factKeyLabel('hair_color'), 'Màu tóc');
  assert.equal(factKeyLabel('setup_rule_rule_8a0efddc57d94574bc7e9e31ee9542b0'), 'Quy tắc thế giới');
  assert.equal(factKeyLabel('sword_owner'), 'sword owner');
  const entities = [{ entity_id: '8581ac88-df66-4eaa-b2ab-ea2f6ac3444d', name: 'Thiên Lôi Uyên' }];
  assert.equal(stateValueLabel(entities, '8581ac88-df66-4eaa-b2ab-ea2f6ac3444d'), 'Thiên Lôi Uyên');
  assert.equal(stateValueLabel(entities, 'bạc trắng'), 'bạc trắng');
});

test('a short code is shown only for entities that share a name', () => {
  const a = { entity_id: 'aaaaaa11-0000-4000-8000-000000000000', name: 'Minh', entity_type: 'PER' };
  const b = { entity_id: 'bbbbbb22-0000-4000-8000-000000000000', name: 'minh', entity_type: 'PER' };
  const c = { entity_id: 'cccccc33-0000-4000-8000-000000000000', name: 'Lam Yên', entity_type: 'PER' };
  assert.equal(entityOptionLabel(a, [a, b, c]), 'Minh (Nhân vật) · #aaaaaa');
  assert.equal(entityOptionLabel(c, [a, b, c]), 'Lam Yên (Nhân vật)');
});
