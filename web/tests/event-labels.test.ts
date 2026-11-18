import test from 'node:test';
import assert from 'node:assert/strict';
import { entityOptionLabel, entityTypeLabel, eventTypeLabel, factKeyLabel, stateValueLabel } from '../src/features/ai-copilot/event-labels';

// UI walkthrough (UI-5) and its recheck: the author sees Vietnamese labels and names, never codes or IDs.
test('labels hide codes, hashes and IDs', () => {
  assert.equal(eventTypeLabel('SUPPRESSION'), 'Trấn áp');
  assert.equal(eventTypeLabel('SECRET_MEETING'), 'Gặp gỡ');
  // Demo walkthrough 2026-11-17: free-form English types and an unaccented typo.
  assert.equal(eventTypeLabel('combat encounter'), 'Giao chiến');
  assert.equal(eventTypeLabel('escape and pursuit'), 'Chạy trốn');
  assert.equal(eventTypeLabel('warning'), 'Cảnh báo');
  assert.equal(eventTypeLabel('truch chay'), 'Sự kiện khác');
  assert.equal(eventTypeLabel('Truy sát'), 'truy sát');
  assert.equal(entityTypeLabel('PER'), 'Nhân vật');
  assert.equal(entityTypeLabel('character'), 'Nhân vật');
  assert.equal(factKeyLabel('hair_color'), 'Màu tóc');
  assert.equal(factKeyLabel('setup_rule_rule_8a0efddc57d94574bc7e9e31ee9542b0'), 'Quy tắc thế giới');
  assert.equal(factKeyLabel('sword_owner'), 'sword owner');
  const entities = [{ entity_id: '8581ac88-df66-4eaa-b2ab-ea2f6ac3444d', name: 'Thiên Lôi Uyên' }];
  assert.equal(stateValueLabel(entities, '8581ac88-df66-4eaa-b2ab-ea2f6ac3444d'), 'Thiên Lôi Uyên');
  assert.equal(stateValueLabel(entities, 'bạc trắng'), 'bạc trắng');
  assert.equal(stateValueLabel(entities, 'Alive'), 'Còn sống');
  assert.equal(stateValueLabel(entities, 'Unconscious'), 'Bất tỉnh');
});

test('a short code is shown only for entities that share a name', () => {
  const a = { entity_id: '00000000-0000-4000-8000-0000000aaaaa', name: 'Minh', entity_type: 'PER' };
  const b = { entity_id: '00000000-0000-4000-8000-0000000bbbbb', name: 'minh', entity_type: 'PER' };
  const c = { entity_id: 'cccccc33-0000-4000-8000-000000000000', name: 'Lam Yên', entity_type: 'PER' };
  assert.equal(entityOptionLabel(a, [a, b, c]), 'Minh (Nhân vật) · #0aaaaa');
  assert.equal(entityOptionLabel(c, [a, b, c]), 'Lam Yên (Nhân vật)');
});
