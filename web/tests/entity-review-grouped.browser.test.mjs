// Issue 5 (long-run live test 2026-11-15): one review item per mention. A large checkpoint opens
// grouped by surface, and one action decides every occurrence of a name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const SURFACES = [['Linh', 18, 'PER'], ['Ba Lắm', 12, 'PER'], ['Nếu', 6, null], ['đèn bão', 4, 'ITEM']];

function review() {
  const candidates = [], decisions = [];
  let pos = 0;
  for (const [surface, count, type] of SURFACES) {
    for (let i = 0; i < count; i++) {
      const id = `${surface.replace(/\W/g, '') || 'x'}-${i}-${pos}`;
      candidates.push({ candidate_id: id, surface, start: pos, end: pos + surface.length,
        context: `… ${surface} bước tới (${i + 1}) …`, origins: ['capitalized_token'] });
      decisions.push({ candidate_id: id, verdict: type ? 'entity' : 'not_entity', entity_type: type,
        canonical_name: type ? surface : '', canonical_entity_id: '', provisional_identity_key: '',
        identity_quote: '', initial_status: 'Unknown', status_quote: '', confidence: 0.8, reason: 'máy' });
      pos += 40;
    }
  }
  return {
    review_schema_version: 1, analysis_run_id: 'run-grouped', revision_id: 'revision-grouped',
    source_hash: 'hash', status: 'waiting_entity_review', brain_version: 1, registry_brain_version: 1,
    review_version: 1, guidance_version: 1, provisional_identity_scope: 'tenant/novel/revision/hash/run',
    candidates, decisions, reviewed_decisions: [], pending_candidate_ids: candidates.map(c => c.candidate_id),
    known_entities: [{ entity_id: 'uuid-linh', name: 'Linh', entity_type: 'PER' }], entities: []
  };
}

test('Grouped entity review decides each name once', { timeout: 180000 }, async t => {
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
  t.after(async () => { await browser.close(); server.close(); });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const state = { review: review(), saved: [] };
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let data = {};
    if (path.endsWith('/entity-guidance')) data = { version: 1, entries: [], chapter_review_enabled: true };
    else if (path.endsWith('/entity-reviews')) data = [state.review];
    else if (path.endsWith('/review')) {
      const body = req.postDataJSON(); state.saved.push(body);
      state.review = { ...state.review, review_version: state.review.review_version + 1, reviewed_decisions: body.decisions };
      data = state.review;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/?scenario=entity-review');
  const group = surface => page.getByTestId('entity-surface-group-' + surface.toLocaleLowerCase('vi'));
  await group('Linh').waitFor();

  // 40 occurrences open as 4 names; no single-occurrence cards until asked.
  await expect(page.locator('[data-testid^="entity-surface-group-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="entity-occurrence-"]')).toHaveCount(0);
  await expect(group('Linh').getByText('18 vị trí', { exact: true })).toBeVisible();

  // One choice links all 18 "Linh" to the known entity.
  await group('Linh').getByLabel('Cả nhóm là thực thể Canon đã có', { exact: true }).click();
  await page.getByRole('option', { name: /^Linh \[PER\]/ }).click();
  await expect(group('Linh').getByText('Canon: Linh')).toBeVisible();

  // One click makes "Ba Lắm" a new identity; another rejects every "Nếu".
  await group('Ba Lắm').getByRole('button', { name: 'Thực thể mới “Ba Lắm”', exact: true }).click();
  await expect(group('Ba Lắm').getByText(/^Mới: Ba Lắm \[PER\]/)).toBeVisible();
  await group('Nếu').getByRole('button', { name: 'Loại cả nhóm', exact: true }).click();
  await expect(group('Nếu').getByText('Đã loại cả nhóm', { exact: true })).toBeVisible();

  // Replacing a different identity asks first; cancel keeps the decisions.
  await group('Linh').getByRole('button', { name: 'Loại cả nhóm', exact: true }).click();
  await expect(group('Linh').getByText('18/18 vị trí “Linh” đang gán cho danh tính khác.')).toBeVisible();
  await group('Linh').getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(group('Linh').getByText('Canon: Linh')).toBeVisible();

  // Single occurrences stay reachable inside a group.
  await group('đèn bão').getByRole('button', { name: 'Xem từng vị trí (4)', exact: true }).click();
  await expect(group('đèn bão').locator('[data-testid^="entity-occurrence-"]')).toHaveCount(4);
  await group('đèn bão').getByRole('button', { name: 'Loại cả nhóm', exact: true }).click();
  await expect(group('đèn bão').getByText('Đã loại cả nhóm', { exact: true })).toBeVisible();

  if (process.env.GROUPED_SCREENSHOT) await page.screenshot({ path: process.env.GROUPED_SCREENSHOT, fullPage: true });

  const saved = page.waitForResponse(r => r.url().endsWith('/review') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Lưu quyết định một phần \(40\/40\)/ }).click();
  await saved;
  const decisions = state.saved.at(-1).decisions;
  assert.equal(decisions.length, 40);
  const by = surface => decisions.filter(d => state.review.candidates.find(c => c.candidate_id === d.candidate_id).surface === surface);
  assert.ok(by('Linh').every(d => d.canonical_entity_id === 'uuid-linh'));
  assert.equal(new Set(by('Ba Lắm').map(d => d.provisional_identity_key)).size, 1);
  assert.ok(by('Ba Lắm').every(d => d.verdict === 'entity' && d.canonical_name === 'Ba Lắm' && !d.canonical_entity_id));
  assert.ok([...by('Nếu'), ...by('đèn bão')].every(d => d.verdict === 'not_entity'));

  // The per-occurrence view is one click away.
  await page.getByText(/^Từng vị trí \(40\)/).click();
  await expect(page.locator('[data-testid^="entity-occurrence-"]')).toHaveCount(5);
});
