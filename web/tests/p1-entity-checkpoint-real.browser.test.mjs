import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createHarness, until, hash } from './helpers/p1-real-stack.mjs';
import { fixtures } from './helpers/p1-fixtures.mjs';

test('Real Gateway checkpoint: Vietnamese LOC, bulk confirm/cancel, partial reload, CAS, Freeze and Canon readback',
  { timeout: 300000 }, async () => {
  const h = await createHarness(), f = fixtures(h), { page } = h;
  const proof = { setup: 'Public API registration/onboarding/novel/chapter fixture; UI manuscript bootstrap, checkpoint and Canon decisions', flag: true };
  let a, novel, chapter, run, initial, locs, immutableRevision, baselineAudit;
  const occurrenceQuotes = [
    ['Lâm Phong gặp Diệp Linh Nhi tại Cồn Vân.', 'tại Cồn Vân.'],
    ['Cồn Vân có cổng đá.', 'có cổng đá.']
  ];
  function checkQuotes(decisions) {
    for (let i = 0; i < locs.length; i++) {
      const d = decisions.find(d => d.candidate_id === locs[i].candidate_id);
      assert.deepEqual([d.identity_quote, d.status_quote], occurrenceQuotes[i]);
    }
  }
  async function storedAudit() {
    return (await h.sql('SELECT entity_candidate_audit FROM narrative.analysis_runs WHERE id=$1', [run]))[0].entity_candidate_audit;
  }
  async function editQuotes(index) {
    await position(locs[index].candidate_id);
    const c = occurrence(locs[index].candidate_id);
    if (await c.getByRole('button', { name: 'Sửa thuộc tính', exact: true }).isVisible())
      await c.getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
    await c.getByLabel('Bằng chứng alias / tên khác', { exact: true }).fill(occurrenceQuotes[index][0]);
    await c.getByLabel('Bằng chứng trạng thái', { exact: true }).fill(occurrenceQuotes[index][1]);
  }
  const endpoint = () => '/ai/story-brains/' + novel;
  const reviews = async () => (await h.api('GET', endpoint() + '/entity-reviews', undefined, a.token)).data;
  const current = async () => (await reviews()).find(r => r.analysis_run_id === run);
  const checkpoint = (target = page) => target.getByTestId('entity-checkpoint-' + run);
  const occurrence = (id, target = page) => checkpoint(target).getByTestId('entity-occurrence-' + id);
  const response = (suffix, target = page) => target.waitForResponse(r =>
    r.url().endsWith(endpoint() + '/entity-reviews/' + run + '/' + suffix) && r.request().method() === 'POST');
  async function open(target = page) {
    await target.goto(f.ide(novel, chapter));
    await target.getByTestId('btn-story-brain').click();
    await target.getByRole('tab', { name: /^Chờ duyệt/ }).click();
    await checkpoint(target).waitFor();
  }
  async function position(id, target = page) {
    const number = Math.floor(initial.candidates.findIndex(c => c.candidate_id === id) / 5) + 1;
    if (initial.candidates.length > 5) await checkpoint(target).getByRole('button', { name: String(number), exact: true }).click();
    await occurrence(id, target).waitFor();
  }
  async function group(key) {
    await checkpoint().getByPlaceholder('Tên nhóm mới (ví dụ: minh-bac-si)', { exact: true }).fill(key);
    await checkpoint().getByRole('button', { name: '+ Thêm nhóm', exact: true }).click();
  }
  async function assign(id, key) {
    await position(id);
    await occurrence(id).getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
    await page.getByRole('option', { name: key, exact: true }).click();
  }
  async function save(target = page) {
    const saved = response('review', target);
    await checkpoint(target).getByRole('button', { name: /^Lưu quyết định một phần/ }).click();
    return saved;
  }
  try {
    await h.step('Public API fixture: fresh author/novel/chapter; real UI bootstrap creates immutable revision and fake extraction', async () => {
      const suffix = randomUUID().slice(0, 8), password = 'Local!' + randomUUID(); h.secrets.add(password);
      const email = 'ux_' + suffix + '@example.invalid';
      await h.api('POST', '/auth/register', { username: 'ux_' + suffix, email, password });
      const login = (await h.api('POST', '/auth/login', { identifier: email, password })).data;
      const promoted = (await h.api('POST', '/auth/become-author', {}, login.accessToken)).data;
      a = { email, password, token: promoted.accessToken || login.accessToken };
      novel = (await h.api('POST', '/novels', { title: 'UX checkpoint tổng duyệt', synopsis: 'Offline fictional fixture' }, a.token)).data.novelId;
      const content = 'Lâm Phong gặp Diệp Linh Nhi tại Cồn Vân. Cồn Vân có cổng đá.';
      chapter = (await h.api('POST', '/novels/' + novel + '/chapters', { title: 'Chương 1 — Cổng đá', content }, a.token)).data.chapterId;
      await f.login(a); await page.goto(f.ide(novel, chapter));
      await expect(f.editor()).toHaveValue(content);
      await page.getByTestId('btn-story-brain').click();
      await page.getByRole('tab', { name: 'Trích xuất', exact: true }).click();
      const started = page.waitForResponse(r => r.url().endsWith('/ai/story-brains/bootstrap/from-manuscript') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu', exact: true }).click();
      const bootstrapResponse = await started; assert.equal(bootstrapResponse.status(), 202);
      const boot = (await bootstrapResponse.json()).data;
      proof.bootstrap_job_id = boot.job_id;
      await until(async () => {
        const job = (await h.api('GET', '/ai/jobs/' + boot.job_id, undefined, a.token)).data;
        assert.notEqual(job.status, 'failed'); return job.status === 'waiting_review';
      }, 'Bootstrap did not reach entity review', 60000);
      initial = (await reviews())[0]; run = initial.analysis_run_id;
      baselineAudit = await storedAudit();
      immutableRevision = (await h.sql('SELECT revision_id,content_hash,content FROM chapter_revisions WHERE revision_id=$1', [initial.revision_id]))[0];
      assert.equal(initial.status, 'waiting_entity_review'); assert.deepEqual(initial.reviewed_decisions, []);
      locs = initial.candidates.filter(c => c.surface === 'Cồn Vân');
      assert.equal(locs.length, 2);
      assert.ok(locs.every(c => initial.decisions.find(d => d.candidate_id === c.candidate_id).entity_type === 'LOC'));
      proof.novel_id = novel; proof.analysis_run_id = run; proof.loc_candidate_ids = locs.map(c => c.candidate_id);
      await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
      await checkpoint().waitFor();
    });
    await h.step('Author groups, explicit LOC selection; canceled bulk has no mutation', async () => {
      for (const key of ['lam-phong', 'diep-linh-nhi', 'con-van']) await group(key);
      await assign(initial.candidates.find(c => c.surface === 'Lâm Phong').candidate_id, 'lam-phong');
      await assign(initial.candidates.find(c => c.surface === 'Diệp Linh Nhi').candidate_id, 'diep-linh-nhi');
      await assign(locs[0].candidate_id, 'con-van');
      const c = occurrence(locs[0].candidate_id);
      await c.getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
      for (const type of ['PER', 'LOC']) {
        await c.getByLabel('Loại thực thể', { exact: true }).click();
        await page.getByRole('option', { name: type, exact: true }).click();
      }
      await editQuotes(0);
      await c.getByRole('button', { name: /Áp dụng quyết định này/ }).click();
      await c.getByRole('button', { name: 'Hủy', exact: true }).click();
      assert.deepEqual((await current()).reviewed_decisions, []);
      await position(locs[1].candidate_id);
      await expect(occurrence(locs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true })).toHaveValue('');
      proof.cancel_server_unchanged = true;
    });
    await h.step('Explicit bulk confirm preserves occurrence evidence through pagination, partial save and reload', async () => {
      await assign(locs[1].candidate_id, 'con-van');
      await editQuotes(1);
      await position(locs[0].candidate_id);
      const c = occurrence(locs[0].candidate_id);
      await c.getByRole('button', { name: /Áp dụng quyết định này/ }).click();
      await c.getByRole('button', { name: 'Xác nhận gán toàn bộ', exact: true }).click();
      await checkpoint().getByRole('button', { name: '1', exact: true }).click();
      const r = await save(); assert.equal(r.status(), 200);
      const decisions = r.request().postDataJSON().decisions;
      checkQuotes(decisions); checkQuotes((await storedAudit()).reviewed_decisions);
      assert.deepEqual(decisions.filter(d => d.provisional_identity_key.endsWith('/con-van')).map(d => d.candidate_id).sort(), locs.map(c => c.candidate_id).sort());
      assert.ok(decisions.filter(d => d.provisional_identity_key.endsWith('/con-van')).every(d => d.entity_type === 'LOC'));
      await page.reload(); await page.getByTestId('btn-story-brain').click();
      await page.getByRole('tab', { name: /^Chờ duyệt/ }).click();
      await position(locs[1].candidate_id);
      await expect(occurrence(locs[1].candidate_id).getByLabel('Gán nhóm danh tính mới', { exact: true })).toHaveValue('con-van');
      for (let i = 0; i < locs.length; i++) {
        await position(locs[i].candidate_id);
        const c = occurrence(locs[i].candidate_id);
        await c.getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
        await expect(c.getByLabel('Bằng chứng alias / tên khác', { exact: true })).toHaveValue(occurrenceQuotes[i][0]);
        await expect(c.getByLabel('Bằng chứng trạng thái', { exact: true })).toHaveValue(occurrenceQuotes[i][1]);
      }
      checkQuotes((await current()).reviewed_decisions);
      proof.partial_reload_loc = true; proof.partial_reload_quotes = true;
    });
    await h.step('Two genuine UI sessions: stale partial save 409 retains local draft and does not mutate server', async () => {
      const before = await current();
      const unresolved = initial.candidates.filter(c => !before.reviewed_decisions.some(d => d.candidate_id === c.candidate_id));
      assert.ok(unresolved.length >= 2);
      await position(unresolved[0].candidate_id); await occurrence(unresolved[0].candidate_id).getByRole('button', { name: 'Loại bỏ', exact: true }).click();
      let release; const held = new Promise(resolve => release = resolve);
      const pattern = '**/api/v1' + endpoint() + '/entity-reviews';
      await page.route(pattern, async route => { await held; await route.continue(); });
      const other = await h.context.newPage();
      try {
        await open(other); await position(unresolved[1].candidate_id, other);
        await occurrence(unresolved[1].candidate_id, other).getByRole('button', { name: 'Loại bỏ', exact: true }).click();
        assert.equal((await save(other)).status(), 200);
        const committed = await current();
        assert.equal((await save()).status(), 409);
        await expect(occurrence(unresolved[0].candidate_id)).toContainText('Đã loại');
        assert.deepEqual(await current(), committed);
        proof.real_cas_status = 409; proof.dirty_retained = true; proof.conflict_server_unchanged = true;
      } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await other.close(); }
      await checkpoint().getByText('v' + (before.review_version + 1), { exact: true }).waitFor();
      assert.equal((await save()).status(), 200);
      const merged = await current();
      assert.ok(unresolved.slice(0, 2).every(c => merged.reviewed_decisions.some(d => d.candidate_id === c.candidate_id && d.verdict === 'not_entity')));
    });
    await h.step('Explicit remaining decisions; Freeze summary and payload preserve author types', async () => {
      const saved = await current();
      for (const c of initial.candidates.filter(c => !saved.reviewed_decisions.some(d => d.candidate_id === c.candidate_id))) {
        await position(c.candidate_id);
        await occurrence(c.candidate_id).getByRole('button', { name: 'Loại bỏ', exact: true }).click();
      }
      await expect(checkpoint().getByTestId('entity-freeze-summary')).toContainText('Cồn Vân [LOC]');
      await h.shot('checkpoint-final-summary');
      const frozen = response('review');
      await checkpoint().getByRole('button', { name: /Đóng băng danh sách entity/ }).click();
      const r = await frozen; assert.equal(r.status(), 200);
      const body = r.request().postDataJSON(); assert.equal(body.finalize, true);
      assert.equal(body.decisions.length, initial.candidates.length);
      assert.ok(body.decisions.filter(d => locs.some(c => c.candidate_id === d.candidate_id)).every(d => d.entity_type === 'LOC'));
      checkQuotes(body.decisions);
      const audit = await storedAudit();
      checkQuotes(audit.reviewed_decisions); checkQuotes(audit.review_submitted_decisions);
      assert.equal(audit.revision_id, initial.revision_id); assert.equal(audit.source_hash, initial.source_hash);
      assert.deepEqual(audit.candidates, baselineAudit.candidates); assert.deepEqual(audit.decisions, baselineAudit.decisions);
      for (const entity of audit.entities) for (const o of entity.occurrences) {
        assert.equal(o.revision_id, initial.revision_id); assert.equal(o.text_hash, initial.source_hash);
        assert.equal(immutableRevision.content.slice(o.start, o.end), o.quote);
      }
      proof.quote_hashes_by_candidate = Object.fromEntries(locs.map((c, i) => [c.candidate_id, hash(occurrenceQuotes[i])]));
      proof.postgres_freeze_quotes_preserved = true; proof.machine_and_source_projection_unchanged = true;
      proof.freeze_expected_version = body.expected_version;
      proof.freeze_entities = (await current()).entities.map(e => ({ entity_id: e.entity_id, name: e.phrase, type: e.entity, candidate_ids: e.candidate_ids }));
      assert.equal(proof.freeze_entities.length, 3);
      assert.deepEqual((await h.api('GET', endpoint() + '/memory', undefined, a.token)).data.entities, []);
    });
    await h.step('Separate HITL proposal approval and activation; final PostgreSQL Canon readback', async () => {
      const continued = response('continue');
      await checkpoint().getByRole('button', { name: '3. Tiếp tục trích xuất event/fact', exact: true }).click();
      assert.equal((await continued).status(), 200);
      const queue = await until(async () => {
        const q = (await h.api('GET', endpoint() + '/review-queue', undefined, a.token)).data;
        return q.length ? q : false;
      }, 'Canon proposals did not appear');
      assert.equal(queue.filter(p => p.proposal_type === 'entity').length, 3);
      assert.equal(queue.filter(p => ['alias', 'state_transition'].includes(p.proposal_type)).length, 0);
      for (const proposal of queue) for (const e of proposal.evidence) {
        assert.equal(e.revision_id, initial.revision_id); assert.equal(e.text_hash, initial.source_hash);
        assert.equal(immutableRevision.content.slice(e.start, e.end), e.quote);
      }
      proof.hitl_source_spans_verified = true;
      for (const proposal of queue.filter(p => p.proposal_type === 'entity')) {
        const payload = proposal.payload;
        assert.ok(['Lâm Phong', 'Diệp Linh Nhi', 'Cồn Vân'].includes(payload.canonical_name));
        assert.equal(payload.entity_type, payload.canonical_name === 'Cồn Vân' ? 'LOC' : 'PER');
      }
      const accepted = page.waitForResponse(r => r.url().includes('/ai/proposal-groups/') && r.url().endsWith('/accept') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Duyệt nguyên tử toàn bộ nhóm/ }).click();
      assert.equal((await accepted).status(), 200);
      const activated = page.waitForResponse(r => r.url().endsWith('/baseline/activate') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Kích hoạt bộ nhớ sau duyệt', exact: true }).click();
      assert.equal((await activated).status(), 200);
      await page.reload();
      const memory = (await h.api('GET', endpoint() + '/memory', undefined, a.token)).data;
      const rows = await h.sql('SELECT id, canonical_name, entity_type, confirmation_status FROM narrative.entities WHERE novel_id=$1 ORDER BY canonical_name', [novel]);
      assert.equal(rows.length, 3);
      for (const row of rows) {
        assert.equal(row.entity_type, row.canonical_name === 'Cồn Vân' ? 'LOC' : 'PER');
        assert.equal(row.confirmation_status, 'confirmed');
        assert.ok(memory.entities.some(e => e.entity_id === row.id && e.entity_type === row.entity_type));
        assert.ok(proof.freeze_entities.some(e => e.entity_id === row.id));
      }
      assert.deepEqual((await h.sql('SELECT revision_id,content_hash,content FROM chapter_revisions WHERE revision_id=$1', [initial.revision_id]))[0], immutableRevision);
      checkQuotes((await storedAudit()).reviewed_decisions);
      proof.immutable_revision_unchanged = true;
      proof.approved_entities = rows; proof.uuid_preserved = true;
      await h.save('ux-checkpoint-proof.json', proof);
    });
  } finally { await h.finish(); }
});
