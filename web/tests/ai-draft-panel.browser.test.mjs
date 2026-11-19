// Issue 15 (long-run live test 2026-11-15): a draft still generating when the author left was never
// shown, and an older draft came back after a new request failed to start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

async function harness(t) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('fixtures/author-ide-fixture.tsx', import.meta.url))],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' }
  });
  const server = createServer((req, res) => {
    const asset = bundle.outputFiles.find(file => file.path.endsWith(req.url === '/app.css' ? '.css' : '.js'));
    res.setHeader('Content-Type', req.url === '/app.css' ? 'text/css' : req.url === '/app.js' ? 'text/javascript' : 'text/html; charset=utf-8');
    res.end(req.url === '/app.js' || req.url === '/app.css' ? asset.contents : '<html><head><link rel="stylesheet" href="/app.css"></head><body class="sc-author-theme"><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  return { browser, url: 'http://127.0.0.1:' + server.address().port };
}

const content = 'Cô nghe nhịp đồng hồ.';
const chapter = () => ({ chapterId: 'chapter-1', novelId: 'novel-1', title: 'Chương thử', chapterNumber: 1, status: 'DRAFT', content, isVip: false, priceCoins: 0 });
const job = (id, status, draft) => ({ job_id: id, novel_id: 'novel-1', chapter_id: 'chapter-1', status,
  validation_status: status === 'completed' ? 'passed' : null, draft,
  patch: status === 'completed' ? { start: content.length, end: content.length, replacement: draft } : null });

async function open(browser, url, handle) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('storycraft-studio-editor-mode', 'source');
    window.testConfig = { accounts: [{ token: 'test', userId: 'author-1', novelId: 'novel-1', chapterIds: ['chapter-1'] }] };
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    let data = handle(path, method, route.request());
    if (data === undefined) {
      if (path.endsWith('/novels/me')) data = [{ novelId: 'novel-1', title: 'Truyện thử' }];
      else if (path.endsWith('/novels/novel-1/chapters')) data = [chapter()];
      else if (path.endsWith('/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử' };
      else if (path.endsWith('/revisions') && method === 'GET') data = [{ revisionId: 'rev-1', contentHash: 'hash', content }];
      else if (path.endsWith('/context-preview')) data = { brain_version: 1 };
      else if (path.endsWith('/chapters/chapter-1')) data = chapter();
      else data = {};
    }
    await route.fulfill({ json: { data, meta: { totalPages: 1 } } });
  });
  await page.goto(url);
  return page;
}

test('A draft still generating on reopen is followed and opens the AI panel when ready', { timeout: 120000 }, async t => {
  const { browser, url } = await harness(t);
  let polls = 0;
  const page = await open(browser, url, (path, method) => {
    if (path.endsWith('/writing/generations') && method === 'GET') return { job: job('job-1', 'generating', '') };
    if (path.endsWith('/jobs/job-1')) return ++polls < 3 ? job('job-1', 'generating', '') : job('job-1', 'completed', 'Linh bước ra.');
    if (path.endsWith('/writing/generations')) throw new Error('No new generation may start');
    return undefined;
  });
  const accept = page.getByRole('button', { name: 'Chấp nhận bản thảo', exact: true });
  // The panel was closed; it opens by itself with the finished draft.
  await accept.waitFor({ timeout: 15000 });
  assert.ok(polls >= 3);
  await expect(page.locator('#studio-ai-panel')).toContainText('Linh bước ra.');
});

test('Starting a new draft retires the previous unaccepted one first', { timeout: 120000 }, async t => {
  const { browser, url } = await harness(t);
  const calls = [];
  const page = await open(browser, url, (path, method) => {
    if (path.endsWith('/writing/generations') && method === 'GET') return { job: job('job-old', 'completed', 'Bản nháp cũ.') };
    if (path.endsWith('/job-old/dismiss')) { calls.push('dismiss job-old'); return {}; }
    if (path.endsWith('/writing/generations')) { calls.push('start'); return job('job-new', 'queued', ''); }
    if (path.endsWith('/jobs/job-new')) return job('job-new', 'completed', 'Bản nháp mới.');
    return undefined;
  });
  const accept = page.getByRole('button', { name: 'Chấp nhận bản thảo', exact: true });
  await accept.waitFor();
  await expect(page.locator('#studio-ai-panel')).toContainText('Bản nháp cũ.');
  await page.getByRole('button', { name: 'Viết tiếp', exact: true }).click();
  await expect(page.locator('#studio-ai-panel')).toContainText('Bản nháp mới.');
  assert.deepEqual(calls, ['dismiss job-old', 'start']);
});
