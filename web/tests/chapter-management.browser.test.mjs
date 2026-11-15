import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run against the web app with API fixtures; never changes real author data.
// RUN_CHAPTER_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome node --test tests/chapter-management.browser.test.mjs
test('25 chapters: display sorting, drag/keyboard reorder, scroll, cancel and save', {
  skip: process.env.RUN_CHAPTER_BROWSER_TESTS !== '1', timeout: 120000
}, async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  try {
    for (const [mode, width] of [['light', 1440], ['dark', 390]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode, hasTouch: width < 600 });
      await context.addInitScript(() => localStorage.setItem('ephurin_access_token', 'chapter-ui-fixture'));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let chapters = Array.from({ length: 25 }, (_, i) => ({ chapterId: `c${i + 1}`, novelId: 'book', title: `Chapter ${i + 1}`,
        chapterNumber: i + 1, wordCount: (i + 1) * 100, isVip: false, priceCoins: 0, status: 'PUBLISHED',
        updatedAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
      const saved = [];
      let failSave = false;
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = [];
        if (path.endsWith('/auth/me')) data = { userId: 'author', username: 'author', role: 'AUTHOR', status: 'ACTIVE' };
        else if (path.endsWith('/chapter-order')) {
          if (failSave) return route.fulfill({ status: 409, json: { error: { message: 'Thứ tự đã thay đổi, vui lòng thử lại.' } } });
          const ids = route.request().postDataJSON().chapterIds;
          saved.push(ids);
          chapters = ids.map((id, i) => ({ ...chapters.find(ch => ch.chapterId === id), chapterNumber: i + 1 }));
          data = {};
        } else if (path.endsWith('/chapters')) data = chapters;
        else if (path.endsWith('/earnings')) data = { unlockCoins: 0 };
        else if (path.endsWith('/statistics')) data = { totalWords: 32500, followersCount: 0, ratingAverage: null, ratingsCount: 0 };
        else if (path.endsWith('/novels/book')) data = { novelId: 'book', authorId: 'author', title: 'Chapter management', genres: [],
          status: 'PUBLISHED', serialStatus: 'ONGOING', chaptersCount: 25, likesCount: 0, viewsCount: 0,
          createdAt: '2026-10-01', updatedAt: '2026-10-25' };
        return route.fulfill({ json: { data, meta: { total: 0, totalPages: 0, totalItems: 0 } } });
      });
      const origin = process.env.CHAPTER_TEST_BASE_URL || 'http://localhost:8080';
      await page.goto(`${origin}/author/novels/book`);
      const table = page.locator('.sc-chapter-table tbody');
      await table.locator('tr').first().waitFor();
      assert.match(await table.locator('tr').first().innerText(), /Chapter 1\b/);
      const toolbar = page.getByRole('group', { name: 'Bộ lọc và thao tác chương' });
      const positions = await toolbar.locator('input, select, button, a').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, y: Math.round(node.getBoundingClientRect().y + node.getBoundingClientRect().height / 2) })));
      assert.equal(new Set(positions.map(p => p.y)).size, 1, JSON.stringify(positions));
      if (width >= 1200) assert.ok(await toolbar.evaluate(n => n.scrollWidth <= n.clientWidth), 'desktop toolbar fits without horizontal scrolling');
      await page.screenshot({ path: join(tmpdir(), `chapter-toolbar-${mode}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Sắp xếp hiển thị chương' }).click();
      await page.getByRole('menuitem', { name: 'Số từ giảm dần' }).click();
      await table.getByText('Chapter 25', { exact: true }).waitFor();
      assert.equal(saved.length, 0, 'display sorting never persists a new chapter order');
      await page.getByRole('button', { name: 'Sắp xếp chương', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const list = dialog.getByRole('list', { name: 'Thứ tự chương' });
      assert.equal(await list.getByRole('listitem').count(), 25);
      const dimensions = await list.evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight }));
      assert.ok(dimensions.height <= 480 && dimensions.scroll > dimensions.height);
      // The reorder dialog always starts in canonical order, even with table sorting active.
      assert.match(await list.getByRole('listitem').first().innerText(), /Chapter 1\b/);
      const handle = dialog.getByRole('button', { name: 'Kéo để di chuyển: Chapter 1', exact: true });
      const from = await handle.boundingBox();
      const to = await list.locator('[data-order-chapter="c3"]').boundingBox();
      if (width < 600) {
        const touch = await context.newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2, id: 1 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2, id: 1 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
        await page.mouse.up();
      }
      assert.deepEqual(await list.getByRole('listitem').evaluateAll(nodes => nodes.slice(0, 3).map(n => n.dataset.orderChapter)), ['c2', 'c3', 'c1']);
      await handle.focus(); await page.keyboard.press('ArrowUp');
      assert.deepEqual(await list.getByRole('listitem').evaluateAll(nodes => nodes.slice(0, 3).map(n => n.dataset.orderChapter)), ['c2', 'c1', 'c3']);
      await list.hover(); await page.mouse.wheel(0, 1200);
      await page.waitForFunction(() => document.querySelector('.sc-chapter-order-list').scrollTop > 0);
      await dialog.screenshot({ path: join(tmpdir(), `chapter-order-${mode}.png`) });
      await list.evaluate(node => { node.scrollTop = 0; });
      const dragStart = await handle.boundingBox();
      const scrollArea = await list.boundingBox();
      await page.mouse.move(dragStart.x + dragStart.width / 2, dragStart.y + dragStart.height / 2);
      await page.mouse.down();
      await page.mouse.move(scrollArea.x + 40, scrollArea.y + scrollArea.height - 8, { steps: 10 });
      await page.waitForFunction(() => document.querySelector('.sc-chapter-order-list').scrollTop > 40);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      assert.equal(await dialog.isVisible(), true, 'Escape cancels a drag before closing the dialog');
      await page.keyboard.press('Escape');
      assert.equal(saved.length, 0, 'closing discards unsaved drag changes');
      await page.getByRole('button', { name: 'Sắp xếp chương', exact: true }).click();
      assert.match(await list.getByRole('listitem').first().innerText(), /Chapter 1\b/);
      await dialog.getByRole('button', { name: 'Đưa xuống: Chapter 1', exact: true }).click();
      failSave = true;
      await dialog.getByRole('button', { name: 'Lưu thứ tự' }).click();
      await dialog.getByRole('alert').waitFor();
      assert.equal(await dialog.isVisible(), true);
      failSave = false;
      await dialog.getByRole('button', { name: 'Lưu thứ tự' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(saved.length, 1);
      assert.equal(saved[0].length, 25);
      assert.equal(new Set(saved[0]).size, 25);
      assert.deepEqual(saved[0].slice(0, 3), ['c2', 'c1', 'c3']);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(tmpdir(), `chapter-table-${mode}.png`), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
});
