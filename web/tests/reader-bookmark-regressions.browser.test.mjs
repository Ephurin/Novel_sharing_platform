import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

let server, browser, base;
before(async () => {
  server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
});
after(async () => { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); });

const paragraphs = Array.from({ length: 55 }, (_, index) => `Dòng ${index + 1}. Người lữ hành bước tiếp.`);
const savedBookmarks = () => paragraphs.slice(0, 51).map((excerpt, paragraphIndex) => ({
  bookmarkId: `bookmark-${paragraphIndex}`, novelId: 'novel-1', chapterId: 'c-1', paragraphIndex,
  startOffset: 0, endOffset: excerpt.length, pageOffset: 0, excerpt, novelTitle: 'Truyện thử',
  chapterTitle: 'Chương 1: Gió mới', chapterNumber: 1, updatedAt: '2026-11-17T00:00:00Z', coverImageUrl: null
}));

async function fixture(t, { role = 'READER', width = 1440, theme = 'light', contents = [paragraphs.join('\n\n')], items = [], pageTwo } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], requests = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(({ role, theme }) => {
    localStorage.setItem('storycraft-theme', theme);
    if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
  }, { role, theme });
  const chapters = contents.map((content, index) => ({ chapterId: `c-${index + 1}`, novelId: 'novel-1', chapterNumber: index + 1, title: `Chương ${index + 1}: Gió mới`, content, isVip: false, priceCoins: 0 }));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    let data = [], meta = {};
    if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
    else if (url.pathname.endsWith('/reading/preferences/me')) data = { fontSize: 18, lineHeight: 1.8, background: 'LIGHT' };
    else if (url.pathname.endsWith('/reading/novels/novel-1')) data = { novelId: 'novel-1', title: 'Truyện thử', authorId: 'author-1', chapters };
    else if (url.pathname.includes('/reading/chapters/')) data = chapters.find(item => url.pathname.endsWith(`/${item.chapterId}`));
    else if (url.pathname.endsWith('/reading/bookmark-entries/me') && method === 'GET') {
      const pageNumber = Number(url.searchParams.get('page')), limit = Number(url.searchParams.get('limit'));
      requests.push(pageNumber);
      if (pageNumber === 2 && pageTwo && await pageTwo() === false) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Không tải được trang bookmark tiếp theo.' } } });
      data = items.slice((pageNumber - 1) * limit, pageNumber * limit);
      meta = { totalItems: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)) };
    } else if (url.pathname.includes('/reading/bookmark-entries/me/') && method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      writes.push({ method, id }); items = items.filter(item => item.bookmarkId !== id);
      return route.fulfill({ status: 204 });
    } else if (url.pathname.endsWith('/reading/bookmark-entries/me') && method === 'POST') {
      const input = route.request().postDataJSON(); writes.push({ method, input }); data = { bookmarkId: 'new-bookmark' };
      items.push({ ...input, ...data, updatedAt: new Date().toISOString() });
    }
    await route.fulfill({ json: { success: true, data, meta } });
  });
  const prefix = role === 'READER' ? '/reader' : '/public';
  await page.goto(`${base}${prefix}/chapters/c-1`);
  await expect(page.getByRole('article', { name: 'Nội dung chương' })).toBeVisible();
  return { page, requests, writes, items: () => items, prefix };
}

test('a bookmark on API page two is removable without reopening the library or rewriting it', async t => {
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const { page, requests, writes, items } = await fixture(t, { width, theme, items: savedBookmarks(), pageTwo: () => gate });
    try {
      await expect.poll(() => requests.includes(2)).toBe(true);
      const target = page.locator('.chapter-prose > p').nth(50);
      await target.click({ position: { x: 8, y: 8 } });
      await expect(page.locator('.sc-reading-bookmark-action')).toBeDisabled();
      release(true);
      const remove = page.getByRole('button', { name: 'Xóa bookmark', exact: true });
      await expect(remove).toBeEnabled();
      await expect(remove).toHaveAttribute('aria-pressed', 'true');
      await remove.click();
      await expect.poll(() => writes.length).toBe(1);
      assert.deepEqual(writes, [{ method: 'DELETE', id: 'bookmark-50' }]);
      assert.equal(items().length, 50);
      assert.ok(items().every(item => item.updatedAt === '2026-11-17T00:00:00Z'));
      await expect(page.locator('.sc-reading-bookmark-action')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.sc-reading-bookmark-action')).toHaveAccessibleName('Bookmark');
    } finally { release(true); }
  }
});

test('a failed later bookmark page cannot offer an incorrect save and can be retried', async t => {
  let fail = true;
  const { page, requests, writes } = await fixture(t, { items: savedBookmarks(), pageTwo: () => !fail });
  await expect.poll(() => requests.includes(2)).toBe(true);
  await page.locator('.chapter-prose > p').nth(50).click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.sc-reading-bookmark-action')).toBeDisabled();
  assert.deepEqual(writes, []);
  await page.getByRole('complementary', { name: 'Công cụ đọc chương' }).getByRole('button', { name: 'Bookmark', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Bookmark', exact: true });
  await expect(drawer.getByRole('alert')).toContainText('Không tải được trang bookmark tiếp theo.');
  fail = false;
  await drawer.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(drawer.locator('.sc-reading-bookmark-entry')).toHaveCount(51);
  await drawer.getByRole('button', { name: 'Đóng hộp thoại', exact: true }).click();
  await page.locator('.chapter-prose > p').nth(50).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toBeEnabled();
  assert.deepEqual(writes, []);
});

test('leading separators retain a real Tab entry, arrow navigation and stable bookmark indices across chapters', async t => {
  for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 390, 'dark']]) {
    const { page, writes } = await fixture(t, { role, width, theme, contents: [
      '---\n\n***\n\nĐoạn đầu.\n\n---\n\n> Lời kể tiếp theo.\n\nĐoạn cuối.',
      '***\n\nMở đầu chương hai.\n\nĐoạn kế tiếp.'
    ] });
    async function tabIntoProse() {
      const entry = page.locator('.chapter-prose > p').first();
      await expect(page.locator('.chapter-prose > [tabindex="0"]')).toHaveCount(1);
      const report = page.locator('.sc-reader-chapter-heading button').last();
      await (await report.count() ? report : page.locator('.sc-reader-chapter-heading h1')).focus();
      await page.keyboard.press('Tab'); await expect(entry).toBeFocused();
      return entry;
    }
    const first = await tabIntoProse();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sc-reading-bookmark-action')).toBeFocused();
    await page.locator('.sc-reading-bookmark-action').click();
    await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toBeEnabled();
    const saved = role === 'READER' ? writes[0].input : await page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks'))[0]);
    assert.equal(saved.paragraphIndex, 2, 'Persisted indices must still include separators');
    await page.keyboard.press('Escape'); await expect(first).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(page.locator('.chapter-prose > blockquote')).toBeFocused();
    await page.keyboard.press('Space'); await expect(page.locator('.sc-reading-bookmark-action')).toBeFocused();
    await page.keyboard.press('Escape'); await page.keyboard.press('ArrowDown');
    await expect(page.locator('.chapter-prose > p').last()).toBeFocused();
    await page.getByRole('complementary', { name: 'Công cụ đọc chương' }).getByRole('link', { name: 'Chương sau', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chương 2: Gió mới', exact: true })).toBeVisible();
    await tabIntoProse();
  }
});
