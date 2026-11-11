import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

// Run after npm run build: exercise the actual router and production CSS together.
test('main reader UI retains animated tools, themes and guest author profiles', { timeout: 180000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-main-ui-'));
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="150"%3E%3Crect width="100" height="150" fill="%23dc8363"/%3E%3C/svg%3E';
  const chapters = [1, 2].map(n => ({ chapterId: `c-${n}`, novelId: 'novel-1', chapterNumber: n, title: `Chương ${n}`, content: 'Một đoạn văn trong chương truyện. '.repeat(250), isVip: false, priceCoins: 0 }));
  const novel = { novelId: 'novel-1', authorId: 'author-1', authorName: 'Tác giả thử', title: 'Truyện thử', genre: 'Fantasy', synopsis: 'Giới thiệu truyện.', serialStatus: 'ONGOING', coverImageUrl: image, chaptersCount: 2, likesCount: 1, viewsCount: 42, chapters };
  try {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let preferences = { fontFamily: 'system-ui', fontSize: 18, lineHeight: 1.8, background: 'LIGHT' };
      await page.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/search')) data = [novel];
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = novel;
        else if (/\/reading\/chapters\/c-\d$/.test(url.pathname)) data = chapters.find(chapter => url.pathname.endsWith(chapter.chapterId));
        else if (url.pathname.endsWith('/reading/preferences/me')) {
          if (route.request().method() === 'PUT') preferences = route.request().postDataJSON();
          data = preferences;
        } else if (url.pathname.endsWith('/authors/author-1/profile')) data = {
          authorId: 'author-1', username: 'author', displayName: 'Tác giả với tên dài để kiểm tra xuống dòng trên điện thoại',
          avatarUrl: image, bannerUrl: image, bio: 'Giới thiệu tác giả.', joinedAt: '2025-01-01',
          publishingSchedule: 'Thứ Tư hàng tuần', totalViews: 42, totalWords: 1200, followersCount: 3, isFollowing: false, novels: [novel]
        };
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      try {
        await page.goto(`${base}/public`);
        await expect(page.getByRole('heading', { name: 'Thư viện công khai', exact: true })).toBeVisible();
        await expect(page.locator('.sc-novel-card')).toHaveCount(1);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (width === 390) {
          await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
          await expect(page.getByRole('dialog', { name: 'Bộ lọc', exact: true })).toBeVisible();
          await expect(page.getByRole('dialog', { name: 'Bộ lọc', exact: true })).toHaveCSS('transform', 'none');
          const bounds = await page.getByRole('dialog', { name: 'Bộ lọc', exact: true }).boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
          await page.screenshot({ path: path.join(output, `${width}-${theme}-filters.png`) });
          await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
        }
        await noOverflow();
        await page.screenshot({ path: path.join(output, `${width}-${theme}-public.png`), fullPage: true });

        await page.goto(`${base}/authors/author-1`);
        await expect(page.getByTestId('author-profile-login-cta')).toBeVisible();
        await expect(page.locator('.sc-profile-stats > div')).toHaveCount(4);
        await page.getByRole('button', { name: /^Phóng to Ảnh đại diện/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await noOverflow();
        await page.screenshot({ path: path.join(output, `${width}-${theme}-profile.png`), fullPage: true });

        await page.evaluate(() => localStorage.setItem('ephurin_access_token', 'fixture-token'));
        await page.goto(`${base}/reader`);
        await expect(page.getByRole('heading', { name: 'Danh sách truyện', exact: true })).toBeVisible();
        await expect(page.locator('.sc-novel-card')).toHaveCount(1);
        await noOverflow();
        await page.screenshot({ path: path.join(output, `${width}-${theme}-reader.png`), fullPage: true });

        await page.goto(`${base}/reader/chapters/c-1`);
        await expect(page.locator('.chapter-prose')).toBeVisible();
        if (width === 390) await page.locator('.chapter-prose > p').first().click();
        await page.getByRole('button', { name: 'Mục lục', exact: true }).click();
        const toc = page.getByRole('dialog', { name: 'Mục lục chương' });
        await toc.getByRole('link', { name: 'Chương 2', exact: true }).click();
        await expect(page).toHaveURL(/\/reader\/chapters\/c-2$/);
        if (width === 390) await page.locator('.chapter-prose > p').first().click();
        await page.getByRole('button', { name: 'Tùy chỉnh đọc', exact: true }).click();
        const settings = page.getByRole('dialog', { name: 'Tùy chỉnh đọc', exact: true });
        for (const [background, label, color] of [['LIGHT', 'Sáng', 'rgb(41, 45, 43)'], ['SEPIA', 'Giấy ngà', 'rgb(48, 44, 37)'], ['DARK', 'Tối', 'rgb(238, 233, 225)']]) {
          await settings.getByRole('button', { name: label, exact: true }).click();
          await expect(settings.getByRole('status')).toHaveText('Đã lưu tùy chỉnh.');
          await expect.poll(() => preferences.background).toBe(background);
          await expect(page.locator('.chapter-prose')).toHaveCSS('color', color);
        }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('progressbar', { name: 'Tiến độ đọc chương' })).toBeAttached();
        await noOverflow();
        await page.screenshot({ path: path.join(output, `${width}-${theme}-chapter.png`) });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Main UI integration screenshots: ${output}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
