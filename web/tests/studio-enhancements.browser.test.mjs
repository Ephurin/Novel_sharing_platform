import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

test('Studio selection tools, reference lookup, pinned notes, publishing checks and AI review preserve the draft', { timeout: 240000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-studio-enhancements-'));
  const styles = await postcss([tailwindcss(), autoprefixer()]).process(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'), { from: fileURLToPath(new URL('../src/styles.css', import.meta.url)) });
  const bundle = await build({ stdin: { contents: "import '@fontsource/be-vietnam-pro/400.css';import '@fontsource/be-vietnam-pro/600.css';import '@fontsource-variable/material-symbols-outlined/full.css';import './tests/fixtures/author-ide-fixture.tsx';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, loader: { '.woff': 'dataurl', '.woff2': 'dataurl' }, bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? styles.css + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text : '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="sc-author-theme"><div id="root"></div><script src="/app.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    for (const profile of [{ width: 1920, dark: false, source: false }, { width: 1280, dark: true, source: true }, { width: 390, dark: true, source: false }]) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, reducedMotion: profile.dark ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      let value = 'An 🌙 gặp Bình dưới ánh trăng.\n\n---\n\nAn bước vào căn nhà cũ.', version = 1, accepts = 0, generations = 0;
      const initial = value, replacement = 'An 🌟';
      const chapter = () => ({ chapterId: 'chapter-1', novelId: 'novel-1', title: 'Chương thử', chapterNumber: 1, status: 'DRAFT', content: value, isVip: false, priceCoins: 0, draftVersion: version, draft: { content: value, title: 'Chương thử', version } });
      const job = { job_id: 'job-1', chapter_id: 'chapter-1', status: 'completed', validation_status: 'passed', validations: [], patch: { start: 0, end: 4, replacement }, draft: replacement };
      await page.addInitScript(source => {
        window.testConfig = { accounts: [{ token: 'fixture-token', userId: 'author-1', novelId: 'novel-1', chapterIds: ['chapter-1'] }] };
        localStorage.setItem('storycraft-studio-editor-mode', source ? 'source' : 'visual');
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.clipboardDenied) throw new Error('Denied'); window.copiedText = text; } } });
      }, profile.source);
      await page.route('**/api/v1/**', async route => {
        const pathname = new URL(route.request().url()).pathname, method = route.request().method(); let data = [];
        if (pathname.endsWith('/novels/me')) data = [{ novelId: 'novel-1', title: 'Truyện thử' }];
        else if (pathname.endsWith('/novels/novel-1/chapters')) data = [chapter()];
        else if (pathname.endsWith('/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử' };
        else if (pathname.endsWith('/chapters/chapter-1')) { if (method === 'PATCH') { value = route.request().postDataJSON().content; version++; } data = chapter(); }
        else if (pathname.endsWith('/characters')) data = [{ characterId: 'an', name: 'An', role: 'PROTAGONIST', description: 'Người giữ thư viện cổ.', personality: 'Điềm tĩnh', notes: null }];
        else if (pathname.endsWith('/timeline')) data = [];
        else if (pathname.endsWith('/revisions/snapshot')) data = { revisionId: 'rev-1', contentHash: 'hash-1', content: value };
        else if (pathname.endsWith('/revisions/accept-draft')) { accepts++; value = replacement + value.slice(5); version++; data = {}; }
        else if (pathname.endsWith('/revisions')) data = [{ revisionId: 'rev-1', contentHash: 'hash-1', content: value, createdAt: '2026-11-01T08:00:00Z', wordCount: 20 }];
        else if (pathname.endsWith('/ai/writing/generations')) { generations++; data = job; }
        else if (pathname.endsWith('/ai/jobs/job-1')) data = job;
        else if (pathname.includes('context-preview')) data = { brain_version: 1 };
        await route.fulfill({ json: { data, meta: { totalPages: 1 } } });
      });
      const name = `${profile.width}-${profile.source ? 'source' : 'visual'}-${profile.dark ? 'dark' : 'light'}`;
      try {
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.evaluate(() => document.fonts.ready); if (profile.dark) await page.evaluate(() => window.setTheme('dark'));
        const canonical = page.locator('textarea.sc-manuscript'), rich = page.locator('[data-studio-rich-editor]'), editor = profile.source ? canonical : rich;
        await expect(canonical).toHaveValue(initial);
        const select = async () => { await canonical.evaluate(el => { if (el.hidden) el.dispatchEvent(new CustomEvent('studio-select-source', { detail: { start: 0, end: 2, scroll: false }, cancelable: true })); else { el.focus(); el.setSelectionRange(0, 2); el.dispatchEvent(new Event('select', { bubbles: true })); } }); };
        const geometry = () => page.locator('.sc-manuscript-page').boundingBox();
        const before = await geometry(); await select();
        const toolbar = page.getByRole('toolbar', { name: 'Công cụ vùng chọn', exact: true }); await expect(toolbar).toBeVisible(); await expect(toolbar).toHaveCSS('opacity','1');
        assert.deepEqual(await geometry(), before, 'selection toolbar must not change manuscript geometry');
        assert.ok(await toolbar.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
        await page.screenshot({ path: path.join(output, name + '-selection.png') });
        await toolbar.getByRole('button', { name: 'In đậm vùng chọn', exact: true }).click(); await expect(canonical).toHaveValue('**An**' + initial.slice(2));
        await editor.focus(); await page.keyboard.press('Control+z'); await expect(canonical).toHaveValue(initial);
        await select(); await expect(toolbar).toBeVisible(); await expect(toolbar).toHaveCSS('opacity','1'); await page.keyboard.press('Alt+Shift+t'); await expect(toolbar.getByRole('button').first()).toBeFocused(); await page.keyboard.press('ArrowRight'); await expect(toolbar.getByRole('button').nth(1)).toBeFocused(); await page.keyboard.press('Escape'); await expect(editor).toBeFocused();
        // A new selection can reopen the toolbar after Escape.
        await canonical.evaluate(el => { el.setSelectionRange(0, 0); el.dispatchEvent(new Event('select', { bubbles: true })); }); await select();
        await page.getByRole('button', { name: 'Xem', exact: true }).click(); await page.getByRole('menuitem', { name: 'Tra cứu cẩm nang', exact: true }).click();
        const reference = page.getByRole('dialog', { name: 'Tra cứu cẩm nang', exact: true }); await expect(reference.getByRole('heading', { name: 'An', exact: true })).toBeVisible();
        await reference.getByRole('searchbox', { name: 'Tìm trong cẩm nang', exact: true }).fill('thu vien'); await expect(reference.getByRole('heading', { name: 'An', exact: true })).toBeVisible();
        await reference.getByRole('button', { name: 'Sao chép thông tin', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.copiedText)).toContain('Người giữ thư viện');
        await page.evaluate(() => { window.clipboardDenied = true; }); await reference.getByRole('button', { name: 'Sao chép thông tin', exact: true }).click(); await expect(reference.getByRole('status')).toContainText('Không sao chép được'); await page.evaluate(() => { window.clipboardDenied = false; });
        await page.screenshot({ path: path.join(output, name + '-reference.png') }); await page.keyboard.press('Escape'); await expect(reference).toBeHidden(); await expect(canonical).toHaveValue(initial);
        for (const text of ['Ghi chú thứ nhất', 'Ghi chú quan trọng']) {
          await select(); await page.keyboard.press('Control+Alt+m'); await page.getByRole('textbox', { name: 'Nội dung ghi chú đoạn', exact: true }).fill(text); await page.getByRole('button', { name: 'Lưu ghi chú đoạn', exact: true }).click();
        }
        const notes = page.getByRole('complementary', { name: 'Ghi chú chương', exact: true });
        if (profile.width === 1920) {
          await editor.click({position:{x:60,y:12}});await page.keyboard.type('abc');await expect(canonical).not.toHaveValue(initial);await expect(notes).toBeVisible();
          await page.keyboard.press('Control+z');await expect(canonical).toHaveValue(initial);
          await notes.getByRole('textbox',{name:'Sửa ghi chú đoạn',exact:true}).first().fill('Ghi chú thứ nhất');await expect(notes).toBeVisible();
        }
        await notes.locator('article.sc-passage-note').nth(1).getByRole('button', { name: 'Ghim ghi chú', exact: true }).click();
        await expect(notes.locator('article.sc-passage-note').first().getByRole('textbox', { name: 'Sửa ghi chú đoạn', exact: true })).toHaveValue('Ghi chú quan trọng');
        await notes.locator('article.sc-passage-note').first().getByRole('button', { name: 'Xóa ghi chú', exact: true }).click(); await expect(notes.locator('article.sc-passage-note')).toHaveCount(1); await notes.getByRole('button', { name: 'Hoàn tác xóa', exact: true }).click(); await expect(notes.locator('article.sc-passage-note')).toHaveCount(2);
        await notes.getByRole('combobox', { name: 'Trạng thái ghi chú', exact: true }).selectOption('pinned'); await expect(notes.locator('article.sc-passage-note')).toHaveCount(1);
        await page.screenshot({ path: path.join(output, name + '-notes.png') }); await notes.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
        await page.getByRole('button', { name: /^Xuất bản chương/ }).click(); await expect(page.getByRole('region', { name: 'Kiểm tra trước xuất bản', exact: true })).toContainText('2 ghi chú chưa xử lý'); await page.screenshot({ path: path.join(output, name + '-publish.png') }); await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await page.getByTitle('Mở trợ lý sáng tác AI', { exact: true }).click(); await expect(notes).toBeHidden();
        await select(); await page.getByRole('button', { name: /Gọt giũa văn phong/ }).click(); await expect(page.getByRole('button', { name: 'So sánh trước khi áp dụng', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'So sánh trước khi áp dụng', exact: true }).click(); const comparison = page.getByRole('dialog', { name: 'So sánh đề xuất AI', exact: true }); await expect(comparison).toBeVisible();
        await expect(comparison.locator('.sc-comparison-prose').first()).toHaveText('An 🌙'); await expect(comparison.locator('.sc-comparison-prose').last()).toHaveText(replacement); await expect(canonical).toHaveValue(initial); assert.equal(accepts, 0); assert.equal(generations, 1);
        assert.equal(await comparison.locator('.sc-text-comparison').evaluate(el => { const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let node; while(node=walker.nextNode()) if(Array.from(node.textContent).some(char=>char.length===1&&char.charCodeAt(0)>=0xD800&&char.charCodeAt(0)<=0xDFFF)) return false; return true; }),true,'Diff highlighting must not split emoji into broken text nodes');
        await page.screenshot({ path: path.join(output, name + '-ai.png') }); await comparison.getByRole('button', { name: 'Chấp nhận bản thảo', exact: true }).click(); await expect(canonical).toHaveValue(replacement + initial.slice(5)); assert.equal(accepts, 1);
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Trợ lý sáng tác AI', exact: true })).toBeHidden(); await expect(notes).toBeVisible();
        await page.reload(); await expect(canonical).toHaveValue(replacement + initial.slice(5)); await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await expect(notes.getByRole('button', { name: 'Bỏ ghim ghi chú', exact: true })).toHaveCount(1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []); console.log('Enhanced Studio:', name);
      } catch (error) { await page.screenshot({ path: path.join(output, name + '-failure.png') }); console.log('Screenshots:', output); throw error; }
      finally { await context.close(); }
    }
    console.log('Screenshots:', output);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
