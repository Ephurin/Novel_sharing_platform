import test from 'node:test';
import assert from 'node:assert/strict';
import { readerEvidence } from './reader-browser-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { mockReadingLocators } from './helpers/reader-locators.mjs';
import { facetCheckbox, facetTrigger, filterBar, statusRadio } from './helpers/reader-filters.mjs';

test('catalog paginates real totals, remembers filters and exposes quick previews for guests and readers', { timeout: 150000 }, async () => {
  const output = await readerEvidence('storycraft-catalog-pagination-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const novels = Array.from({ length: 47 }, (_, index) => ({ novelId: `n-${index}`, authorId: 'writer', title: `Truyện ${index + 1}`, synopsis: 'Giới thiệu thử nghiệm.', authorName: 'Tác giả thử', genre: 'Fantasy', genres: index % 2 ? ['Fantasy'] : ['Fantasy', 'Cultivation'], tags: index % 3 ? ['Magic'] : ['Magic', 'Adventure'], serialStatus: 'ONGOING', chaptersCount: 12, viewsCount: 1200 }));
  try {
    for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 375, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], searches = [];
      let following = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ role, theme }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
      }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [], meta = {};
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'r-1', username: 'reader', email: 'r@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Cultivation'], tags: ['Magic', 'Adventure'] };
        else if (url.pathname.endsWith('/reading/search')) {
          searches.push(url.searchParams);
          const all = url.searchParams.get('q') === 'none' ? [] : novels.filter(novel => url.searchParams.getAll('genres').every(name => novel.genres.includes(name)) && url.searchParams.getAll('tags').every(name => novel.tags.includes(name)));
          const number = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
          data = all.slice((number - 1) * limit, number * limit);
          meta = { totalItems: all.length, totalPages: Math.ceil(all.length / limit), page: number };
        } else if (url.pathname.includes('/reading/novels/')) data = { ...novels.find(n => url.pathname.endsWith(n.novelId)), chapters: [] };
        else if (url.pathname.endsWith('/statistics') || url.pathname.endsWith('/follow')) {
          if (route.request().method() === 'PUT') following = true;
          data = { novelId: 'n-0', totalWords: 0, followersCount: 1, ratingAverage: null, ratingsCount: 0, isFollowing: following, notificationsEnabled: false };
        }
        await route.fulfill({ json: { success: true, data, meta } });
      });
      try {
        const catalog = role === 'GUEST' ? '/public' : '/reader';
        await mockReadingLocators(page, novels);
        await page.goto(base + catalog);
        await expect(page.locator('.sc-catalog-story')).toHaveCount(20);
        await expect(page.locator('.sc-catalog-title-count')).toHaveText('(47)');
        await page.getByRole('navigation', { name: 'Phân trang' }).getByRole('button', { name: 'Trang 3', exact: true }).click();
        await expect(page.locator('.sc-catalog-story')).toHaveCount(7);
        await expect(page.locator('.sc-catalog-title-count')).toHaveText('(47)');
        await expect(page).toHaveURL(/page=3/);
        await page.locator('.sc-catalog-cover').first().click();
        await expect(page).toHaveURL(base + '/truyen/n-40');
        await page.goBack();
        await expect(page.locator('.sc-catalog-story')).toHaveCount(7);
        await expect(page).toHaveURL(/page=3/);
        await page.locator('#reader-sort').selectOption('title:asc');
        await expect.poll(() => searches.at(-1)?.get('page')).toBe('1');
        await (await facetCheckbox(page, 'Thể loại', 'Fantasy')).check();
        await (await facetCheckbox(page, 'Thể loại', 'Cultivation')).check();
        await (await facetCheckbox(page, 'Thẻ', 'Magic')).check();
        await (await facetCheckbox(page, 'Thẻ', 'Adventure')).check();
        await expect(page.locator('.sc-catalog-title-count')).toHaveText('(8)');
        await expect(page.locator('.sc-catalog-story')).toHaveCount(8);
        assert.deepEqual(searches.at(-1).getAll('genres'), ['Fantasy', 'Cultivation']);
        assert.deepEqual(searches.at(-1).getAll('tags'), ['Magic', 'Adventure']);
        await page.reload();
        await expect(page.locator('.sc-catalog-story')).toHaveCount(8);
        await expect(page.locator('#reader-sort')).toHaveValue('title:asc');
        await expect((await facetCheckbox(page, 'Thể loại', 'Fantasy'))).toBeChecked();
        await expect((await facetCheckbox(page, 'Thể loại', 'Cultivation'))).toBeChecked();
        await expect((await facetCheckbox(page, 'Thẻ', 'Magic'))).toBeChecked();
        await expect((await facetCheckbox(page, 'Thẻ', 'Adventure'))).toBeChecked();
        await filterBar(page).getByRole('button', { name: /Đặt lại bộ lọc/ }).click();
        await expect(page.locator('.sc-catalog-story')).toHaveCount(20);
        await expect(page.locator('.sc-catalog-title-count')).toHaveText('(47)');
        await page.goto(`${base}${catalog}?q=none`);
        await expect(page.getByRole('heading', { name: 'Chưa tìm thấy truyện phù hợp', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
        await expect(page.locator('.sc-catalog-story')).toHaveCount(20);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`), fullPage: true });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Catalog pagination screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
