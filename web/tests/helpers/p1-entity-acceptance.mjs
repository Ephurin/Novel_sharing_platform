import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { until } from './p1-real-stack.mjs';

export async function entityAcceptance(h, f, x) {
  const { page } = h, text = 'bác sĩ Minh gặp tài xế Minh. Minh mở hồ sơ. lan đứng gần.';
  const base = `/ai/story-brains/${x.novelA}`;
  const reviews = async () => (await h.api('GET', base + '/entity-reviews', undefined, x.a.token)).data;
  const memory = async () => (await h.api('GET', base + '/memory', undefined, x.a.token)).data;
  let run, initial, minhs, frozen, approved, proposals;
  const card = () => page.getByTestId('entity-checkpoint-' + run);
  const occurrence = id => card().getByTestId('entity-occurrence-' + id);
  async function openReview() {
    await page.getByTestId('btn-story-brain').click();
    await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    await card().waitFor();
  }
  async function group(label) {
    await card().getByPlaceholder('Tên nhóm mới (ví dụ: minh-bac-si)', { exact: true }).fill(label);
    await card().getByRole('button', { name: '+ Thêm nhóm', exact: true }).click();
  }
  async function select(id, label) {
    await occurrence(id).getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  function response(suffix) {
    return page.waitForResponse(r => r.url().endsWith('/api/v1' + base + `/entity-reviews/${run}/` + suffix) && r.request().method() === 'POST');
  }
  await h.step('G3/S10: manuscript saved by UI, immutable-source checkpoint; no machine identity approval', async () => {
    await f.login(x.a); await page.goto(f.ide(x.novelA, x.first));
    await until(async () => await f.editor().inputValue() === 'bản cần lưu khi đổi chương.', 'Server draft did not load for its owner');
    const beforeRecovery = await f.chapterState(x.first), recovered = f.patchResponse(x.first);
    await page.getByRole('button', { name: 'Khôi phục vào trình soạn thảo', exact: true }).click();
    await until(async () => await f.editor().inputValue() === 'riêng tư chưa gửi của tác giả a.', 'Owner A did not recover its own isolated pending buffer');
    assert.equal((await recovered).status(), 200);
    await f.changed(x.first, 'riêng tư chưa gửi của tác giả a.', beforeRecovery);
    const before = await f.chapterState(x.first), saved = f.patchResponse(x.first);
    await f.editor().fill(text); assert.equal((await saved).status(), 200);
    const state = await f.changed(x.first, text, before);
    x.analysisRevision = state.chapter.latest_revision_id;
    initial = await until(async () => (await reviews()).find(r => r.revision_id === x.analysisRevision), 'No checkpoint for the saved immutable revision');
    run = initial.analysis_run_id;
    assert.equal(initial.status, 'waiting_entity_review'); assert.deepEqual(initial.reviewed_decisions, []);
    assert.equal(initial.source_hash, state.revisions.find(r => r.revision_id === x.analysisRevision).content_hash);
    minhs = initial.candidates.filter(c => c.surface === 'Minh').sort((a, b) => a.start - b.start);
    assert.equal(minhs.length, 3, 'Fixture must expose three independent Minh occurrences');
    assert.equal(initial.candidates.some(c => c.surface === 'lan'), false, 'Missing-name refresh must add an actual new occurrence');
    assert.deepEqual((await memory()).entities, []);
    await openReview(); await h.snapshot('G3-UI-discovery-pending-only', x.owned); await h.shot('s10-human-review-initial');
  });
  await h.step('G3/S11: UI partial review persists one human group; interrupted review resumes', async () => {
    await group('doctor'); await select(minhs[0].candidate_id, 'doctor');
    const saved = response('review');
    await card().getByRole('button', { name: /^Lưu quyết định một phần/ }).click();
    const result = await saved; assert.equal(result.status(), 200); assert.equal(result.request().postDataJSON().finalize, false);
    const dto = (await result.json()).data;
    assert.equal(dto.reviewed_decisions.length, 1); assert.equal(dto.pending_candidate_ids.length, initial.candidates.length - 1);
    assert.deepEqual((await memory()).entities, []); assert.equal((await memory()).brain_version, 1);
    await page.reload(); await until(async () => await f.editor().inputValue() === text, 'Draft did not survive reload');
    await openReview();
    assert.equal(await occurrence(minhs[0].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true }).inputValue(), 'doctor');
    assert.equal(await occurrence(minhs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true }).inputValue(), '');
    await h.snapshot('G3-partial-review-reloaded', x.owned); await h.shot('s11-pending-review-resumed');
  });
  await h.step('G3/S10: two real UI sessions cause review CAS 409; dirty human choices survive without DB mutation', async () => {
    const current = (await reviews()).find(r => r.analysis_run_id === run);
    await card().getByText('v' + current.review_version, { exact: true }).waitFor();
    await group('driver'); await select(minhs[1].candidate_id, 'driver');
    let release;
    const held = new Promise(resolve => release = resolve), pattern = '**/api/v1' + base + '/entity-reviews';
    await page.route(pattern, async route => { await held; await route.continue(); });
    const other = await h.context.newPage();
    try {
      await other.goto(f.ide(x.novelA, x.first)); await other.getByTestId('btn-story-brain').click();
      await other.getByRole('tab', { name: /^Chờ duyệt/ }).click();
      const checkpoint = other.getByTestId('entity-checkpoint-' + run);
      await checkpoint.getByText('v' + current.review_version, { exact: true }).waitFor();
      await checkpoint.getByPlaceholder('Tên nhóm mới (ví dụ: minh-bac-si)', { exact: true }).fill('other-driver');
      await checkpoint.getByRole('button', { name: '+ Thêm nhóm', exact: true }).click();
      await checkpoint.getByTestId('entity-occurrence-' + minhs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
      await other.getByRole('option', { name: 'other-driver', exact: true }).click();
      const saved = other.waitForResponse(r => r.url().endsWith('/api/v1' + base + `/entity-reviews/${run}/review`) && r.request().method() === 'POST');
      const partial = checkpoint.getByRole('button', { name: /^Lưu quyết định một phần/ });
      await partial.click(); assert.equal((await saved).status(), 200);
      await until(async () => !(await partial.isDisabled()), 'Second UI review did not finish refreshing');
      const before = await h.snapshot('G3-before-stale-review', x.owned), stale = response('review');
      await card().getByRole('button', { name: /^Lưu quyết định một phần/ }).click();
      assert.equal((await stale).status(), 409);
      await card().getByText('Xung đột phiên bản (409 Conflict):', { exact: false }).waitFor();
      assert.equal(await occurrence(minhs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true }).inputValue(), 'driver');
      assert.deepEqual(await h.snapshot('G3-after-stale-review-no-mutation', x.owned), before);
      await h.shot('s10-real-review-conflict-local-choice-preserved');
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await other.close(); }
    await card().getByText('v' + (current.review_version + 1), { exact: true }).waitFor();
    assert.equal(await occurrence(minhs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true }).inputValue(), 'driver');
  });
  await h.step('G3/S10: explicit guidance refresh preserves compatible human decisions and adds pending name', async () => {
    await page.getByLabel('Tên cần chú ý (mỗi dòng một tên)', { exact: true }).fill('lan');
    const saved = page.waitForResponse(r => r.url().endsWith('/api/v1' + base + '/entity-guidance') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Lưu danh sách tăng cường', exact: true }).click(); assert.equal((await saved).status(), 200);
    const refreshed = response('refresh'); await card().getByTestId('btn-refresh-entity-review').click();
    const result = await refreshed; assert.equal(result.status(), 200);
    const dto = (await result.json()).data;
    const preserved = dto.reviewed_decisions.find(d => d.candidate_id === minhs[0].candidate_id);
    assert.ok(preserved.provisional_identity_key.endsWith('/doctor'));
    assert.ok(dto.candidates.some(c => c.surface === 'lan' && dto.pending_candidate_ids.includes(c.candidate_id)));
    assert.ok(dto.guidance_version > initial.guidance_version);
    // Explicitly reaffirm the local author's identity after reconciling the concurrent decision.
    await select(minhs[1].candidate_id, 'doctor'); await select(minhs[1].candidate_id, 'driver');
    await h.snapshot('G3-refresh-new-name-pending', x.owned);
  });
  await h.step('G3/S10: UI separates homonyms, groups repeated occurrences, freezes and reloads stable UUIDs', async () => {
    const current = (await reviews()).find(r => r.analysis_run_id === run);
    await group('driver'); await group('witness');
    for (const c of current.candidates) {
      if (c.candidate_id === minhs[0].candidate_id || c.candidate_id === minhs[2].candidate_id) await select(c.candidate_id, 'doctor');
      else if (c.candidate_id === minhs[1].candidate_id) await select(c.candidate_id, 'driver');
      else if (c.surface === 'lan') await select(c.candidate_id, 'witness');
      else await occurrence(c.candidate_id).getByRole('button', { name: 'Loại bỏ', exact: true }).click();
    }
    const saved = response('review'); await card().getByRole('button', { name: 'Đóng băng danh sách entity (Freeze)', exact: true }).click();
    const result = await saved; assert.equal(result.status(), 200); assert.equal(result.request().postDataJSON().finalize, true);
    frozen = (await result.json()).data; assert.equal(frozen.entities.length, 3);
    const doctor = frozen.entities.find(e => e.provisional_identity_key.endsWith('/doctor'));
    const driver = frozen.entities.find(e => e.provisional_identity_key.endsWith('/driver'));
    assert.equal(doctor.phrase, 'Minh'); assert.equal(driver.phrase, 'Minh'); assert.notEqual(doctor.entity_id, driver.entity_id);
    assert.deepEqual(new Set(doctor.candidate_ids), new Set([minhs[0].candidate_id, minhs[2].candidate_id]));
    assert.deepEqual(driver.candidate_ids, [minhs[1].candidate_id]);
    assert.deepEqual((await memory()).entities, []); assert.equal((await memory()).brain_version, 1);
    await page.reload(); await until(async () => await f.editor().inputValue() === text, 'Frozen review draft changed after reload'); await openReview();
    const reloaded = (await reviews()).find(r => r.analysis_run_id === run);
    assert.deepEqual(reloaded.entities, frozen.entities); assert.equal(reloaded.status, 'entities_reviewed');
    await h.snapshot('G3-frozen-UUIDs-not-Canon', x.owned); await h.shot('s10-homonyms-frozen');
  });
  await h.step('G3/S10: UI Continue creates exact-ID proposals; complete edited group acceptance alone commits Canon', async () => {
    const continued = response('continue'); await card().getByRole('button', { name: '3. Tiếp tục trích xuất event/fact', exact: true }).click();
    assert.equal((await continued).status(), 200);
    proposals = await until(async () => {
      const queue = (await h.api('GET', base + '/review-queue', undefined, x.a.token)).data;
      return queue.some(p => p.proposal_type === 'entity') && queue;
    }, 'Continue did not create entity dependency proposals');
    assert.equal(new Set(proposals.map(p => p.dependency_group_id)).size, 1);
    const gid = proposals[0].dependency_group_id, entityProposals = proposals.filter(p => p.proposal_type === 'entity');
    assert.equal(entityProposals.length, 3);
    const pendingEvent = proposals.find(p => p.proposal_type === 'event'); assert.ok(pendingEvent);
    assert.deepEqual(new Set(pendingEvent.payload.participants), new Set(frozen.entities.map(e => e.entity_id)));
    assert.deepEqual((await memory()).entities, []); assert.deepEqual((await memory()).events, []);
    await h.snapshot('G3-exact-ID-proposals-still-pending', x.owned);
    const negatives = [];
    const negative = async (name, operation) => {
      const before = await h.snapshot(name + '-before', x.owned);
      try { await operation(); }
      finally { assert.deepEqual(await h.snapshot(name + '-after', x.owned), before, name + ': durable mutation'); }
      negatives.push({ name, status: 'PASS' }); await h.save('canon-approval-negatives.json', negatives);
    };
    const route = `/ai/proposal-groups/${gid}/accept`, body = {
      proposal_ids: proposals.map(p => p.proposal_id), expected_brain_version: 1
    };
    await negative('G1-401-anonymous-Canon', () => h.api('POST', route, body, undefined, [401]));
    await negative('G1-403-foreign-owner-Canon', () => h.api('POST', route, body, x.b.token, [403]));
    await negative('G1-409-stale-Canon', () => h.api('POST', route, { ...body, expected_brain_version: 2 }, x.a.token, [409]));
    await negative('C01-incomplete-single-edit-accept', () => h.api('POST', `/ai/proposals/${pendingEvent.proposal_id}/edit-and-accept`,
      { expected_brain_version: 1, edited_payload: pendingEvent.payload }, x.a.token, [422]));
    await negative('atomic-rejection-incomplete-single-reject', () => h.api('POST', `/ai/proposals/${pendingEvent.proposal_id}/reject`,
      { reason: 'An individual member cannot decide the dependency group' }, x.a.token, [422]));
    await negative('G1-422-unknown-identity-whole-group-rollback', () => h.api('POST', route, {
      ...body, edited_payloads: { [pendingEvent.proposal_id]: { ...pendingEvent.payload, participants: [randomUUID()] } }
    }, x.a.token, [422]));
    await negative('G1-422-forged-author-authority-marker', () => h.api('POST', route, {
      ...body, edited_payloads: { [pendingEvent.proposal_id]: { ...pendingEvent.payload, source_type: 'author' } }
    }, x.a.token, [422]));
    const groupCard = page.getByTestId('dependency-group-' + gid);
    const summary = 'Hai người tên Minh gặp nhau; bác sĩ mở hồ sơ.';
    await groupCard.getByLabel('Tóm tắt sự kiện (summary)', { exact: true }).fill(summary);
    const accepted = page.waitForResponse(r => r.url().endsWith(`/api/v1/ai/proposal-groups/${gid}/accept`) && r.request().method() === 'POST');
    await groupCard.getByTestId('btn-accept-group-' + gid).click();
    const result = await accepted; assert.equal(result.status(), 200);
    assert.deepEqual(new Set(result.request().postDataJSON().proposal_ids), new Set(proposals.map(p => p.proposal_id)));
    assert.equal(result.request().postDataJSON().edited_payloads[pendingEvent.proposal_id].summary, summary);
    approved = await memory(); assert.equal(approved.brain_version, 2);
    assert.deepEqual(new Set(approved.entities.map(e => e.entity_id)), new Set(frozen.entities.map(e => e.entity_id)));
    assert.equal(approved.entities.filter(e => e.name === 'Minh').length, 2);
    assert.equal(approved.events.length, 1); assert.equal(approved.events[0].summary, summary);
    await h.snapshot('G3-atomic-edited-group-Canon-v2', x.owned); await h.shot('s10-atomic-canon-approved');
  });
  await h.save('entity-identity-lifecycle.json', { run, revision: x.analysisRevision, initial, frozen, proposals, approved });
  return { run, frozen, approved, proposals, text };
}
