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
  return revision;
}

async function pendingGroup(api, id, revision) {
  const base = `/ai/story-brains/${id}`;
  const checkpoint = await until(async () => (await api('GET', `${base}/entity-reviews`))
    .find(r => r.revision_id === revision.revision_id), 'Missing entity review checkpoint');
  assert.equal(checkpoint.source_hash, revision.content_hash);
  const run = checkpoint.analysis_run_id;
  const path = `${base}/entity-reviews/${run}`;
  await api('POST', `${path}/continue`, {}, [409]);
  const audit = await api('GET', `${base}/entity-candidate-audits/${run}`);
  await api('POST', `${path}/review`, { expected_version: audit.review_version,
    decisions: audit.decisions.map(d => d.verdict === 'entity' && !d.canonical_entity_id
      ? { ...d, provisional_identity_key: `${audit.provisional_identity_scope}/${d.candidate_id}` } : d) });
  await api('POST', `${path}/continue`, {});
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
      if (number >= 4 && number <= 7) {
        const state = await h.snapshot(`s5-sequential-revision-${number}`, [id]);
        assertHistory(state, approved);
        return;
      }
      const queue = await pendingGroup(api, id, revision);
      const pending = await h.snapshot(`s5-pending-${number}`, [id]);
      assertHistory(pending, approved);
      const group = `/ai/proposal-groups/${queue[0].dependency_group_id}`;
      const version = Number(pending['narrative.story_brains'][0].brain_version);
      const body = { proposal_ids: queue.map(p => p.proposal_id), expected_brain_version: version };
      if (number === 2) {
        await api('POST', `${group}/reject`, { expected_brain_version: version, reason: 'Author rejects this group' });
      } else {
        await api('POST', `${group}/accept`, body);
        await api('POST', `${group}/accept`, body, [409]);
        approved.push(content);
      }
      const after = await h.snapshot(`s5-decided-${number}`, [id]);
      assertHistory(after, approved);
      assert.ok(after['narrative.revision_provenances'].some(p => p.revision_id === revision.revision_id && p.chapter_number === number));
      assert.deepEqual(after['narrative.story_plan_objectives'].find(o => o.plan_id === active.plan_id).objective_metadata.events,
        [{ ...future, participants: [{ entity_id: null, name_hint: 'UnwrittenLan' }] }]);
      const memory = await api('GET', `/ai/story-brains/${id}/memory`);
      assert.equal(memory.events.length, approved.length);
      assert.doesNotMatch(JSON.stringify(memory), /UnwrittenBetrayal|UnwrittenLan/);
      await h.shot(`s5-chapter-${number}`);
    });
  }
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
    assert.deepEqual(await h.snapshot('s7-foreign-access-rejected', [id, otherId]), before);
    await h.page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), foreign.token);
    await h.page.goto(`${h.origin}/author/ide?novelId=${id}`);
    await expect(h.page.getByText(betrayal, { exact: true })).toHaveCount(0);
    await h.shot('s7-foreign-ide');
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
