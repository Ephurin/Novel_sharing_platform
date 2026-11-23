import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('home recovers from failed requests, handles interrupted motion and exposes quick previews on touch', { timeout: 90000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const novels = Array.from({ length: 9 }, (_, index) => ({
    novelId: `book-${index}`,
    authorId: 'writer',
    authorName: 'Tác giả thử',
    title: `Hành trình ${index + 1}`,
    synopsis: 'Một câu chuyện dài. '.repeat(200),
    genre: 'Fantasy',
    genres: ['Fantasy'],
    chaptersCount: 8,
    viewsCount: 100 - index,
    likesCount: index + 1,
    serialStatus: 'ONGOING'
  }));
  try {
    for (const reduced of [false, true]) {
      const width = reduced ? 375 : 1440;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: reduced,
        reducedMotion: reduced ? 'reduce' : 'no-preference'
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(reduced => localStorage.setItem('storycraft-theme', reduced ? 'dark' : 'light'), reduced);
      let failLikes = true;
      let failCommunity = true;
      let previewRequests = 0;
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) {
          if (url.searchParams.get('sort') === 'likes' && failLikes) {
            await route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Tạm thời không khả dụng' } } });
            return;
          }
          data = url.searchParams.get('sort') === 'likes' ? [...novels].reverse() : novels;
        } else if (url.pathname.endsWith('/reviews') || url.pathname.endsWith('/comments')) {
          if (failCommunity) {
            await route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Tạm thời không khả dụng' } } });
            return;
          }
          if (url.pathname.endsWith('/reviews')) {
            data = [{
              userId: 'rev-1',
              displayName: 'Độc giả thử',
              avatarUrl: null,
              score: 9,
              review: 'Nhịp truyện cuốn hút và giàu cảm xúc.',
              createdAt: '2026-11-20T10:00:00Z',
              updatedAt: '2026-11-20T10:00:00Z'
            }];
          }
        } else if (url.pathname.includes('/reading/novels/')) previewRequests++;
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 0 } } });
      });
      try {
        await page.goto(base);
        const featured = page.getByRole('region', { name: 'Truyện nổi bật', exact: true });
        await expect(featured.locator('.sc-home-featured-card')).toHaveCount(9);
        await expect(featured.locator('.sc-home-featured-cover-link').first()).toHaveAttribute('href', '/public/novels/book-0');

        const trigger = featured.locator('.sc-home-featured-card .sc-home-preview-trigger').first();
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

        await featured.getByRole('tab', { name: 'Được yêu thích', exact: true }).click();
        await expect(featured.getByRole('alert')).toContainText('Không thể tải truyện nổi bật.', { timeout: 20000 });
        failLikes = false;
        await featured.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await expect(featured.locator('.sc-home-featured-card')).toHaveCount(9);
        await expect(featured.getByRole('alert')).toHaveCount(0);
        await expect(featured.locator('.sc-home-featured-cover-link').first()).toHaveAttribute('href', '/public/novels/book-8');

        // Community section must surface an error state (not empty state) when all review/comment requests fail.
        const community = page.getByRole('region', { name: 'Bình luận và đánh giá gần đây', exact: true });
        await expect(community.getByRole('alert')).toContainText('Chưa tải được bình luận và đánh giá gần đây.');
        failCommunity = false;
        await community.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await expect(community.getByRole('alert')).toHaveCount(0);
        await expect(community.locator('.sc-home-review-card').first()).toContainText('Nhịp truyện cuốn hút và giàu cảm xúc.');

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
