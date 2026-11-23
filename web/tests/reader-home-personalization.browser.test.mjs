import test from 'node:test';
import assert from 'node:assert/strict';
import { readerEvidence } from './reader-browser-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

const novels = Array.from({ length: 8 }, (_, i) => ({
  novelId: `n-${i}`,
  authorId: 'writer',
  authorName: 'Tác giả thử',
  title: `Truyện mới ${i + 1}`,
  synopsis: 'Giới thiệu truyện.',
  genre: 'Fantasy',
  genres: ['Fantasy'],
  chaptersCount: 4,
  viewsCount: 120 - i,
  likesCount: i + 1,
  serialStatus: 'ONGOING'
}));
const chapters = [1, 3, 7, 9].map((number, index) => ({ chapterId: `c-${index}`, novelId: 'n-0', chapterNumber: number, title: `Chương ${number}: Hành trình`, isVip: false, priceCoins: 0 }));
const history = [{ novelId: 'n-0', chapterId: 'c-1', readChapterIds: ['c-1'], readAt: '2026-11-06T00:00:00Z', paragraphIndex: 3, pageOffset: 120, novel: { title: novels[0].title, coverImageUrl: null }, chapter: { title: chapters[1].title, chapterNumber: 3 } }];
const statistics = { novelId: 'n-0', totalWords: 1000, followersCount: 1, ratingAverage: null, ratingsCount: 0, isFollowing: false, notificationsEnabled: false, myRating: null, myReview: null };

test('home supports search cancellation, keyboard suggestions, URL restoration and relevance live search', { timeout: 120000 }, async () => {
  const output = await readerEvidence('storycraft-home-personalization-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const [width, theme] of [[1440, 'light'], [375, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], searches = [], aborted = [], sorts = [];
      let privateRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => { if (new URL(request.url()).searchParams.get('q') === 'cu') aborted.push(request.url()); });
      await page.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [];
        if (url.pathname.includes('/history/me') || url.pathname.includes('/library/me')) privateRequests++;
        if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Đời thường'], tags: [] };
        else if (url.pathname.endsWith('/reading/search')) {
          const q = url.searchParams.get('q');
          if (q) {
            searches.push(q);
            sorts.push(url.searchParams.get('sort'));
          }
          if (q === 'cu') { await new Promise(resolve => setTimeout(resolve, 1000)); data = [{ ...novels[0], title: 'Kết quả cũ' }]; }
          else if (q === 'long') data = novels.map(n => ({ ...n, title: `${n.title} ${'những cuộc phiêu lưu qua các miền đất xa '.repeat(5)}` }));
          else data = url.searchParams.get('sort') === 'likes' ? [...novels].reverse() : novels;
        } else if (url.pathname.includes('/reading/novels/')) data = { ...novels.find(n => url.pathname.endsWith(n.novelId)), chapters };
        else if (url.pathname.endsWith('/statistics')) data = statistics;
        try { await route.fulfill({ json: { success: true, data } }); } catch (error) { if (!route.request().failure()) throw error; }
      });
      try {
        await page.goto(base);
        const skipLink = page.getByRole('link', { name: 'Đến nội dung chính', exact: true });
        await expect(skipLink).toBeAttached();
        await page.keyboard.press('Tab');
        await expect(skipLink).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#home-main')).toBeFocused();

        await page.getByRole('tab', { name: 'Được yêu thích', exact: true }).click();
        const remembered = page.url();
        assert.equal(new URL(remembered).searchParams.get('tab'), 'liked');
        await page.locator('.sc-home-featured-cover-link').first().click();
        await expect(page).toHaveURL(`${base}/public/novels/n-7`);
        await page.goBack();
        await expect(page).toHaveURL(remembered);
        await expect(page.getByRole('tab', { name: 'Được yêu thích', exact: true })).toHaveAttribute('aria-selected', 'true');

        if (width === 375) {
          await page.getByRole('button', { name: 'Tìm kiếm truyện', exact: true }).click();
        }
        const search = page.getByTestId('navbar-global-search-input');
        await search.fill('cu');
        await expect.poll(() => searches.includes('cu')).toBe(true);
        await search.fill('moi');
        await expect(page.getByRole('option', { name: /Truyện mới 1/ })).toBeVisible();
        await expect.poll(() => aborted.length).toBeGreaterThan(0);
        await expect(page.getByRole('option', { name: 'Kết quả cũ' })).toHaveCount(0);
        assert.ok(sorts.includes('relevance'), 'Live search must pass sort=relevance');
        await expect(search).toBeFocused();
        await page.keyboard.press('ArrowDown');
        const activeId = await search.getAttribute('aria-activedescendant');
        await expect(page.locator(`[id="${activeId}"]`)).toHaveAttribute('aria-selected', 'true');
        await page.screenshot({ path: path.join(output, `search-${width}-${theme}.png`), fullPage: true });
        await page.keyboard.press('Escape');
        await expect(search).toHaveAttribute('aria-expanded', 'false');
        if (width === 375) {
          await page.getByRole('button', { name: 'Tìm kiếm truyện', exact: true }).click();
        }
        await search.focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('option', { name: /Truyện mới 1/ })).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`${base}/public/novels/n-0`);
        await page.goBack();
        await expect(page).toHaveURL(remembered);

        // Submitting the live search form without selecting an option opens /tim-kiem preserving relevance sort.
        if (width === 375) {
          await page.getByRole('button', { name: 'Tìm kiếm truyện', exact: true }).click();
        }
        await search.click();
        await search.fill('truyen');
        await expect(page.getByRole('option', { name: /Truyện mới 1/ })).toBeVisible();
        const sortsBeforeSubmit = sorts.length;
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`${base}/tim-kiem?keywords=truyen&sort=relevance%3Adesc`);
        await expect.poll(() => sorts.slice(sortsBeforeSubmit).includes('relevance')).toBe(true);
        await expect(page.locator('#sc-search-quick-sort')).toHaveValue('relevance:desc');
        await page.goBack();
        await expect(page).toHaveURL(remembered);

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
  const output = await readerEvidence('storycraft-home-reader-');
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
        await expect(resume.locator('.sc-home-read-card').first()).toHaveAttribute('href', '/reader/chapters/c-1');
        await expect(resume.locator('.sc-home-progress-line')).toBeVisible();
        await resume.screenshot({ path: path.join(output, `resume-${width}-${theme}.png`) });

        await page.locator('.sc-home-featured-card .sc-home-preview-trigger').first().click();
        const dialog = page.getByRole('dialog', { name: novels[0].title, exact: true });
        const add = dialog.getByRole('button', { name: 'Theo dõi truyện', exact: true });
        await expect(add).toBeEnabled();
        await add.click();
        await expect(dialog.getByRole('button', { name: 'Bỏ theo dõi truyện', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.sc-toast-message').last()).toHaveText('Đã theo dõi truyện.');
        await expect(dialog).toHaveCSS('opacity', '1');
        await page.screenshot({ path: path.join(output, `saved-${width}-${theme}.png`), fullPage: true });
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
        await expect(resume.locator('.sc-home-read-card')).toHaveCount(0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Reader personalization screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
