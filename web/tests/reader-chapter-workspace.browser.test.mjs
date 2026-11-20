import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readerEvidence } from './reader-browser-evidence.mjs';

const chapters = [1, 2, 3].map(number => ({ chapterId: `c-${number}`, novelId: 'novel-1', chapterNumber: number, title: `Chương ${number}: Những mùa gió`, isVip: number === 3, priceCoins: number === 3 ? 10 : 0, wordCount: 2400 }));
const content = Array.from({ length: 65 }, (_, index) => `Đoạn ${index + 1}. Buổi sáng trải dài trên con đường nhỏ. Người lữ hành dừng lại bên hiên nhà, lắng nghe tiếng lá và nhớ về những câu chuyện đã đi qua. Một hành trình mới đang chờ ở phía trước.`).join('\n\n') + '\n\n---\n\nĐoạn cuối. Kết thúc chương.';

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
      let bookmarks = [], failBookmark = false, failPreferences = false, unlocked = false;
      let privateRequests = 0, pendingSaves = 0, maximumSaves = 0;
      await page.addInitScript(({ role, theme }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
        else if (!localStorage.getItem('fixture-legacy-seeded')) {
          localStorage.setItem('fixture-legacy-seeded', '1');
          localStorage.setItem('storycraft-workspace:guest:reading-bookmark:novel-1', JSON.stringify({ novelId: 'novel-1', chapterId: 'c-1', paragraphIndex: 5, pageOffset: .2, updatedAt: new Date().toISOString() }));
        }
      }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let data = [], meta = { totalItems: 0, totalPages: 1 };
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
        } else if (url.pathname.endsWith('/reading/bookmark-entries/me')) {
          privateRequests++;
          if (method === 'POST') {
            if (failBookmark) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Chưa lưu dấu trang.' } } });
            const input = route.request().postDataJSON(), chapter = chapters.find(item => item.chapterId === input.chapterId);
            const existing = bookmarks.find(item => item.chapterId === input.chapterId && item.paragraphIndex === input.paragraphIndex && (item.startOffset ?? 0) === (input.startOffset ?? 0));
            data = { ...input, bookmarkId: existing?.bookmarkId ?? `mark-${input.paragraphIndex}-${input.startOffset ?? 0}`, novelTitle: 'Hành trình qua những mùa gió', chapterTitle: chapter.title, chapterNumber: chapter.chapterNumber, updatedAt: new Date().toISOString(), coverImageUrl: null };
            bookmarks = [data, ...bookmarks.filter(item => item.bookmarkId !== data.bookmarkId)];
          } else { data = bookmarks; meta = { totalItems: bookmarks.length, totalPages: 1 }; }
        } else if (url.pathname.includes('/reading/bookmark-entries/me/') && method === 'DELETE') {
          bookmarks = bookmarks.filter(item => item.bookmarkId !== url.pathname.split('/').at(-1));
          return route.fulfill({ status: 204 });
        } else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { novelId: 'novel-1', title: 'Hành trình qua những mùa gió', authorName: 'Người kể chuyện', authorId: 'author-1', coverImageUrl: '/missing-cover.jpg', synopsis: 'Giới thiệu.', chapters };
        else if (url.pathname.endsWith('/chapters/c-3/unlock')) { unlocked = true; data = { unlocked: true }; }
        else if (url.pathname.endsWith('/wallet/me')) data = { walletId: 'wallet-1', coinsBalance: 120, lockedCoins: 0 };
        else if (url.pathname.includes('/reading/chapters/')) {
          const chapter = chapters.find(item => url.pathname.endsWith('/' + item.chapterId));
          if (chapter.chapterId === 'c-2') await new Promise(resolve => setTimeout(resolve, 150));
          if (chapter.isVip && !unlocked) return route.fulfill({ status: 402, json: { success: false, error: { code: 'PAYMENT_002', message: 'Chapter unlock required', details: { priceCoins: 10, novelId: 'novel-1' } } } });
          data = { ...chapter, content };
        } else if (url.pathname.endsWith('/statistics')) data = { isFollowing: false, notificationsEnabled: false, ratingsCount: 0, ratingAverage: null };
        await route.fulfill({ json: { success: true, data, meta } });
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
          await expect(page.locator('.sc-reading-bookmark-action')).toBeVisible();
          await page.keyboard.press('Escape');
          await page.getByRole('heading', { name: chapters[0].title, exact: true }).tap(); await expect(rail).not.toBeVisible();
          await prose.dispatchEvent('pointerdown', { clientX: 150, clientY: 250, pointerType: 'touch' });
          await prose.dispatchEvent('pointermove', { clientX: 150, clientY: 350, pointerType: 'touch' });
          await prose.dispatchEvent('click'); await expect(rail).not.toBeVisible();
          await paragraph.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
          await paragraph.tap(); await expect(rail).not.toBeVisible();
          await page.evaluate(() => window.getSelection()?.removeAllRanges());
          await paragraph.tap();
        }
        await expect(rail).toBeVisible();
        if (role === 'GUEST') {
          await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks') ?? '[]').length)).toBe(1);
          await rail.getByRole('button', { name: 'Bookmark', exact: true }).click();
          const legacyMarks = page.getByRole('dialog', { name: 'Bookmark', exact: true });
          await expect(legacyMarks.locator('.sc-reading-bookmark-entry')).toHaveCount(1);
          await legacyMarks.getByRole('button', { name: 'Xóa bookmark đoạn 6', exact: true }).click();
          await expect(legacyMarks.getByText('Chưa có bookmark', { exact: true })).toBeVisible();
          await legacyMarks.getByRole('button', { name: 'Đóng hộp thoại', exact: true }).click();
          await expect(legacyMarks).toHaveCount(0);
          assert.equal(await page.evaluate(() => localStorage.getItem('storycraft-workspace:guest:reading-bookmark:novel-1')), null);
        }
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
        const passage = page.locator('.chapter-prose > p').nth(20);
        await page.evaluate(() => document.fonts.ready);
        await passage.click({ position: { x: 10, y: 10 } });
        await expect(page.locator('.sc-reading-line-highlight')).toHaveCount(1);
        if (width >= 1200) {
          const lineBox = await page.locator('.sc-reading-line-highlight').boundingBox();
          const actionBox = await page.locator('.sc-reading-bookmark-action').boundingBox();
          assert.ok(Math.abs(actionBox.y + actionBox.height / 2 - lineBox.y - lineBox.height / 2) < 1, 'Bookmark button is centered on the selected line');
        }
        assert.ok(await page.locator('.sc-reading-line-highlight').evaluate(node => node.getBoundingClientRect().height) < await passage.evaluate(node => node.getBoundingClientRect().height));
        await expect(passage).toHaveCSS('box-shadow', 'none');
        await expect(passage).toHaveCSS('outline-style', 'none');
        if (role === 'READER') {
          failBookmark = true;
          await page.locator('.sc-reading-bookmark-action').click();
          await expect(page.locator('.sc-toast-message').last()).toContainText('Chưa lưu dấu trang.');
          await expect(page.locator('.sc-reading-bookmark-action')).toHaveAttribute('aria-pressed', 'false');
          failBookmark = false;
        }
        await page.locator('.sc-reading-bookmark-action').click();
        await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const saved = role === 'READER' ? bookmarks[0] : await page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks'))[0]);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-reading.png`) });
        assert.equal(saved.paragraphIndex, 20);
        assert.equal(saved.startOffset, 0);
        assert.ok(saved.endOffset > 0 && saved.endOffset < (await passage.textContent()).length);
        assert.ok(saved.excerpt.length < (await passage.textContent()).length);
        assert.ok(saved.pageOffset >= 0 && saved.pageOffset <= 1);
        await expect(page.locator('.sc-reading-line-highlight')).toHaveCount(0, { timeout: 4500 });
        const secondLineY = await passage.evaluate(node => parseFloat(getComputedStyle(node).lineHeight) + 10);
        await passage.click({ position: { x: 10, y: secondLineY } });
        await page.locator('.sc-reading-bookmark-action').click();
        await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toBeVisible();
        const secondLine = role === 'READER' ? bookmarks[0] : await page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks'))[0]);
        assert.equal(secondLine.paragraphIndex, saved.paragraphIndex);
        assert.notEqual(secondLine.bookmarkId, saved.bookmarkId);
        assert.ok(secondLine.startOffset >= saved.endOffset, JSON.stringify({ saved, secondLine }));
        await page.getByRole('button', { name: 'Xóa bookmark', exact: true }).click();
        await page.locator('.chapter-prose > p').nth(25).click({ position: { x: 10, y: 10 } });
        await page.locator('.sc-reading-bookmark-action').click();
        await expect.poll(() => role === 'READER' ? bookmarks.length : page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks') ?? '[]').length)).toBe(2);
        const longExcerpt = 'Một dòng bookmark dài để kiểm tra nút xóa không bị khuất trong bảng bên. '.repeat(10).slice(0, 500);
        if (role === 'READER') bookmarks[0] = { ...bookmarks[0], excerpt: longExcerpt };
        else await page.evaluate(excerpt => {
          const items = JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks'));
          items[0].excerpt = excerpt;
          localStorage.setItem('storycraft-guest-reading-bookmarks', JSON.stringify(items));
        }, longExcerpt);
        await showTools();
        await rail.getByRole('link', { name: 'Chương sau', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}/chapters/c-2`);
        await expect(page.getByRole('heading', { name: chapters[1].title, exact: true })).toBeVisible();
        await expect(prose).toBeVisible(); await showTools();
        await rail.getByRole('button', { name: 'Mục lục', exact: true }).click();
        const toc = page.getByRole('dialog', { name: 'Mục lục chương', exact: true });
        await expect(toc.locator('[aria-current="page"]')).toHaveAttribute('href', `${prefix}/chapters/c-2`);
        await expect(toc.locator('.sc-reader-toc-book img')).toHaveCount(0);
        await toc.screenshot({ path: path.join(output, `${role}-${width}-${theme}-toc.png`) });
        await page.keyboard.press('Escape');
        await rail.getByRole('button', { name: 'Bookmark', exact: true }).click();
        const marks = page.getByRole('dialog', { name: 'Bookmark', exact: true });
        await expect(marks.locator('.sc-reading-bookmark-entry')).toHaveCount(2);
        const removeButton = marks.locator('.sc-reading-bookmark-remove').first();
        await expect(removeButton).toBeVisible();
        await expect(removeButton).toHaveText('close');
        const removeBounds = await removeButton.boundingBox(), panelBounds = await marks.boundingBox();
        assert.ok(removeBounds.x >= panelBounds.x && removeBounds.x + removeBounds.width <= panelBounds.x + panelBounds.width);
        assert.ok(removeBounds.width >= 36 && removeBounds.height >= 36);
        await marks.screenshot({ path: path.join(output, `${role}-${width}-${theme}-bookmark-drawer.png`) });
        await marks.locator('.sc-reading-bookmark-open').filter({ hasText: 'Đoạn 21.' }).click();
        await expect(page).toHaveURL(new RegExp(`${prefix}/chapters/c-1\\?bookmark=1&paragraph=20&offset=`));
        await expect(page.getByRole('heading', { name: chapters[0].title, exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
        await expect(passage).toBeFocused();
        await page.reload();
        await expect(passage).toBeFocused();
        await expect(passage).toBeInViewport();
        await expect(page.locator('.sc-reading-line-highlight')).toHaveCount(1);
        await expect(passage).toHaveCSS('outline-style', 'none');
        await expect(page.locator('.sc-reading-line-highlight')).toHaveCount(0, { timeout: 4500 });
        await expect(passage).toHaveCSS('outline-style', 'none');
        await passage.press('Enter');
        await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toBeFocused();
        await page.getByRole('button', { name: 'Xóa bookmark', exact: true }).click();
        await expect.poll(() => role === 'READER' ? bookmarks.length : page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks') ?? '[]').length)).toBe(1);
        await page.keyboard.press('Escape');
        const beforeBreak = page.locator('.chapter-prose > p').nth(64);
        await beforeBreak.focus(); await beforeBreak.press('ArrowDown');
        await expect(page.locator('.chapter-prose > p').nth(65)).toBeFocused();
        await page.keyboard.press('ArrowUp'); await expect(beforeBreak).toBeFocused();
        await showTools();
        await rail.getByRole('button', { name: 'Bookmark', exact: true }).click();
        await marks.getByRole('link', { name: 'Mở trang Bookmark', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Bookmark', exact: true })).toBeVisible();
        await expect(page.locator('.sc-reading-bookmark-entry')).toHaveCount(1);
        await page.reload(); await expect(page.locator('.sc-reading-bookmark-entry')).toHaveCount(1);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-bookmarks.png`) });
        if (role === 'READER') {
          const sections = page.getByRole('navigation', { name: 'Mục đọc của tôi', exact: true });
          await expect(sections.getByRole('link', { name: 'Bookmark', exact: true })).toHaveAttribute('aria-current', 'page');
          await sections.getByRole('link', { name: 'Thư viện của tôi', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Thư viện của tôi', exact: true })).toBeVisible();
          await sections.getByRole('link', { name: 'Lịch sử đọc', exact: true }).click();
          await expect(sections.getByRole('link', { name: 'Lịch sử đọc', exact: true })).toHaveAttribute('aria-current', 'page');
          await page.getByRole('navigation', { name: 'Công cụ đọc', exact: true }).getByRole('link', { name: 'Bookmark', exact: true }).click();
          await page.getByRole('button', { name: /Hành trình qua những mùa gió/ }).click();
          await expect(page.locator('.sc-reading-bookmark-entry')).toHaveCount(1);
        }
        await page.goto(`${base}${prefix}/chapters/c-1`); await expect(prose).toBeVisible(); await showTools();
        await rail.getByRole('button', { name: 'Mục lục', exact: true }).click();
        await toc.getByRole('link', { name: /Chương 3:/ }).click();
        await expect(page.getByRole('heading', { name: 'Chương VIP đang khóa', exact: true })).toBeVisible();
        if (role === 'READER') {
          // UAT 2026-11-20 (BUG-001): the price and the balance are shown before coins are spent.
          await expect(page.getByText('Mở khóa chương này với 10 xu.', { exact: false })).toBeVisible();
          await expect(page.getByTestId('unlock-balance')).toContainText('Số dư hiện tại: 120 xu');
          await page.getByRole('button', { name: 'Mở khóa · 10 xu', exact: true }).click();
          await expect(prose).toBeVisible(); await showTools();
          await expect(rail.getByRole('button', { name: 'Chương sau', exact: true })).toBeDisabled();
          await rail.getByRole('link', { name: 'Về trang truyện', exact: true }).click();
          await expect(page).toHaveURL(`${base}${prefix}/novels/novel-1`);
          await expect(page.locator('.sc-navbar')).toBeVisible();
        } else { assert.equal(privateRequests, 0); await expect(page.getByRole('link', { name: 'Đăng nhập để mở khóa', exact: true })).toBeVisible(); }
        assert.ok(maximumSaves <= 1, 'Preference writes must be serialized');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
      } catch (error) {
        console.log(JSON.stringify({ role, width, theme, state: await page.evaluate(() => ({ selected: document.querySelectorAll('.sc-reading-passage-selected').length, action: document.querySelectorAll('.sc-reading-bookmark-action').length, selection: window.getSelection()?.toString(), focused: document.activeElement?.tagName, scroll: window.scrollY })) }));
        await page.screenshot({ path: path.join(output, 'bookmark-error.png') });
        throw error;
      } finally { await context.close(); }
    }
    console.log(`Chapter reader screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
