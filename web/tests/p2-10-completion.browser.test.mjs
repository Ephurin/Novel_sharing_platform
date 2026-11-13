import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// P2-10 completion regressions (mocked HTTP, fake provider, no network outside the Vite origin).
// - #133: a novel without World Setup is pointed to the existing manuscript route into memory.
// - #134: future-event brainstorm targets the chapter after the last written one and refuses history.
// - #135: discarding the shared planning backup in another tab re-persists this tab's unsaved edits.
// P210_ONLY=c133,c134 runs a subset.

const novelId = '10000000-0000-4000-8000-000000000210';
const chapterIds = ['20000000-0000-4000-8000-000000000211', '20000000-0000-4000-8000-000000000212'];
const planKey = `ephurin-planning:author-210:${novelId}:plan`;

function objective(id, n) {
  return { objective_id: id, intent_version: 1, target_chapter: n, title: `Chương ${n}`, description: '', events: [], dependencies: [] };
}

function freshState(overrides = {}) {
  return {
    brainVersion: 1,
    // ch.1 has saved text (history); ch.2 is an empty slot (still open for planning).
    chapters: [
      { n: 1, wordCount: 120 },
      { n: 2, wordCount: 0 },
    ],
    plans: {
      head_version: 1, active_plan_id: null,
      plans: [{ plan_id: '80000000-0000-4000-8000-000000000210', plan_version: 1, status: 'draft', source_outline: '', private_notes: '',
        objectives: [objective('90000000-0000-4000-8000-000000000211', 1), objective('90000000-0000-4000-8000-000000000213', 3)], action: 'save', can_save: true }],
    },
    ...overrides,
  };
}

test('P2-10 completion: #133 memory entry, #134 future target, #135 cross-tab backup', { timeout: 300000 }, async () => {
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
  const only = process.env.P210_ONLY?.split(',').map(x => x.trim()).filter(Boolean);
  const run = id => !only || only.includes(id);
  const pageErrors = [];

  async function mock(page, state) {
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => localStorage.setItem('ephurin_access_token', 'token-author-210'));
    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/v1', '');
      const method = req.method();
      const body = ['POST', 'PATCH', 'PUT'].includes(method) ? req.postDataJSON() : null;
      const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, meta: { totalPages: 1 } }) });
      const fail = (code, status) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message: code } }) });
      const chapters = state.chapters.map((c, i) => ({ chapterId: chapterIds[i], novelId, chapterNumber: c.n, title: `Chương ${c.n}`, content: c.wordCount ? 'Đã viết.' : '', wordCount: c.wordCount,
        isVip: false, priceCoins: 0, status: 'DRAFT', draftVersion: 1, updatedAt: new Date().toISOString() }));
      const novel = { novelId, authorId: 'author-210', title: 'Truyện kiểm thử P2-10', slug: 'p2-10', synopsis: '', status: 'DRAFT', genres: [], chaptersCount: chapters.length };

      if (path === '/auth/me') return send({ userId: 'author-210', username: 'Tác Giả 210', email: 'author210@example.test', role: 'AUTHOR', status: 'ACTIVE' });
      if (path === '/novels/genres') return send([]);
      if (path === '/novels/me') return send([novel]);
      if (path === `/novels/${novelId}`) return send(novel);
      if (path === `/novels/${novelId}/chapters`) return send(chapters);
      const ch = chapters.find(c => path === `/chapters/${c.chapterId}`);
      if (ch) return send(ch);
      if (path === `/ai/story-brains/by-novel/${novelId}`) return send({ novel_id: novelId, story_brain_id: 'brain-210', brain_version: state.brainVersion, status: 'draft', baseline_revision_id: null, counts: { events: 0, entities: 0, facts: 0, pending_proposals: 0 } });
      if (path === `/ai/story-brains/${novelId}/extraction-status`) return send([]);
      if (path === `/ai/story-brains/${novelId}/review-queue`) return send([]);
      if (path === `/ai/story-brains/${novelId}/entity-reviews`) return send([]);
      if (path === `/ai/story-brains/${novelId}/memory`) return send({ brain_version: state.brainVersion, status: 'draft', entities: [], relationships: [], relations: [], facts: [], events: [], recent_events: [] });
      if (path === `/ai/story-brains/${novelId}/setup` && method === 'GET') return fail('SETUP_NOT_FOUND', 404);
      if (path === `/ai/story-plans/edit-v1/${novelId}`) {
        if (method === 'GET') return send(state.plans);
        return send(state.plans.plans.at(-1));
      }
      if (path === `/ai/story-brains/${novelId}/brainstorm`) {
        return send({
          contract_version: 'brainstorm-v1', novel_id: novelId, story_brain_id: 'brain-210', brain_version: state.brainVersion, plan_version: null,
          world_rules: [], characters: [],
          future_events: [{ event_id: '70000000-0000-4000-8000-000000000210', target_chapter: body.target_chapter || 1, title: 'Hội chợ đèn lồng', description: 'Hai người gặp lại ở hội chợ.', text: 'Hai người gặp lại ở hội chợ.', ending: false, min_words: 1500, participants: [], origin: 'model_proposed', status: 'model_proposed', is_canon: false, is_historical: false }],
          provenance: { contract_version: 'brainstorm-v1', provider: 'fake', model: 'fake-brainstorm-v1', status: 'model_proposed', grounding_rules_count: 0, grounding_entities_count: 0, timestamp: new Date().toISOString() },
        });
      }
      if (method === 'GET' && path.startsWith('/ai/')) return fail('NOT_FOUND', 404);
      return send({});
    });
  }

  async function openPlanning(page) {
    await page.goto(`${origin}/author/ide?novelId=${novelId}&chapterId=${chapterIds[0]}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
    const studio = page.getByRole('region', { name: 'Planning Studio' });
    await expect(studio).toBeVisible({ timeout: 10000 });
    await expect(studio).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
  }
  async function step(page, name) {
    await page.getByRole('navigation', { name: 'Các bước lập kế hoạch' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('region', { name: 'Planning Studio' })).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
  }

  try {
    if (run('c133')) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await mock(page, freshState());
      await openPlanning(page);
      const route = page.getByTestId('planning-memory-from-chapters');
      await expect(route).toBeVisible();
      await route.getByRole('button', { name: 'Bắt đầu bộ nhớ từ chương đã lưu' }).click();
      await expect(page.getByRole('tab', { name: 'Trích xuất' })).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu' })).toBeVisible();
      await context.close();

      // Without any written chapter the route is described, not offered.
      const empty = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p2 = await empty.newPage();
      await mock(p2, freshState({ chapters: [{ n: 1, wordCount: 0 }] }));
      await openPlanning(p2);
      await expect(p2.getByTestId('planning-memory-from-chapters')).toHaveCount(0);
      await expect(p2.getByText(/viết và lưu ít nhất một chương/)).toBeVisible();
      await empty.close();
    }

    if (run('c133b')) {
      // Final acceptance finding: the chapter list was read once, so text written after the IDE
      // loaded did not count as "written" in Planning until a full page reload.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const state = freshState({ chapters: [{ n: 1, wordCount: 0 }] });
      await mock(page, state);
      await openPlanning(page);
      await expect(page.getByTestId('planning-memory-from-chapters')).toHaveCount(0);
      state.chapters = [{ n: 1, wordCount: 30 }]; // the author writes ch.1 and autosave stores it
      await page.getByRole('button', { name: 'Viết bản thảo', exact: true }).click();
      await page.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
      await expect(page.getByTestId('planning-memory-from-chapters')).toBeVisible({ timeout: 10000 });
      await context.close();
    }

    if (run('c134')) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await mock(page, freshState());
      await openPlanning(page);
      await step(page, 'Dàn ý chương');
      const modal = page.getByRole('dialog', { name: /Trợ lý AI Động não/i });
      // Top-level button: first plan card after the last written chapter (card 3), never ch.1.
      await page.getByTestId('brainstorm-open-plan-btn').click();
      await expect(modal).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Chương mục tiêu gợi ý' })).toHaveValue('3');
      await expect(page.getByTestId('brainstorm-target-written-warning')).toHaveCount(0);
      await page.getByTestId('brainstorm-close-btn').click();
      // Card for written ch.1: warned, and adopting is refused (plan stays separate from history).
      await page.getByTestId('brainstorm-chapter-btn-0').click();
      await expect(page.getByTestId('brainstorm-target-written-warning')).toBeVisible();
      await page.getByTestId('brainstorm-submit-btn').click();
      await expect(page.getByTestId('brainstorm-event-card-0')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('adopt-event-btn-0').click();
      await expect(page.getByTestId('brainstorm-adopt-error')).toContainText('đã được viết');
      await expect(page.getByTestId('event-adopted-badge-0')).toHaveCount(0);
      await page.getByTestId('brainstorm-close-btn').click();
      await expect(page.getByRole('textbox', { name: /^Sự kiện 1 chương/ })).toHaveCount(0);
      await context.close();
    }

    if (run('c135')) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const tab1 = await context.newPage();
      const tab2 = await context.newPage();
      await mock(tab1, freshState());
      await mock(tab2, freshState());
      await openPlanning(tab1);
      await step(tab1, 'Dàn ý chương');
      await tab1.getByRole('button', { name: 'Thêm sự kiện chương 2' }).click();
      const saved = await tab1.evaluate(k => localStorage.getItem(k), planKey);
      assert.ok(saved, 'tab 1 must keep a device backup of its unsaved edit');
      // Tab 2 discards the shared backup (as "Bỏ bản sửa dàn ý trên thiết bị" does).
      await tab2.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      await tab2.evaluate(k => localStorage.removeItem(k), planKey);
      await expect(tab1.getByTestId('planning-cross-tab-notice')).toBeVisible({ timeout: 5000 });
      const restored = await tab1.evaluate(k => localStorage.getItem(k), planKey);
      assert.ok(restored, 'tab 1 must re-persist its unsaved edit after another tab removed the backup');
      assert.deepEqual(JSON.parse(restored).value, JSON.parse(saved).value);
      await context.close();
    }

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
