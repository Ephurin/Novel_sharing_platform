import assert from 'node:assert/strict';
import { until } from './p1-real-stack.mjs';

export async function canonAcceptance(h, f, x) {
  const { page } = h, base = `/ai/story-brains/${x.novelA}`;
  const memory = async () => (await h.api('GET', base + '/memory', undefined, x.a.token)).data;
  const queue = async () => (await h.api('GET', base + '/review-queue', undefined, x.a.token)).data;
  const identity = group => x.entities.frozen.entities.find(e => e.provisional_identity_key.endsWith('/' + group)).entity_id;
  const doctor = identity('doctor'), driver = identity('driver'), witness = identity('witness');
  const original = x.entities.approved.events[0];
  const source = await h.sql('SELECT * FROM narrative.events WHERE id=$1', [original.event_id]);
  assert.ok(source[0].event_metadata.evidence.length > 0);
  assert.equal(source[0].event_metadata.evidence[0].revision_id, x.analysisRevision);
  assert.equal(source[0].event_metadata.evidence[0].quote, x.entities.text);
  let rejected, corrected;
  async function correction(summary, entity = witness, status = 'Alive') {
    const active = (await memory()).events[0];
    await page.getByRole('tab', { name: /^Sự kiện/ }).click();
    const card = page.getByTestId('event-card-' + active.event_id);
    await card.getByTestId('btn-edit-event-' + active.event_id).click();
    await card.getByLabel('Tóm tắt sự kiện đã sửa (summary)', { exact: true }).fill(summary);
    // Clear prior form rows explicitly, then create precisely the intended update through UI.
    while (await card.getByRole('button', { name: 'Bỏ', exact: true }).count()) await card.getByRole('button', { name: 'Bỏ', exact: true }).last().click();
    await card.getByRole('button', { name: '+ Thêm cập nhật trạng thái', exact: true }).click();
    await card.getByRole('textbox', { name: 'Thực thể', exact: true }).click();
    await page.getByRole('option').filter({ hasText: entity.slice(0, 8) }).click();
    await card.getByLabel('Thuộc tính', { exact: true }).fill('status');
    await card.getByLabel('Giá trị mới', { exact: true }).fill(status);
    const result = page.waitForResponse(r => r.url().endsWith('/api/v1' + base + `/events/${active.event_id}/corrections`) && r.request().method() === 'POST');
    await card.getByTestId('btn-submit-correction-' + active.event_id).click();
    const response = await result; assert.equal(response.status(), 201);
    assert.deepEqual(response.request().postDataJSON().transitions, [{ entity_id: entity, attribute_key: 'status', new_value: status }]);
    return await queue();
  }
  await h.step('G3/S10: UI correction creates a multi-member pending group without changing approved memory', async () => {
    const before = await memory();
    rejected = await correction('Nhóm chỉnh sửa mà tác giả sẽ từ chối.');
    assert.equal(rejected.length, 2); assert.equal(new Set(rejected.map(p => p.dependency_group_id)).size, 1);
    assert.deepEqual(new Set(rejected.map(p => p.proposal_type)), new Set(['event', 'state_transition']));
    assert.deepEqual(await memory(), before); await h.snapshot('S10-correction-pending-not-Canon', x.owned);
  });
  await h.step('G3/S10: browser atomic group rejection persists both author decisions with no Canon/version change', async () => {
    const before = await h.snapshot('S10-before-atomic-rejection', x.owned), canonical = await memory(), gid = rejected[0].dependency_group_id;
    await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    await page.getByTestId('btn-reject-group-' + gid).click();
    await page.getByTestId('input-reject-group-reason').fill('Author UI rejects this entire correction group');
    const pending = page.waitForResponse(r => r.url().endsWith(`/api/v1/ai/proposal-groups/${gid}/reject`) && r.request().method() === 'POST');
    await page.getByTestId('btn-confirm-reject-group').click();
    const result = await pending; assert.equal(result.status(), 200); assert.equal(result.request().postDataJSON().expected_brain_version, 2);
    const after = await h.snapshot('S10-after-atomic-rejection', x.owned);
    for (const key of Object.keys(before)) if (!['narrative.proposals', 'narrative.proposal_decisions'].includes(key)) assert.deepEqual(after[key], before[key], key);
    const rows = await h.sql('SELECT id,status,payload FROM narrative.proposals WHERE dependency_group_id=$1 ORDER BY id', [gid]);
    assert.equal(rows.length, 2); assert.ok(rows.every(r => r.status === 'rejected'));
    const decisions = await h.sql('SELECT * FROM narrative.proposal_decisions WHERE proposal_id=ANY($1::uuid[]) ORDER BY proposal_id', [rejected.map(p => p.proposal_id)]);
    assert.equal(decisions.length, 2); assert.ok(decisions.every(d => d.decision === 'reject' && d.actor_id === x.a.userId));
    assert.deepEqual(await memory(), canonical); assert.deepEqual(await queue(), []); await h.shot('s10-atomic-group-rejected');
  });
  await h.step('G3/S10: separate UI correction and complete approval preserve immutable event provenance', async () => {
    corrected = await correction('Tác giả xác nhận lan còn sống, hai Minh giữ nguyên danh tính.');
    assert.equal(corrected.length, 2); assert.equal((await memory()).brain_version, 2);
    const gid = corrected[0].dependency_group_id;
    await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    const pending = page.waitForResponse(r => r.url().endsWith(`/api/v1/ai/proposal-groups/${gid}/accept`) && r.request().method() === 'POST');
    await page.getByTestId('btn-accept-group-' + gid).click(); assert.equal((await pending).status(), 200);
    x.correctedMemory = await memory(); assert.equal(x.correctedMemory.brain_version, 3);
    assert.deepEqual(new Set(x.correctedMemory.entities.map(e => e.entity_id)), new Set([doctor, driver, witness]));
    assert.equal(x.correctedMemory.events.length, 1);
    const event = x.correctedMemory.events[0]; assert.equal(event.metadata.supersedes_id, original.event_id);
    assert.deepEqual(event.metadata.evidence, original.metadata.evidence);
    assert.deepEqual(new Set(event.participants), new Set([doctor, driver, witness]));
    const states = await h.sql('SELECT * FROM narrative.state_transitions WHERE novel_id=$1', [x.novelA]);
    assert.equal(states.length, 1); assert.equal(states[0].entity_id, witness); assert.equal(states[0].new_value, 'Alive');
    const historical = (await h.sql('SELECT * FROM narrative.events WHERE id=$1', [original.event_id]))[0];
    assert.deepEqual(historical.event_metadata.evidence, source[0].event_metadata.evidence);
    await h.snapshot('S10-approved-correction-v3', x.owned); await h.shot('s10-correction-approved-exact-identity');
  });
  await h.step('G3/S10: mounted consistency uses approved current state and an actual immutable revision', async () => {
    const current = await h.sql('SELECT state FROM narrative.current_entity_states WHERE entity_id=$1', [witness]);
    assert.equal(current[0].state.status, 'Alive');
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const before = await f.chapterState(x.first), saved = f.patchResponse(x.first);
    x.latestDraft = x.entities.text + '\nlan đã chết.';
    await f.editor().fill(x.latestDraft); assert.equal((await saved).status(), 200);
    const updated = await f.changed(x.first, x.latestDraft, before); x.consistencyRevision = updated.chapter.latest_revision_id;
    await page.getByTestId('btn-story-brain').click(); await page.getByRole('tab', { name: /^Sự kiện/ }).click();
    const baseline = await h.snapshot('S10-before-consistency-check', x.owned);
    const pending = page.waitForResponse(r => r.url().endsWith('/api/v1' + base + '/author-operation') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Kiểm tra nhất quán chương đang mở', exact: true }).click();
    const result = await pending; assert.equal(result.status(), 200);
    const dto = (await result.json()).data; await h.save('consistency-actual-response.json', dto);
    assert.deepEqual(await h.snapshot('S10-after-read-only-consistency-check', x.owned), baseline);
    const finding = dto.findings.find(item => item.entity_id === witness);
    assert.ok(finding, 'Approved Alive state must detect the uniquely identified lan death contradiction');
    assert.equal(finding.revision_id, x.consistencyRevision); assert.equal(finding.evidence, 'lan đã chết');
    await page.getByText(finding.description, { exact: false }).waitFor(); await h.shot('s10-real-current-state-consistency');
  });
  await h.step('G3/S10: author corrects the identified contradiction and separately approves the complete group', async () => {
    const previous = (await memory()).events[0];
    const proposals = await correction('Tác giả sửa trạng thái lan theo bản thảo đã lưu.', witness, 'Dead');
    assert.equal((await memory()).brain_version, 3);
    const gid = proposals[0].dependency_group_id;
    await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    const accepted = page.waitForResponse(r => r.url().endsWith(`/api/v1/ai/proposal-groups/${gid}/accept`) && r.request().method() === 'POST');
    await page.getByTestId('btn-accept-group-' + gid).click(); assert.equal((await accepted).status(), 200);
    const value = await memory(); assert.equal(value.brain_version, 4);
    assert.equal(value.entities.find(e => e.entity_id === witness).status, 'Dead');
    assert.equal(value.events[0].metadata.supersedes_id, previous.event_id);
    assert.deepEqual(value.events[0].metadata.evidence, original.metadata.evidence);
    await page.getByRole('tab', { name: /^Sự kiện/ }).click();
    const checked = page.waitForResponse(r => r.url().endsWith('/api/v1' + base + '/author-operation') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Kiểm tra nhất quán chương đang mở', exact: true }).click();
    assert.deepEqual((await (await checked).json()).data.findings, []);
    await page.getByText('Không tìm thấy mâu thuẫn trong lần kiểm tra này.', { exact: true }).waitFor();
    await h.snapshot('S10-consistency-corrected-author-approval-v4', x.owned); await h.shot('s10-correction-resolves-consistency');
  });
  await h.step('G3/S10: exact-ID author locks distinguish homonymous subjects', async () => {
    await page.getByRole('tab', { name: /^Quan hệ Canon/ }).click();
    for (const [subject, relation, version] of [[doctor, 'ally', 4], [driver, 'enemy', 5]]) {
      await page.getByRole('textbox', { name: 'Chủ thể (Subject)', exact: true }).click(); await page.getByRole('option').filter({ hasText: subject.slice(0, 8) }).click();
      if (subject === driver) {
        // Mantine deselects the current option when clicked again. Make the
        // author's target change explicit, then choose witness again below.
        await page.getByRole('textbox', { name: 'Đối tượng (Object)', exact: true }).click();
        await page.getByRole('option').filter({ hasText: doctor.slice(0, 8) }).click();
      }
      await page.getByRole('textbox', { name: 'Đối tượng (Object)', exact: true }).click(); await page.getByRole('option').filter({ hasText: witness.slice(0, 8) }).click();
      await page.getByLabel('Loại quan hệ (Relation Type, tối đa 80 ký tự)', { exact: true }).fill(relation);
      const pending = page.waitForResponse(r => r.url().endsWith('/api/v1' + base + '/relationship-locks') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Khóa quan hệ vào Canon', exact: true }).click();
      const result = await pending; assert.equal(result.status(), 200);
      assert.deepEqual(result.request().postDataJSON(), { subject_entity_id: subject, object_entity_id: witness, relation_type: relation, expected_brain_version: version });
      const value = await memory(); assert.equal(value.brain_version, version + 1);
      assert.ok(value.relations.some(r => r.locked && r.relation === relation && r.metadata.subject_entity_id === subject && r.metadata.object_entity_id === witness));
    }
    const value = await memory(); assert.equal(value.relations.length, 2);
    await h.snapshot('S10-homonym-exact-pair-locks-v6', x.owned); await h.shot('s10-two-homonymous-subject-locks');
  });
  await h.step('G3/S11: pending correction survives reload, without entering Canon or changing UUIDs/locks', async () => {
    const canonical = await memory(); assert.equal(canonical.brain_version, 6);
    const proposals = await correction('Đề xuất còn chờ duyệt cho tài xế Minh.', driver, 'Alive');
    assert.equal(proposals.length, 2); assert.deepEqual(await memory(), canonical);
    const groupId = proposals[0].dependency_group_id;
    await page.reload(); await until(async () => await f.editor().inputValue() === x.latestDraft, 'Latest saved draft lost on reload');
    await page.getByTestId('btn-story-brain').click(); await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    await page.getByTestId('dependency-group-' + groupId).waitFor();
    assert.deepEqual(await memory(), canonical);
    const reviews = (await h.api('GET', base + '/entity-reviews', undefined, x.a.token)).data;
    assert.ok(reviews.some(r => r.revision_id === x.consistencyRevision && r.status === 'waiting_entity_review'));
    const audit = (await h.api('GET', base + '/entity-candidate-audits/' + x.entities.run, undefined, x.a.token)).data;
    assert.deepEqual(audit.entities, x.entities.frozen.entities);
    assert.equal(canonical.entities.find(e => e.entity_id === driver).status, 'Unknown');
    const analysed = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/reanalyse'));
    await page.getByRole('button', { name: 'Phân tích lại chương đang mở', exact: true }).click();
    assert.equal((await analysed).status(), 200);
    const active = await until(async () => {
      const all = (await h.api('GET', base + '/entity-reviews', undefined, x.a.token)).data;
      return all.find(r => r.revision_id === x.consistencyRevision && r.brain_version === canonical.brain_version);
    }, 'No current-Brain checkpoint after explicit UI reanalysis');
    const checkpoint = page.getByTestId('entity-checkpoint-' + active.analysis_run_id);
    const candidate = active.candidates.find(c => c.surface === 'Minh'); assert.ok(candidate);
    await checkpoint.getByTestId('entity-occurrence-' + candidate.candidate_id).getByRole('textbox', { name: 'Chọn thực thể Canon đã có', exact: true }).click();
    await page.getByRole('option').filter({ hasText: doctor.slice(0, 8) }).click();
    const reviewed = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/entity-reviews/${active.analysis_run_id}/review`));
    await checkpoint.getByRole('button', { name: /^Lưu quyết định một phần/ }).click();
    const review = await reviewed; assert.equal(review.status(), 200);
    const choice = review.request().postDataJSON().decisions.find(d => d.candidate_id === candidate.candidate_id);
    assert.equal(choice.canonical_entity_id, doctor); assert.equal(choice.provisional_identity_key, '');
    await page.reload(); await until(async () => await f.editor().inputValue() === x.latestDraft, 'Review reload changed draft');
    await page.getByTestId('btn-story-brain').click(); await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    const resumed = page.getByTestId('entity-checkpoint-' + active.analysis_run_id).getByTestId('entity-occurrence-' + candidate.candidate_id);
    await until(async () => (await resumed.getByRole('textbox', { name: 'Chọn thực thể Canon đã có', exact: true }).inputValue()).includes(doctor.slice(0, 8)), 'Exact canonical selection did not resume');
    assert.deepEqual(await memory(), canonical);
    const before = await h.snapshot('S11-before-stale-continuation', x.owned);
    await h.api('POST', base + `/entity-reviews/${x.entities.run}/continue`, {}, x.a.token, [409]);
    assert.deepEqual(await h.snapshot('S11-after-stale-continuation-no-mutation', x.owned), before);
    await h.shot('s11-pending-proposal-and-stable-canon');
  });
  await h.step('S11: actual SPA logout/login clears private account context without a document reload', async () => {
    const canonical = await memory();
    await page.keyboard.press('Escape');
    await page.getByTitle('Quay lại danh sách tác phẩm', { exact: true }).click();
    await page.getByRole('button', { name: /^Tài khoản / }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(/\/login$/);
    const navigation = await page.evaluate(() => performance.timeOrigin);
    await page.getByLabel('Email or username', { exact: true }).fill(x.b.email);
    await page.getByLabel('Password', { exact: true }).fill(x.b.password);
    const logged = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Login', exact: true }).click(); assert.equal((await logged).status(), 200);
    await page.waitForURL(/\/author$/);
    await page.locator('header').getByRole('link', { name: /Viết tiếp/ }).click();
    await until(async () => await f.editor().inputValue() === 'bản thảo tác giả khác.', 'SPA account switch restored another owner draft');
    assert.equal(await page.evaluate(() => performance.timeOrigin), navigation, 'Account switch unexpectedly reset the SPA/cache');
    await page.getByTestId('btn-story-brain').click();
    const content = await page.content();
    for (const id of [doctor, driver, witness]) assert.ok(!content.includes(id), 'Previous author Canon identity leaked after SPA logout');
    const before = await h.snapshot('S11-SPA-account-before-foreign-negative', x.owned);
    await h.api('GET', base + '/memory', undefined, x.b.token, [403]);
    assert.deepEqual(await h.snapshot('S11-SPA-account-after-foreign-negative', x.owned), before);
    assert.deepEqual(await memory(), canonical);
    await h.shot('s11-SPA-account-switch-no-private-cache');
  });
  await h.save('canon-correction-relationship-results.json', { doctor, driver, witness, rejected, corrected, memory: await memory() });
  return { doctor, driver, witness, memory: await memory() };
}
