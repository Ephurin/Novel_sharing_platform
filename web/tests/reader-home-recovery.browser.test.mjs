import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('home recovers from failed requests, handles interrupted motion and exposes quick previews on touch', { timeout: 90000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const novels = Array.from({ length: 9 }, (_, index) => ({ novelId: `book-${index}`, authorId: 'writer',
    title: `Hành trình ${index + 1}`, synopsis: 'Một câu chuyện dài. '.repeat(200), genre: 'Fantasy',
    chaptersCount: 8, viewsCount: 100, serialStatus: 'ONGOING' }));
  try {
    for (const reduced of [false, true]) {
      const width = reduced ? 375 : 1440;
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: reduced,
        reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(reduced => localStorage.setItem('storycraft-theme', reduced ? 'dark' : 'light'), reduced);
      let failure = true;
      let previewRequests = 0;
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Lỗi'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) {
          if (url.searchParams.get('genre') === 'Lỗi' && failure) {
            await route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Tạm thời không khả dụng' } } });
            return;
          }
          data = url.searchParams.get('sort') === 'likes' ? [...novels].reverse() : novels;
        } else if (url.pathname.includes('/reading/novels/')) previewRequests++;
        await route.fulfill({ json: { success: true, data } });
      });
      try {
        await page.goto(base);
        await expect(page.locator('.sc-home-feature-cover')).toHaveCount(4);
        const next = page.getByRole('button', { name: 'Truyện nổi bật tiếp theo', exact: true });
        const previous = page.getByRole('button', { name: 'Truyện nổi bật trước', exact: true });
        await next.click();
        await previous.click();
        await page.getByRole('radio', { name: 'Được yêu thích', exact: true }).click();
        await page.getByRole('radio', { name: 'Nổi bật', exact: true }).click();
        const grid = page.locator('.sc-home-feature-grid');
        await expect(grid).toHaveCSS('opacity', '1');
        await expect(grid).toHaveCSS('transform', 'none');
        await expect(page.locator('.sc-home-feature-cover').first()).toHaveAttribute('href', '/public/novels/book-0');
        const trigger = page.locator('.sc-home-feature-card .sc-home-preview-trigger').first();
        if (reduced) await trigger.tap(); else await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Hành trình 1', exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS('opacity', '1');
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 900);
        assert.equal(previewRequests, 0);
        await dialog.getByRole('button', { name: 'Đóng xem nhanh', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        const discovery = page.getByRole('region', { name: 'Khám phá truyện', exact: true });
        await discovery.getByRole('radio', { name: 'Lỗi', exact: true }).click();
        await expect(discovery.getByRole('alert')).toContainText('Không tải được truyện.', { timeout: 20000 });
        await expect(discovery.getByRole('button', { name: 'Đổi gợi ý', exact: true })).toBeDisabled();
        failure = false;
        await discovery.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await expect(discovery.locator('.sc-home-compact')).toHaveCount(6);
        await expect(discovery.getByRole('alert')).toHaveCount(0);
        await expect(discovery.getByRole('radio', { name: 'Lỗi', exact: true })).toBeChecked();
        const shuffle = discovery.getByRole('button', { name: 'Đổi gợi ý', exact: true });
        await shuffle.click();
        await shuffle.click();
        await expect(shuffle).toBeFocused();
        await expect(discovery.locator('.sc-home-compact')).toHaveCount(6);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
