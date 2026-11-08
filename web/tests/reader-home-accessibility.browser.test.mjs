import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('home maintains contrast, focus, reduced motion and reflow at narrow widths and 200% zoom', { timeout: 90000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width === 320 });
      const page = await context.newPage();
      await page.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        const data = url.pathname.endsWith('/reading/filters') ? { genres: ['Fantasy', 'Đời thường', 'Trinh thám', 'Lãng mạn', 'Kỳ ảo'], tags: [] } : url.pathname.endsWith('/reading/search') ? Array.from({ length: 8 }, (_, i) => ({ novelId: `n-${i}`, authorId: 'writer', title: `Truyện với nhan đề dài và từkhóacầntựxuốngdòng${i}`, chaptersCount: 4, viewsCount: 100, serialStatus: 'ONGOING' })) : [];
        await route.fulfill({ json: { success: true, data } });
      });
      try {
        await page.goto(base);
        await expect(page.locator('.sc-home-feature-cover')).toHaveCount(4);
        await expect(page.locator('.sc-home-feature-grid')).toHaveCSS('opacity', '1');
        const pairs = await page.evaluate(() => {
          const rgba = value => { const values = value.match(/[\d.]+/g).map(Number); return [...values.slice(0, 3), values[3] ?? 1]; };
          const background = element => {
            const layers = [];
            for (let node = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor));
            return layers.reduce((bg, top) => top.slice(0, 3).map((channel, i) => channel * top[3] + bg[i] * (1 - top[3])), [255, 255, 255]);
          };
          const luminance = rgb => rgb.map(channel => channel / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
          const ratio = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };
          return ['.sc-home-footer', '.sc-home-ranking li a > span', '.sc-home-results-summary', '.sc-home-feature-caption h2', '.sc-home-feature-caption > span'].map(selector => {
            const element = document.querySelector(selector);
            return { selector, ratio: ratio(rgba(getComputedStyle(element).color).slice(0, 3), background(element)) };
          });
        });
        for (const pair of pairs) assert.ok(pair.ratio >= 4.5, `${theme} ${pair.selector}: ${pair.ratio}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.getByRole('button', { name: 'Truyện nổi bật tiếp theo', exact: true }).click();
        await expect(page.locator('.sc-home-feature-grid')).toHaveCSS('transform', 'none');
        await page.locator('.sc-home-preview-trigger').first().focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCSS('opacity', '1');
        await expect(dialog.getByRole('button', { name: 'Đóng xem nhanh', exact: true })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.sc-home-preview-trigger').first()).toBeFocused();
        if (width === 1440) {
          await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
          await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toBeVisible();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
