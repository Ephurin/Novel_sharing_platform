import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { chromium, expect } from '@playwright/test';
import { isolatedIdeServer } from './helpers/isolated-ide-server.mjs';
import { evidenceDirectory, sanitizedTrace } from './helpers/evidence-output.mjs';

test('S09 real AuthorWritingIde: rich/source durability, IME, notes isolation and two-tab conflicts', { skip: process.env.RUN_DRAFT_BROWSER_TESTS !== '1', timeout: 300000 }, async () => {
  const fixture = await isolatedIdeServer(), { config, readback } = fixture;
  const evidence = await evidenceDirectory('rich-manuscript-durability');
  let server, browser;
  try {
    const styles = await postcss([tailwindcss(), autoprefixer()]).process(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'), { from: fileURLToPath(new URL('../src/styles.css', import.meta.url)) });
    const bundle = await build({ stdin: { contents: "import '@fontsource/be-vietnam-pro/400.css';import '@fontsource/be-vietnam-pro/500.css';import '@fontsource-variable/material-symbols-outlined/full.css';import './tests/fixtures/author-ide-fixture';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', loader: { '.woff': 'dataurl', '.woff2': 'dataurl' }, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(config.base), 'process.env.NODE_ENV': '"test"' } });
    server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? styles.css + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text : '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const [first, second] = config.accounts, [chapter, otherChapter] = first.chapterIds;
    const seed = async (account, id, content) => {
      const current = await readback(id);
      const response = await fetch(`${config.base}/chapters/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content, expectedVersion: current.draft.version }) });
      assert.equal(response.status, 200, await response.text());
    };
    const profiles = [{ width: 1440, theme: 'light', reduce: false }, { width: 1440, theme: 'dark', reduce: true }, { width: 375, theme: 'light', reduce: true }, { width: 390, theme: 'dark', reduce: false }];
    for (const profile of profiles) {
      const name = `${profile.width}-${profile.theme}`, initial = 'Xin chào 🌙';
      await seed(first, chapter, initial); await seed(first, otherChapter, 'Chương khác.'); await seed(second, second.chapterIds[0], 'Tài khoản khác.');
      const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, reducedMotion: profile.reduce ? 'reduce' : 'no-preference' });
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.addInitScript(config => { window.testConfig = config; localStorage.setItem('storycraft-studio-editor-mode', 'visual'); }, config);
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      const canonical = page.locator('textarea.sc-manuscript'), rich = page.locator('[data-studio-rich-editor]');
      const save = async expected => { await rich.press('Control+s'); await expect.poll(async () => (await readback(chapter)).draft.content).toBe(expected); };
      const select = (start, end = start) => canonical.evaluate((el, range) => el.dispatchEvent(new CustomEvent('studio-select-source', { detail: { ...range, scroll: false }, cancelable: true })), { start, end });
      const position = () => canonical.evaluate(el => [el.selectionStart, el.selectionEnd]);
      try {
        await page.goto(origin); await expect(canonical).toHaveValue(initial); await page.evaluate(() => document.fonts.ready); await page.evaluate(theme => window.setTheme(theme), profile.theme);
        await select(initial.length); await rich.press('Enter'); await expect(canonical).toHaveValue(initial + '\n');
        await page.waitForTimeout(700); // Separate history typing groups (650ms coalescing window).
        await rich.press('Enter'); await expect(canonical).toHaveValue(initial + '\n\n');
        await rich.press('Control+z'); await expect(canonical).toHaveValue(initial + '\n'); await expect.poll(position).toEqual([initial.length + 1, initial.length + 1]);
        await rich.press('Control+Shift+z'); await expect(canonical).toHaveValue(initial + '\n\n'); await expect.poll(position).toEqual([initial.length + 2, initial.length + 2]);
        await page.keyboard.insertText('Một đoạn mới.'); const expected = initial + '\n\nMột đoạn mới.'; await expect(canonical).toHaveValue(expected); await save(expected);
        await select(2, 7); await page.getByRole('button', { name: 'Ký hiệu định dạng', exact: true }).click(); await expect(canonical).toBeVisible(); await expect.poll(position).toEqual([2,7]);
        await page.getByRole('button', { name: 'Soạn thảo', exact: true }).click(); await expect(rich).toBeFocused(); await expect(canonical).toHaveValue(expected); assert.equal(await page.evaluate(() => getSelection().toString()), expected.slice(2,7));
        await select(expected.length); await page.waitForTimeout(500); await page.reload(); await expect(canonical).toHaveValue(expected); await expect.poll(position).toEqual([expected.length, expected.length]);

        // Real Chromium composition events: no partial composition is sent to autosave.
        await select(expected.length); const cdp = await context.newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: 'Việ', selectionStart: 3, selectionEnd: 3 });
        await page.waitForTimeout(1350); assert.equal((await readback(chapter)).draft.content, expected); await expect(canonical).toHaveValue(expected);
        await cdp.send('Input.insertText', { text: ' Việt' }); await expect(canonical).toHaveValue(expected + ' Việt'); await save(expected + ' Việt');

        // Clipboard HTML is discarded; formatting and author-note atoms cannot be injected by paste.
        await select((expected + ' Việt').length);
        await rich.evaluate(el => { const data = new DataTransfer(); data.setData('text/plain', '\nDán tiếng Việt 🌙'); data.setData('text/html', '<script>window.pasteExecuted=true</script>'); el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })); });
        const pasted = expected + ' Việt\nDán tiếng Việt 🌙'; await expect(canonical).toHaveValue(pasted); await save(pasted); assert.equal(await page.evaluate(() => window.pasteExecuted), undefined);

        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await page.getByRole('tab', { name: 'Sổ tay chương', exact: true }).click();
        const privateNote = 'Ghi chú riêng chỉ của tác giả A.'; await page.getByRole('textbox', { name: 'Ghi chú riêng', exact: true }).fill(privateNote);
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
        await page.evaluate(id => window.navigateTestChapter(id), otherChapter); await expect(canonical).toHaveValue('Chương khác.');
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await page.getByRole('tab', { name: 'Sổ tay chương', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Ghi chú riêng', exact: true })).toHaveValue('');
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
        await page.evaluate(() => window.selectTestAccount(1)); await expect(canonical).toHaveValue('Tài khoản khác.');
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await page.getByRole('tab', { name: 'Sổ tay chương', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Ghi chú riêng', exact: true })).toHaveValue('');
        await page.evaluate(() => window.selectTestAccount(0)); await expect(canonical).toHaveValue(pasted);
        await page.getByRole('button', { name: 'Ghi chú', exact: true }).click(); await page.getByRole('tab', { name: 'Sổ tay chương', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Ghi chú riêng', exact: true })).toHaveValue(privateNote); await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
        await page.getByRole('button', { name: 'Xem trước như độc giả', exact: true }).click();
        const preview = page.getByRole('dialog', { name: 'Xem bản định dạng', exact: true }); await expect(preview.locator('.chapter-prose')).toContainText('Dán tiếng Việt'); await expect(preview).not.toContainText(privateNote); await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
        await page.getByRole('toolbar', { name: 'Công cụ bản thảo', exact: true }).getByRole('button', { name: 'Tệp', exact: true }).click();
        const download = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Tải bản định dạng HTML', exact: true }).click();
        const exported = await readFile(await (await download).path(), 'utf8'); assert.ok(exported.includes('Dán tiếng Việt')); assert.ok(!exported.includes(privateNote));

        // Two actual IDE tabs read the same version. The stale tab cannot overwrite the winner.
        const tab = await context.newPage(); await tab.goto(origin); await expect(tab.locator('textarea.sc-manuscript')).toHaveValue(pasted);
        const winner = pasted + '\nTab thứ nhất lưu trước.'; await select(pasted.length); await page.keyboard.insertText('\nTab thứ nhất lưu trước.'); await save(winner);
        const stale = tab.locator('textarea.sc-manuscript'); await stale.evaluate(el => el.dispatchEvent(new CustomEvent('studio-select-source', { detail: { start: el.value.length, end: el.value.length }, cancelable: true })));
        await tab.keyboard.insertText('\nTab thứ hai còn bản nháp.'); await tab.locator('[data-studio-rich-editor]').press('Control+s');
        await expect(tab.getByText('Có thay đổi từ phiên khác. Bản trên máy được giữ lại; chưa ghi đè bản máy chủ.')).toBeVisible(); assert.equal((await readback(chapter)).draft.content, winner);
        assert.ok(await tab.evaluate(key => localStorage.getItem(key)?.includes('Tab thứ hai còn bản nháp.'), `storycraft-draft:${first.userId}:${chapter}`));
        await tab.screenshot({ path: fileURLToPath(new URL(`${name}-409-conflict.png`, evidence)) }); await tab.close();
        await page.reload(); await expect(canonical).toHaveValue(winner); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: fileURLToPath(new URL(`${name}-durable-rich.png`, evidence)) }); assert.deepEqual(errors, []);
        console.log(JSON.stringify({ profile, enterUndoReload: true, imeComposition: true, paste: true, chapterAccountIsolation: true, privateNotesIsolation: true, previewExport: true, actualTwoTab409: true }));
      } catch (error) { await page.screenshot({ path: fileURLToPath(new URL(`${name}-failure.png`, evidence)) }); throw error; }
      finally { await sanitizedTrace(context, evidence, `${name}-trace`); await context.close(); }
    }
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await fixture.close(); }
});
