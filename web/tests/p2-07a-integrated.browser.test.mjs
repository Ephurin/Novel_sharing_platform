import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { createHarness, hash, until } from './helpers/p1-real-stack.mjs';

const scenario = process.env.P207A_SCENARIO;
assert.ok(['S1', 'S2'].includes(scenario), 'Set P207A_SCENARIO to S1 or S2');

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
      const content = 'Minh gặp Minh. lan.';
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
      await h.shot('s1-chapter-saved');
    });
    await h.step('P1 entity review and Canon approval use the real Gateway', async () => {
      const pending = await h.snapshot(scenario + '-before-hitl', [novelId]);
      const run = pending['narrative.analysis_runs'].find(row => row.operation === 'incremental_story_analysis');
      assert.ok(run);
      const { data: audit } = await h.api('GET', `${base}/entity-candidate-audits/${run.id}`, undefined, author.token);
      const decisions = audit.decisions.map(d => d.verdict === 'entity' && !d.canonical_entity_id
        ? { ...d, provisional_identity_key: `${audit.provisional_identity_scope}/${d.candidate_id}` } : d);
      await h.api('POST', `${base}/entity-reviews/${run.id}/review`, {
        expected_version: audit.review_version, decisions,
      }, author.token);
      await h.api('POST', `${base}/entity-reviews/${run.id}/continue`, {}, author.token);
      const { data: queue } = await h.api('GET', `${base}/review-queue`, undefined, author.token);
      const proposals = queue.filter(p => p.analysis_run_id === run.id);
      const before = await h.snapshot(scenario + '-before-canon-approval', [novelId]);
      assertFuturePlan(before);
      assert.deepEqual(before['narrative.events'], []);
      assert.ok(proposals.some(p => p.proposal_type === 'event'));
      await h.api('POST', `/ai/proposal-groups/${proposals[0].dependency_group_id}/accept`, {
        proposal_ids: proposals.map(p => p.proposal_id),
        expected_brain_version: Number(before['narrative.story_brains'][0].brain_version),
      }, author.token);
      const after = await h.snapshot(scenario + '-canon-approved', [novelId]);
      assertFuturePlan(after);
      assert.ok(after['narrative.events'].length);
      assert.equal(after['narrative.events'][0].summary, 'Minh gặp Minh. lan.');
      assert.ok(!JSON.stringify(after['narrative.events']).includes('FutureOnlyBetrayal'));
    });
  } finally {
    await h.finish();
  }
});
