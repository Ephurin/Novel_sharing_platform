import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { expect } from '@playwright/test';
import { createHarness, hash, until } from './helpers/p1-real-stack.mjs';

const scenario = process.env.P207A_SCENARIO;
assert.ok(['S5', 'S6', 'S7'].includes(scenario));
const betrayal = 'UnwrittenBetrayal: At chapter 8, Minh betrays Lan.';

async function novel(h, author, title) {
  return (await h.api('POST', '/novels', { title, synopsis: 'A lighthouse keeper finds a city beneath the tide.' }, author.token)).data.novelId;
}

async function openPlan(page, h, author, id) {
  await page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), author.token);
  await page.goto(`${h.origin}/author/ide?novelId=${id}`);
  await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
  await page.getByRole('navigation', { name: 'Các bước lập kế hoạch' }).getByRole('button', { name: /Dàn ý chương/ }).click();
  await expect(page.getByRole('region', { name: 'Planning Studio' })).toHaveAttribute('aria-busy', 'false');
}

async function setup(api, id) {
  const base = `/ai/story-brains/${id}`;
  await api('POST', '/ai/story-brains/bootstrap/from-idea', {
    contract_version: 'setup-v1', novel_id: id, mode: 'extract', expected_setup_version: 0,
    idempotency_key: randomUUID(), outline: 'The lighthouse keeper finds a city.',
    setup: { text: '', declarations: [{ declaration_id: 'minh', entity_type: 'character', display_name: 'Minh' }],
      world_rules: [{ declaration_id: 'rule', text: 'The lighthouse cannot shine underwater.' }], initial_conditions: [] },
  });
  const source = await api('GET', `${base}/setup`);
  const path = `${base}/setup/${source.snapshot_id}`;
  const review = await api('POST', `${path}/review`, {
    idempotency_key: randomUUID(), dependency_group_id: source.proposals[0].dependency_group_id,
    setup_hash: source.setup_hash, expected_setup_version: source.setup_version,
    expected_review_version: source.review_version, expected_brain_version: source.brain_version,
    decisions: source.proposals.map(p => ({ proposal_id: p.proposal_id, decision: 'accept',
      ...(p.card_type === 'entity' ? { identity: { kind: 'new' } } : {}) })),
  });
  return api('POST', `${path}/activate`, {
    contract_version: 'setup-m0-v1', idempotency_key: randomUUID(), setup_hash: source.setup_hash,
    expected_setup_version: source.setup_version, expected_review_version: review.review_version,
    expected_brain_version: review.brain_version,
  });
}

function planBody() {
  return {
    contract_version: 'plan-edit-v1', action: 'save', idempotency_key: randomUUID(), expected_plan_version: 0,
    source_outline: 'The lighthouse journey.',
    objectives: [{ objective_id: randomUUID(), expected_intent_version: 0, target_chapter: 8,
      title: 'Chapter eight', description: 'An unwritten choice', dependencies: [],
      events: [{ event_id: randomUUID(), text: betrayal, participants: [{ name_hint: 'UnwrittenLan' }] }] }],
  };
}

async function activatePlan(api, id, body = planBody()) {
  const path = `/ai/story-plans/edit-v1/${id}`;
  const saved = await api('POST', path, body);
  return api('POST', path, { contract_version: 'plan-edit-v1', action: 'activate',
    expected_plan_version: saved.plan_version, idempotency_key: randomUUID(), source_plan_id: saved.plan_id });
}

async function chapter(h, api, author, id, number, content) {
  const draft = await api('POST', `/novels/${id}/chapters`, {
    title: `Chapter ${number}`, content: '', clientRequestId: randomUUID(),
  });
  await h.page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), author.token);
  await h.page.goto(`${h.origin}/author/ide?novelId=${id}&chapterId=${draft.chapterId}`);
  const saved = h.page.waitForResponse(r => r.url().endsWith(`/chapters/${draft.chapterId}`) && r.request().method() === 'PATCH');
  await h.page.locator('textarea.sc-manuscript').fill(content);
  const response = await saved;
  assert.equal(response.status(), 200);
  const { data } = await response.json();
  const revision = await until(async () => (await h.sql(
    "SELECT * FROM chapter_revisions WHERE revision_id=$1", [data.analysisRevisionId],
  ))[0], 'Missing immutable revision');
  assert.equal(revision.content_hash, hash(content));
  assert.equal(revision.created_by, author.userId);
  assert.equal(revision.source_type, 'AUTHOR_MANUAL');
  const [row] = await h.sql('SELECT chapter_number FROM chapters WHERE chapter_id=$1', [draft.chapterId]);
  assert.equal(row.chapter_number, number);
  if (scenario === 'S5' && number === 8) {
    const request = response.request().postDataJSON();
    await until(async () => (await h.sql(
      "SELECT 1 FROM revision_outbox_events WHERE novel_id=$1 AND status IN ('PENDING','PROCESSING')", [id],
    )).length === 0, 'Writer outbox did not settle');
    const before = await h.snapshot('s5-before-save-replay', [id]);
    const replay = await api('PATCH', `/chapters/${draft.chapterId}`, request, [200, 409]);
    if (replay) assert.equal(replay.analysisRevisionId, revision.revision_id);
    await api('PATCH', `/chapters/${draft.chapterId}`, {
      ...request, content: 'Conflicting stale manuscript.',
    }, [409]);
    assert.deepEqual(await h.snapshot('s5-after-save-replay', [id]), before);
  }
  return revision;
}

async function pendingGroup(api, id, revision, replayHarness) {
  const base = `/ai/story-brains/${id}`;
  const checkpoint = await until(async () => (await api('GET', `${base}/entity-reviews`))
    .find(r => r.revision_id === revision.revision_id), 'Missing entity review checkpoint');
  assert.equal(checkpoint.source_hash, revision.content_hash);
  const run = checkpoint.analysis_run_id;
  const path = `${base}/entity-reviews/${run}`;
  await api('POST', `${path}/continue`, {}, [409]);
  const audit = await api('GET', `${base}/entity-candidate-audits/${run}`);
  const body = { expected_version: audit.review_version,
    decisions: audit.decisions.map(d => d.verdict === 'entity' && !d.canonical_entity_id
      ? { ...d, provisional_identity_key: `${audit.provisional_identity_scope}/${d.candidate_id}` } : d) };
  await api('POST', `${path}/review`, body);
  if (replayHarness) {
    const before = await replayHarness.snapshot('s5-before-review-replay', [id]);
    await api('POST', `${path}/review`, body, [200, 409]);
    await api('POST', `${path}/review`, { ...body,
      decisions: body.decisions.map(d => ({ ...d, reason: 'Conflicting review replay' })),
    }, [409]);
    assert.deepEqual(await replayHarness.snapshot('s5-after-review-replay', [id]), before);
  }
  await api('POST', `${path}/continue`, {});
  if (replayHarness) {
    const before = await replayHarness.snapshot('s5-before-continue-replay', [id]);
    await api('POST', `${path}/continue`, {}, [200, 409]);
    assert.deepEqual(await replayHarness.snapshot('s5-after-continue-replay', [id]), before);
  }
  const queue = (await api('GET', `${base}/review-queue`)).filter(p => p.analysis_run_id === run);
  assert.equal(new Set(queue.map(p => p.dependency_group_id)).size, 1);
  assert.ok(queue.some(p => p.proposal_type === 'event'));
  return queue;
}

function assertHistory(state, texts) {
  assert.deepEqual(state['narrative.events'].map(e => e.summary).sort(), [...texts].sort());
  for (const table of ['events', 'facts', 'state_transitions', 'entity_mentions']) {
    assert.doesNotMatch(JSON.stringify(state[`narrative.${table}`]), /UnwrittenBetrayal|UnwrittenLan/);
  }
}

async function temporal(h, author, id, api) {
  let active, future;
  await h.step('Activate reviewed M0 and the chapter-eight future plan', async () => {
    assert.equal((await setup(api, id)).baseline_revision_id, null);
    future = planBody().objectives[0].events[0];
    const body = planBody();
    body.objectives[0].events = [future];
    active = await activatePlan(api, id, body);
    const state = await h.snapshot('s5-m0-future-only', [id]);
    assertHistory(state, []);
    assert.deepEqual(state['public.chapter_revisions'], []);
  });
  const approved = [];
  for (let number = 1; number <= 8; number++) {
    await h.step(`Save and review immutable chapter ${number}`, async () => {
      const content = number === 8 ? 'Minh refuses to betray Lan and keeps the promise.' : `Minh visits the lighthouse, day ${number}.`;
      const revision = await chapter(h, api, author, id, number, content);
      if (number >= 5 && number <= 7) {
        const state = await h.snapshot(`s5-sequential-revision-${number}`, [id]);
        assertHistory(state, approved);
        return;
      }
      const queue = await pendingGroup(api, id, revision, number === 8 ? h : undefined);
      const pending = await h.snapshot(`s5-pending-${number}`, [id]);
      assertHistory(pending, approved);
      const group = `/ai/proposal-groups/${queue[0].dependency_group_id}`;
      const version = Number(pending['narrative.story_brains'][0].brain_version);
      const body = { proposal_ids: queue.map(p => p.proposal_id), expected_brain_version: version };
      if (number === 4) {
        await api('POST', `${group}/reject`, { expected_brain_version: version, reason: 'Author rejects this group' });
      } else {
        await api('POST', `${group}/accept`, body);
        await api('POST', `${group}/accept`, body, [409]);
        approved.push(content);
      }
      const after = await h.snapshot(`s5-decided-${number}`, [id]);
      assertHistory(after, approved);
      if (number !== 4) {
        const event = after['narrative.events'].find(row => row.summary === content);
        assert.equal(event.event_metadata.evidence[0].revision_id, revision.revision_id);
        assert.equal(event.event_metadata.evidence[0].text_hash, revision.content_hash);
        assert.equal(event.event_metadata.evidence[0].quote, content);
      }
      assert.ok(after['narrative.revision_provenances'].some(p => p.revision_id === revision.revision_id && p.chapter_number === number));
      assert.deepEqual(after['narrative.story_plan_objectives'].find(o => o.plan_id === active.plan_id).objective_metadata.events,
        [{ ...future, participants: [{ entity_id: null, name_hint: 'UnwrittenLan' }] }]);
      const memory = await api('GET', `/ai/story-brains/${id}/memory`);
      assert.equal(memory.events.length, approved.length);
      assert.doesNotMatch(JSON.stringify(memory), /UnwrittenBetrayal|UnwrittenLan/);
      await h.shot(`s5-chapter-${number}`);
    });
  }
  await h.step('Fork and activate revised future intent after chapter eight', async () => {
    const path = `/ai/story-plans/edit-v1/${id}`;
    const listing = await api('GET', path);
    assert.equal(listing.active_plan_id, active.plan_id);
    const before = await h.snapshot('s5-before-plan-fork', [id]);
    const source = listing.plans.find(plan => plan.plan_id === active.plan_id);
    const title = 'The keeper chooses loyalty';
    const body = {
      contract_version: 'plan-edit-v1', action: 'fork', source_plan_id: source.plan_id,
      expected_plan_version: listing.head_version, idempotency_key: randomUUID(),
      source_outline: source.source_outline,
      objectives: source.objectives.map(({ intent_version, ...objective }) => ({
        ...objective, expected_intent_version: intent_version, title,
      })),
    };
    const fork = await api('POST', path, body);
    const updated = await api('POST', path, {
      contract_version: 'plan-edit-v1', action: 'activate', source_plan_id: fork.plan_id,
      expected_plan_version: fork.plan_version, idempotency_key: randomUUID(),
    });
    const after = await h.snapshot('s5-after-plan-fork', [id]);
    await api('POST', path, { ...body, idempotency_key: randomUUID() }, [409]);
    assert.deepEqual(await h.snapshot('s5-stale-plan-fork-denied', [id]), after);
    for (const key of ['public.chapter_revisions', 'narrative.events', 'narrative.facts',
      'narrative.state_transitions', 'narrative.entity_mentions', 'narrative.story_brains']) {
      assert.deepEqual(after[key], before[key], key);
    }
    assert.deepEqual(after['narrative.story_plan_objectives'].filter(o => o.plan_id === source.plan_id),
      before['narrative.story_plan_objectives'].filter(o => o.plan_id === source.plan_id));
    assert.equal((await api('GET', path)).active_plan_id, updated.plan_id);
    await openPlan(h.page, h, author, id);
    await expect(h.page.getByLabel('Tiêu đề chương 1', { exact: true })).toHaveValue(title);
    await h.shot('s5-updated-future-plan');
  });
}

async function concurrency(h, author, id, api) {
  await setup(api, id);
  const path = `/ai/story-plans/edit-v1/${id}`;
  await api('POST', path, planBody());
  await h.step('Independent tabs submit competing plan versions', async () => {
    const other = await h.context.newPage();
    try {
      await Promise.all([openPlan(h.page, h, author, id), openPlan(other, h, author, id)]);
      const editor = page => page.getByLabel('Mục tiêu chương 1', { exact: true });
      await editor(h.page).fill('Winner retains the original future event.');
      await editor(other).fill('Stale tab must not replace the objective.');
      const write = async page => {
        const response = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Lưu bản nháp dàn ý' }).click();
        return response;
      };
      const won = await write(h.page);
      assert.equal(won.status(), 200);
      const request = won.request().postDataJSON();
      const before = await h.snapshot('s6-plan-winner', [id]);
      assert.equal((await write(other)).status(), 409);
      await api('POST', path, request);
      for (const action of ['activate', 'delete']) {
        await api('POST', path, { contract_version: 'plan-edit-v1', action, idempotency_key: randomUUID(),
          expected_plan_version: request.expected_plan_version, source_plan_id: (await won.json()).data.plan_id }, [409]);
      }
      assert.deepEqual(await h.snapshot('s6-plan-stale-rejected', [id]), before);
      await other.reload();
      await openPlan(other, h, author, id);
      const discard = other.getByRole('button', { name: 'Bỏ bản sửa dàn ý trên thiết bị' });
      if (await discard.isVisible()) await discard.click();
      await expect(editor(other)).toHaveValue('Winner retains the original future event.');
      await h.shot('s6-plan-winner', other);
    } finally {
      await other.close();
    }
  });
  await h.step('Concurrent Canon approval has one winner and leaves plan rows intact', async () => {
    const revision = await chapter(h, api, author, id, 1, 'Minh opens the lighthouse door.');
    const queue = await pendingGroup(api, id, revision);
    const pending = await h.snapshot('s6-canon-pending', [id]);
    const path = `/ai/proposal-groups/${queue[0].dependency_group_id}/accept`;
    const body = { proposal_ids: queue.map(p => p.proposal_id),
      expected_brain_version: Number(pending['narrative.story_brains'][0].brain_version) };
    const outcomes = await Promise.all([1, 2].map(() => h.api('POST', path, body, author.token, [200, 409])));
    assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
    const after = await h.snapshot('s6-canon-winner', [id]);
    assert.equal(after['narrative.events'].length, 1);
    assert.deepEqual(after['narrative.story_plan_objectives'], pending['narrative.story_plan_objectives']);
    assert.deepEqual(after['narrative.entity_mentions'], pending['narrative.entity_mentions']);
    await h.shot('s6-canon-winner');
  });
  for (const status of [200, 503]) await h.step(`Late plan response (${status}) cannot replace the selected novel or its local buffer`, async () => {
    const title = `Concurrent lighthouse ${status}`;
    const otherId = await novel(h, author, title);
    let outcome;
    let release;
    let received;
    const held = new Promise(resolve => { release = resolve; });
    const ready = new Promise(resolve => { received = resolve; });
    const pattern = `**/api/v1${path}`;
    await openPlan(h.page, h, author, id);
    await h.page.route(pattern, async route => {
      const response = await route.fetch();
      received();
      await held;
      try {
        if (status === 200) await route.fulfill({ response });
        else await route.fulfill({ status, json: { error: { code: 'LATE_TEST_ERROR', message: 'Abandoned plan response' } } });
        outcome = 'fulfilled';
      } catch (error) {
        outcome = 'route closed';
        assert.match(error.message, /cancel|abort|closed|handled|Invalid Interception/i);
      }
    }, { times: 1 });
    try {
      await h.page.getByRole('button', { name: 'Tải lại dàn ý', exact: true }).click();
      await ready;
      await h.page.getByRole('link', { name: /Tủ truyện/ }).click();
      await h.page.getByRole('link', { name: 'Tác phẩm của tôi', exact: true }).click();
      const project = h.page.locator('article').filter({ hasText: title });
      const hydrated = h.page.waitForResponse(r => r.url().endsWith(`/ai/story-plans/edit-v1/${otherId}`)
        && r.request().method() === 'GET' && r.ok());
      await project.getByRole('button', { name: /Viết tiếp/ }).click();
      await expect(h.page).toHaveURL(new RegExp(`novelId=${otherId}`));
      await h.page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
      await h.page.getByRole('navigation', { name: 'Các bước lập kế hoạch' })
        .getByRole('button', { name: /Dàn ý chương/ }).click();
      await hydrated;
      const studio = h.page.getByRole('region', { name: 'Planning Studio' });
      await expect(studio).toContainText(title);
      await expect(studio).toHaveAttribute('aria-busy', 'false');
      const outline = h.page.getByLabel('Dán hoặc nhập dàn ý tương lai');
      await outline.fill('Local buffer for the second novel.');
      await expect(outline).toHaveValue('Local buffer for the second novel.');
      const before = await h.snapshot(`s6-before-release-${status}`, [id, otherId]);
      await h.shot(`s6-before-release-${status}`);
      release();
      await h.page.unrouteAll({ behavior: 'wait' });
      await expect(outline).toHaveValue('Local buffer for the second novel.');
      await expect(studio).not.toContainText('Winner retains the original future event.');
      await expect(h.page.getByText('Abandoned plan response', { exact: false })).toHaveCount(0);
      await expect(h.page).toHaveURL(new RegExp(`novelId=${otherId}`));
      assert.ok(outcome);
      await h.save(`s6-release-${status}.json`, { status, outcome, source: id, destination: otherId });
      assert.deepEqual(await h.snapshot(`s6-after-release-${status}`, [id, otherId]), before);
      await h.shot(`s6-late-response-isolated-${status}`);
    } finally {
      release();
      await h.page.unrouteAll({ behavior: 'wait' });
    }
  });
}

async function isolation(h, author, id, api) {
  const foreign = await h.account('AUTHOR');
  const otherId = await novel(h, foreign, 'Foreign lighthouse');
  await setup(api, id);
  await activatePlan(api, id);
  const revision = await chapter(h, api, author, id, 1, 'Minh opens the lighthouse door.');
  const queue = await pendingGroup(api, id, revision);
  await h.step('Foreign author cannot read or mutate the owner workspace', async () => {
    const before = await h.snapshot('s7-before-foreign-access', [id, otherId]);
    const brain = `/ai/story-brains/${id}`;
    const plan = `/ai/story-plans/edit-v1/${id}`;
    for (const path of [plan, `${brain}/setup`, `/ai/story-brains/by-novel/${id}`, `${brain}/review-queue`,
      `${brain}/entity-candidate-audits/${queue[0].analysis_run_id}`]) {
      const denied = await h.api('GET', path, undefined, foreign.token, [403, 404]);
      assert.doesNotMatch(JSON.stringify(denied.json), /UnwrittenBetrayal/);
    }
    for (const action of ['save', 'activate', 'delete', 'fork']) {
      await h.api('POST', plan, { ...planBody(), action, author_id: author.userId }, foreign.token, [403, 404]);
    }
    for (const action of ['accept', 'reject']) {
      await h.api('POST', `/ai/proposal-groups/${queue[0].dependency_group_id}/${action}`,
        { proposal_ids: queue.map(p => p.proposal_id), expected_brain_version: 1 }, foreign.token, [403, 404]);
    }
    await h.api('GET', plan, undefined, undefined, [401]);
    const claimedScope = { 'X-Tenant-Id': randomUUID(), 'X-Author-Id': author.userId };
    await h.api('GET', plan, undefined, foreign.token, [403, 404], claimedScope);
    await h.api('GET', `/chapters/${revision.chapter_id}`, undefined, foreign.token, [403, 404], claimedScope);
    const ownerRead = await h.api('GET', plan, undefined, author.token);
    const claimedRead = await h.api('GET', plan, undefined, author.token, [200], claimedScope);
    assert.deepEqual(claimedRead.data, ownerRead.data);
    const foreignPlan = `/ai/story-plans/edit-v1/${otherId}`;
    const activeSource = ownerRead.data.active_plan_id;
    const setupSource = await api('GET', `${brain}/setup`);
    const crossScope = [
      ['POST', foreignPlan, { contract_version: 'plan-edit-v1', action: 'fork', expected_plan_version: 0,
        source_plan_id: activeSource, idempotency_key: randomUUID() }, foreign.token, [404, 422]],
      ['POST', `${brain}/setup/${setupSource.snapshot_id}/activate`, {}, foreign.token, [403, 404]],
      ['POST', `${brain}/setup/${setupSource.snapshot_id}/review`, {}, foreign.token, [403, 404]],
      ['POST', `${brain}/entity-reviews/${queue[0].analysis_run_id}/continue`, {}, foreign.token, [403, 404]],
      ['PATCH', `/chapters/${revision.chapter_id}`, { content: 'Foreign write', expectedVersion: 1 }, foreign.token, [403, 404]],
      ['POST', plan, { ...planBody(), expected_plan_version: ownerRead.data.head_version,
        author_id: foreign.userId }, author.token, [422]],
    ];
    for (const [method, route, body, token, statuses] of crossScope) {
      const rejected = await h.api(method, route, body, token, statuses, claimedScope);
      assert.doesNotMatch(JSON.stringify(rejected.json), /UnwrittenBetrayal|Minh opens the lighthouse door/);
      assert.deepEqual(await h.snapshot(`s7-denied-${h.readbacks.length}`, [id, otherId]), before);
    }
    assert.deepEqual(await h.snapshot('s7-foreign-access-rejected', [id, otherId]), before);
    const context = await h.browser.newContext();
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === h.origin
        ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), foreign.token);
      await page.goto(`${h.origin}/author/ide?novelId=${id}`);
      await expect(page.getByText('Acceptance S7', { exact: true })).toHaveCount(0);
      await openPlan(page, h, foreign, otherId);
      await expect(page.getByRole('region', { name: 'Planning Studio' })).toContainText('Foreign lighthouse');
      await expect(page.getByLabel('Dán hoặc nhập dàn ý tương lai')).toHaveValue('');
      await expect(page.getByText(betrayal, { exact: true })).toHaveCount(0);
      await h.shot('s7-foreign-ide', page);
    } finally {
      await context.close();
    }
  });
  await h.step('Fake provider errors are visible and leave the local draft intact', async () => {
    await openPlan(h.page, h, author, id);
    const outline = h.page.getByLabel('Dán hoặc nhập dàn ý tương lai');
    await outline.fill('Local author draft through provider failures.');
    const before = await h.snapshot('s7-before-provider-errors', [id]);
    await h.page.getByTestId('brainstorm-open-plan-btn').click();
    for (const [instruction, status] of [['test_429', 429], ['test_malformed_json', 502]]) {
      await h.page.getByLabel('Yêu cầu định hướng cho AI').fill(instruction);
      const pending = h.page.waitForResponse(r => r.url().endsWith('/brainstorm') && r.request().method() === 'POST');
      await h.page.getByTestId('brainstorm-submit-btn').click();
      assert.equal((await pending).status(), status);
      await expect(h.page.getByTestId('brainstorm-error-alert')).toBeVisible();
      await expect(h.page.getByTestId('brainstorm-event-card-0')).toHaveCount(0);
      await h.shot(`s7-provider-${status}`);
    }
    const endpoint = `**/api/v1/ai/story-brains/${id}/brainstorm`;
    await h.page.getByLabel('Yêu cầu định hướng cho AI').fill('Suggest one future event.');
    await h.page.route(endpoint, async route => {
      const receipt = await route.fetch();
      assert.equal(receipt.status(), 200);
      await route.fulfill({ status: 503, json: { error: {
        code: 'SERVICE_UNAVAILABLE', message: 'Injected lost response after fake-provider success',
      } } });
    }, { times: 1 });
    const next = () => h.page.waitForResponse(r => r.url().endsWith('/brainstorm') && r.request().method() === 'POST');
    const unavailable = next();
    await h.page.getByTestId('brainstorm-submit-btn').click();
    const failed = await unavailable;
    assert.equal(failed.status(), 503);
    await expect(h.page.getByTestId('brainstorm-error-alert')).toBeVisible();
    await expect(h.page.getByTestId('brainstorm-event-card-0')).toHaveCount(0);
    const uncertain = await h.snapshot('s7-lost-response-before-retry', [id]);
    const replay = next();
    await h.page.getByTestId('brainstorm-safe-retry-btn').click();
    const recovered = await replay;
    assert.equal(recovered.status(), 200);
    assert.equal(recovered.request().postData(), failed.request().postData());
    await expect(h.page.getByTestId('brainstorm-event-card-0')).toBeVisible();
    assert.deepEqual(await h.snapshot('s7-lost-response-recovered', [id]), uncertain);
    await h.save('s7-uncertain-response.json', { transportFailure: failed.status(), retry: recovered.status(), samePayload: true });
    await h.page.getByTestId('brainstorm-close-btn').click();
    await expect(outline).toHaveValue('Local author draft through provider failures.');
    const after = await h.snapshot('s7-after-provider-errors', [id]);
    const priorRuns = before['narrative.analysis_runs'];
    const newRuns = after['narrative.analysis_runs'].filter(run => !priorRuns.some(prior => prior.id === run.id));
    assert.equal(newRuns.length, 3);
    assert.equal(newRuns.filter(run => run.status === 'failed').length, 2);
    assert.ok(newRuns.every(run => run.operation === 'brainstorm'));
    assert.deepEqual({ ...after, 'narrative.analysis_runs': after['narrative.analysis_runs']
      .filter(run => !newRuns.includes(run)) }, before);
  });
}

test(`${scenario} real-stack acceptance`, { timeout: 240000 }, async () => {
  const h = await createHarness();
  try {
    const author = await h.account('AUTHOR');
    const id = await novel(h, author, `Acceptance ${scenario}`);
    const api = async (method, path, body, expected) => (await h.api(method, path, body, author.token, expected)).data;
    await ({ S5: temporal, S6: concurrency, S7: isolation })[scenario](h, author, id, api);
  } finally {
    await h.finish();
  }
});
