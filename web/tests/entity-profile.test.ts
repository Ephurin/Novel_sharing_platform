import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../src/shared/api/api-client.ts';
import { getEntityProfile, updateEntityProfile, type EntityProfile, type EntityProfilePatch } from '../src/features/ai-copilot/author-memory-api.ts';
import { buildProfilePatch, profileDraft, codePointCount } from '../src/features/ai-copilot/entity-profile-form.ts';

const base: EntityProfile = { entity_id: 'entity-a', novel_id: 'novel-a', version: 3, brain_version: 8,
  profile: { description: 'Confirmed', appearance: 'Blue', personality: '', background: '' }, author_notes: '', effective_from_chapter: 2 };

test('AX02 partial Canon patch, clear, note-only, no-op and cutoff semantics', () => {
  const form = profileDraft(base);
  assert.deepEqual(buildProfilePatch(base, form), {});
  assert.deepEqual(buildProfilePatch(base, { ...form, description: '', cutoff: '5' }).patch,
    { expected_version: 3, expected_brain_version: 8, effective_from_chapter: 5, description: '' });
  const notes = buildProfilePatch(base, { ...form, author_notes: 'fixture-note' }).patch!;
  assert.deepEqual(Object.keys(notes).sort(), ['author_notes', 'expected_brain_version', 'expected_version']);
  assert.ok(buildProfilePatch(base, { ...form, cutoff: '4' }).error);
});

test('AX02 Unicode code points and bounds, control characters and strict cutoff', () => {
  const form = { ...profileDraft(base), description: '😀'.repeat(4000), cutoff: '1000000' };
  assert.equal(codePointCount(form.description), 4000);
  assert.ok(buildProfilePatch(base, form).patch);
  assert.ok(buildProfilePatch(base, { ...form, description: form.description + '😀' }).error);
  assert.ok(buildProfilePatch(base, { ...form, author_notes: 'a'.repeat(8001) }).error);
  assert.ok(buildProfilePatch(base, { ...form, appearance: '\u0000' }).error);
  for (const cutoff of ['', '0', '1.5', '-1', '1000001', '1e2']) assert.ok(buildProfilePatch(base, { ...form, cutoff }).error);
});

test('AX02 typed Gateway API GET/PATCH, stable retry key and fail-closed payload', async () => {
  const original = apiClient.defaults.adapter;
  const calls: any[] = [];
  apiClient.defaults.adapter = async config => {
    calls.push({ method: config.method, url: config.url, headers: config.headers.toJSON(), body: config.data ? JSON.parse(config.data) : undefined });
    return { data: { data: base }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    assert.deepEqual(await getEntityProfile('novel-a', 'entity-a'), base);
    const patch = buildProfilePatch(base, { ...profileDraft(base), author_notes: 'fixture-note' }).patch!;
    await updateEntityProfile('novel-a', 'entity-a', patch, 'same-operation');
    await updateEntityProfile('novel-a', 'entity-a', patch, 'same-operation');
    assert.equal(calls[0].url, '/ai/story-brains/novel-a/entities/entity-a/profile');
    assert.equal(calls[1].method, 'patch');
    assert.deepEqual(calls[1], calls[2]);
    assert.equal(calls[1].headers['Idempotency-Key'], 'same-operation');
    for (const invalid of [{ ...patch, future_plan: 'no' }, { ...patch, author_notes: null }, { ...patch, expected_version: undefined },
      { ...patch, author_notes: 'x'.repeat(8001) }, { expected_version: 3, expected_brain_version: 8, description: 'new' },
      { ...patch, effective_from_chapter: 2 }]) {
      await assert.rejects(updateEntityProfile('novel-a', 'entity-a', invalid as EntityProfilePatch, 'new-operation'));
    }
    assert.equal(calls.length, 3);
    await assert.rejects(getEntityProfile('other-novel', 'entity-a'));
  } finally { apiClient.defaults.adapter = original; }
});
