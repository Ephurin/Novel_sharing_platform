import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('detail: long chapter lists, actual reading position, mobile read action and deliberate reports', { timeout: 150000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'storycraft-detail-enhancements-'));
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
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ role, theme }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
      }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let data = [], status = 200;
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader', username: 'reader', email: 'r@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { ...novel, chapters: empty ? [] : chapters };
        else if (url.pathname.endsWith('/reading/history/me/novel-1')) data = { chapterId: invalidHistory ? 'deleted' : 'c-26', chapter: { chapterNumber: 999, title: 'Old chapter metadata' } };
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
        if (role === 'READER') {
          await expect(main).toHaveText('menu_bookĐọc tiếp · Chương 52');
          await expect(page.getByRole('progressbar', { name: 'Vị trí chương đang đọc' })).toHaveAttribute('value', '26');
          await page.getByRole('button', { name: 'Tới chương đang đọc' }).click();
          await expect(table).toHaveCount(20);
          await expect(page.locator('[aria-current="location"]')).toHaveAttribute('href', '/reader/chapters/c-26');
          await expect(page.locator('[aria-current="location"]')).toBeFocused();
          await expect(page.getByTestId('novel-floating-read')).toBeVisible();
          const floating = await page.getByTestId('novel-floating-read').boundingBox();
          const top = await page.getByRole('button', { name: 'Về đầu trang', exact: true }).boundingBox();
          assert.ok(top.y + top.height <= floating.y, 'Back-to-top must stay above the read action');
        } else await page.getByRole('button', { name: 'Xem toàn bộ 47 chương' }).click();
        await expect(table).toHaveCount(20);
        await page.getByRole('textbox', { name: 'Tìm chương', exact: true }).fill('chuong 94');
        await expect(table).toHaveCount(1);
        await expect(table).toContainText('Chương 94:');
        await page.getByRole('textbox', { name: 'Quyền đọc', exact: true }).click();
        await page.getByRole('option', { name: 'VIP', exact: true }).click();
        await expect(table).toHaveCount(0);
        await expect(page.getByText('Không tìm thấy chương.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Bỏ bộ lọc chương' }).click();
        await page.getByRole('textbox', { name: 'Thứ tự chương' }).click();
        await page.getByRole('option', { name: 'Chương mới trước', exact: true }).click();
        await expect(table.first()).toContainText('Chương 94:');
        await page.getByRole('navigation', { name: 'Phân trang chương' }).getByRole('button', { name: 'Trang chương 3', exact: true }).click();
        await expect(table).toHaveCount(7);
        await expect(table.first()).toContainText('Chương 14:');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Thu gọn mục lục' }).click();
        await expect(table).toHaveCount(5);
        await expect(page.getByRole('textbox', { name: 'Tìm chương', exact: true })).not.toBeVisible();
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
