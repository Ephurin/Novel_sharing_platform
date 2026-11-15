import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

test('animated menus and dialogs preserve keyboard, routing, pending guards and theme', { timeout: 120000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-overlays-'));
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'overlays-test-harness', configureServer(vite) {
      vite.middlewares.use('/__overlays_test', async (req, res, next) => {
        if (req.url.includes('?')) return next();
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__overlays_test', `<!doctype html>
            <html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="/theme-init.js"></script>
            <style>.material-symbols-outlined { font-family: 'Material Symbols Outlined Variable'; font-size: 18px; line-height: 1; }</style>
            </head><body><div id="root"></div><script type="module">
              import React, { useState } from 'react';
              import { createRoot } from 'react-dom/client';
              import { MemoryRouter, Link, useLocation } from 'react-router-dom';
              import { Button } from '@mantine/core';
              import { useQueryClient } from '@tanstack/react-query';
              import { AppProviders } from '/src/app/providers.tsx';
              import { ThemeControl } from '/src/shared/components/ThemeControl.tsx';
              import { AnimatedMenu as Menu } from '/src/shared/components/AnimatedMenu.tsx';
              import { AdminConfirm } from '/src/features/admin/AdminShared.tsx';
              import { AnimatedDisclosure } from '/src/shared/components/AnimatedDisclosure.tsx';
              import { NotificationBell } from '/src/features/notifications/NotificationBell.tsx';
              import '@fontsource/be-vietnam-pro/400.css';
              import '@fontsource/be-vietnam-pro/500.css';
              import '@fontsource/be-vietnam-pro/600.css';
              import '@fontsource-variable/material-symbols-outlined/full.css';
              import '/src/styles.css';
              import '/src/theme/color-mode.css';
              const h = React.createElement;
              function Demo() {
                const cache = useQueryClient();
                const [opened, setOpened] = useState(false);
                const [reason, setReason] = useState('');
                const [pending, setPending] = useState(false);
                const location = useLocation();
                return h('main', { style: { padding: 32, minHeight: '150vh' } },
                  h(ThemeControl),
                  h(Menu, { position: 'bottom-end' },
                    h(Menu.Target, null, h(Button, null, 'Tài khoản')),
                    h(Menu.Dropdown, null,
                      h(Menu.Label, null, 'Tài khoản StoryCraft'),
                      h(Menu.Item, { disabled: true }, 'Không khả dụng'),
                      h(Menu.Item, { component: Link, to: '/profile/me' }, 'Hồ sơ'),
                      h(Menu.Divider),
                      h(Menu.Item, { onClick: () => setOpened(true) }, 'Mở xác nhận'))),
                  h(Button, { onClick: () => setOpened(true) }, 'Mở hộp thoại'),
                  h('output', null, location.pathname),
                  h(AnimatedDisclosure, { summary: 'Cấu hình nâng cao' },
                    h('label', null, 'Quy tắc thử nghiệm', h('input', { 'aria-label': 'Quy tắc thử nghiệm', defaultValue: 'Mặc định' }))),
                  h(NotificationBell),
                  h(Button, { onClick: () => cache.setQueryData(['notifications', 'unread-count', undefined], 3) }, '3 thông báo'),
                  h(Button, { onClick: () => cache.setQueryData(['notifications', 'unread-count', undefined], 102) }, '102 thông báo'),
                  h(Button, { onClick: () => cache.setQueryData(['notifications', 'unread-count', undefined], 0) }, '0 thông báo'),
                  h(AdminConfirm, { opened, title: 'Xác nhận thao tác', reason, setReason,
                    required: true, pending, confirmLabel: 'Xác nhận', onClose: () => setOpened(false),
                    onConfirm: () => { setPending(true); setTimeout(() => setPending(false), 1000); } },
                    h('p', null, 'Kiểm tra lý do trước khi xác nhận.')));
              }
              createRoot(document.getElementById('root')).render(h(AppProviders, null, h(MemoryRouter, null, h(Demo))));
            </script></body></html>`));
        } catch (error) { next(error); }
      });
    }}]
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    for (const theme of ['light', 'dark']) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const mobile = reducedMotion === 'reduce';
        const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, reducedMotion });
        try {
          await context.addInitScript((theme) => localStorage.setItem('storycraft-theme', theme), theme);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__overlays_test`);
          const account = page.getByRole('button', { name: 'Tài khoản', exact: true });
          const layout = () => page.locator('main').evaluate(el => {
            const { x, y, width } = el.getBoundingClientRect();
            return { x, y, width };
          });
          const restingLayout = await layout();
          await account.focus();
          await page.keyboard.press('ArrowDown');
          await expect(page.getByRole('menuitem', { name: 'Hồ sơ' })).toBeFocused();
          assert.deepEqual(await layout(), restingLayout, 'opening a menu must not shift or resize the page');
          assert.equal(await page.locator('body').getAttribute('data-scroll-locked'), null);
          await page.keyboard.press('Enter');
          await expect(page.locator('output')).toHaveText('/profile/me');
          await expect(account).toBeFocused();
          await account.click();
          await expect(page.getByRole('menu')).toBeVisible();
          await expect.poll(() => page.locator('.sc-animated-menu').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
          await page.screenshot({ path: path.join(output, `${theme}-${reducedMotion}-menu.png`) });
          await page.keyboard.press('Escape');
          await expect(account).toBeFocused();
          await expect(page.getByRole('menu')).toHaveCount(0);

          // Menu -> dialog handoff must keep focus inside the new modal.
          await account.click();
          await page.getByRole('menuitem', { name: 'Mở xác nhận' }).click();
          const dialog = page.getByRole('dialog', { name: 'Xác nhận thao tác' });
          await expect(dialog).toBeVisible();
          await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(account).toBeFocused();

          const opener = page.getByRole('button', { name: 'Mở hộp thoại' });
          await page.evaluate(() => {
            window.dialogMotion = new Promise(resolve => {
              const frames = [];
              const until = performance.now() + 800;
              function sample() {
                const el = document.querySelector('.sc-animated-modal');
                if (el) {
                  const matrix = new DOMMatrix(getComputedStyle(el).transform);
                  const rect = el.getBoundingClientRect();
                  frames.push({ matrix: Array.from(matrix.toFloat64Array()), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
                }
                if (performance.now() < until) requestAnimationFrame(sample);
                else resolve(frames);
              }
              requestAnimationFrame(sample);
            });
          });
          await opener.click();
          await expect(dialog).toBeVisible();
          assert.deepEqual(await layout(), restingLayout, 'dialog scroll locking must not shift the background');
          const frames = await page.evaluate(() => window.dialogMotion);
          assert.ok(frames.length > 2, 'capture the dialog throughout its entrance');
          for (const frame of frames) {
            const m = frame.matrix;
            assert.ok(m[0] >= .95 && m[0] <= 1.001 && Math.abs(m[0] - m[5]) < .001);
            for (const index of [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14]) {
              assert.ok(Math.abs(m[index]) < .001, 'dialog must scale straight out without rotation, perspective or translation');
            }
            assert.ok(Math.abs(frame.x - frames.at(-1).x) < 1 && Math.abs(frame.y - frames.at(-1).y) < 1, 'zoom must keep the dialog center fixed');
            if (reducedMotion === 'reduce') assert.ok(Math.abs(m[0] - 1) < .001);
          }
          const confirm = dialog.getByRole('button', { name: 'Xác nhận', exact: true });
          await expect(confirm).toBeDisabled();
          await dialog.getByLabel('Lý do xử lý').fill('Lý do kiểm tra');
          await expect(confirm).toBeEnabled();
          // Tab and Shift+Tab stay trapped while open.
          for (let i = 0; i < 8; i++) {
            await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
            assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
          }
          await expect.poll(() => page.locator('.sc-animated-modal').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
          await page.screenshot({ path: path.join(output, `${theme}-${reducedMotion}-dialog.png`) });
          const bounds = await dialog.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width);
          assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height);
          await confirm.click();
          await expect(dialog.getByRole('button', { name: 'Đóng hộp thoại' })).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(dialog).toBeVisible();
          await page.mouse.click(4, 4);
          await expect(dialog).toBeVisible();
          await expect(confirm).toBeEnabled();
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          await opener.click();
          await expect(dialog.getByLabel('Lý do xử lý')).toHaveValue('Lý do kiểm tra');
          await page.mouse.click(4, 4);
          await expect(dialog).toHaveCount(0);
          // The shared appearance menu changes and persists the theme.
          await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
          await page.getByRole('menuitem', { name: theme === 'light' ? 'Tối' : 'Sáng', exact: true }).click();
          assert.equal(await page.evaluate(() => localStorage.getItem('storycraft-theme')), theme === 'light' ? 'dark' : 'light');
          const disclosure = page.getByRole('button', { name: 'Cấu hình nâng cao', exact: true });
          await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
          await expect(page.getByRole('textbox', { name: 'Quy tắc thử nghiệm' })).toHaveCount(0);
          await disclosure.focus();
          await page.keyboard.press('Enter');
          await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
          const rule = page.getByRole('textbox', { name: 'Quy tắc thử nghiệm' });
          await rule.fill('Chương [0-9]+');
          await disclosure.focus();
          await page.keyboard.press('Space');
          await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
          await expect(page.getByRole('textbox', { name: 'Quy tắc thử nghiệm' })).toHaveCount(0);
          await disclosure.click();
          await expect(rule).toHaveValue('Chương [0-9]+');
          await expect.poll(() => page.locator('.sc-disclosure-content').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
          await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
          await page.screenshot({ path: path.join(output, `${theme}-${reducedMotion}-disclosure.png`) });
          await disclosure.click();
          await expect.poll(() => page.locator('.sc-disclosure-content').evaluate(el => el.getBoundingClientRect().height)).toBe(0);
          const bell = page.locator('.sc-notification-bell');
          const bellLayout = () => bell.evaluate(el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x: x + scrollX, y: y + scrollY, width, height };
          });
          const bellBounds = await bellLayout();
          await page.getByRole('button', { name: '3 thông báo', exact: true }).click();
          await expect(bell).toHaveAttribute('aria-label', 'Thông báo, 3 chưa đọc');
          await expect(bell.locator('.sc-notification-count')).toHaveText('3');
          await expect(bell).toHaveAttribute('href', '/notifications');
          await page.getByRole('button', { name: '102 thông báo', exact: true }).click();
          await expect(bell.locator('.sc-notification-count')).toHaveText('99+');
          assert.deepEqual(await bellLayout(), bellBounds, 'badge changes must not move the navbar');
          if (reducedMotion === 'reduce') {
            const transform = await bell.locator('.material-symbols-outlined').evaluate(el => getComputedStyle(el).transform);
            assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(transform), 'reduced motion must not ring the bell');
          }
          await bell.focus();
          await expect(page.getByRole('tooltip')).toHaveText('Thông báo, 102 chưa đọc');
          await page.keyboard.press('Escape');
          await page.keyboard.press('Enter');
          await expect(page.locator('output')).toHaveText('/notifications');
          await page.getByRole('button', { name: '0 thông báo', exact: true }).click();
          await expect(bell.locator('.sc-notification-count')).toHaveCount(0);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    }
    console.log(`Overlay screenshots: ${output}`);
  } finally { await browser?.close(); await server.close(); }
});
