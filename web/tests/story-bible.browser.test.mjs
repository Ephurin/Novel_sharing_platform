import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('Cẩm nang shows approved knowledge, preserves author enrichment and performs a real sync request', { timeout: 90000 }, async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('fixtures/story-bible-fixture.tsx', import.meta.url))],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => {
    const file = bundle.outputFiles.find(f => f.path.endsWith(req.url === '/app.css' ? '.css' : '.js'));
    if (req.url === '/app.js' || req.url === '/app.css') {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(file?.contents);
    } else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    let syncs = 0;
    let merged = false;
    let mergePayload;
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith('/novels/novel-bible')) data = { novelId: 'novel-bible', title: 'Approved novel' };
      if (path.endsWith('/characters')) data = [{ characterId: merged ? 'char-2' : 'char-1', name: merged ? 'Fujiyama Amane' : 'Amane', role: 'PROTAGONIST',
        personality: 'Kind', description: 'Author biography remains', notes: 'My personal notes', source: 'AUTHOR_MANUAL' }];
      if (path.endsWith('/memory')) data = { brain_version: merged ? 4 : 3, entities: [
        ...(!merged ? [{ entity_id: 'char-1', name: 'Amane', entity_type: 'PER' }] : []),
        { entity_id: 'char-2', name: 'Fujiyama Amane', entity_type: 'PER' },
        { entity_id: 'location-1', name: 'Hà Nội', entity_type: 'LOC' }],
        facts: [{ fact_id: 'fact-1', subject_entity_id: 'location-1', fact_key: 'Quy tắc thế giới', fact_value: 'Magic is forbidden' }],
        aliases: [], events: [], transitions: [] };
      if (path.endsWith('/story-bible/sync')) { syncs++; data = { brainVersion: 3 }; }
      if (path.endsWith('/entities/merge')) {
        mergePayload = route.request().postDataJSON(); merged = true;
        data = { status: 'merged', brain_version: 4 };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('textarea').filter({ hasText: 'Author biography remains' }).waitFor();
    assert.ok(await page.locator('textarea').evaluateAll(nodes => nodes.some(n => n.value === 'My personal notes')));
    await page.getByRole('button', { name: 'Địa danh & dữ kiện', exact: true }).click();
    await page.getByRole('heading', { name: 'Hà Nội', exact: true }).waitFor();
    assert.equal(await page.getByText('Magic is forbidden', { exact: true }).isVisible(), true);
    await page.getByRole('button', { name: 'Cập nhật từ Story Brain', exact: true }).click();
    await page.getByText('Đã cập nhật Cẩm nang từ dữ liệu đã duyệt trong Story Brain.', { exact: true }).waitFor();
    assert.equal(syncs, 1);
    await page.getByRole('button', { name: /Nhân vật/ }).first().click();
    await page.getByRole('button', { name: 'Gộp hai tên của cùng nhân vật', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Xác nhận gộp', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await page.getByRole('textbox', { name: 'Tên cần gộp (sẽ thành tên gọi khác)', exact: true }).click();
    await page.getByRole('option', { name: 'Amane · char-1', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nhân vật giữ lại (tên chính thức)', exact: true }).click();
    await page.getByRole('option', { name: 'Fujiyama Amane · char-2', exact: true }).click();
    assert.equal(mergePayload, undefined);
    await confirm.click();
    await page.getByText('Đã gộp “Amane” vào “Fujiyama Amane”. Tên cũ được giữ làm tên gọi khác.', { exact: true }).waitFor();
    assert.deepEqual(mergePayload, { source_entity_id: 'char-1', target_entity_id: 'char-2', expected_brain_version: 3 });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
