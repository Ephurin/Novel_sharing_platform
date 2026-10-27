import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const NOVEL = '10000000-0000-0000-0000-000000000001';
const OTHER_NOVEL = '10000000-0000-0000-0000-000000000002';
const A = '20000000-0000-0000-0000-000000000001';
const B = '20000000-0000-0000-0000-000000000002';
const fields = { description: 'Confirmed baseline', appearance: 'Blue eyes', personality: 'Patient', background: '' };
const deferred = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

// Mounted React + production API client; HTTP is mocked, never integrated acceptance.
test('AX02 mounted AuthorMemoryPanel profile component (MOCK HTTP ONLY)', { timeout: 180000 }, async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('fixtures/entity-profile-fixture.tsx', import.meta.url))],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '\"/api/v1\"', 'process.env.NODE_ENV': '\"test\"' } });
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).contents;
  const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.contents || '';
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); }
    else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  async function fixture(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const calls = [], records = new Map(), replay = new Map(), consoleMessages = [];
    let writes = 0;
    page.on('console', message => consoleMessages.push(message.text()));
    page.on('pageerror', error => consoleMessages.push(error.message));
    const profile = (novel, entity) => {
      const key = novel + ':' + entity;
      if (!records.has(key)) records.set(key, { entity_id: entity, novel_id: novel, version: 0, brain_version: 1,
        profile: { ...fields, appearance: entity === B ? 'Red hair' : 'Blue eyes' }, author_notes: '', effective_from_chapter: 2 });
      return records.get(key);
    };
    await page.route('**/api/v1/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      const match = path.match(/story-brains\/([^/]+)\/entities\/([^/]+)\/profile$/);
      if (match) {
        const [, novel, entity] = match;
        const call = { method: request.method(), url: request.url(), headers: request.headers(), body: request.postDataJSON() };
        calls.push(call);
        if (options.intercept && await options.intercept({ route, call, novel, entity, profile, calls })) return;
        if (call.method === 'GET') return route.fulfill({ json: { data: structuredClone(profile(novel, entity)) } });
        const key = call.headers['idempotency-key'];
        if (!replay.has(key)) {
          const current = profile(novel, entity), body = call.body;
          for (const name of Object.keys(fields)) if (name in body) current.profile[name] = body[name];
          if ('author_notes' in body) current.author_notes = body.author_notes;
          if ('effective_from_chapter' in body) { current.effective_from_chapter = body.effective_from_chapter; current.brain_version++; }
          current.version++; writes++;
          replay.set(key, structuredClone(current));
        }
        if (options.afterWrite && await options.afterWrite({ route, call, calls })) return;
        return route.fulfill({ json: { data: replay.get(key) } });
      }
      let data = [];
      if (path.endsWith('/entity-guidance')) data = { version: 0, entries: [] };
      if (path.endsWith('/memory')) data = { entities: [A, B].map(entity_id => ({ entity_id, name: 'Minh', entity_type: 'PER', status: 'Alive', location: 'Unknown' })), events: [], facts: [], relations: [], transitions: [] };
      else if (path.includes('/story-brains/by-novel/')) data = { brain_version: 1, status: 'active' };
      else if (path.includes('/story-plans/') || path.includes('/autonomous/')) return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
      return route.fulfill({ json: { data } });
    });
    page.setDefaultTimeout(5000);
    await page.goto(url);
    try { await page.getByRole('tab', { name: 'Hồ sơ Codex' }).click(); }
    catch { await context.close(); throw new Error('Fixture bootstrap failed: ' + consoleMessages.join(' | ').replaceAll('PRIVATE_SENTINEL', '[redacted]')); }
    const choose = async entity => {
      await page.getByRole('textbox', { name: 'Chọn entity theo UUID', exact: true }).click();
      await page.getByRole('option', { name: new RegExp(entity) }).click();
    };
    return { context, page, calls, records, profile, consoleMessages, choose, writes: () => writes,
      close: () => context.close() };
  }
  try {
    await t.test('GET, Canon PATCH, mock server readback, reload and homonym UUID isolation', async () => {
      const f = await fixture(); const { page } = f;
      try {
        await f.choose(A); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Blue eyes');
        await page.getByLabel('Ngoại hình', { exact: true }).fill('Green eyes');
        await page.getByLabel('Chương bắt đầu có hiệu lực').fill('5');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đọc lại' })).toBeVisible();
        const patch = f.calls.find(c => c.method === 'PATCH');
        assert.deepEqual(patch.body, { expected_version: 0, expected_brain_version: 1, appearance: 'Green eyes', effective_from_chapter: 5 });
        assert.equal(f.calls.filter(c => c.method === 'GET').length, 2);
        assert.ok(patch.headers['idempotency-key']);
        await f.choose(B); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Red hair');
        await f.choose(A); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Green eyes');
        await page.reload(); await page.getByRole('tab', { name: 'Hồ sơ Codex' }).click(); await f.choose(A);
        await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Green eyes');
        if (process.env.AX02_EVIDENCE_DIR) {
          await mkdir(process.env.AX02_EVIDENCE_DIR, { recursive: true });
          assert.equal(await page.getByLabel('Private Author Notes', { exact: false }).inputValue(), '');
          await page.screenshot({ path: join(process.env.AX02_EVIDENCE_DIR, 'profile-component-mock.png'), fullPage: true });
          await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(process.env.AX02_EVIDENCE_DIR, 'profile-component-mock-save.png'), fullPage: true });
        }
      } finally { await f.close(); }
    });

    await t.test('note-only PATCH, Unicode bounds and private cache/storage/log isolation', async () => {
      const f = await fixture(); const { page } = f;
      try {
        await f.choose(A); const notes = page.getByLabel('Private Author Notes', { exact: false });
        await expect(notes).toHaveValue(''); await notes.fill('PRIVATE_SENTINEL');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đọc lại' })).toBeVisible();
        assert.deepEqual(f.calls.find(c => c.method === 'PATCH').body, { expected_version: 0, expected_brain_version: 1, author_notes: 'PRIVATE_SENTINEL' });
        const publicState = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, queries: window.__profileQueryClient.getQueryCache().getAll().map(q => q.state.data) }));
        assert.ok(!publicState.includes('PRIVATE_SENTINEL'));
        assert.ok(f.consoleMessages.every(m => !m.includes('PRIVATE_SENTINEL')));
        assert.ok(f.calls.every(c => !c.url.includes('PRIVATE_SENTINEL')));
        await page.getByLabel('Mô tả', { exact: true }).fill('😀'.repeat(4000));
        await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeEnabled();
        await page.getByLabel('Mô tả', { exact: true }).fill('😀'.repeat(4001));
        await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeDisabled();
        await page.getByLabel('Mô tả', { exact: true }).fill('New baseline');
        await page.getByLabel('Chương bắt đầu có hiệu lực').fill('1000001');
        await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeDisabled();
      } finally { await f.close(); }
    });

    await t.test('success requires GET readback; readback failure retries GET without another PATCH', async () => {
      let getCount = 0;
      const f = await fixture({ intercept: async ({ route, call, novel, entity, profile }) => {
        if (call.method === 'GET') {
          getCount++;
          if (getCount === 2) { await route.fulfill({ status: 503, json: { error: { message: 'unavailable' } } }); return true; }
          if (getCount === 3) { const data = structuredClone(profile(novel, entity)); data.profile.description = 'Authoritative readback'; await route.fulfill({ json: { data } }); return true; }
        } return false;
      } }); const { page } = f;
      try {
        await f.choose(A); await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue(fields.description);
        await page.getByLabel('Mô tả', { exact: true }).fill('Local draft');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Đọc lại sau lưu' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Lưu thay đổi', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Đọc lại sau lưu' }).click();
        await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue('Authoritative readback');
        assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
      } finally { await f.close(); }
    });

    await t.test('409 preserves draft; explicit server reconciliation uses fresh versions and key', async () => {
      let conflict = true, comparisonUnavailable = true;
      const f = await fixture({ intercept: async ({ route, call, novel, entity, profile }) => {
        if (call.method === 'GET' && !conflict && comparisonUnavailable) {
          comparisonUnavailable = false; await route.fulfill({ status: 503, json: { error: { message: 'unavailable' } } }); return true;
        }
        if (call.method === 'PATCH' && conflict) {
          conflict = false; const current = profile(novel, entity); current.version = 4; current.brain_version = 7; current.profile.appearance = 'Other session';
          await route.fulfill({ status: 409, json: { error: { code: 'CHECKPOINT_CONFLICT', message: 'Conflict' } } }); return true;
        } return false;
      } });
      const { page } = f;
      try {
        await f.choose(A); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Blue eyes');
        await page.getByLabel('Ngoại hình', { exact: true }).fill('Author draft');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: '409' })).toBeVisible();
        await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Author draft');
        assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
        await page.getByRole('button', { name: 'Tải phiên bản server để đối chiếu' }).click();
        await expect(page.getByRole('alert')).toContainText('Chưa tải được');
        await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Author draft');
        await page.getByRole('button', { name: 'Tải phiên bản server để đối chiếu' }).click();
        await expect(page.getByTestId('profile-server-comparison')).toContainText('Other session');
        await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Author draft');
        await page.getByRole('button', { name: 'Lưu bản đã đối chiếu' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đọc lại' })).toBeVisible();
        const patches = f.calls.filter(c => c.method === 'PATCH');
        assert.equal(patches[1].body.expected_version, 4); assert.equal(patches[1].body.expected_brain_version, 7);
        assert.notEqual(patches[0].headers['idempotency-key'], patches[1].headers['idempotency-key']);
      } finally { await f.close(); }
    });

    await t.test('ambiguous transport failure retries exactly once with same key/body; new edit gets new key', async () => {
      let lost = true;
      const f = await fixture({ afterWrite: async ({ route }) => {
        if (lost) { lost = false; await route.fulfill({ status: 503, json: { error: { message: 'PRIVATE_SENTINEL' } } }); return true; } return false;
      } }); const { page } = f;
      try {
        await f.choose(A); await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue(fields.description);
        await page.getByLabel('Mô tả', { exact: true }).fill('Changed');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Thử lại đúng yêu cầu cũ' })).toBeVisible();
        assert.ok(!(await page.getByRole('alert').textContent()).includes('PRIVATE_SENTINEL'));
        await page.getByRole('button', { name: 'Thử lại đúng yêu cầu cũ' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đọc lại' })).toBeVisible();
        const patches = f.calls.filter(c => c.method === 'PATCH');
        assert.deepEqual(patches[0].body, patches[1].body);
        assert.equal(patches[0].headers['idempotency-key'], patches[1].headers['idempotency-key']);
        assert.equal(f.writes(), 1);
        await page.getByLabel('Mô tả', { exact: true }).fill('Changed again');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đọc lại' })).toBeVisible();
        const last = f.calls.filter(c => c.method === 'PATCH').at(-1);
        assert.notEqual(last.headers['idempotency-key'], patches[0].headers['idempotency-key']);
      } finally { await f.close(); }
    });

    for (const status of [401, 403, 404, 422, 503]) await t.test(`${status} is explicit; auth failures clear private view`, async () => {
      const f = await fixture({ intercept: async ({ route, call }) => {
        if (call.method === 'PATCH') { await route.fulfill({ status, json: { error: { message: 'PRIVATE_SENTINEL' } } }); return true; } return false;
      } }); const { page } = f;
      try {
        await f.choose(A); const notes = page.getByLabel('Private Author Notes', { exact: false }); await expect(notes).toHaveValue('');
        await notes.fill('PRIVATE_SENTINEL'); await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        assert.ok(!(await page.getByRole('alert').textContent()).includes('PRIVATE_SENTINEL'));
        if (status === 401 || status === 403) { await expect(notes).toHaveCount(0); await expect(page.getByTestId('entity-profile-editor')).not.toContainText('PRIVATE_SENTINEL'); }
      } finally { await f.close(); }
    });

    for (const target of ['account', 'novel', 'entity']) await t.test(`late private GET discarded on ${target} switch`, async () => {
      const gate = deferred(); let held = false;
      const f = await fixture({ intercept: async ({ route, call, novel, entity, profile }) => {
        if (call.method === 'GET' && !held) {
          held = true; const data = structuredClone(profile(novel, entity)); data.author_notes = 'PRIVATE_SENTINEL';
          await gate.promise; await route.fulfill({ json: { data } }).catch(() => {}); return true;
        } return false;
      } }); const { page } = f;
      try {
        await f.choose(A); await expect.poll(() => held).toBe(true);
        if (target === 'account') await page.evaluate(() => window.__profileSetAccount('author-b'));
        if (target === 'novel') await page.evaluate(n => window.__profileSetNovel(n), OTHER_NOVEL);
        if (target === 'entity') { await f.choose(B); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Red hair'); }
        const response = page.waitForResponse(r => r.url().includes(`/entities/${A}/profile`)); gate.release(); await response;
        await expect(page.locator('body')).not.toContainText('PRIVATE_SENTINEL');
        if (target !== 'entity') await expect(page.getByLabel('Private Author Notes', { exact: false })).toHaveCount(0);
        else await expect(page.getByLabel('Private Author Notes', { exact: false })).toHaveValue('');
      } finally { gate.release(); await f.close(); }
    });

    for (const target of ['account', 'novel', 'entity']) await t.test(`in-flight PATCH stays bound on ${target} switch`, async () => {
      const gate = deferred(); let held = false;
      const f = await fixture({ afterWrite: async () => { held = true; await gate.promise; return false; } }); const { page } = f;
      try {
        await f.choose(A); const notes = page.getByLabel('Private Author Notes', { exact: false }); await expect(notes).toHaveValue(''); await notes.fill('PRIVATE_SENTINEL');
        await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect.poll(() => held).toBe(true);
        if (target === 'account') await page.evaluate(() => window.__profileSetAccount('author-b'));
        if (target === 'novel') await page.evaluate(n => window.__profileSetNovel(n), OTHER_NOVEL);
        if (target === 'entity') { await f.choose(B); await expect(page.getByLabel('Ngoại hình', { exact: true })).toHaveValue('Red hair'); }
        const response = page.waitForResponse(r => r.request().method() === 'PATCH'); gate.release(); await response;
        if (target !== 'entity') await expect(page.getByLabel('Private Author Notes', { exact: false })).toHaveCount(0);
        else await expect(page.getByLabel('Private Author Notes', { exact: false })).toHaveValue('');
        assert.equal(f.calls.filter(c => c.method === 'GET' && c.url.includes(`/entities/${A}/profile`)).length, 1);
        assert.ok(f.calls.find(c => c.method === 'PATCH').url.includes(NOVEL));
        assert.equal(f.calls.find(c => c.method === 'PATCH').headers.authorization, 'Bearer fixture-token-author-a');
      } finally { gate.release(); await f.close(); }
    });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
