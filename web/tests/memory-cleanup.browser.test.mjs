import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Demo walkthrough 2026-11-18: after approval the author can remove a wrong entity and correct or remove
// a fact. Mounted AuthorMemoryPanel with the production API client; HTTP is mocked.
const HERO = '30000000-0000-0000-0000-000000000001';
const IDIOM = '30000000-0000-0000-0000-000000000002';
const EVENT = '40000000-0000-0000-0000-000000000001';
const FACT = '50000000-0000-0000-0000-000000000001';
const STATUS = '50000000-0000-0000-0000-000000000002';

test('author removes a wrong entity and corrects / removes a fact (MOCK HTTP ONLY)', { timeout: 180000 }, async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('fixtures/entity-profile-fixture.tsx', import.meta.url))],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).contents;
  const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.contents || '';
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(js); }
    else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const memory = {
    brain_version: 1,
    entities: [
      { entity_id: HERO, name: 'Trần Vũ', entity_type: 'PER', status: 'Alive', location: 'Unknown' },
      { entity_id: IDIOM, name: 'Quỷ Môn Quan', entity_type: 'LOC', status: 'Unknown', location: 'Unknown' }],
    events: [{ event_id: EVENT, event_type: 'discovery', summary: 'Trần Vũ đứng trước Quỷ Môn Quan.', chapter: 3,
      participants: [HERO, IDIOM], metadata: {} }],
    facts: [{ fact_id: FACT, subject_entity_id: HERO, fact_key: 'hair_color', fact_value: 'silver', chapter_number: 9, fact_type: 'trait' },
      { fact_id: STATUS, subject_entity_id: HERO, fact_key: 'status', fact_value: 'Alive', chapter_number: 9, fact_type: 'state' }],
    relations: [], transitions: [], aliases: []
  };
  const calls = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/v1/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      const body = request.method() === 'POST' ? request.postDataJSON() : undefined;
      let match = path.match(/entities\/([^/]+)\/retire$/);
      if (match) {
        calls.push({ path, body });
        memory.entities = memory.entities.map(e => e.entity_id === match[1] ? { ...e, is_retired: true } : e);
        memory.brain_version++;
        return route.fulfill({ json: { data: { entity_id: match[1], brain_version: memory.brain_version, status: 'retired' } } });
      }
      match = path.match(/facts\/([^/]+)\/corrections$/);
      if (match) {
        calls.push({ path, body });
        const old = memory.facts.find(f => f.fact_id === match[1]);
        const successor = { ...old, fact_id: `fact-${calls.length}`, fact_value: body.retire ? old.fact_value : body.fact_value };
        memory.facts = memory.facts.flatMap(f => f.fact_id !== match[1] ? [f] : body.retire ? [] : [successor]);
        memory.brain_version++;
        return route.fulfill({ json: { data: { fact_id: successor.fact_id, brain_version: memory.brain_version,
          status: body.retire ? 'removed' : 'corrected' } } });
      }
      let data = [];
      if (path.endsWith('/entity-guidance')) data = { version: 0, entries: [] };
      if (path.endsWith('/memory')) data = structuredClone(memory);
      else if (path.includes('/story-brains/by-novel/')) data = { brain_version: memory.brain_version, status: 'active' };
      else if (path.includes('/story-plans/') || path.includes('/autonomous/')) return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
      return route.fulfill({ json: { data } });
    });
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);

    // 1. Remove the idiom that was approved as a place.
    await page.getByRole('tab', { name: 'Địa danh' }).click();
    await page.getByTestId(`btn-retire-entity-${IDIOM}`).click();
    await expect(page.getByText('1 sự kiện đang nhắc tới tên này', { exact: false })).toBeVisible();
    await page.getByLabel('Lý do (không bắt buộc)').fill('thành ngữ, không phải địa danh');
    await page.getByTestId(`btn-confirm-retire-${IDIOM}`).click();
    await expect.poll(() => calls.length).toBe(1);
    assert.deepEqual(calls[0].body, { expected_brain_version: 1, reason: 'thành ngữ, không phải địa danh' });
    await expect(page.getByText('Chưa có địa danh nào đã duyệt.')).toBeVisible();

    // 2. The event that still names it is kept and flagged in red.
    await page.getByRole('tab', { name: /^Sự kiện/ }).click();
    await expect(page.getByTestId('retired-entity-events')).toContainText('1 sự kiện còn nhắc tới thực thể đã gỡ');
    await expect(page.getByTestId(`retired-entity-warning-${EVENT}`)).toContainText('Quỷ Môn Quan');
    await expect(page.getByText('Quỷ Môn Quan · đã gỡ')).toBeVisible();

    // 3. A status is picked from the list and keeps its stored word (Alive -> Dead), not the label.
    await page.getByRole('tab', { name: /^Dữ kiện/ }).click();
    await page.getByTestId(`btn-edit-fact-${STATUS}`).click();
    await expect(page.getByTestId(`input-fact-${STATUS}`)).toHaveValue('Còn sống');
    await page.getByTestId(`input-fact-${STATUS}`).click();
    await page.getByRole('option', { name: 'Đã chết' }).click();
    await page.getByTestId(`btn-save-fact-${STATUS}`).click();
    await expect.poll(() => calls.length).toBe(2);
    assert.deepEqual(calls[1].body, { expected_brain_version: 2, fact_value: 'Dead' });
    await expect(page.getByText('Đã chết', { exact: true })).toBeVisible();

    // 4. Correct the English fact value, then remove the fact.
    await page.getByRole('tab', { name: /^Dữ kiện/ }).click();
    await page.getByTestId(`btn-edit-fact-${FACT}`).click();
    await page.getByTestId(`input-fact-${FACT}`).fill('bạc trắng');
    await page.getByTestId(`btn-save-fact-${FACT}`).click();
    await expect.poll(() => calls.length).toBe(3);
    assert.deepEqual(calls[2].body, { expected_brain_version: 3, fact_value: 'bạc trắng' });
    await expect(page.getByText('bạc trắng', { exact: true })).toBeVisible();
    const corrected = memory.facts.find(f => f.fact_key === 'hair_color').fact_id;
    await page.getByTestId(`btn-remove-fact-${corrected}`).click();
    await page.getByTestId(`btn-confirm-remove-fact-${corrected}`).click();
    await expect.poll(() => calls.length).toBe(4);
    assert.deepEqual(calls[3].body, { expected_brain_version: 4, retire: true });
    await expect(page.getByText('bạc trắng', { exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
