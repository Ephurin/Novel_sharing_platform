import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Exercise the actual AdminId with its providers/styles, without admin API or database fixtures.
test('Animate UI AdminId: clipboard, keyboard, themes, responsive and reduced motion', { timeout: 90000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const value = '12345678-1234-4123-a123-123456789abc';
  const longValue = 'long-reference-'.repeat(16);
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-animate-ui-'));
  const server = await createServer({
    root,
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'admin-tooltip-test-harness',
      configureServer(vite) {
        vite.middlewares.use('/__tooltip_test', async (req, res, next) => {
          if (req.url.includes('?')) return next();
          try {
            const html = await vite.transformIndexHtml('/__tooltip_test', `<!doctype html>
              <html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1">
              <script src="/theme-init.js"></script>
              <style>.material-symbols-outlined { font-family: 'Material Symbols Outlined Variable'; font-size: 18px; line-height: 1; }</style>
              </head><body><div id="root"></div>
              <script type="module">
                import React from 'react';
                import { createRoot } from 'react-dom/client';
                import { AppProviders } from '/src/app/providers.tsx';
                import { AdminId } from '/src/features/admin/AdminShared.tsx';
                import '@fontsource/be-vietnam-pro/400.css';
                import '@fontsource-variable/material-symbols-outlined/full.css';
                import '/src/styles.css';
                import '/src/theme/color-mode.css';
                createRoot(document.getElementById('root')).render(React.createElement(AppProviders, null,
                  React.createElement('main', { className: 'admin-shell', style: { padding: '64px 24px' } },
                    React.createElement('h1', null, 'Mã tham chiếu'),
                    React.createElement(AdminId, { value: '${value}', label: 'mã thử nghiệm' }),
                    React.createElement('div', { style: { marginTop: 40 } },
                      React.createElement(AdminId, { value: '${longValue}', label: 'mã dài', compact: false })))));
              </script></body></html>`);
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          } catch (error) { next(error); }
        });
      }
    }]
  });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    for (const theme of ['light', 'dark']) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const mobile = reducedMotion === 'reduce';
        const context = await browser.newContext({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
          reducedMotion,
          permissions: ['clipboard-read', 'clipboard-write']
        });
        try {
          await context.addInitScript((theme) => localStorage.setItem('storycraft-theme', theme), theme);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(`${base}/__tooltip_test`);
          const button = page.getByRole('button', { name: 'Sao chép mã thử nghiệm', exact: true });
          await expect(button).toBeVisible();
          // Tab must focus the real button and describe it with the full ID.
          await page.keyboard.press('Tab');
          await expect(button).toBeFocused();
          await expect(page.getByRole('tooltip')).toHaveText(value);
          assert.ok(await button.getAttribute('aria-describedby'));
          await page.keyboard.press('Escape');
          await expect(page.getByRole('tooltip')).toHaveCount(0);
          await expect(button).toBeFocused();
          await page.keyboard.press('Enter');
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value);
          await expect(page.getByRole('status').first()).toHaveText('Đã sao chép');
          await page.mouse.move(0, 0);
          await button.hover();
          await expect(page.getByRole('tooltip')).toHaveText('Đã sao chép');
          await page.keyboard.press('Escape');
          await expect(page.getByRole('tooltip')).toHaveCount(0);
          await page.getByRole('button', { name: 'Sao chép mã dài', exact: true }).hover();
          const tooltip = page.getByRole('tooltip');
          await expect(tooltip).toHaveText(longValue);
          await expect.poll(async () => page.locator('.sc-animated-tooltip').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
          await page.evaluate(() => document.fonts.ready);
          const style = await page.locator('.sc-animated-tooltip').evaluate((el) => {
            const css = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return { bg: css.backgroundColor, text: css.color, font: css.fontFamily,
              transform: css.transform, left: rect.left, right: rect.right,
              scroll: el.scrollWidth, width: el.clientWidth,
              expectedBg: getComputedStyle(document.documentElement).getPropertyValue('--sc-surface-elevated').trim() };
          });
          assert.match(style.font, /Be Vietnam Pro/);
          assert.ok(style.left >= 0 && style.right <= page.viewportSize().width);
          assert.ok(style.scroll <= style.width, 'long references must wrap');
          assert.equal(style.bg, theme === 'dark' ? 'rgb(50, 46, 42)' : 'rgb(255, 255, 255)');
          if (reducedMotion === 'reduce') assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(style.transform));
          await page.screenshot({ path: path.join(output, `${theme}-${reducedMotion}.png`) });
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    }
    console.log(`Tooltip screenshots: ${output}`);
  } finally {
    await browser?.close();
    await server.close();
  }
});
