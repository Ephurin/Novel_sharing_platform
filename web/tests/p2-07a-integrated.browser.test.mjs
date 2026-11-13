import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { expect } from '@playwright/test';
import { createHarness, hash, until } from './helpers/p1-real-stack.mjs';

const scenario = process.env.P207A_SCENARIO;
assert.ok(['S1', 'S2', 'S3-5', 'S3-10', 'S3-21', 'S4'].includes(scenario));
const longPlan = scenario.startsWith('S3-');
const planSize = longPlan ? Number(scenario.slice(3)) : scenario === 'S4' ? 2 : 0;

test(`${scenario} first chapter through the real Gateway`, {
  timeout: 180000,
}, async () => {
  const h = await createHarness();
  const { page } = h;
  try {
    const author = await h.account('AUTHOR');
    const idea = 'A lighthouse keeper discovers a city beneath the tide.';
    const { data: novel } = await h.api('POST', '/novels', {
      title: 'The City Beneath the Tide', synopsis: idea,
    }, author.token);
    const novelId = novel.novelId;
    const brainPath = '/ai/story-brains';
    const base = `${brainPath}/${novelId}`;
    let adopted;
    let persistedPlan;
    let chapterOne;
    let homonyms;
    const planPath = `/ai/story-plans/edit-v1/${novelId}`;
    function planRows(state) {
      const active = state['narrative.story_plans'].filter(row => row.status === 'active');
      assert.equal(active.length, 1);
      assert.equal(active[0].created_by, author.userId);
      assert.equal(state['public.novels'][0].author_id, author.userId);
      const rows = state['narrative.story_plan_objectives']
        .filter(row => row.plan_id === active[0].id).sort((a, b) => a.order_index - b.order_index);
      assert.equal(rows.length, planSize);
      assert.equal(new Set(rows.map(row => row.objective_metadata.logical_id)).size, planSize);
      assert.deepEqual(rows.map(row => row.target_chapter), Array.from({ length: planSize }, (_, i) => i + 1));
      return { active: active[0], rows };
    }
    function checkPlan(state) {
      if (persistedPlan) assert.deepEqual(planRows(state), persistedPlan);
    }
    function assertFuturePlan(state) {
      if (scenario !== 'S2') return;
      const active = state['narrative.story_plans'].filter(plan => plan.status === 'active');
      assert.deepEqual(active.map(plan => plan.id), [adopted.planId]);
      assert.equal(active[0].plan_version, adopted.planVersion);
      const objectives = state['narrative.story_plan_objectives'].filter(row => row.plan_id === adopted.planId);
      const matches = objectives.flatMap(row => row.objective_metadata.events
        .filter(event => event.event_id === adopted.eventId)
        .map(event => ({ chapter: row.target_chapter, logicalId: row.objective_metadata.logical_id, event })));
      assert.deepEqual(matches, [{
        chapter: 2,
        logicalId: adopted.logicalId,
        event: { event_id: adopted.eventId, text: adopted.text, participants: adopted.participants },
      }]);
      const history = JSON.stringify(state['narrative.events']);
      for (const marker of [adopted.eventId, adopted.text, 'FutureOnlyBetrayal']) {
        assert.ok(!history.includes(marker), 'Future Plan leaked into Historical Events');
      }
    }
    const nav = page.getByRole('navigation', { name: 'Các bước lập kế hoạch' });
    const go = async name => {
      await nav.getByRole('button', { name }).click();
      await expect(page.getByRole('region', { name: 'Planning Studio' })).toHaveAttribute('aria-busy', 'false');
    };
    await h.step('Fresh novel has no Story Brain or historical events', async () => {
      const state = await h.snapshot('s1-fresh-novel', [novelId]);
      assert.deepEqual(state['narrative.story_brains'], []);
      assert.deepEqual(state['narrative.events'], []);
      assert.deepEqual(state['public.chapter_revisions'], []);
    });
    await h.step('Author IDE Brainstorm works without an active Story Plan', async () => {
      await page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), author.token);
      await page.goto(`${h.origin}/author/ide?novelId=${novelId}`);
      await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
      await go(/Ý tưởng/);
      await page.getByTestId('brainstorm-open-idea-btn').click();
      const response = page.waitForResponse(res =>
        res.url().endsWith(`${brainPath}/${novelId}/brainstorm`) && res.request().method() === 'POST');
      await page.getByTestId('brainstorm-submit-btn').click();
      const result = await response;
      const payload = await result.json();
      assert.equal(result.status(), 200, JSON.stringify(payload));
      assert.equal(payload.data.plan_version, null);
      const body = result.request().postDataJSON();
      const replay = await h.api('POST', `${base}/brainstorm`, body, author.token);
      assert.deepEqual(replay.data, payload.data);
      await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible();
      await h.shot('s1-fresh-novel-brainstorm');
      await page.getByTestId('brainstorm-close-btn').click();
    });
    if (scenario === 'S2') {
      await h.step('Import, edit, and save an outline, then adopt a Future Event', async () => {
        await go(/Dàn ý chương/);
        await page.getByLabel('Dán hoặc nhập dàn ý tương lai').fill('The keeper arrives\nA betrayal at sea');
        await page.getByRole('button', { name: 'Tách dàn ý thành thẻ theo dòng' }).click();
        await page.getByLabel('Mục tiêu chương 2').fill('FutureOnlyBetrayal');
        const privateNote = 'P207A private planning sentinel';
        await page.getByLabel('Ghi chú kế hoạch riêng tư').fill(privateNote);
        const save = page.getByRole('button', { name: 'Lưu bản nháp dàn ý' });
        const write = async button => {
          const response = page.waitForResponse(r =>
            r.url().includes('/story-plans/edit-v1/') && r.request().method() === 'POST');
          await button.click();
          const result = await response;
          assert.ok(result.ok(), JSON.stringify(await result.json()));
          return (await result.json()).data;
        };
        await write(save);
        const successfulSave = h.requests.findLast(r => r.body?.action === 'save');
        await h.api('POST', `/ai/story-plans/edit-v1/${novelId}`, {
          ...successfulSave.body, idempotency_key: 'p207a-stale-plan',
        }, author.token, [409]);
        await page.getByTestId('brainstorm-chapter-btn-1').click();
        const brainstorm = page.waitForResponse(r =>
          r.url().endsWith('/brainstorm') && r.request().method() === 'POST');
        await page.getByTestId('brainstorm-submit-btn').click();
        const suggestion = (await (await brainstorm).json()).data.future_events[0];
        assert.equal(suggestion.target_chapter, 2);
        await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible();
        await page.getByTestId('adopt-event-btn-0').click();
        await expect(page.getByTestId('event-adopted-badge-0')).toBeVisible();
        await page.getByTestId('brainstorm-close-btn').click();
        await expect(page.getByLabel('Sự kiện 1 chương 2', { exact: true })).toBeVisible();
        await write(save);
        const { plan_id: planId, plan_version: planVersion } =
          await write(page.getByRole('button', { name: 'Dùng bản đã lưu' }));
        const savedObjective = h.requests.findLast(r => r.body?.action === 'save')
          .body.objectives.find(row => row.target_chapter === 2);
        assert.equal(savedObjective.events.length, 1);
        assert.ok(suggestion.participants.length);
        adopted = {
          planId,
          planVersion,
          logicalId: savedObjective.objective_id,
          eventId: savedObjective.events[0].event_id,
          text: `${suggestion.title}: ${suggestion.text}`,
          participants: suggestion.participants.map(p => ({
            entity_id: p.entity_id ?? null,
            name_hint: p.entity_id ? null : p.name_hint,
          })),
        };
        await h.save('selected-future-event.json', adopted);
        const state = await h.snapshot('s2-plan-before-m0', [novelId]);
        assertFuturePlan(state);
        const activeRequest = {
          target: 'future_events', target_chapter: 2, expected_plan_version: planVersion,
        };
        const stale = await h.api('POST', `${base}/brainstorm`, {
          ...activeRequest, expected_plan_version: planVersion - 1, idempotency_key: 'p207a-stale-brainstorm',
        }, author.token, [409]);
        assert.equal(stale.json.error.code, 'PLAN_VERSION_CONFLICT');
        const current = await h.api('POST', `${base}/brainstorm`, {
          ...activeRequest, idempotency_key: 'p207a-active-brainstorm',
        }, author.token);
        assert.equal(current.data.plan_version, planVersion);
        const generation = h.requests.findLast(r => r.path.endsWith('/brainstorm'));
        assert.ok(!JSON.stringify(generation).includes(privateNote));
        assert.deepEqual(state['narrative.events'], []);
        assert.deepEqual(state['public.chapter_revisions'], []);
        await h.shot('s2-adopted-plan');
        await go(/Ý tưởng/);
      });
    }
    if (planSize) {
      await h.step('Import, edit, activate and reload the ordered outline', async () => {
        await go(/Dàn ý chương/);
        const titles = Array.from({ length: planSize }, (_, i) => `Outline objective ${i + 1}`);
        const descriptions = titles.map((title, i) => `${title} edited ${i + 1}`);
        await page.getByLabel('Dán hoặc nhập dàn ý tương lai').fill(titles.join('\n'));
        await page.getByRole('button', { name: 'Tách dàn ý thành thẻ theo dòng' }).click();
        for (const [i, description] of descriptions.entries()) {
          await page.getByLabel(`Mục tiêu chương ${i + 1}`, { exact: true }).fill(description);
        }
        const future = 'Unwritten meeting with Unverified Vesper';
        await page.getByRole('button', { name: `Thêm sự kiện chương ${planSize}`, exact: true }).click();
        await page.getByLabel(`Sự kiện 1 chương ${planSize}`, { exact: true }).fill(future);
        await page.getByRole('button', { name: `Thêm người tham gia sự kiện 1 chương ${planSize}`, exact: true }).click();
        await page.getByLabel(`Người tham gia 1 sự kiện 1 chương ${planSize}`, { exact: true }).fill('Unverified Vesper');
        const write = async name => {
          const response = page.waitForResponse(r => r.url().endsWith(planPath) && r.request().method() === 'POST');
          await page.getByRole('button', { name, exact: true }).click();
          const result = await response;
          const payload = await result.json();
          assert.equal(result.status(), 200, JSON.stringify(payload));
          return payload.data;
        };
        await write('Lưu bản nháp dàn ý');
        const saved = h.requests.findLast(r => r.body?.action === 'save').body;
        const activated = await write('Dùng bản đã lưu');
        const state = await h.snapshot('plan-activated', [novelId]);
        persistedPlan = planRows(state);
        const { active, rows } = persistedPlan;
        assert.equal(active.id, activated.plan_id);
        assert.equal(active.plan_version, activated.plan_version);
        assert.deepEqual(rows.map(row => row.title), titles);
        assert.deepEqual(rows.map(row => row.description), descriptions);
        assert.deepEqual(rows.map(row => row.objective_metadata.logical_id), saved.objectives.map(row => row.objective_id));
        assert.deepEqual(rows.at(-1).objective_metadata.events, [{
          event_id: saved.objectives.at(-1).events[0].event_id, text: future,
          participants: [{ entity_id: null, name_hint: 'Unverified Vesper' }],
        }]);
        const stale = await h.api('POST', planPath, {
          ...saved, idempotency_key: randomUUID(),
          objectives: saved.objectives.map(row => ({ ...row, description: 'Stale overwrite' })),
        }, author.token, [409]);
        assert.equal(stale.json.error.code, 'PLAN_VERSION_CONFLICT');
        await page.reload();
        await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
        await go(/Dàn ý chương/);
        await expect(page.getByRole('textbox', { name: /^Tiêu đề chương \d+$/ })).toHaveCount(planSize);
        for (const [i, row] of rows.entries()) {
          await expect(page.getByLabel(`Tiêu đề chương ${i + 1}`, { exact: true })).toHaveValue(row.title);
          await expect(page.getByLabel(`Mục tiêu chương ${i + 1}`, { exact: true })).toHaveValue(row.description);
        }
        const reloaded = await h.snapshot('plan-reloaded-after-stale-write', [novelId]);
        checkPlan(reloaded);
        assert.deepEqual(reloaded['narrative.events'], []);
        assert.deepEqual(reloaded['narrative.entity_mentions'], []);
        await h.shot('ordered-plan-reloaded');
        await go(/Ý tưởng/);
      });
    }
    await h.step('Author declares and reviews setup, then activates M0', async () => {
      await page.getByLabel('Ý tưởng & hướng đi (tương lai)').fill(idea);
      await go(/Thế giới/);
      await page.getByRole('button', { name: 'Thêm quy tắc' }).click();
      await page.getByLabel('Quy tắc 1').fill('The lighthouse cannot shine under water.');
      await go(/Nhân vật/);
      await page.getByRole('button', { name: 'Thêm nhân vật hoặc địa danh' }).click();
      await page.getByLabel('Tên 1').fill('Minh');
      await page.getByRole('button', { name: 'Lưu và xử lý thiết lập' }).click();
      const choices = page.getByRole('textbox', { name: /Quyết định thẻ/ });
      await expect(choices).toHaveCount(2);
      for (const choice of await choices.all()) {
        await choice.click();
        await page.getByRole('option', { name: 'Duyệt', exact: true }).click();
      }
      await page.getByRole('textbox', { name: /Danh tính thẻ/ }).click();
      await page.getByRole('option', { name: /Tạo danh tính mới/ }).click();
      await page.getByRole('button', { name: 'Lưu quyết định toàn nhóm' }).click();
      const activate = page.getByRole('button', { name: 'Kích hoạt thiết lập để bắt đầu viết' });
      const activated = page.waitForResponse(res =>
        res.url().endsWith('/activate') && res.request().method() === 'POST');
      await activate.click();
      assert.equal((await activated).status(), 200);
      const state = await h.snapshot(scenario + '-m0', [novelId]);
      for (const key of ['narrative.events', 'public.chapter_revisions', 'mongo.draft_chapters']) {
        assert.deepEqual(state[key], [], key);
      }
      if (scenario === 'S1') assert.deepEqual(state['narrative.story_plans'], []);
      assertFuturePlan(state);
      checkPlan(state);
      assert.equal(state['narrative.facts'].length, 1);
      assert.equal(state['narrative.entities'].length, 1);
      const [rule] = state['narrative.facts'];
      assert.equal(rule.source_type, 'author_setup');
      assert.equal(rule.created_by, author.userId);
      assert.equal(rule.source_revision_id, null);
      const foreign = await h.account('AUTHOR');
      await h.api('GET', `${base}/setup`, undefined, foreign.token, [403]);
      await h.api('POST', `${base}/brainstorm`, { target: 'all' }, foreign.token, [403]);
      await h.shot(scenario + '-m0');
    });
    await h.step('Chapter editor saves an immutable author revision and starts P1', async () => {
      await go(/viết/i);
      await page.getByRole('button', { name: /Tạo bản nháp chương mới/ }).click();
      const editor = page.locator('textarea.sc-manuscript');
      const content = scenario === 'S4' ? 'bác sĩ Minh gặp tài xế Minh. Minh mở hồ sơ.' : 'Minh gặp Minh. lan.';
      const saved = page.waitForResponse(res =>
        /\/api\/v1\/chapters\/[^/?]+$/.test(res.url()) && res.request().method() === 'PATCH');
      await editor.fill(content);
      assert.equal((await saved).status(), 200);
      await until(async () => (await h.sql(
        "SELECT 1 FROM revision_outbox_events WHERE novel_id=$1 AND status='COMPLETED'", [novelId],
      )).length, 'P1 outbox did not complete');
      const state = await h.snapshot(scenario + '-p1-pending', [novelId]);
      assert.deepEqual(state['narrative.events'], []);
      assert.equal(state['public.chapter_revisions'].length, 1);
      const [revision] = state['public.chapter_revisions'];
      assert.equal(revision.source_type, 'AUTHOR_MANUAL');
      assert.equal(revision.created_by, author.userId);
      assert.equal(revision.content_hash, hash(content));
      const [chapter] = state['public.chapters'];
      chapterOne = { ...revision, chapterId: chapter.chapter_id, content };
      const retry = await h.api('PATCH', `/chapters/${chapter.chapter_id}`, {
        content, expectedVersion: 1,
      }, author.token);
      assert.equal(retry.data.analysisRevisionId, revision.revision_id);
      await h.api('PATCH', `/chapters/${chapter.chapter_id}`, {
        content: 'Conflicting stale content.', expectedVersion: 1,
      }, author.token, [409]);
      await page.reload();
      await expect(editor).toHaveValue(content);
      const reloaded = await h.snapshot(scenario + '-chapter-reload', [novelId]);
      assert.deepEqual(reloaded['public.chapter_revisions'], state['public.chapter_revisions']);
      assert.deepEqual(reloaded['narrative.facts'], state['narrative.facts']);
      assert.deepEqual(reloaded['narrative.events'], []);
      checkPlan(reloaded);
      await h.shot('s1-chapter-saved');
    });
    await h.step('P1 entity review and Canon approval use the real Gateway', async () => {
      const pending = await h.snapshot(scenario + '-before-hitl', [novelId]);
      const run = pending['narrative.analysis_runs'].find(row => row.operation === 'incremental_story_analysis');
      assert.ok(run);
      const { data: audit } = await h.api('GET', `${base}/entity-candidate-audits/${run.id}`, undefined, author.token);
      let decisions = audit.decisions.map(d => d.verdict === 'entity' && !d.canonical_entity_id
        ? { ...d, provisional_identity_key: `${audit.provisional_identity_scope}/${d.candidate_id}` } : d);
      if (scenario === 'S4') {
        const minhs = audit.candidates.filter(c => c.surface === 'Minh').sort((a, b) => a.start - b.start);
        assert.equal(minhs.length, 3);
        const existing = pending['narrative.entities'].find(e => e.canonical_name === 'Minh');
        assert.ok(existing);
        const selected = new Map(minhs.map((c, i) => [c.candidate_id, {
          candidate_id: c.candidate_id, verdict: 'entity', entity_type: 'PER',
          ...(i === 1 ? { provisional_identity_key: `${audit.provisional_identity_scope}/driver` }
            : { canonical_entity_id: existing.id }),
        }]));
        decisions = decisions.map(d => selected.get(d.candidate_id) ?? d);
        await h.api('POST', `${base}/entity-reviews/${run.id}/continue`, {}, author.token, [409]);
        await h.api('POST', `${base}/entity-reviews/${run.id}/review`, {
          expected_version: audit.review_version,
          decisions: decisions.map(d => d.candidate_id === minhs[0].candidate_id
            ? { ...d, canonical_entity_id: randomUUID() } : d),
        }, author.token, [409, 422]);
      }
      await h.api('POST', `${base}/entity-reviews/${run.id}/review`, {
        expected_version: audit.review_version, decisions,
      }, author.token);
      await h.api('POST', `${base}/entity-reviews/${run.id}/continue`, {}, author.token);
      const { data: queue } = await h.api('GET', `${base}/review-queue`, undefined, author.token);
      const proposals = queue.filter(p => p.analysis_run_id === run.id);
      const before = await h.snapshot(scenario + '-before-canon-approval', [novelId]);
      assertFuturePlan(before);
      checkPlan(before);
      assert.deepEqual(before['narrative.events'], []);
      assert.ok(proposals.some(p => p.proposal_type === 'event'));
      if (scenario === 'S4') {
        const foreign = await h.account('AUTHOR');
        await h.api('GET', `${base}/entity-candidate-audits/${run.id}`, undefined, foreign.token, [403]);
        await h.api('POST', `/ai/proposal-groups/${proposals[0].dependency_group_id}/accept`, {
          proposal_ids: proposals.map(p => p.proposal_id),
          expected_brain_version: Number(before['narrative.story_brains'][0].brain_version),
        }, foreign.token, [403]);
      }
      await h.api('POST', `/ai/proposal-groups/${proposals[0].dependency_group_id}/accept`, {
        proposal_ids: proposals.map(p => p.proposal_id),
        expected_brain_version: Number(before['narrative.story_brains'][0].brain_version),
      }, author.token);
      const after = await h.snapshot(scenario + '-canon-approved', [novelId]);
      assertFuturePlan(after);
      checkPlan(after);
      assert.ok(after['narrative.events'].length);
      assert.equal(after['narrative.events'][0].summary, chapterOne.content);
      if (scenario === 'S4') {
        homonyms = after['narrative.entities'].filter(e => e.canonical_name === 'Minh');
        assert.equal(homonyms.length, 2);
        assert.equal(new Set(homonyms.map(e => e.id)).size, 2);
        const mentions = after['narrative.entity_mentions'].filter(row => row.revision_id === chapterOne.revision_id);
        assert.deepEqual(mentions.filter(row => row.surface_text === 'Minh')
          .reduce((counts, row) => counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1), new Map())
          .size, 2);
        assert.ok(!JSON.stringify(after['narrative.entity_mentions']).includes('Unverified Vesper'));
      }
      assert.ok(!JSON.stringify(after['narrative.events']).includes('FutureOnlyBetrayal'));
    });
    if (scenario === 'S4') {
      await h.step('Second genuine revision links a confirmed identity across chapters', async () => {
        const existing = homonyms.find(row => row.static_attributes?.mentions === 0) ?? homonyms[0];
        const { data: chapter } = await h.api('POST', `/novels/${novelId}/chapters`, {
          title: 'Second chapter', content: '', clientRequestId: randomUUID(),
        }, author.token);
        const content = 'Minh trở lại và mở cửa.';
        await page.goto(`${h.origin}/author/ide?novelId=${novelId}&chapterId=${chapter.chapterId}`);
        const save = page.waitForResponse(r => r.url().endsWith(`/chapters/${chapter.chapterId}`) &&
          r.request().method() === 'PATCH');
        await page.locator('textarea.sc-manuscript').fill(content);
        const response = await save;
        assert.equal(response.status(), 200);
        const { data: saved } = await response.json();
        const revisionId = saved.analysisRevisionId;
        const checkpoint = await until(async () => (await h.api(
          'GET', `${base}/entity-reviews`, undefined, author.token,
        )).data.find(row => row.revision_id === revisionId), 'Chapter 2 entity checkpoint missing');
        assert.equal(checkpoint.source_hash, hash(content));
        const runId = checkpoint.analysis_run_id;
        const path = `${base}/entity-reviews/${runId}`;
        const { data: audit } = await h.api('GET', `${base}/entity-candidate-audits/${runId}`, undefined, author.token);
        assert.ok(audit.candidates.some(c => c.surface === 'Minh'));
        const candidates = new Map(audit.candidates.map(c => [c.candidate_id, c]));
        const decisions = audit.decisions.map(d => candidates.get(d.candidate_id).surface === 'Minh'
          ? { ...d, canonical_entity_id: existing.id, provisional_identity_key: '' }
          : { ...d, verdict: 'not_entity', canonical_entity_id: '', provisional_identity_key: '' });
        await h.api('POST', `${path}/review`, { expected_version: audit.review_version, decisions }, author.token);
        await h.api('POST', `${path}/continue`, {}, author.token);
        const pending = await h.snapshot('chapter-2-pending-author-decision', [novelId]);
        const { data: queue } = await h.api('GET', `${base}/review-queue`, undefined, author.token);
        const group = queue.filter(p => p.analysis_run_id === runId);
        assert.ok(group.some(p => p.proposal_type === 'event'));
        const acceptPath = `/ai/proposal-groups/${group[0].dependency_group_id}/accept`;
        const acceptance = {
          proposal_ids: group.map(p => p.proposal_id),
          expected_brain_version: Number(pending['narrative.story_brains'][0].brain_version),
        };
        await h.api('POST', acceptPath, acceptance, author.token);
        const accepted = await h.snapshot('chapter-2-author-approved', [novelId]);
        await h.api('POST', acceptPath, acceptance, author.token, [200, 409]);
        const replay = await h.snapshot('chapter-2-approval-replayed', [novelId]);
        for (const table of ['narrative.entities', 'narrative.entity_mentions', 'narrative.events']) {
          assert.deepEqual(replay[table], accepted[table]);
        }
        assert.deepEqual(accepted['narrative.entities'].filter(e => e.canonical_name === 'Minh').map(e => e.id).sort(),
          homonyms.map(e => e.id).sort());
        const mentions = accepted['narrative.entity_mentions'].filter(row => row.entity_id === existing.id);
        assert.ok(mentions.some(row => row.revision_id === chapterOne.revision_id));
        const second = mentions.find(row => row.revision_id === revisionId);
        assert.ok(second);
        assert.equal(second.source_text_hash, hash(content));
        assert.equal(second.tenant_id, existing.tenant_id);
        const revision = accepted['public.chapter_revisions'].find(row => row.revision_id === revisionId);
        assert.equal(revision.created_by, author.userId);
        assert.equal(revision.source_type, 'AUTHOR_MANUAL');
        assert.equal(revision.content_hash, hash(content));
        assert.ok(accepted['narrative.analysis_runs'].some(row => row.id === runId && row.tenant_id === second.tenant_id));
        checkPlan(accepted);
        await h.shot('chapter-2-confirmed-identity');
      });
    }
  } finally {
    await h.finish();
  }
});
