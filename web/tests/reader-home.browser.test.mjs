import test from 'node:test';
import assert from 'node:assert/strict';
import { readerEvidence } from './reader-browser-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('public homepage keeps root URL, uses live catalog sections and links guests/readers to their catalog', { timeout: 180000 }, async () => {
  const output = await readerEvidence('storycraft-reader-home-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#775f55"/><circle cx="100" cy="110" r="60" fill="#e9c899"/><text x="100" y="225" text-anchor="middle" fill="white" font-size="20">StoryCraft</text></svg>');
  const novels = Array.from({ length: 16 }, (_, index) => ({ novelId: `novel-${index}`, authorId: 'author-1', title: `Hành trình qua những mùa gió ${index + 1}`, coverImageUrl: index % 3 ? image : null, genre: index % 2 ? 'Đời thường' : 'Fantasy', status: index < 5 ? 'COMPLETED' : 'ONGOING', chaptersCount: 12, viewsCount: 1250 - index, likesCount: index, updatedAt: '2026-11-01T10:00:00Z', latestChapter: { chapterId: `chapter-${index}`, chapterNumber: 12, title: 'Ngày trở về', publishedAt: '2026-11-01T10:00:00Z' } }));
  novels[0].latestChapter.title = 'Chương 12: Ngày trở về';
  novels[0].authorName = 'Tác giả thử';
  novels[0].synopsis = 'Một chuyến hành trình qua những miền ký ức.';
  try {
    for (const role of ['GUEST', 'READER']) for (const width of [1440, 1024, 768, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375,
        reducedMotion: width === 375 ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ theme, role }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
      }, { theme, role });
      let lastGenre = '';
      let releaseEmpty;
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Đời thường', 'Trống'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) {
          lastGenre = url.searchParams.get('genre') || '';
          if (lastGenre === 'Trống') await new Promise(resolve => { releaseEmpty = resolve; });
          data = novels.filter(novel => (!lastGenre || novel.genre === lastGenre) && (!url.searchParams.get('status') || novel.status === url.searchParams.get('status')));
          if (url.searchParams.get('sort') === 'likes') data = [...data].reverse();
        }
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      try {
        const catalog = role === 'READER' ? '/reader' : '/public';
        await page.goto(base);
        await expect(page).toHaveURL(`${base}/`);
        await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toHaveCSS('font-size', '24px');
        await expect(page.locator('.sc-home-feature-cover')).toHaveCount(4);
        await expect(page.locator('.sc-home-carousel-dot').first()).toHaveCSS('height', width === 375 ? '44px' : '24px');
        await expect(page.locator('.sc-home-ranking li')).toHaveCount(5);
        await expect(page.locator('.sc-home-discovery .sc-home-compact')).toHaveCount(6);
        await expect(page.locator('.sc-home-completed .sc-home-compact')).toHaveCount(5);
        await expect(page.locator('.sc-home-update').first()).toContainText('Chương 12: Ngày trở về');
        await expect(page.locator('.sc-home-chapter').first()).toHaveAttribute('href', `${catalog}/chapters/chapter-0`);
        const first = page.locator('.sc-home-feature-cover').first();
        await expect(first).toHaveAttribute('href', `${catalog}/novels/novel-0`);
        await page.getByRole('button', { name: 'Truyện nổi bật tiếp theo', exact: true }).click();
        await expect(first).toHaveAttribute('href', `${catalog}/novels/novel-4`);
        await expect(page.locator('.sc-home-page-label')).toHaveText('Trang 2 / 2');
        const sorts = page.getByRole('radiogroup', { name: 'Chọn truyện nổi bật' });
        await sorts.getByRole('radio', { name: 'Nổi bật', exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(sorts.getByRole('radio', { name: 'Được yêu thích', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(first).toHaveAttribute('href', `${catalog}/novels/novel-15`);
        await expect(page.locator('.sc-home-page-label')).toHaveText('Trang 1 / 2');
        await sorts.getByRole('radio', { name: 'Được yêu thích', exact: true }).click();
        await expect(sorts.getByRole('radio', { name: 'Được yêu thích', exact: true })).toHaveAttribute('aria-checked', 'true');
        await page.getByRole('radio', { name: 'Nổi bật', exact: true }).click();
        await expect(first).toHaveAttribute('href', `${catalog}/novels/novel-0`);
        await expect(page.locator('.sc-home-feature-grid')).toHaveCSS('opacity', '1');
        const previewTrigger = page.locator('.sc-home-feature-card .sc-home-preview-trigger').first();
        await previewTrigger.focus();
        await page.keyboard.press('Enter');
        const quickPreview = page.getByRole('dialog', { name: novels[0].title, exact: true });
        await expect(quickPreview).toBeVisible();
        await expect(quickPreview).toHaveCSS('opacity', '1');
        await expect(quickPreview).toContainText(novels[0].synopsis);
        await expect(quickPreview.getByRole('link', { name: 'Tác giả thử', exact: true })).toHaveAttribute('href', '/authors/author-1');
        await expect(quickPreview.getByRole('link', { name: 'Đọc truyện', exact: true })).toHaveAttribute('href', `${catalog}/novels/novel-0`);
        await expect(page).toHaveURL(`${base}/`);
        const previewBounds = await quickPreview.boundingBox();
        assert.ok(previewBounds.x >= 0 && previewBounds.x + previewBounds.width <= width);
        if (width === 375 || width === 1440) {
          await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-preview.png`), fullPage: true });
          if (role === 'GUEST') await quickPreview.screenshot({ path: path.join(output, `${width}-${theme}-preview-panel.png`) });
        }
        await page.keyboard.press('Escape');
        await expect(quickPreview).toHaveCount(0);
        await expect(previewTrigger).toBeFocused();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`), fullPage: true });
        const genres = page.getByRole('radiogroup', { name: 'Khám phá theo thể loại' });
        await genres.getByRole('radio', { name: 'Trống', exact: true }).click();
        try {
          await expect.poll(() => typeof releaseEmpty).toBe('function');
          await expect(page.locator('#home-discovery-results')).toHaveAttribute('aria-busy', 'true');
          await expect(page.locator('.sc-home-results-summary')).toHaveText('Đang tìm truyện Trống…');
          await expect(page.locator('#home-discovery-results .sc-home-loading-compact')).toBeVisible();
          await expect(page.getByRole('button', { name: 'Đổi gợi ý', exact: true })).toBeDisabled();
        } finally { releaseEmpty?.(); }
        await expect(page.getByRole('heading', { name: 'Chưa có truyện thuộc thể loại này', exact: true })).toBeVisible();
        await expect(page.locator('.sc-home-results-summary')).toHaveText('0 gợi ý cho thể loại Trống');
        await page.getByRole('button', { name: 'Bỏ bộ lọc', exact: true }).click();
        await expect(genres.getByRole('radio', { name: 'Tất cả', exact: true })).toBeChecked();
        await expect(page.locator('.sc-home-discovery .sc-home-compact')).toHaveCount(6);
        await genres.getByRole('radio', { name: 'Đời thường', exact: true }).click();
        await expect.poll(() => lastGenre).toBe('Đời thường');
        await expect(page.locator('.sc-home-discovery .sc-home-compact')).toHaveCount(6);
        await expect(page.locator('.sc-home-results-summary')).toHaveText('6 gợi ý cho thể loại Đời thường');
        await genres.getByRole('radio', { name: 'Đời thường', exact: true }).click();
        await expect(genres.getByRole('radio', { name: 'Đời thường', exact: true })).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('#home-discovery-results')).toHaveAttribute('aria-busy', 'false');
        await page.getByRole('button', { name: 'Đổi gợi ý', exact: true }).click();
        await page.getByRole('link', { name: 'Tất cả truyện Đời thường', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${catalog}\\?genre=`));
        if (width === 375) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Lọc theo thể loại', exact: true })).toHaveValue('Đời thường');
        await page.goto(base);
        await page.getByRole('combobox', { name: 'Tìm truyện trên trang chủ', exact: true }).fill('Hành trình');
        await page.getByRole('search').getByRole('button', { name: 'Tìm truyện', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${catalog}\\?q=`));
        if (width === 375) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Tìm truyện', exact: true })).toHaveValue('Hành trình');
        assert.deepEqual(errors, []);
      } finally { releaseEmpty?.(); await context.close(); }
    }
    for (const role of ['AUTHOR', 'ADMIN']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('ephurin_access_token', 'fixture-token'));
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'writer-1', username: 'writer', email: 'writer@example.invalid', role, status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/search')) data = novels;
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy'], tags: [] };
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      try {
        await page.goto(base);
        await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toBeVisible();
        await expect(page.locator('.sc-brand')).toHaveAttribute('href', '/');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } finally { await context.close(); }
    }
    console.log(`Homepage screenshots: ${output}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
