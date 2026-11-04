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

test('Studio tooltips, numeric typography, symbols, context scope and always-available reader preview', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-studio-polish-'));
  const styles = await postcss([tailwindcss(), autoprefixer()]).process(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'), { from: fileURLToPath(new URL('../src/styles.css', import.meta.url)) });
  const bundle = await build({ stdin: { contents: "import '@fontsource/be-vietnam-pro/400.css';import '@fontsource/be-vietnam-pro/600.css';import '@fontsource-variable/material-symbols-outlined/full.css';import './tests/fixtures/author-ide-fixture.tsx';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, loader: { '.woff': 'dataurl', '.woff2': 'dataurl' }, bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? styles.css + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text : '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="sc-author-theme"><div id="root"></div><script src="/app.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    for (const profile of [{ width: 1440, dark: false, mode: 'visual' }, { width: 1280, dark: true, mode: 'source' }, { width: 390, dark: true, mode: 'visual' }]) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, reducedMotion: profile.dark ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const initial = 'Anh Hùng Goblin 🌙 xuất hiện.\n\nMột câu chuyện mới bắt đầu.';
      const nameEnd = 'Anh Hùng Goblin'.length;
      let saved = initial, version = 1;
      const chapter = () => ({ chapterId: 'chapter-1', novelId: 'novel-1', title: 'Chương thử', chapterNumber: 1, status: 'DRAFT', content: saved, isVip: false, priceCoins: 0, draftVersion: version, draft: { content: saved, title: 'Chương thử', version } });
      await page.addInitScript(mode => { window.testConfig = { accounts: [{ token: 'fixture', userId: 'author-1', novelId: 'novel-1', chapterIds: ['chapter-1'] }] }; localStorage.setItem('storycraft-studio-editor-mode', mode); }, profile.mode);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()); let data = [];
        if (url.pathname.endsWith('/novels/me')) data = [{ novelId: 'novel-1', title: 'Truyện thử' }];
        else if (url.pathname.endsWith('/novels/novel-1/chapters')) data = [chapter()];
        else if (url.pathname.endsWith('/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử' };
        else if (url.pathname.endsWith('/chapters/chapter-1')) { if (route.request().method() === 'PATCH') { const body = route.request().postDataJSON(); assert.equal(body.expectedVersion, version); saved = body.content; version++; } data = chapter(); }
        await route.fulfill({ json: { data, meta: { totalPages: 1 } } });
      });
      const name = `${profile.width}-${profile.mode}`;
      try {
        await page.goto('http://127.0.0.1:' + server.address().port); await page.evaluate(() => document.fonts.ready);
        if (profile.dark) await page.evaluate(() => window.setTheme('dark'));
        const canonical = page.locator('textarea.sc-manuscript'), editor = profile.mode === 'visual' ? page.locator('[data-studio-rich-editor]') : canonical;
        await expect(canonical).toHaveValue(initial);
        const commands = page.getByRole('toolbar', { name: 'Công cụ bản thảo', exact: true });
        await commands.getByRole('button', { name: 'Xem trước như độc giả', exact: true }).click();
        const preview = page.getByRole('dialog', { name: 'Xem bản định dạng', exact: true });
        await expect(preview.locator('.chapter-prose')).toContainText('Anh Hùng Goblin');
        await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);

        const font = page.getByRole('spinbutton', { name: 'Cỡ chữ', exact: true }), spacing = page.getByRole('spinbutton', { name: 'Giãn dòng', exact: true });
        await font.fill('24'); await font.press('Enter'); await expect(editor).toHaveCSS('font-size', '24px');
        await spacing.fill(''); await spacing.pressSequentially('2.35'); await spacing.press('Enter'); await expect(editor).toHaveCSS('line-height', '56.4px');
        await spacing.fill('99'); await spacing.press('Tab'); await expect(spacing).toHaveValue('3');
        await font.fill('8'); await font.press('Enter'); await expect(font).toHaveValue('13');
        await font.fill('22'); await font.press('Enter'); await spacing.fill('2.35'); await spacing.press('Enter');
        await expect(canonical).toHaveValue(initial);
        await page.reload(); await expect(canonical).toHaveValue(initial);
        if (profile.dark) await page.evaluate(() => window.setTheme('dark'));
        await expect(page.locator('html')).toHaveAttribute('data-theme', profile.dark ? 'dark' : 'light');
        await expect(font).toHaveValue('22'); await expect(spacing).toHaveValue('2.35'); await expect(editor).toHaveCSS('font-size', '22px');

        const select = async (start, end) => canonical.evaluate((el, range) => { if (el.hidden) el.dispatchEvent(new CustomEvent('studio-select-source', { detail: { ...range, scroll: false }, cancelable: true })); else { el.focus(); el.setSelectionRange(range.start, range.end); el.dispatchEvent(new Event('select', { bubbles: true })); } }, { start, end });
        await select(0, nameEnd);
        const tools = page.getByRole('toolbar', { name: 'Công cụ vùng chọn', exact: true });
        for (const [button, label] of [['In đậm vùng chọn', 'In đậm'], ['In nghiêng vùng chọn', 'In nghiêng'], ['Gạch chân vùng chọn', 'Gạch chân'], ['Ghi chú vùng chọn', 'Ghi chú riêng'], ['Chú thích vùng chọn cho độc giả', 'Chú thích cho độc giả'], ['Đánh dấu vùng chọn', 'Đánh dấu đoạn'], ['Tra cứu vùng chọn trong cẩm nang', 'Tra cứu cẩm nang'], ['Hỏi AI về vùng chọn', 'Hỏi AI về vùng chọn']]) {
          await tools.getByRole('button', { name: button, exact: true }).hover();
          await expect(page.locator('.sc-animated-tooltip').filter({ hasText: label })).toBeVisible();
        }
        await page.screenshot({ path: path.join(output, `${name}-tooltip.png`) });
        await commands.getByRole('button', { name: 'Chèn', exact: true }).click(); await page.getByRole('menuitem', { name: 'Ký tự đặc biệt', exact: true }).click();
        const symbols = page.getByRole('dialog', { name: 'Ký tự đặc biệt', exact: true });
        await expect(symbols).toBeVisible(); await expect(symbols).toHaveCSS('opacity', '1');
        await expect(symbols.locator('.sc-symbol-glyph').first()).toHaveCSS('font-size', '26px');
        await page.screenshot({ path: path.join(output, `${name}-symbols.png`) });
        await symbols.getByRole('searchbox', { name: 'Tìm ký tự đặc biệt', exact: true }).fill('ngoac nhat');
        await symbols.getByRole('button', { name: 'Chèn Ngoặc Nhật', exact: true }).click();
        await expect(symbols).toHaveCount(0); await expect(canonical).toHaveValue('「Anh Hùng Goblin」' + initial.slice(nameEnd)); await expect(editor).toBeFocused();
        await page.keyboard.press('Control+s'); await expect.poll(() => saved).toBe('「Anh Hùng Goblin」' + initial.slice(nameEnd));
        await page.keyboard.press('Control+z'); await expect(canonical).toHaveValue(initial);
        const at = initial.indexOf('xuất'); await select(at, at);
        await page.getByRole('button', { name: 'Chèn ký tự đặc biệt', exact: true }).click();
        await symbols.getByRole('searchbox', { name: 'Tìm ký tự đặc biệt', exact: true }).fill('tên tác phẩm');
        await symbols.getByRole('button', { name: 'Chèn Ngoặc tên tác phẩm', exact: true }).click();
        await expect(symbols).toHaveCount(0); await expect(editor).toBeFocused();
        await expect(canonical).toHaveValue(initial.slice(0, at) + '《》' + initial.slice(at));
        await page.keyboard.type('Tên truyện'); await expect(canonical).toHaveValue(initial.slice(0, at) + '《Tên truyện》' + initial.slice(at));

        await page.getByRole('button', { name: /AI Hỗ trợ viết/ }).click();
        const scope = page.getByLabel('Phạm vi ngữ cảnh', { exact: true }); await scope.selectOption('bible');
        await expect(page.locator('.sc-ai-panel')).toHaveCSS('opacity', '1');
        const geometry = await scope.evaluate(el => { const label = document.querySelector('label[for="studio-ai-context-scope"]').getBoundingClientRect(), select = el.getBoundingClientRect(), panel = el.closest('.sc-ai-panel').getBoundingClientRect(); return { aligned: Math.abs(label.x - select.x) < 1, stacked: label.bottom < select.top, contained: select.left >= panel.left && select.right <= panel.right }; });
        assert.deepEqual(geometry, { aligned: true, stacked: true, contained: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${name}-context.png`) });
        assert.deepEqual(errors, []);
      } catch (error) { await page.screenshot({ path: path.join(output, `${name}-failure.png`) }); console.log(`Studio polish screenshots: ${output}`); throw error; }
      finally { await context.close(); }
    }
    console.log(`Studio polish screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
