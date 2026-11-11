import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readerEvidence } from './reader-browser-evidence.mjs';

const chapters = [1, 2, 3].map(number => ({ chapterId: `c-${number}`, novelId: 'novel-1', chapterNumber: number, title: `Chương ${number}: Những mùa gió`, isVip: number === 3, priceCoins: number === 3 ? 10 : 0, wordCount: 2400 }));
const content = Array.from({ length: 65 }, (_, index) => `Đoạn ${index + 1}. Buổi sáng trải dài trên con đường nhỏ. Người lữ hành dừng lại bên hiên nhà, lắng nghe tiếng lá và nhớ về những câu chuyện đã đi qua. Một hành trình mới đang chờ ở phía trước.`).join('\n\n');

test('chapter tools support persistent preferences, precise bookmarks, navigation and intentional mobile taps', { timeout: 240000 }, async () => {
  const output = await readerEvidence('chapter-reader-workspace-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 1440, 'dark'], ['GUEST', 390, 'light'], ['READER', 390, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let preferences = { fontFamily: 'Be Vietnam Pro', fontSize: 18, background: 'LIGHT', lineHeight: 1.8, margin: 24, textAlign: 'LEFT' };
      let bookmark = null, failBookmark = false, failPreferences = false, unlocked = false;
      let privateRequests = 0, pendingSaves = 0, maximumSaves = 0;
      await page.addInitScript(({ role, theme }) => { localStorage.setItem('storycraft-theme', theme); if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token'); }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let data = [];
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/preferences/me')) {
          privateRequests++;
          if (method === 'PUT') {
            pendingSaves++; maximumSaves = Math.max(maximumSaves, pendingSaves);
            await new Promise(resolve => setTimeout(resolve, 100)); pendingSaves--;
            if (failPreferences) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Chưa lưu tùy chỉnh.' } } });
            preferences = route.request().postDataJSON();
          }
          data = preferences;
        } else if (url.pathname.endsWith('/reading/bookmarks/me/novel-1')) {
          privateRequests++;
          if (method === 'PUT') {
            if (failBookmark) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Chưa lưu dấu trang.' } } });
            bookmark = { ...route.request().postDataJSON(), novelId: 'novel-1', updatedAt: new Date().toISOString() };
          } else if (method === 'DELETE') bookmark = null;
          data = bookmark;
        } else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { novelId: 'novel-1', title: 'Hành trình qua những mùa gió', authorName: 'Người kể chuyện', authorId: 'author-1', coverImageUrl: '/missing-cover.jpg', synopsis: 'Giới thiệu.', chapters };
        else if (url.pathname.endsWith('/chapters/c-3/unlock')) { unlocked = true; data = { unlocked: true }; }
        else if (url.pathname.includes('/reading/chapters/')) {
          const chapter = chapters.find(item => url.pathname.endsWith('/' + item.chapterId));
          if (chapter.chapterId === 'c-2') await new Promise(resolve => setTimeout(resolve, 150));
          if (chapter.isVip && !unlocked) return route.fulfill({ status: 402, json: { success: false, error: { code: 'PAYMENT_002', message: 'Chapter unlock required' } } });
          data = { ...chapter, content };
        } else if (url.pathname.endsWith('/statistics')) data = { isFollowing: false, notificationsEnabled: false, ratingsCount: 0, ratingAverage: null };
        await route.fulfill({ json: { success: true, data, meta: { totalItems: 0, totalPages: 1 } } });
      });
      try {
        const prefix = role === 'READER' ? '/reader' : '/public';
        await page.goto(`${base}${prefix}/chapters/c-1`);
        const rail = page.getByRole('complementary', { name: 'Công cụ đọc chương', includeHidden: true });
        const prose = page.getByRole('article', { name: 'Nội dung chương', includeHidden: true });
        const paragraph = page.locator('.chapter-prose > p').first();
        await expect(prose).toBeVisible();
        await expect(page.locator('.sc-navbar')).not.toBeVisible();
        if (width < 768) {
          await expect(rail).not.toBeVisible();
          await paragraph.tap(); await expect(rail).toBeVisible();
          await paragraph.tap(); await expect(rail).not.toBeVisible();
          await prose.dispatchEvent('pointerdown', { clientX: 150, clientY: 250, pointerType: 'touch' });
          await prose.dispatchEvent('pointermove', { clientX: 150, clientY: 350, pointerType: 'touch' });
          await prose.dispatchEvent('click'); await expect(rail).not.toBeVisible();
          await paragraph.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
          await paragraph.tap(); await expect(rail).not.toBeVisible();
          await page.evaluate(() => window.getSelection()?.removeAllRanges());
          await paragraph.tap();
        }
        await expect(rail).toBeVisible();
        await expect(rail.getByRole('button', { name: 'Chương trước', exact: true })).toBeDisabled();
        await expect(rail).toHaveCSS('position', 'fixed');
        await rail.getByRole('button', { name: 'Tùy chỉnh đọc', exact: true }).click();
        const settings = page.getByRole('dialog', { name: 'Tùy chỉnh đọc', exact: true });
        await settings.getByRole('textbox', { name: 'Phông chữ', exact: true }).click();
        await page.getByRole('option', { name: 'Literata', exact: true }).click();
        await settings.getByRole('textbox', { name: 'Cỡ chữ', exact: true }).fill('22');
        await settings.getByRole('textbox', { name: 'Lề hai bên', exact: true }).fill('40');
        await settings.getByRole('textbox', { name: 'Giãn dòng', exact: true }).fill('1.9');
        await settings.getByRole('button', { name: 'Căn đều', exact: true }).click();
        await settings.getByRole('button', { name: 'Giấy ngà', exact: true }).click();
        await expect(prose).toHaveCSS('font-size', '22px');
        await expect(prose).toHaveCSS('text-align', 'justify');
        await expect(prose).toHaveCSS('font-family', 'Literata');
        await expect(prose).toHaveCSS('padding-left', width < 400 ? '39px' : '40px');
        if (role === 'READER') {
          await expect(settings.getByRole('status')).toHaveText('Đã lưu tùy chỉnh.');
          assert.equal(preferences.margin, 40); assert.equal(preferences.textAlign, 'JUSTIFY');
          failPreferences = true;
          await settings.getByRole('textbox', { name: 'Cỡ chữ', exact: true }).fill('23');
          await expect(settings.getByRole('status')).toContainText('Chưa đồng bộ tùy chỉnh.');
          failPreferences = false;
          await settings.getByRole('button', { name: 'Thử lại', exact: true }).click();
          await expect(settings.getByRole('status')).toHaveText('Đã lưu tùy chỉnh.');
        }
        await settings.screenshot({ path: path.join(output, `${role}-${width}-${theme}-settings.png`) });
        await page.keyboard.press('Escape');
        await expect(settings).toHaveCount(0);
        await expect(rail.getByRole('button', { name: 'Tùy chỉnh đọc', exact: true })).toBeFocused();
        await page.reload(); await expect(prose).toHaveCSS('text-align', 'justify');
        await expect(prose).toHaveCSS('font-size', role === 'READER' ? '23px' : '22px');
        if (role === 'READER') {
          preferences = { ...preferences, fontSize: 24, background: 'DARK' };
          await page.reload();
          await expect(prose).toHaveCSS('font-size', '24px');
          await expect(page.locator('.sc-reader-workspace')).toHaveAttribute('data-reader-background', 'DARK');
        }
        await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'instant' }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1750);
        const showTools = async () => {
          if (width < 768 && !(await rail.isVisible())) {
            const toggle = page.getByRole('button', { name: 'Hiện công cụ đọc', exact: true });
            await toggle.focus(); await page.keyboard.press('Space');
          }
          await expect(rail).toBeVisible();
        };
        await showTools();
        if (role === 'READER') {
          failBookmark = true;
          await rail.getByRole('button', { name: 'Đánh dấu vị trí đọc', exact: true }).click();
          await expect(page.locator('.sc-toast-message').last()).toContainText('Chưa lưu dấu trang.');
          await expect(rail.getByRole('button', { name: 'Đánh dấu vị trí đọc', exact: true })).toHaveAttribute('aria-pressed', 'false');
          failBookmark = false;
        }
        await rail.getByRole('button', { name: 'Đánh dấu vị trí đọc', exact: true }).click();
        await expect(rail.getByRole('button', { name: 'Bỏ dấu trang', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const saved = role === 'READER' ? bookmark : await page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-workspace:guest:reading-bookmark:novel-1')));
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-reading.png`) });
        assert.ok(saved.paragraphIndex > 0, `${role}/${width}: ${JSON.stringify(saved)}, scroll=${await page.evaluate(() => window.scrollY)}`);
        assert.ok(saved.pageOffset >= 0 && saved.pageOffset <= 1);
        await rail.getByRole('link', { name: 'Chương sau', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}/chapters/c-2`);
        await expect(page.getByRole('heading', { name: chapters[1].title, exact: true })).toBeVisible();
        await expect(prose).toBeVisible(); await showTools();
        await rail.getByRole('button', { name: 'Mục lục', exact: true }).click();
        const toc = page.getByRole('dialog', { name: 'Mục lục chương', exact: true });
        await expect(toc.locator('[aria-current="page"]')).toHaveAttribute('href', `${prefix}/chapters/c-2`);
        await expect(toc.locator('.sc-reader-toc-book img')).toHaveCount(0);
        await toc.screenshot({ path: path.join(output, `${role}-${width}-${theme}-toc.png`) });
        await toc.getByRole('link', { name: 'Tới dấu trang · Chương 1', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}/chapters/c-1?bookmark=1`);
        await expect(page.getByRole('heading', { name: chapters[0].title, exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
        await showTools();
        await rail.getByRole('button', { name: 'Bỏ dấu trang', exact: true }).click();
        await expect(rail.getByRole('button', { name: 'Đánh dấu vị trí đọc', exact: true })).toBeVisible();
        await rail.getByRole('button', { name: 'Mục lục', exact: true }).click();
        await toc.getByRole('link', { name: /Chương 3:/ }).click();
        await expect(page.getByRole('heading', { name: 'Chương VIP đang khóa', exact: true })).toBeVisible();
        if (role === 'READER') {
          await page.getByRole('button', { name: 'Mở khóa chương', exact: true }).click();
          await expect(prose).toBeVisible(); await showTools();
          await expect(rail.getByRole('button', { name: 'Chương sau', exact: true })).toBeDisabled();
          await rail.getByRole('link', { name: 'Về trang truyện', exact: true }).click();
          await expect(page).toHaveURL(`${base}${prefix}/novels/novel-1`);
          await expect(page.locator('.sc-navbar')).toBeVisible();
        } else { assert.equal(privateRequests, 0); await expect(page.getByRole('link', { name: 'Đăng nhập để mở khóa', exact: true })).toBeVisible(); }
        assert.ok(maximumSaves <= 1, 'Preference writes must be serialized');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Chapter reader screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
