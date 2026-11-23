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
  const novels = Array.from({ length: 16 }, (_, index) => ({
    novelId: `novel-${index}`,
    authorId: 'author-1',
    authorName: 'Tác giả thử',
    title: `Hành trình qua những mùa gió ${index + 1}`,
    synopsis: 'Một chuyến hành trình qua những miền ký ức.',
    coverImageUrl: index % 3 ? image : null,
    genre: index % 2 ? 'Đời thường' : 'Fantasy',
    genres: [index % 2 ? 'Đời thường' : 'Fantasy'],
    tags: ['Phiêu lưu'],
    status: index < 5 ? 'COMPLETED' : 'ONGOING',
    serialStatus: index < 5 ? 'COMPLETED' : 'ONGOING',
    chaptersCount: 12,
    viewsCount: 1250 - index,
    likesCount: index + 1,
    updatedAt: '2026-11-01T10:00:00Z',
    latestChapter: {
      chapterId: `chapter-${index}`,
      chapterNumber: 12,
      title: index === 0 ? 'Chương 12: Ngày trở về' : `Chương 12: Hồi ${index + 1}`,
      publishedAt: '2026-11-01T10:00:00Z'
    }
  }));
  const latestChapters = Array.from({ length: 10 }, (_, index) => ({
    chapterId: `latest-ch-${index}`,
    novelId: novels[index].novelId,
    chapterNumber: 12 + (index === 0 ? 1 : 0),
    title: index === 0 ? 'Chương 13: Ngày trở về' : `Chương 12: Hồi ${index + 1}`,
    publishedAt: '2026-11-01T10:00:00Z',
    novelTitle: novels[index].title,
    coverImageUrl: novels[index].coverImageUrl,
    genre: novels[index].genre,
    genres: novels[index].genres
  }));

  try {
    for (const role of ['GUEST', 'READER']) for (const width of [1440, 1024, 768, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width === 375,
        reducedMotion: width === 375 ? 'reduce' : 'no-preference'
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ theme, role }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
      }, { theme, role });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) {
          data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        } else if (url.pathname.endsWith('/reading/filters')) {
          data = { genres: ['Fantasy', 'Đời thường'], tags: ['Phiêu lưu'] };
        } else if (url.pathname.endsWith('/reading/chapters/latest')) {
          data = latestChapters;
        } else if (url.pathname.endsWith('/reading/novels/random')) {
          data = { novelId: 'outside-top-99', title: 'Truyện ngoài danh sách top' };
        } else if (url.pathname.endsWith('/reading/novels/outside-top-99')) {
          data = { ...novels[0], novelId: 'outside-top-99', title: 'Truyện ngoài danh sách top', chapters: [] };
        } else if (url.pathname.endsWith('/reading/search')) {
          const status = url.searchParams.get('status');
          data = novels.filter(novel => !status || novel.status === status);
          if (url.searchParams.get('sort') === 'likes') data = [...data].reverse();
        }
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      try {
        const catalog = role === 'READER' ? '/reader' : '/public';
        await page.goto(base);
        await expect(page).toHaveURL(`${base}/`);
        await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Thảo luận nổi bật', exact: true })).toHaveCount(0);

        const chaptersSection = page.getByRole('region', { name: 'Chương mới cập nhật', exact: true });
        await expect(chaptersSection.locator('.sc-home-chapter-row')).toHaveCount(8);
        await expect(chaptersSection.locator('.sc-home-chapter-row').first()).toHaveAttribute('href', `${catalog}/chapters/latest-ch-0`);
        if (width >= 1024) {
          await expect(chaptersSection.locator('.sc-home-chapter-row').first()).toContainText('Chương 13: Ngày trở về');
        }
        await chaptersSection.getByRole('button', { name: 'Xem thêm →', exact: true }).click();
        await expect(chaptersSection.locator('.sc-home-chapter-row')).toHaveCount(10);

        const featuredSection = page.getByRole('region', { name: 'Truyện nổi bật', exact: true });
        await expect(featuredSection.locator('.sc-home-featured-card')).toHaveCount(12);
        const firstCover = featuredSection.locator('.sc-home-featured-cover-link').first();
        await expect(firstCover).toHaveAttribute('href', `${catalog}/novels/novel-0`);

        const featureTabs = featuredSection.getByRole('tablist', { name: 'Lọc truyện nổi bật', exact: true });
        await expect(featureTabs.getByRole('tab', { name: 'Mới cập nhật', exact: true })).toBeVisible();
        await featureTabs.getByRole('tab', { name: 'Được yêu thích', exact: true }).click();
        await expect(featureTabs.getByRole('tab', { name: 'Được yêu thích', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(firstCover).toHaveAttribute('href', `${catalog}/novels/novel-15`);
        await featureTabs.getByRole('tab', { name: 'Đang hot', exact: true }).click();
        await expect(firstCover).toHaveAttribute('href', `${catalog}/novels/novel-0`);

        const rankingSection = page.getByRole('region', { name: 'Bảng xếp hạng truyện', exact: true });
        await expect(rankingSection.getByRole('tab', { name: 'Mới cập nhật', exact: true })).toBeVisible();
        await expect(rankingSection.locator('.sc-home-rank-list li')).toHaveCount(7);
        await rankingSection.getByRole('tab', { name: 'Yêu thích', exact: true }).click();
        await expect(rankingSection.locator('.sc-home-rank-row').first()).toHaveAttribute('href', `${catalog}/novels/novel-15`);

        const previewTrigger = featuredSection.locator('.sc-home-featured-card .sc-home-preview-trigger').first();
        await previewTrigger.focus();
        await page.keyboard.press('Enter');
        const quickPreview = page.getByRole('dialog', { name: novels[0].title, exact: true });
        await expect(quickPreview).toBeVisible();
        await expect(quickPreview).toHaveCSS('opacity', '1');
        await expect(quickPreview).toContainText(novels[0].synopsis);
        await expect(quickPreview.getByRole('link', { name: 'Tác giả thử', exact: true })).toHaveAttribute('href', '/authors/author-1');
        await expect(quickPreview.getByRole('link', { name: 'Đọc truyện', exact: true })).toHaveAttribute('href', `${catalog}/novels/novel-0`);
        const previewBounds = await quickPreview.boundingBox();
        assert.ok(previewBounds.x >= 0 && previewBounds.x + previewBounds.width <= width);
        await page.keyboard.press('Escape');
        await expect(quickPreview).toHaveCount(0);
        await expect(previewTrigger).toBeFocused();

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`), fullPage: true });

        // Tag-only collection ('Hành trình trưởng thành' matches tag 'Phiêu lưu', no matching genre) must link with ?tag=
        const collections = page.getByRole('region', { name: 'Bộ sưu tập theo gu đọc', exact: true });
        const journeyCard = collections.locator('.is-col-journey');
        await expect(journeyCard).toHaveAttribute('href', `${catalog}?tag=${encodeURIComponent('Phiêu lưu')}&sort=views:desc`);
        if (width === 1440 && theme === 'light') {
          await journeyCard.click();
          await expect(page).toHaveURL(`${base}${catalog}?tag=${encodeURIComponent('Phiêu lưu')}&sort=views:desc`);
          await expect(page.locator('#sc-catalog-sidebar').getByRole('checkbox', { name: 'Phiêu lưu', exact: true })).toBeChecked();
          await page.goto(base);

          // Random button must pick from the dedicated full-catalog endpoint (including novels outside top lists).
          await page.getByTestId('home-hero-random').click();
          await expect(page).toHaveURL(`${base}${catalog}/novels/outside-top-99`);
          await page.goto(base);
        }

        await page.getByTestId('home-hero-explore').click();
        await expect(page).toHaveURL(`${base}${catalog}`);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }

    for (const role of ['AUTHOR', 'ADMIN']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('ephurin_access_token', 'fixture-token'));
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'writer-1', username: 'writer', email: 'writer@example.invalid', role, status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/chapters/latest')) data = latestChapters;
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
