import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const baseDecision = (id, type = 'LOC') => ({
  candidate_id: id, verdict: 'entity', entity_type: type, canonical_name: 'Cồn Vân',
  canonical_entity_id: '', provisional_identity_key: '', identity_quote: '',
  initial_status: 'Unknown', status_quote: '', confidence: 0.9, reason: 'Machine suggestion only'
});
function review(type = 'LOC') {
  return {
    review_schema_version: 1, analysis_run_id: 'run-ux', revision_id: 'revision-ux',
    source_hash: 'hash-ux', status: 'waiting_entity_review', brain_version: 1,
    registry_brain_version: 1, review_version: 1, guidance_version: 1,
    provisional_identity_scope: 'tenant/novel/revision/hash/run',
    candidates: ['loc-1', 'loc-2', 'loc-other'].map((id, i) => ({
      candidate_id: id, surface: 'Cồn Vân', start: i * 20, end: i * 20 + 7,
      context: 'Cồn Vân nằm phía xa.', origins: ['ner']
    })),
    decisions: ['loc-1', 'loc-2', 'loc-other'].map(id => baseDecision(id, type)),
    reviewed_decisions: [{ ...baseDecision('loc-other'), canonical_entity_id: 'uuid-other' }],
    pending_candidate_ids: ['loc-1', 'loc-2'],
    known_entities: [{ entity_id: 'uuid-other', name: 'Cồn Vân', entity_type: 'LOC' }],
    entities: []
  };
}

test('Identity checkpoint UX: type, bulk, CAS and isolation', { timeout: 180000 }, async t => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('fixtures/p1-hitl-fixture.tsx', import.meta.url))],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' }
  });
  const server = createServer((req, res) => {
    const file = bundle.outputFiles.find(f => f.path.endsWith(req.url === '/app.css' ? '.css' : '.js'));
    if (req.url === '/app.js' || req.url === '/app.css') {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(file?.contents);
    } else res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const url = 'http://127.0.0.1:' + server.address().port + '/?scenario=entity-review';
  async function setup(type) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const state = { review: review(type), requests: [], stale: false };
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let data;
      if (path.endsWith('/entity-guidance')) data = { version: 1, entries: [], chapter_review_enabled: true };
      else if (path.endsWith('/entity-reviews')) data = [state.review];
      else if (path.endsWith('/review')) {
        const body = req.postDataJSON(); state.requests.push({ path, body });
        if (state.stale) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Version conflict' } }) });
        state.review = { ...state.review, review_version: state.review.review_version + 1,
          reviewed_decisions: body.decisions, status: body.finalize ? 'entities_reviewed' : 'waiting_entity_review' };
        data = state.review;
      } else if (path.endsWith('/refresh')) {
        state.requests.push({ path, body: req.postDataJSON() });
        state.review = { ...state.review, review_version: state.review.review_version + 1 }; data = state.review;
      } else data = {};
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto(url);
    await page.getByTestId('entity-occurrence-loc-1').waitFor();
    const card = id => page.getByTestId('entity-occurrence-' + id);
    async function assign(id = 'loc-1') {
      await page.getByPlaceholder('Tên nhóm mới (ví dụ: minh-bac-si)', { exact: true }).fill('con-van');
      await page.getByRole('button', { name: '+ Thêm nhóm', exact: true }).click();
      await card(id).getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
      await page.getByRole('option', { name: 'con-van', exact: true }).click();
    }
    async function save() {
      const response = page.waitForResponse(r => r.url().endsWith('/review') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /^Lưu quyết định một phần/ }).click();
      return response;
    }
    return { page, state, card, assign, save };
  }
  try {
    await t.test('machine LOC is a visible suggestion, not approval; explicit group save preserves LOC', async () => {
      const h = await setup('LOC');
      try {
        assert.equal(h.state.review.reviewed_decisions.length, 1);
        assert.equal(h.state.requests.length, 0);
        await expect(h.card('loc-1')).toContainText('[LOC]');
        await h.assign(); await h.save();
        assert.equal(h.state.requests.at(-1).body.decisions.find(d => d.candidate_id === 'loc-1').entity_type, 'LOC');
      } finally { await h.page.close(); }
    });
    await t.test('explicit LOC edit is part of checkpoint draft without a second hidden commit', async () => {
      const h = await setup('PER');
      try {
        h.state.review = { ...h.state.review, review_version: 2, candidates: [
          ...h.state.review.candidates,
          ...Array.from({ length: 4 }, (_, i) => ({ candidate_id: 'extra-' + i,
            surface: 'Khác', start: 80 + i * 10, end: 84 + i * 10, context: 'Khác xuất hiện.' }))
        ] };
        await h.page.evaluate(() => window.__queryClient.invalidateQueries({ queryKey: ['entity-reviews'] }));
        await h.page.getByRole('button', { name: '2', exact: true }).waitFor();
        await h.assign();
        await h.card('loc-1').getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
        await h.card('loc-1').getByLabel('Loại thực thể', { exact: true }).click();
        await h.page.getByRole('option', { name: 'LOC', exact: true }).click();
        await h.page.getByRole('button', { name: '2', exact: true }).click();
        await h.page.getByRole('button', { name: '1', exact: true }).click();
        await h.save();
        assert.equal(h.state.requests.at(-1).body.decisions.find(d => d.candidate_id === 'loc-1').entity_type, 'LOC');
        await h.page.reload(); await h.card('loc-1').getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
        await expect(h.card('loc-1').getByLabel('Loại thực thể', { exact: true })).toHaveValue('LOC');
      } finally { await h.page.close(); }
    });
    await t.test('bulk cancel is inert; confirm targets exact matching eligible IDs, preserves other UUID, save/reload/freeze', async () => {
      const h = await setup('LOC');
      try {
        await h.assign();
        const bulk = h.card('loc-1').getByRole('button', { name: /Áp dụng quyết định này/ });
        await bulk.click();
        await h.card('loc-1').getByRole('button', { name: 'Hủy', exact: true }).click();
        await expect(h.card('loc-2').getByLabel('Gán nhóm danh tính mới', { exact: true })).toHaveValue('');
        assert.equal(h.state.requests.length, 0);
        await bulk.click(); await h.card('loc-1').getByRole('button', { name: 'Xác nhận gán toàn bộ', exact: true }).click();
        await h.save();
        const ds = h.state.requests.at(-1).body.decisions;
        assert.deepEqual(ds.filter(d => d.provisional_identity_key).map(d => d.candidate_id).sort(), ['loc-1', 'loc-2']);
        assert.equal(ds.find(d => d.candidate_id === 'loc-other').canonical_entity_id, 'uuid-other');
        await h.page.reload();
        await expect(h.card('loc-2').getByLabel('Gán nhóm danh tính mới', { exact: true })).toHaveValue('con-van');
        await h.page.getByRole('button', { name: /Đóng băng danh sách entity/ }).click();
        await expect.poll(() => h.state.requests.filter(r => r.body.finalize).length).toBe(1);
        assert.ok(h.state.requests.at(-1).body.decisions.every(d => d.entity_type === 'LOC'));
        assert.ok(h.state.requests.every(r => r.path.includes('/novel-test-uuid-1/entity-reviews/run-ux/')));
      } finally { await h.page.close(); }
    });
    await t.test('stale 409 then server refresh preserves dirty LOC draft and warns on type-only conflict', async () => {
      const h = await setup('LOC');
      try {
        await h.assign();
        h.state.stale = true;
        assert.equal((await h.save()).status(), 409);
        await expect(h.page.getByText(/Lựa chọn của bạn vẫn được giữ lại/)).toBeVisible();
        h.state.review = { ...h.state.review, reviewed_decisions: [
          ...h.state.review.reviewed_decisions,
          { ...baseDecision('loc-1', 'PER'), provisional_identity_key: h.state.review.provisional_identity_scope + '/con-van',
            reason: 'Author assigned to provisional identity group: con-van' }
        ], review_version: 3 };
        h.state.stale = false;
        await h.page.getByTestId('btn-refresh-entity-review').click();
        await expect(h.page.getByText(/Các lựa chọn chưa lưu của bạn vẫn được giữ nguyên/)).toBeVisible();
        await h.save();
        assert.equal(h.state.requests.at(-1).body.decisions.find(d => d.candidate_id === 'loc-1').entity_type, 'LOC');
      } finally { await h.page.close(); }
    });
    await t.test('bulk preserves source and per-occurrence authored quotes through pagination, save, reload and Freeze', async () => {
      const h = await setup('LOC');
      const quotes = { 'loc-1': ['Source identity evidence', 'Source status evidence'],
        'loc-2': ['Target identity evidence', 'Target status evidence'], 'loc-3': ['', ''] };
      async function fields(id) {
        const card = h.card(id);
        await card.getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
        return [card.getByLabel('Bằng chứng alias / tên khác', { exact: true }),
          card.getByLabel('Bằng chứng trạng thái', { exact: true })];
      }
      function assertQuotes(ds) {
        for (const [id, values] of Object.entries(quotes)) {
          const d = ds.find(x => x.candidate_id === id);
          assert.deepEqual([d.identity_quote, d.status_quote], values, 'Evidence must stay with ' + id);
        }
        assert.equal(ds.find(d => d.candidate_id === 'loc-1').reason, 'Author refined provisional identity: con-van');
      }
      try {
        h.state.review = { ...h.state.review, review_version: 2, candidates: [
          ...h.state.review.candidates,
          { candidate_id: 'loc-3', surface: 'Cồn Vân', start: 60, end: 67, context: 'Cồn Vân ở đây.' },
          ...Array.from({ length: 3 }, (_, i) => ({ candidate_id: 'extra-' + i, surface: 'Khác', start: 80 + i * 10, end: 84 + i * 10, context: 'Khác.' }))
        ] };
        await h.page.evaluate(() => window.__queryClient.invalidateQueries({ queryKey: ['entity-reviews'] }));
        await h.page.getByRole('button', { name: '2', exact: true }).waitFor();
        await h.assign();
        await h.card('loc-2').getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
        await h.page.getByRole('option', { name: 'con-van', exact: true }).click();
        for (const id of ['loc-1', 'loc-2']) {
          const inputs = await fields(id); await inputs[0].fill(quotes[id][0]); await inputs[1].fill(quotes[id][1]);
        }
        await h.card('loc-1').getByRole('button', { name: /Áp dụng quyết định này/ }).click();
        await h.card('loc-1').getByRole('button', { name: 'Xác nhận gán toàn bộ', exact: true }).click();
        await h.page.getByRole('button', { name: '2', exact: true }).click();
        await h.page.getByRole('button', { name: '1', exact: true }).click();
        await h.save(); assertQuotes(h.state.requests.at(-1).body.decisions);
        await h.page.reload();
        for (const id of ['loc-1', 'loc-2', 'loc-3']) {
          const inputs = await fields(id); await expect(inputs[0]).toHaveValue(quotes[id][0]); await expect(inputs[1]).toHaveValue(quotes[id][1]);
        }
        for (let i = 0; i < 3; i++) {
          if (i === 1) await h.page.getByRole('button', { name: '2', exact: true }).click();
          await h.card('extra-' + i).getByRole('button', { name: 'Loại bỏ', exact: true }).click();
        }
        await h.page.getByRole('button', { name: /Đóng băng danh sách entity/ }).click();
        await expect.poll(() => h.state.requests.filter(r => r.body.finalize).length).toBe(1);
        assertQuotes(h.state.requests.at(-1).body.decisions);
      } finally { await h.page.close(); }
    });
    await t.test('bulk never remaps another explicitly selected same-name UUID', async () => {
      const h = await setup('LOC');
      try {
        h.state.review = { ...h.state.review, review_version: 2, known_entities: [
          ...h.state.review.known_entities,
          { entity_id: 'uuid-first', name: 'Cồn Vân', entity_type: 'LOC' }
        ] };
        await h.page.evaluate(() => window.__queryClient.invalidateQueries({ queryKey: ['entity-reviews'] }));
        await h.page.getByText('v2', { exact: true }).waitFor();
        for (const [id, uuid] of [['loc-1', 'uuid-first'], ['loc-2', 'uuid-other']]) {
          await h.card(id).getByLabel('Chọn thực thể Canon đã có', { exact: true }).click();
          await h.page.getByRole('option', { name: new RegExp(uuid.slice(0, 8)) }).click();
        }
        await h.card('loc-1').getByRole('button', { name: /Áp dụng quyết định này/ }).click();
        await h.card('loc-1').getByRole('button', { name: 'Xác nhận gán toàn bộ', exact: true }).click();
        await h.save();
        const ds = h.state.requests.at(-1).body.decisions;
        assert.equal(ds.find(d => d.candidate_id === 'loc-1').canonical_entity_id, 'uuid-first');
        for (const id of ['loc-2', 'loc-other']) assert.equal(ds.find(d => d.candidate_id === id).canonical_entity_id, 'uuid-other');
      } finally { await h.page.close(); }
    });
    await t.test('mixed types in one group are shown and block Freeze until explicitly reconciled', async () => {
      const h = await setup('LOC');
      try {
        await h.assign();
        await h.card('loc-2').getByLabel('Gán nhóm danh tính mới', { exact: true }).click();
        await h.page.getByRole('option', { name: 'con-van', exact: true }).click();
        await h.card('loc-2').getByRole('button', { name: 'Sửa thuộc tính', exact: true }).click();
        await h.card('loc-2').getByLabel('Loại thực thể', { exact: true }).click();
        await h.page.getByRole('option', { name: 'PER', exact: true }).click();
        await expect(h.page.getByTestId('entity-freeze-summary')).toContainText('Cồn Vân [PER]');
        await expect(h.page.getByRole('button', { name: /Đóng băng danh sách entity/ })).toBeDisabled();
        assert.equal(h.state.requests.length, 0);
      } finally { await h.page.close(); }
    });
    await t.test('novel and analysis changes never reuse foreign dirty decisions', async () => {
      const h = await setup('LOC');
      try {
        await h.assign();
        h.state.review = { ...review(), analysis_run_id: 'run-new', reviewed_decisions: [] };
        await h.page.getByRole('button', { name: 'Novel 2', exact: true }).click();
        await expect(h.card('loc-1').getByLabel('Gán nhóm danh tính mới', { exact: true })).toHaveValue('');
        await expect(h.page.getByRole('button', { name: /^Lưu quyết định một phần/ })).toBeDisabled();
      } finally { await h.page.close(); }
    });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
