import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('reader catalog: cover cards, unified sorting, selectable filters and scroll navigation', { timeout: 120000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-reader-catalog-'));
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#775f55"/><circle cx="100" cy="110" r="60" fill="#e9c899"/><text x="100" y="225" text-anchor="middle" fill="white" font-size="20">StoryCraft</text></svg>');
  const novels = Array.from({ length: 30 }, (_, index) => ({ novelId: `novel-${index}`, authorId: 'author-1', title: `Hành trình qua những mùa gió ${index + 1}`, coverImageUrl: index === 1 ? null : image, genre: 'Fantasy', tags: ['Magic'], authorName: 'Hidden author', synopsis: 'Hidden synopsis', status: index % 2 ? 'COMPLETED' : 'ONGOING', chaptersCount: 12, viewsCount: 1250, likesCount: 99 }));
  try {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      let searchParams;
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => {
        localStorage.setItem('ephurin_access_token', 'fixture-token');
        localStorage.setItem('storycraft-theme', theme);
      }, theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/search')) { searchParams = url.searchParams; data = novels; }
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Đời thường'], tags: ['Magic', 'Adventure'] };
        else if (url.pathname.endsWith('/reading/novels/novel-0')) data = { ...novels[0], chapters: [] };
        else if (url.pathname.endsWith('/novels/novel-0/statistics')) data = { novelId: 'novel-0', totalWords: 1000, followersCount: 0, ratingAverage: null, ratingsCount: 0, isFollowing: false, myRating: null, myReview: null };
        else if (url.pathname.endsWith('/reading/history/me/novel-0')) data = null;
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      try {
        await page.goto(`${base}/reader`);
        await expect(page.getByRole('heading', { name: 'Danh sách truyện', exact: true })).toBeVisible();
        await expect(page.locator('.sc-reader-book')).toHaveCount(30);
        const card = page.locator('.sc-reader-book').first();
        await expect(card).toContainText('12 chương');
        await expect(card).toContainText('1.250 lượt đọc');
        await expect(card).toContainText('Đang ra');
        await expect(card).not.toContainText(/Hidden author|Hidden synopsis|Fantasy|99|Xem truyện/);
        const cover = await card.locator('.sc-book-cover').boundingBox();
        assert.ok(cover.height / cover.width > 1.45);
        if (width === 390) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.locator('#reader-sort')).toHaveCount(1);
        await expect(page.getByLabel('Thứ tự sắp xếp', { exact: true })).toHaveCount(0);
        await page.locator('#reader-sort').selectOption('wordCount:desc');
        await expect.poll(() => `${searchParams?.get('sort')}:${searchParams?.get('order')}`).toBe('wordCount:desc');
        await page.locator('#reader-sort').selectOption('title:asc');
        await expect.poll(() => `${searchParams?.get('sort')}:${searchParams?.get('order')}`).toBe('title:asc');
        await page.getByRole('textbox', { name: 'Lọc theo thể loại', exact: true }).click();
        await page.getByRole('option', { name: 'Fantasy', exact: true }).click();
        await expect.poll(() => searchParams?.get('genre')).toBe('Fantasy');
        await page.getByRole('textbox', { name: 'Lọc theo thẻ', exact: true }).fill('Mag');
        await page.getByRole('option', { name: 'Magic', exact: true }).click();
        await expect.poll(() => searchParams?.get('tag')).toBe('Magic');
        await page.getByRole('button', { name: 'Bỏ lọc theo thể loại', exact: true }).click();
        await expect.poll(() => searchParams?.get('genre')).toBe(null);
        if (width === 390) {
          await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
          await expect(page.getByRole('dialog', { name: 'Bộ lọc', exact: true })).toHaveCount(0);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-catalog.png`) });
        await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Danh sách truyện', exact: true }).click();
        await page.evaluate(() => window.scrollTo(0, 700));
        await expect(page.locator('.sc-navbar')).toHaveClass(/sc-navbar-hidden/);
        await expect.poll(async () => (await page.locator('.sc-navbar').boundingBox()).y).toBeLessThan(0);
        await page.evaluate(() => window.scrollTo(0, 500));
        await expect(page.locator('.sc-navbar')).not.toHaveClass(/sc-navbar-hidden/);
        await expect.poll(async () => (await page.locator('.sc-navbar').boundingBox()).y).toBe(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await card.getByRole('link', { name: `Đọc truyện: ${novels[0].title}`, exact: true }).click();
        await expect(page).toHaveURL(/\/reader\/novels\/novel-0$/);
        await expect(page.locator('.sc-navbar')).not.toHaveClass(/sc-navbar-hidden/);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Reader screenshots: ${output}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
