import test from 'node:test';
import assert from 'node:assert/strict';
import { readerEvidence } from './reader-browser-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('detail: simple chapter list, accurate read flags, mobile read action and deliberate reports', { timeout: 150000 }, async () => {
  const output = await readerEvidence('storycraft-detail-enhancements-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const chapters = Array.from({ length: 47 }, (_, index) => ({ chapterId: `c-${index + 1}`, chapterNumber: (index + 1) * 2, title: `Chương ${(index + 1) * 2}: Mùa gió ${index + 1}`, wordCount: 1300, isVip: index % 2 === 1, priceCoins: 10, publishedAt: '2026-11-01T12:00:00Z' })).reverse();
  const novel = { novelId: 'novel-1', authorId: 'author', title: 'Những mùa gió', synopsis: Array(20).fill('Hành trình đi qua những miền ký ức và những lời hẹn chưa thành.').join('\n\n'), genres: ['Fantasy'], chapters };
  try {
    for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 390, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
      const page = await context.newPage(), errors = [], reports = [];
      let invalidHistory = false, empty = false, rejectReport = true;
      let activeUser = 'reader', currentChapterId = 'c-26';
      const readIds = new Set(['c-1', 'c-3', 'c-26']);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ role, theme }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') {
          localStorage.setItem('ephurin_access_token', 'fixture-token');
          localStorage.setItem('storycraft-workspace:reader:read-chapters:novel-1', JSON.stringify(['c-2']));
        }
      }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [], status = 200;
        if (url.pathname.endsWith('/auth/me')) data = { userId: activeUser, username: activeUser, email: 'r@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { ...novel, chapters: empty ? [] : chapters };
        else if (url.pathname.endsWith('/reading/history/me/novel-1')) data = activeUser === 'reader-2' ? null : { chapterId: invalidHistory ? 'deleted' : currentChapterId, readChapterIds: [...readIds], chapter: { chapterNumber: 999, title: 'Old chapter metadata' } };
        else if (url.pathname.includes('/reading/chapters/')) {
          const chapter = chapters.find(item => url.pathname.endsWith('/' + item.chapterId));
          if (chapter.isVip) return route.fulfill({ status: 402, json: { success: false, error: { code: 'PAYMENT_002', message: 'Chapter unlock required' } } });
          data = { ...chapter, novelId: 'novel-1', content: '<p>Chapter content</p>' };
          if (role === 'READER') readIds.add(chapter.chapterId);
        } else if (url.pathname.endsWith('/reading/history/me') && route.request().method() === 'PUT') {
          currentChapterId = route.request().postDataJSON().chapterId;
          data = { synced: true };
        }
        else if (url.pathname.endsWith('/statistics')) data = { isFollowing: false, notificationsEnabled: false, ratingAverage: null, ratingsCount: 0 };
        else if (url.pathname.endsWith('/reports')) {
          reports.push(route.request().postDataJSON());
          await new Promise(resolve => setTimeout(resolve, 120));
          if (rejectReport) { rejectReport = false; return route.fulfill({ status: 500, json: { success: false, error: { message: 'Không gửi được báo cáo thử nghiệm.' } } }); }
          data = { reportId: 'report-1', status: 'PENDING' };
        }
        await route.fulfill({ status, json: { success: true, data, meta: { totalPages: 1, totalItems: 0 } } });
      });
      try {
        const prefix = role === 'READER' ? '/reader' : '/public';
        await page.goto(`${base}${prefix}/novels/novel-1`);
        const main = page.getByTestId('novel-main-read'), table = page.locator('#reader-chapters tbody tr');
        await expect(main).toHaveAttribute('href', `${prefix}/chapters/${role === 'READER' ? 'c-26' : 'c-1'}`);
        await expect(page.getByTestId('novel-floating-read')).not.toBeVisible();
        await expect(table).toHaveCount(5);
        await expect(table.first()).toContainText('Chương 2:');
        await expect(page.locator('.sc-chapter-filters')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: 'Phân trang chương' })).toHaveCount(0);
        await expect(page.locator('.sc-chapter-position')).toHaveCount(0);
        if (role === 'READER') {
          await expect(page.getByTestId('read-chapter-c-2').locator('xpath=ancestor::tr')).not.toHaveAttribute('data-read');
          await expect(main).toHaveText('menu_bookĐọc tiếp · Chương 52');
          await expect(page.locator('#reader-chapters tr[data-read]')).toHaveCount(2);
          const readColor = await table.nth(0).locator('.sc-reader-chapter-title').evaluate(node => getComputedStyle(node).color);
          const unreadColor = await table.nth(1).locator('.sc-reader-chapter-title').evaluate(node => getComputedStyle(node).color);
          assert.notEqual(readColor, unreadColor, 'Read chapter titles should appear muted');
          const readLink = table.nth(0).locator('.sc-reader-chapter-title');
          await readLink.hover();
          await expect(readLink).not.toHaveCSS('color', readColor);
          await expect(readLink).toHaveCSS('text-decoration-line', 'none');
        } else await expect(page.locator('#reader-chapters tr[data-read]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Xem toàn bộ 47 chương' }).click();
        await expect(table).toHaveCount(47);
        await expect(page.getByTestId('read-chapter-c-47')).toHaveAttribute('href', `${prefix}/chapters/c-47`);
        if (role === 'READER') {
          await expect(page.locator('#reader-chapters tr[data-read]')).toHaveCount(3);
          await expect(page.getByTestId('novel-floating-read')).toBeVisible();
          const floating = await page.getByTestId('novel-floating-read').boundingBox();
          const top = await page.getByRole('button', { name: 'Về đầu trang', exact: true }).boundingBox();
          assert.ok(top.y + top.height <= floating.y, 'Back-to-top must stay above the read action');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('#reader-chapters').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`) });
        await page.getByRole('button', { name: 'Thu gọn mục lục' }).click();
        await expect(table).toHaveCount(5);
        await expect(page.getByRole('textbox', { name: 'Tìm chương', exact: true })).not.toBeVisible();
        const opened = role === 'READER' ? 'c-5' : 'c-3';
        await page.getByTestId(`read-chapter-${opened}`).click();
        await expect(page.locator('.chapter-prose')).toBeVisible();
        await page.goBack();
        await expect(page.getByTestId(`read-chapter-${opened}`).locator('xpath=ancestor::tr')).toHaveAttribute('data-read', 'true');
        await page.getByTestId('read-chapter-c-2').click();
        await expect(page.getByRole('heading', { name: 'Chương VIP đang khóa', exact: true })).toBeVisible();
        await page.goBack();
        await expect(page.getByTestId('read-chapter-c-2').locator('xpath=ancestor::tr')).not.toHaveAttribute('data-read');
        await page.reload();
        await expect(page.getByTestId(`read-chapter-${opened}`).locator('xpath=ancestor::tr')).toHaveAttribute('data-read', 'true');
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.getByTestId('novel-floating-read')).not.toBeVisible();
        if (role === 'READER') {
          const trigger = page.getByRole('button', { name: 'Báo cáo truyện', exact: true });
          await trigger.click();
          const dialog = page.getByRole('dialog', { name: 'Báo cáo truyện', exact: true });
          await expect(dialog).toBeVisible(); assert.equal(reports.length, 0);
          await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
          await trigger.click();
          await dialog.getByRole('textbox', { name: 'Lý do báo cáo', exact: true }).click();
          await page.getByRole('option', { name: 'Lý do khác', exact: true }).click();
          await dialog.getByRole('textbox', { name: 'Chi tiết', exact: true }).fill('  ');
          await dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
          assert.equal(reports.length, 0);
          await dialog.getByRole('textbox', { name: 'Chi tiết', exact: true }).fill('Nội dung cần được kiểm tra.');
          await dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
          await expect(dialog.getByRole('alert')).toBeVisible();
          await expect(dialog.getByRole('textbox', { name: 'Chi tiết', exact: true })).toHaveValue('Nội dung cần được kiểm tra.');
          await dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
          await expect(dialog).toHaveCount(0);
          await expect(page.getByTestId('reader-interaction-notice')).toHaveText('Đã gửi báo cáo truyện tới quản trị viên.');
          assert.deepEqual(reports.at(-1), { targetType: 'NOVEL', targetId: 'novel-1', reason: 'Lý do khác', description: 'Nội dung cần được kiểm tra.' });
          activeUser = 'reader-2'; await page.reload();
          await expect(page.locator('#reader-chapters tr[data-read]')).toHaveCount(0);
          activeUser = 'reader';
          currentChapterId = 'c-2'; await page.reload();
          await expect(main).toHaveText('menu_bookBắt đầu đọc');
          await expect(main).toHaveAttribute('href', '/reader/chapters/c-1');
          await expect(page.getByTestId('read-chapter-c-2').locator('xpath=ancestor::tr')).not.toHaveAttribute('data-read');
          invalidHistory = true; await page.reload();
          await expect(main).toHaveText('menu_bookBắt đầu đọc');
          await expect(main).toHaveAttribute('href', '/reader/chapters/c-1');
          await expect(page.getByRole('progressbar')).toHaveCount(0);
        } else await expect(page.getByRole('button', { name: 'Báo cáo truyện', exact: true })).toHaveCount(0);
        empty = true; await page.reload();
        await expect(page.getByText('Truyện chưa có chương nào được xuất bản.', { exact: true })).toBeVisible();
        await expect(main).toHaveCount(0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Detail enhancement screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
