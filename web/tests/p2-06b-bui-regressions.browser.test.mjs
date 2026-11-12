import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-06B BUI regressions (BUI-01..04 + E1).
//
// Unlike p2-06b-brainstorming.browser.test.mjs, this mock enforces the backend
// contracts the UI depends on, so a UI that sends invalid versions or payloads
// fails here instead of passing against a permissive mock:
// - brainstorm-v1 plan CAS mirrors BrainstormService._get_active_plan_info:
//   expected_plan_version is compared with the ACTIVE plan's plan_version and is
//   a 409 when there is no active plan.
// - brainstorm-v1 brain CAS and idempotency (same key + different payload = 409).
// - setup-v1 declarations are strict (extra='forbid'): unknown keys are a 422.
// Fake provider only; no live model, no network outside the Vite origin.

const novelId = '10000000-0000-4000-8000-000000000001';
const chapterId = '20000000-0000-4000-8000-000000000001';
const DECLARATION_KEYS = new Set(['declaration_id', 'entity_type', 'display_name', 'aliases']);
const LABEL = /^[A-Za-z0-9_-]{1,64}$/;

function freshState(overrides = {}) {
  return {
    brainVersion: 1,
    setupSnapshot: {
      snapshot_id: 'snapshot-101',
      novel_id: novelId,
      setup_version: 1,
      brain_version: 1,
      job_status: 'draft',
      outline: 'Ý tưởng khởi đầu.',
      snapshot: { text: '', declarations: [], world_rules: [], initial_conditions: [] },
      proposals: [],
      review: null,
    },
    plans: { head_version: 0, active_plan_id: null, plans: [] },
    fail: null, // { status, code } for the next brainstorm calls while set
    ...overrides,
  };
}

test('P2-06B BUI-01..04 regressions against contract-enforcing mocks', { timeout: 300000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);
  const server = await createServer({
    root,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0, fs: { strict: false } },
    logLevel: 'error',
  });
  await server.listen();
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  const out = process.env.P206B_BUI_EVIDENCE_DIR || join(tmpdir(), 'p2-06b-bui-evidence');
  await mkdir(out, { recursive: true });

  // P206B_BUI_ONLY=bui01a,bui03 runs a subset (used to show each finding RED on the unfixed UI).
  const only = process.env.P206B_BUI_ONLY?.split(',').map(x => x.trim()).filter(Boolean);
  const run = id => !only || only.includes(id);
  const allWrites = [];
  const allBrainstorms = [];
  const pageErrors = [];

  async function open(state) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const brainstorms = [];
    const writes = [];
    const receipts = new Map();
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => localStorage.setItem('ephurin_access_token', 'token-author-101'));
    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();
      const body = ['POST', 'PATCH', 'PUT'].includes(method) ? req.postDataJSON() : null;
      if (body) { writes.push({ path, method, body }); allWrites.push({ path, method, body }); }
      const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, meta: { totalPages: 1 } }) });
      const fail = (code, status, message = code) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message } }) });
      const chapter = { chapterId, novelId, chapterNumber: 1, title: 'Chương 1', content: '', wordCount: 0, isVip: false, priceCoins: 0, status: 'DRAFT', draftVersion: 1, updatedAt: new Date().toISOString() };

      if (path === '/auth/me') return send({ userId: 'author-101', username: 'Tác Giả 101', email: 'author101@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      if (path === '/novels/genres') return send([]);
      if (path === '/novels/me') return send([{ novelId, authorId: 'author-101', title: 'Truyện kiểm thử BUI', slug: 'bui', synopsis: '', status: 'DRAFT', genres: [], chaptersCount: 1 }]);
      if (path === `/novels/${novelId}`) return send({ novelId, authorId: 'author-101', title: 'Truyện kiểm thử BUI', slug: 'bui', synopsis: '', status: 'DRAFT', genres: [], chaptersCount: 1 });
      if (path === `/novels/${novelId}/chapters`) return send([chapter]);
      if (path === `/chapters/${chapterId}`) return send(chapter);
      if (path === `/ai/story-brains/by-novel/${novelId}`) return send({ novel_id: novelId, story_brain_id: 'brain-101', brain_version: state.brainVersion, status: 'draft', baseline_revision_id: null, counts: { events: 0, entities: 0, facts: 0, pending_proposals: 0 } });
      if (path === `/ai/story-brains/${novelId}/extraction-status`) return send([]);
      if (path === `/ai/story-brains/${novelId}/memory`) return send({ brain_version: state.brainVersion, entities: [], relationships: [], facts: [], recent_events: [] });

      if (path === `/ai/story-brains/${novelId}/setup` && method === 'GET') return send(state.setupSnapshot);
      if (path === '/ai/story-brains/bootstrap/from-idea' && method === 'POST') {
        // setup-v1 strict DTO: Declaration has extra='forbid'.
        const setup = body.setup;
        for (const d of setup.declarations) {
          const extra = Object.keys(d).filter(k => !DECLARATION_KEYS.has(k));
          if (extra.length) return fail('VALIDATION_ERROR', 422, `Extra inputs are not permitted: ${extra.join(',')}`);
        }
        const ids = [...setup.declarations, ...setup.world_rules, ...setup.initial_conditions].map(x => x.declaration_id);
        if (ids.some(id => !LABEL.test(id))) return fail('VALIDATION_ERROR', 422, 'declaration_id label');
        if (new Set(ids).size !== ids.length) return fail('VALIDATION_ERROR', 422, 'Declaration IDs must be unique across setup');
        if (body.expected_setup_version !== state.setupSnapshot.setup_version) return fail('SETUP_VERSION_CONFLICT', 409);
        state.setupSnapshot = { ...state.setupSnapshot, setup_version: state.setupSnapshot.setup_version + 1, outline: body.outline ?? '', snapshot: { ...setup } };
        return send({ job_id: 'job-1', story_brain_id: 'brain-101', status: 'completed' });
      }
      if (path.startsWith(`/ai/story-brains/${novelId}/setup/`)) return send({ snapshot_id: state.setupSnapshot.snapshot_id, eligible: false });

      if (path === `/ai/story-plans/edit-v1/${novelId}`) {
        if (method === 'GET') return send(state.plans);
        return send(state.plans.plans.at(-1) ?? {});
      }

      if (path === `/ai/story-brains/${novelId}/brainstorm`) {
        brainstorms.push(body); allBrainstorms.push(body);
        const { idempotency_key: key, ...rest } = body;
        const hash = createHash('sha256').update(JSON.stringify(rest)).digest('hex');
        if (key && receipts.has(key) && receipts.get(key) !== hash) return fail('IDEMPOTENCY_CONFLICT', 409, 'Idempotency key reused with conflicting payload');
        if (key) receipts.set(key, hash);
        if (state.fail) return fail(state.fail.code, state.fail.status);
        if (body.expected_brain_version != null && body.expected_brain_version !== state.brainVersion) return fail('BRAIN_VERSION_CONFLICT', 409);
        if (body.expected_plan_version != null) {
          const active = state.plans.plans.find(p => p.plan_id === state.plans.active_plan_id);
          if (!active) return fail('PLAN_VERSION_CONFLICT', 409, 'novel has no active plan');
          if (active.plan_version !== body.expected_plan_version) return fail('PLAN_VERSION_CONFLICT', 409, `expected ${body.expected_plan_version}, got ${active.plan_version}`);
        }
        const want = kind => body.target === 'all' || body.target === kind;
        return send({
          contract_version: 'brainstorm-v1', novel_id: novelId, story_brain_id: 'brain-101', brain_version: state.brainVersion, plan_version: null,
          world_rules: want('world_rules') ? [{ rule_id: '50000000-0000-4000-8000-000000000001', fact_key: 'qi', text: 'Linh khí Nam Vực mang tính âm hàn.', category: 'magic_system', origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }] : [],
          characters: want('characters') ? [{ character_id: '60000000-0000-4000-8000-000000000001', name: 'Lâm Nhược Vũ', canonical_name: 'Lâm Nhược Vũ', entity_type: 'character', role: 'protagonist', description: 'Kiếm tu thanh lãnh.', archetype: 'Kiếm tu', aliases: ['Tuyết Kiếm Thiếu Niên'], origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }] : [],
          future_events: want('future_events') ? [{ event_id: '70000000-0000-4000-8000-000000000001', target_chapter: body.target_chapter || 1, title: 'Bí cảnh Lôi Trạch khai mở', description: 'Cửa bí cảnh mở giữa giông bão.', text: 'Cửa bí cảnh mở giữa giông bão.', ending: false, min_words: 1500, participants: [{ entity_id: null, name_hint: 'Lâm Nhược Vũ' }], origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }] : [],
          provenance: { contract_version: 'brainstorm-v1', provider: 'fake', model: 'fake-brainstorm-v1', status: 'model_proposed', grounding_rules_count: 0, grounding_entities_count: 0, timestamp: new Date().toISOString() },
        });
      }
      return send({});
    });
    await page.goto(`${origin}/author/ide?novelId=${novelId}&chapterId=${chapterId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Planning Studio' })).toBeVisible({ timeout: 10000 });
    const step = async name => {
      await page.getByRole('navigation', { name: 'Các bước lập kế hoạch' }).getByRole('button', { name: new RegExp(name) }).click();
      await expect(page.getByRole('region', { name: 'Planning Studio' })).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
    };
    const modal = page.getByRole('dialog', { name: /Trợ lý AI Động não/i });
    return { context, page, brainstorms, writes, step, modal };
  }

  try {
    // ---------------------------------------------------------------------
    // BUI-01a: new novel, no plan at all -> brainstorm events must not 409.
    // ---------------------------------------------------------------------
    if (run('bui01a')) {
      const state = freshState();
      const { context, page, brainstorms, step, modal } = await open(state);
      await step('Dàn ý chương');
      await page.getByTestId('brainstorm-open-plan-btn').click();
      await expect(modal).toBeVisible();
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible({ timeout: 5000 });
      assert.equal(brainstorms.at(-1).expected_plan_version, undefined, 'No active plan: expected_plan_version must be omitted');
      await page.getByTestId('adopt-event-btn-0').click();
      await expect(page.getByTestId('event-adopted-badge-0')).toBeVisible();
      await page.getByTestId('brainstorm-close-btn').click();
      const ev = page.getByRole('textbox', { name: 'Sự kiện 1 chương 1', exact: true });
      await expect(ev).toBeVisible();
      const text = await ev.inputValue();
      assert.ok(text.includes('Bí cảnh Lôi Trạch khai mở'), 'Event title must be preserved in plan event text');
      assert.ok(text.includes('Cửa bí cảnh mở giữa giông bão.'), 'Event description must be preserved');
      await expect(page.getByText('Bản sửa trên thiết bị · chưa xác nhận với máy chủ')).toBeVisible();
      // E1: plan editor modal must only offer scopes it can adopt.
      await page.getByTestId('brainstorm-open-plan-btn').click();
      await page.getByRole('textbox', { name: 'Phạm vi gợi ý' }).click();
      const options = await page.getByRole('option').allTextContents();
      assert.deepEqual(options, ['Sự kiện tương lai (Future Events)'], `Plan editor must not offer non-adoptable scopes: ${options}`);
      await page.keyboard.press('Escape');
      await context.close();
    }

    // ---------------------------------------------------------------------
    // BUI-01b: active plan v1 + newer inactive draft v2 (head_version 2).
    // CAS must use the ACTIVE plan version from server readback.
    // ---------------------------------------------------------------------
    if (run('bui01b')) {
      const obj = (id, n) => ({ objective_id: id, intent_version: 1, target_chapter: n, title: `Chương ${n}`, description: '', events: [], dependencies: [] });
      const state = freshState({
        plans: {
          head_version: 2, active_plan_id: '80000000-0000-4000-8000-000000000001',
          plans: [
            { plan_id: '80000000-0000-4000-8000-000000000001', plan_version: 1, status: 'active', source_outline: '', private_notes: 'Ghi chú tuyệt mật kế hoạch', objectives: [obj('90000000-0000-4000-8000-000000000001', 1)], action: 'save', can_save: false, is_historical: true },
            { plan_id: '80000000-0000-4000-8000-000000000002', plan_version: 2, status: 'draft', source_outline: '', private_notes: 'Ghi chú tuyệt mật kế hoạch', objectives: [obj('90000000-0000-4000-8000-000000000002', 1)], action: 'save', can_save: true },
          ],
        },
      });
      const { context, page, brainstorms, step, modal } = await open(state);
      await step('Dàn ý chương');
      await page.getByTestId('brainstorm-chapter-btn-0').click();
      await expect(modal).toBeVisible();
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible({ timeout: 5000 });
      assert.equal(brainstorms.at(-1).expected_plan_version, 1, 'CAS must target the active plan version, not head_version');
      await context.close();
    }

    // ---------------------------------------------------------------------
    // BUI-02: Setup "all" -> rule, character AND event are all adoptable and
    // land in their drafts (event into the Story Plan draft, no plan yet).
    // ---------------------------------------------------------------------
    if (run('bui02')) {
      const state = freshState();
      const { context, page, step, modal } = await open(state);
      await page.getByTestId('brainstorm-open-idea-btn').click();
      await expect(modal).toBeVisible();
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('adopt-rule-btn-0').click();
      await page.getByTestId('adopt-character-btn-0').click();
      await page.getByTestId('adopt-event-btn-0').click();
      await expect(page.getByTestId('rule-adopted-badge-0')).toBeVisible();
      await expect(page.getByTestId('character-adopted-badge-0')).toBeVisible();
      await expect(page.getByTestId('event-adopted-badge-0')).toBeVisible();
      await expect(page.getByTestId('brainstorm-adopt-error')).toHaveCount(0);
      await page.getByTestId('brainstorm-close-btn').click();
      await step('Thế giới');
      assert.equal(await page.getByRole('textbox', { name: 'Quy tắc 1' }).inputValue(), 'Linh khí Nam Vực mang tính âm hàn.');
      await step('Nhân vật');
      assert.equal(await page.getByRole('textbox', { name: 'Tên 1' }).inputValue(), 'Lâm Nhược Vũ');
      await step('Dàn ý chương');
      const ev = page.getByRole('textbox', { name: 'Sự kiện 1 chương 1', exact: true });
      await expect(ev).toBeVisible();
      assert.ok((await ev.inputValue()).includes('Cửa bí cảnh mở giữa giông bão.'));
      await context.close();
    }

    // ---------------------------------------------------------------------
    // BUI-03: edited character description/role survive adopt, setup-v1
    // submit (strict, no extra keys) and reload as device-local notes.
    // ---------------------------------------------------------------------
    if (run('bui03')) {
      const state = freshState();
      const { context, page, writes, step, modal } = await open(state);
      await step('Nhân vật');
      await page.getByTestId('brainstorm-open-characters-btn').click();
      await expect(modal).toBeVisible();
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-character-card-0')).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="character-desc-input-0"]').fill('Kiếm tu thanh lãnh [TÁC GIẢ SỬA], sợ lửa.');
      await page.getByTestId('adopt-character-btn-0').click();
      await page.getByTestId('brainstorm-close-btn').click();
      const note = page.getByRole('textbox', { name: 'Ghi chú nhân vật 1 (chỉ trên thiết bị)' });
      await expect(note).toBeVisible();
      const noteText = await note.inputValue();
      assert.ok(noteText.includes('[TÁC GIẢ SỬA]'), 'Edited description must be kept');
      assert.ok(noteText.includes('protagonist'), 'Role must be kept');
      await expect(page.getByTestId('character-note-warning')).toBeVisible();

      await page.getByRole('button', { name: 'Lưu và xử lý thiết lập' }).click();
      await expect(page.getByText('Bản sửa trên thiết bị — chưa lưu máy chủ.')).toHaveCount(0, { timeout: 10000 });
      const setupWrite = writes.find(w => w.path === '/ai/story-brains/bootstrap/from-idea' && w.method === 'POST');
      assert.ok(setupWrite, 'setup-v1 submit must happen');
      assert.ok(!JSON.stringify(setupWrite.body).includes('[TÁC GIẢ SỬA]'), 'Device-local notes must not be sent to the server');
      assert.equal(setupWrite.body.setup.declarations.length, 1);

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
      await step('Nhân vật');
      const noteAfter = page.getByRole('textbox', { name: 'Ghi chú nhân vật 1 (chỉ trên thiết bị)' });
      await expect(noteAfter).toBeVisible();
      assert.ok((await noteAfter.inputValue()).includes('[TÁC GIẢ SỬA]'), 'Notes must survive accepted submit + reload');
      await context.close();
    }

    // ---------------------------------------------------------------------
    // BUI-04: Safe Retry reuses the key only for an identical payload;
    // changed input disables retry and a new request gets a new key;
    // 409 CAS offers reload, never blind retry.
    // ---------------------------------------------------------------------
    if (run('bui04')) {
      const state = freshState();
      const { context, page, brainstorms, step, modal } = await open(state);
      await step('Thế giới');
      await page.getByTestId('brainstorm-open-rules-btn').click();
      await expect(modal).toBeVisible();
      const instruction = page.locator('textarea[aria-label="Yêu cầu định hướng cho AI"]');
      await instruction.fill('Hệ thống tu luyện A');

      // identical retry reuses the key
      state.fail = { status: 503, code: 'IDEMPOTENCY_STORE_UNAVAILABLE' };
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-safe-retry-btn')).toBeVisible({ timeout: 5000 });
      const k1 = brainstorms.at(-1).idempotency_key;
      state.fail = null;
      await page.getByTestId('brainstorm-safe-retry-btn').click();
      await expect(page.getByTestId('brainstorm-rule-card-0')).toBeVisible({ timeout: 5000 });
      assert.equal(brainstorms.at(-1).idempotency_key, k1);
      assert.equal(brainstorms.at(-1).instruction, 'Hệ thống tu luyện A');

      // changed input: retry is refused, fresh request gets a fresh key
      state.fail = { status: 429, code: 'RATE_LIMIT_EXCEEDED' };
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-safe-retry-btn')).toBeVisible({ timeout: 5000 });
      const k2 = brainstorms.at(-1).idempotency_key;
      assert.notEqual(k2, k1);
      await instruction.fill('Hệ thống tu luyện B');
      await expect(page.getByTestId('brainstorm-retry-stale-warning')).toBeVisible();
      await expect(page.getByTestId('brainstorm-safe-retry-btn')).toBeDisabled();
      state.fail = null;
      const before = brainstorms.length;
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-rule-card-0')).toBeVisible({ timeout: 5000 });
      assert.equal(brainstorms.length, before + 1);
      assert.equal(brainstorms.at(-1).instruction, 'Hệ thống tu luyện B');
      assert.notEqual(brainstorms.at(-1).idempotency_key, k2, 'Changed payload must use a new key');

      // 409 CAS: no blind retry, reload then a fresh request succeeds
      state.brainVersion = 2;
      state.setupSnapshot = { ...state.setupSnapshot, brain_version: 2 };
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-error-alert')).toContainText('BRAIN_VERSION_CONFLICT', { timeout: 5000 });
      await expect(page.getByTestId('brainstorm-safe-retry-btn')).toHaveCount(0);
      await page.getByTestId('brainstorm-reload-btn').click();
      await expect(page.getByTestId('brainstorm-error-alert')).toHaveCount(0, { timeout: 5000 });
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-rule-card-0')).toBeVisible({ timeout: 5000 });
      assert.equal(brainstorms.at(-1).expected_brain_version, 2, 'Fresh request must carry the reloaded brain version');
      await page.screenshot({ path: join(out, 'p2-06b-bui-final-state.png') }).catch(() => {});
      await context.close();
    }

    // ---------------------------------------------------------------------
    // Invariants across all scenarios.
    // ---------------------------------------------------------------------
    for (const w of allWrites) {
      assert.ok(!w.path.includes('/narrative_events') && !w.path.includes('/facts'), `No Canon/history write: ${w.path}`);
      assert.ok(!w.path.includes('/activate') && !w.path.includes('/amendments'), `No M0 activation / amendment: ${w.path}`);
    }
    for (const b of allBrainstorms) {
      const s = JSON.stringify(b);
      assert.ok(!s.includes('Ghi chú tuyệt mật') && !s.includes('[TÁC GIẢ SỬA]'), 'No private note leakage into brainstorm');
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
