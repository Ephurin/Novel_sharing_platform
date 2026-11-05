import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

for (const mode of ['source', 'visual']) test('Writing studio preserves insertion selection across assistant focus and async preparation: ' + mode, { timeout: 90000 }, async () => {
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
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const initial = 'Mở đầu 🌙. Đoạn giữa cần viết. Kết thúc.';
    let content = initial;
    let selection;
    let generationCount = 0;
    const replacement = 'Bản thảo mới ✨';
    const chapter = () => ({ chapterId: 'chapter-1', novelId: 'novel-1', title: 'Chương thử', chapterNumber: 1, status: 'DRAFT', content, isVip: false, priceCoins: 0 });
    const job = () => ({ job_id: 'job-1', chapter_id: 'chapter-1', status: 'completed', validation_status: 'passed', draft: replacement, patch: { start: selection.cursor, end: selection.cursor, replacement } });
    await page.addInitScript(mode => { localStorage.setItem('storycraft-studio-editor-mode', mode);
      window.testConfig = { accounts: [{ token: 'test', userId: 'author-1', novelId: 'novel-1', chapterIds: ['chapter-1'] }] };
    }, mode);
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let data = {};
      if (path.endsWith('/novels/me')) data = [{ novelId: 'novel-1', title: 'Truyện thử' }];
      else if (path.endsWith('/novels/novel-1/chapters')) data = [chapter()];
      else if (path.endsWith('/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử' };
      else if (path.endsWith('/revisions') && method === 'GET') {
        await new Promise(resolve => setTimeout(resolve, 150));
        data = [{ revisionId: 'rev-1', contentHash: 'hash', content }];
      } else if (path.endsWith('/context-preview')) data = { brain_version: 1 };
      else if (path.endsWith('/writing/generations')) {
        selection = route.request().postDataJSON().selection;
        generationCount++;
        data = job();
      } else if (path.endsWith('/jobs/job-1')) data = job();
      else if (path.endsWith('/accept-draft')) {
        const points = Array.from(content);
        content = points.slice(0, selection.cursor).join('') + replacement + points.slice(selection.cursor).join('');
        data = { chapterId: 'chapter-1', revision: { content } };
      } else if (path.endsWith('/chapters/chapter-1')) data = chapter();
      await route.fulfill({ json: { data, meta: { totalPages: 1 } } });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    const editor = page.locator('textarea.sc-manuscript');
    const surface = mode === 'visual' ? page.locator('[data-studio-rich-editor]') : editor;
    await page.waitForFunction(expected => document.querySelector('textarea.sc-manuscript')?.value === expected, initial);
    await page.getByRole('button', { name: /AI Hỗ trợ viết/ }).click();
    for (const [start, end] of [[initial.indexOf('Đoạn'), initial.indexOf('Đoạn')], [0, 0], [3, 9]]) {
      const before = content;
      await surface.focus();
      await editor.evaluate((el, range) => { if(el.hidden)el.dispatchEvent(new CustomEvent('studio-select-source',{detail:{start:range[0],end:range[1]},cancelable:true}));else el.setSelectionRange(...range); el.dispatchEvent(new Event('select', { bubbles: true })); }, [start, end]);
      const focusStyle = await surface.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
      assert.deepEqual(focusStyle, { outline: 'none', shadow: 'none' });
      await page.getByRole('button', { name: '✍️ Viết tiếp', exact: true }).click();
      // Move the DOM selection while async preparation is pending: request must use the captured position.
      await editor.evaluate(el => {if(el.hidden)el.dispatchEvent(new CustomEvent('studio-select-source',{detail:{start:el.value.length,end:el.value.length},cancelable:true}));else el.setSelectionRange(el.value.length, el.value.length);});
      await page.getByRole('button', { name: 'Chấp nhận bản thảo', exact: true }).waitFor();
      assert.deepEqual(selection, { start: Array.from(before.slice(0, start)).length, end: Array.from(before.slice(0, end)).length, cursor: Array.from(before.slice(0, end)).length });
      await page.getByRole('button', { name: 'Chấp nhận bản thảo', exact: true }).click();
      await page.waitForFunction(expected => {
        const el = document.querySelector('textarea.sc-manuscript');
        return el.value === expected.content && el.selectionStart === expected.caret && (el.hidden ? document.activeElement?.matches('[data-studio-rich-editor]') : document.activeElement === el) && !el.readOnly;
      }, { content: before.slice(0, end) + replacement + before.slice(end), caret: end + replacement.length });
      assert.equal(await editor.inputValue(), before.slice(0, end) + replacement + before.slice(end));
    }
    assert.equal(generationCount, 3);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
