import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('catalog paginates real totals, remembers filters and exposes quick previews for guests and readers', { timeout: 150000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-catalog-pagination-'));
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
        await page.goto(base + catalog);
        await expect(page.locator('.sc-reader-book')).toHaveCount(20);
        await expect(page.locator('.sc-catalog-summary')).toHaveText('47 truyện · Trang 1 / 3');
        await page.getByRole('navigation', { name: 'Phân trang truyện' }).getByRole('button', { name: 'Trang 3', exact: true }).click();
        await expect(page.locator('.sc-reader-book')).toHaveCount(7);
        await expect(page.locator('.sc-catalog-summary')).toHaveText('47 truyện · Trang 3 / 3');
        await expect(page).toHaveURL(/page=3/);
        await page.locator('.sc-book-cover').first().click();
        await expect(page).toHaveURL(base + catalog + '/novels/n-40');
        await page.goBack();
        await expect(page.locator('.sc-catalog-summary')).toHaveText('47 truyện · Trang 3 / 3');
        if (width === 375) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await page.locator('#reader-sort').selectOption('title:asc');
        await expect.poll(() => searches.at(-1)?.get('page')).toBe('1');
        await page.getByRole('textbox', { name: 'Lọc theo thể loại', exact: true }).click();
        await page.getByRole('option', { name: 'Fantasy', exact: true }).click();
        await page.getByRole('option', { name: 'Cultivation', exact: true }).click();
        await page.keyboard.press('Escape');
        await page.getByRole('textbox', { name: 'Lọc theo thẻ', exact: true }).click();
        await page.getByRole('option', { name: 'Magic', exact: true }).click();
        await page.getByRole('option', { name: 'Adventure', exact: true }).click();
        await page.keyboard.press('Escape');
        if (width === 375) await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Bỏ bộ lọc Thể loại: Fantasy', exact: true })).toBeVisible();
        await expect(page.locator('.sc-catalog-summary')).toHaveText('8 truyện · Trang 1 / 1');
        assert.deepEqual(searches.at(-1).getAll('genres'), ['Fantasy', 'Cultivation']);
        assert.deepEqual(searches.at(-1).getAll('tags'), ['Magic', 'Adventure']);
        if (width === 1440) {
          await page.keyboard.press('Escape');
          const controls = await page.locator('.sc-catalog-filter-row .mantine-Input-input').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
          assert.ok(Math.max(...controls) - Math.min(...controls) < 1, 'Filter controls must align');
          const heights = await page.locator('.sc-catalog-filter-row .mantine-Input-input').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
          assert.ok(heights.every(height => Math.abs(height - 40) < 1), 'Desktop filter controls must share the 40px height');
          const chip = await page.getByRole('button', { name: 'Bỏ bộ lọc Thể loại: Fantasy', exact: true }).boundingBox();
          const reset = await page.getByRole('button', { name: 'Xóa tất cả bộ lọc', exact: true }).boundingBox();
          assert.ok(Math.abs(chip.y + chip.height / 2 - reset.y - reset.height / 2) < 1, 'Reset must align with chips');
        }
        await page.reload();
        await expect(page.locator('.sc-reader-book')).toHaveCount(8);
        if (width === 375) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.locator('#reader-sort')).toHaveValue('title:asc');
        await expect(page.locator('.mantine-MultiSelect-pill').filter({ hasText: 'Fantasy' })).toBeVisible();
        await expect(page.locator('.mantine-MultiSelect-pill').filter({ hasText: 'Cultivation' })).toBeVisible();
        await page.getByRole('textbox', { name: 'Tìm truyện', exact: true }).fill('none');
        if (width === 375) await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Không tìm thấy truyện', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Bỏ bộ lọc', exact: true }).click();
        await expect(page.locator('.sc-reader-book')).toHaveCount(20);
        await expect(page.locator('.sc-catalog-active')).toHaveCount(0);
        await page.locator('.sc-reader-book .sc-home-preview-trigger').first().click();
        const dialog = page.getByRole('dialog', { name: 'Truyện 1', exact: true });
        await expect(dialog).toContainText('Giới thiệu thử nghiệm.');
        const read = dialog.getByRole('link', { name: 'Đọc truyện' });
        const color = await read.evaluate(node => getComputedStyle(node).color);
        await read.hover();
        await expect(read).toHaveCSS('text-decoration-line', 'none');
        await expect(read).not.toHaveCSS('color', color);
        if (role === 'READER') {
          await dialog.getByRole('button', { name: 'Theo dõi truyện', exact: true }).click();
          await expect(dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true })).toBeVisible();
        } else await expect(dialog.getByRole('link', { name: 'Đăng nhập để theo dõi truyện' })).toHaveAttribute('href', '/login');
        await dialog.getByRole('button', { name: 'Đóng xem nhanh' }).focus();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('.sc-reader-book .sc-home-preview-trigger').first()).toBeFocused();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`), fullPage: true });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Catalog pagination screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
