import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

const novels = Array.from({ length: 8 }, (_, i) => ({ novelId: `n-${i}`, authorId: 'writer', authorName: 'Tác giả thử', title: `Truyện mới ${i + 1}`, synopsis: 'Giới thiệu truyện.', genre: 'Fantasy', chaptersCount: 4, viewsCount: 120, serialStatus: 'ONGOING' }));
const chapters = [1, 3, 7, 9].map((number, index) => ({ chapterId: `c-${index}`, novelId: 'n-0', chapterNumber: number, title: `Chương ${number}: Hành trình`, isVip: false, priceCoins: 0 }));
const history = [{ novelId: 'n-0', chapterId: 'c-1', readAt: '2026-11-06T00:00:00Z', paragraphIndex: 3, pageOffset: 120, novel: { title: novels[0].title, coverImageUrl: null }, chapter: { title: chapters[1].title, chapterNumber: 3 } }];
const statistics = { novelId: 'n-0', totalWords: 1000, followersCount: 1, ratingAverage: null, ratingsCount: 0, isFollowing: false, notificationsEnabled: false, myRating: null, myReview: null };

test('home supports search cancellation, keyboard suggestions, URL restoration and compact mobile filters', { timeout: 120000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-home-personalization-'));
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const [width, theme] of [[1440, 'light'], [375, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], searches = [], aborted = [];
      let privateRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => { if (new URL(request.url()).searchParams.get('q') === 'cu') aborted.push(request.url()); });
      await page.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.includes('/history/me') || url.pathname.includes('/library/me')) privateRequests++;
        if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Đời thường', 'Lãng mạn', 'Trinh thám', 'Thể loại 6', 'Kỳ ảo'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) {
          const q = url.searchParams.get('q');
          if (q) searches.push(q);
          if (q === 'cu') { await new Promise(resolve => setTimeout(resolve, 1000)); data = [{ ...novels[0], title: 'Kết quả cũ' }]; }
          else if (q === 'long') data = novels.map(n => ({ ...n, title: `${n.title} ${'những cuộc phiêu lưu qua các miền đất xa '.repeat(5)}` }));
          else data = url.searchParams.get('sort') === 'likes' ? [...novels].reverse() : novels;
        } else if (url.pathname.includes('/reading/novels/')) data = { ...novels.find(n => url.pathname.endsWith(n.novelId)), chapters };
        else if (url.pathname.endsWith('/statistics')) data = statistics;
        try { await route.fulfill({ json: { success: true, data } }); } catch (error) { if (!route.request().failure()) throw error; }
      });
      try {
        await page.goto(base);
        await page.keyboard.press('Tab');
        await expect(page.getByRole('link', { name: 'Đến nội dung chính', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#home-main')).toBeFocused();
        await page.getByRole('radio', { name: 'Được yêu thích', exact: true }).click();
        await page.getByRole('button', { name: 'Truyện nổi bật tiếp theo', exact: true }).click();
        if (width === 375) {
          await expect(page.getByRole('radio', { name: 'Thể loại 6', exact: true })).toHaveCount(0);
          await page.getByRole('button', { name: 'Xem thêm thể loại', exact: true }).click();
        }
        await page.getByRole('radio', { name: 'Thể loại 6', exact: true }).click();
        if (width === 375) {
          await page.getByRole('button', { name: 'Thu gọn thể loại', exact: true }).click();
          await expect(page.getByRole('radio', { name: 'Thể loại 6', exact: true })).toBeChecked();
        }
        const remembered = page.url();
        assert.equal(new URL(remembered).searchParams.get('featured'), 'likes');
        assert.equal(new URL(remembered).searchParams.get('page'), '2');
        assert.equal(new URL(remembered).searchParams.get('genre'), 'Thể loại 6');
        await page.locator('.sc-home-feature-cover').first().click();
        await expect(page).toHaveURL(`${base}/public/novels/n-3`);
        await page.goBack();
        await expect(page).toHaveURL(remembered);
        await expect(page.getByRole('radio', { name: 'Được yêu thích', exact: true })).toBeChecked();
        await expect(page.locator('.sc-home-page-label')).toHaveText('Trang 2 / 2');
        await expect(page.getByRole('radio', { name: 'Thể loại 6', exact: true })).toBeChecked();
        const search = page.getByRole('combobox', { name: 'Tìm truyện trên trang chủ', exact: true });
        await search.fill('c');
        assert.equal(searches.length, 0);
        await search.fill('cu');
        await expect.poll(() => searches.includes('cu')).toBe(true);
        await search.fill('moi');
        await expect(page.getByRole('option', { name: /Truyện mới 1/ })).toBeVisible();
        await expect.poll(() => aborted.length).toBeGreaterThan(0);
        await expect(page.getByRole('option', { name: 'Kết quả cũ' })).toHaveCount(0);
        await expect(search).toBeFocused();
        await page.keyboard.press('ArrowDown');
        const activeId = await search.getAttribute('aria-activedescendant');
        await expect(page.locator(`[id="${activeId}"]`)).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('.sc-home-search-results')).toHaveCSS('opacity', '1');
        await page.screenshot({ path: path.join(output, `search-${width}-${theme}.png`), fullPage: true });
        await page.locator('.sc-home-search-results').screenshot({ path: path.join(output, `search-panel-${width}-${theme}.png`) });
        await page.keyboard.press('Escape');
        await expect(search).toHaveAttribute('aria-expanded', 'false');
        await expect(search).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`${base}/public/novels/n-0`);
        await page.goBack();
        await search.fill('long');
        await expect(page.getByRole('option')).toHaveCount(5);
        await page.keyboard.press('ArrowUp');
        await expect(page.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
        const panelBounds = await page.locator('.sc-home-search-results').boundingBox();
        await expect.poll(async () => {
          const optionBounds = await page.getByRole('option').last().boundingBox();
          return optionBounds.y >= panelBounds.y - 1 && optionBounds.y + optionBounds.height <= panelBounds.y + panelBounds.height + 1;
        }).toBe(true);
        await page.keyboard.press('Escape');
        await page.locator('.sc-home-preview-trigger').first().click();
        await page.getByRole('dialog').getByRole('link', { name: 'Đăng nhập để theo dõi truyện', exact: true }).click();
        await expect(page).toHaveURL(`${base}/login`);
        assert.equal(privateRequests, 0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Personalization screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});

test('reader saves from preview with feedback, resumes real chapter position and isolates accounts', { timeout: 90000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-home-reader-'));
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const [width, theme] of [[1440, 'light'], [375, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => { localStorage.setItem('storycraft-theme', theme); localStorage.setItem('ephurin_access_token', 'reader-a'); }, theme);
      let saved = false, failSave = false, account = 'reader-a', changes = 0;
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: account, username: account, email: `${account}@example.invalid`, role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) data = novels;
        else if (url.pathname.endsWith('/reading/history/me')) data = account === 'reader-a' ? history : [];
        else if (url.pathname.includes('/reading/novels/')) data = { ...novels[0], chapters };
        else if (url.pathname.endsWith('/statistics')) data = { ...statistics, isFollowing: saved };
        else if (url.pathname.endsWith('/follow')) {
          changes++;
          if (failSave) { await route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Tạm thời không khả dụng' } } }); return; }
          saved = route.request().method() === 'PUT'; data = { ...statistics, isFollowing: saved };
        }
        await route.fulfill({ json: { success: true, data } });
      });
      try {
        await page.goto(base);
        const resume = page.getByRole('region', { name: 'Đọc tiếp', exact: true });
        await expect(resume.getByRole('link', { name: 'Đọc tiếp', exact: true })).toHaveAttribute('href', '/reader/chapters/c-1');
        await expect(resume.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
        await expect(resume).toContainText('Vị trí chương 2 / 4');
        await resume.screenshot({ path: path.join(output, `resume-${width}-${theme}.png`) });
        await page.locator('.sc-home-feature-card .sc-home-preview-trigger').first().click();
        const dialog = page.getByRole('dialog', { name: novels[0].title, exact: true });
        const add = dialog.getByRole('button', { name: 'Theo dõi truyện', exact: true });
        await expect(add).toBeEnabled();
        await add.click();
        await expect(dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.sc-toast-message').last()).toHaveText('Đã theo dõi truyện.');
        await expect(dialog).toHaveCSS('opacity', '1');
        await page.screenshot({ path: path.join(output, `saved-${width}-${theme}.png`), fullPage: true });
        await dialog.screenshot({ path: path.join(output, `library-panel-${width}-${theme}.png`) });
        failSave = true;
        await dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true }).click();
        await expect(page.locator('.sc-toast-message').last()).toHaveText('Chưa cập nhật được trạng thái theo dõi. Hãy thử lại.');
        await expect(dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true })).toHaveAttribute('aria-pressed', 'true');
        failSave = false;
        await dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true }).click();
        await expect(add).toHaveAttribute('aria-pressed', 'false');
        assert.equal(changes, 3);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        // Exercise the app's SPA logout so old private cache cannot appear for another account.
        await page.getByTestId('shell-avatar-btn').click();
        await page.getByTestId('shell-logout-btn').click();
        await expect(resume).toHaveCount(0);
        account = 'reader-b';
        await page.evaluate(() => localStorage.setItem('ephurin_access_token', 'reader-b'));
        await page.goto(base);
        await expect(page.getByTestId('shell-session')).toHaveAttribute('data-username', 'reader-b');
        await expect(resume).toHaveCount(0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Reader personalization screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
