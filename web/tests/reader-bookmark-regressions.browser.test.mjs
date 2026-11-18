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

async function fixture(t, { role = 'READER', width = 1440, theme = 'light', background = 'LIGHT', contents = [paragraphs.join('\n\n')], items = [], pageTwo, legacyBookmark, initialSearch = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], requests = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(({ role, theme, items, legacyBookmark }) => {
    localStorage.setItem('storycraft-theme', theme);
    if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
    else if (items.length) localStorage.setItem('storycraft-guest-reading-bookmarks', JSON.stringify(items));
    if (legacyBookmark && !localStorage.getItem('fixture-legacy-bookmark-seeded')) {
      localStorage.setItem('fixture-legacy-bookmark-seeded', '1');
      localStorage.setItem(`storycraft-workspace:guest:reading-bookmark:${legacyBookmark.novelId}`, JSON.stringify(legacyBookmark));
    }
  }, { role, theme, items, legacyBookmark });
  const chapters = contents.map((content, index) => ({ chapterId: `c-${index + 1}`, novelId: 'novel-1', chapterNumber: index + 1, title: `Chương ${index + 1}: Gió mới`, content, isVip: false, priceCoins: 0 }));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    let data = [], meta = {};
    if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
    else if (url.pathname.endsWith('/reading/preferences/me')) data = { fontSize: 18, lineHeight: 1.8, background };
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
  await page.goto(`${base}${prefix}/chapters/c-1${initialSearch}`);
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
  await drawer.getByRole('button', { name: 'Thử lại', exact: true }).click();
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

test('a restored first bookmark retains Tab entry after blur, rerenders and reload', { timeout: 90000 }, async t => {
  for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 390, 'dark']]) {
    for (const leadingSeparators of [false, true]) {
      const excerpt = 'Lời mở đầu của chuyến đi.';
      const mark = { ...savedBookmarks()[0], paragraphIndex: leadingSeparators ? 2 : 0, excerpt, endOffset: excerpt.length };
      const content = `${leadingSeparators ? '---\n\n***\n\n> ' : ''}${excerpt}\n\nĐoạn tiếp theo.`;
      const { page, prefix } = await fixture(t, { role, width, theme, contents: [content], items: [mark] });
      await page.goto(`${base}${prefix}/bookmarks?novelId=novel-1`);
      await page.locator('.sc-reading-bookmark-open').click();
      await expect(page).toHaveURL(/bookmark=1&paragraph=/);
      const entry = page.locator('.chapter-prose > p, .chapter-prose > blockquote').first();
      await expect(entry).toBeFocused();
      await expect(entry).toHaveAttribute('tabindex', '0');
      await expect(page.locator('.sc-reading-line-flash')).toHaveCount(0);
      await expect(page.locator('.chapter-prose > [tabindex="0"]')).toHaveCount(1);
      const report = page.locator('.sc-reader-chapter-heading button').last();
      await (await report.count() ? report : page.locator('.sc-reader-chapter-heading h1')).focus();
      await page.keyboard.press('Tab');
      await expect(entry).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Xóa bookmark', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(entry).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(entry).not.toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(entry).toBeFocused();
      await page.reload();
      await expect(entry).toBeFocused();
      await expect(entry).toHaveAttribute('tabindex', '0');
    }
  }
});

test('a first legacy guest link restores the migrated position without a reload', { timeout: 60000 }, async t => {
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
    const legacyBookmark = { novelId: 'novel-1', chapterId: 'c-1', paragraphIndex: 30, pageOffset: .2, updatedAt: '2026-11-17T00:00:00Z' };
    const { page } = await fixture(t, { role: 'GUEST', width, theme, legacyBookmark, initialSearch: '?bookmark=1' });
    const target = page.locator('.chapter-prose > p').nth(30);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('storycraft-guest-reading-bookmarks') ?? '[]').length)).toBe(1);
    assert.equal(await page.evaluate(() => localStorage.getItem('storycraft-workspace:guest:reading-bookmark:novel-1')), null);
    await expect(target).toBeFocused();
    await expect(target).toHaveAttribute('tabindex', '0');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const box = await target.boundingBox();
    assert.ok(box.y >= 0 && box.y < 900, 'The migrated paragraph is in the viewport on the first visit');
    await page.reload();
    await expect(target).toBeFocused();
  }
});

test('legacy separator bookmarks preserve their scroll position and focus a nearby readable block', { timeout: 60000 }, async t => {
  for (const [role, width, theme] of [['GUEST', 1440, 'light'], ['READER', 390, 'dark']]) {
    for (const trailing of [false, true]) {
      const before = paragraphs.slice(0, 30);
      const content = [...before, '---', '***', ...(trailing ? [] : ['> Đoạn ngay sau đường phân cách.', 'Đoạn kết.'])].join('\n\n');
      const item = { ...savedBookmarks()[0], paragraphIndex: 30, pageOffset: .328125, excerpt: '', endOffset: null };
      const position = role === 'GUEST' && trailing
        ? { legacyBookmark: { novelId: item.novelId, chapterId: item.chapterId, paragraphIndex: item.paragraphIndex, pageOffset: item.pageOffset, updatedAt: item.updatedAt }, initialSearch: '?bookmark=1' }
        : { items: [item], initialSearch: '?bookmark=1&paragraph=30&offset=0.328125' };
      const { page } = await fixture(t, { role, width, theme, contents: [content], ...position });
      const target = trailing ? page.locator('.chapter-prose > p').last() : page.locator('.chapter-prose > blockquote');
      await expect(target).toBeFocused();
      await expect(target).toHaveAttribute('tabindex', '0');
      const anchor = await page.locator('.chapter-prose > hr').first().evaluate(node => {
        const box = node.getBoundingClientRect();
        return { top: box.top + scrollY, height: box.height, scroll: scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight };
      });
      const expectedScroll = Math.max(0, Math.min(anchor.maxScroll, anchor.top + anchor.height * item.pageOffset - 900 * .25));
      assert.ok(Math.abs(anchor.scroll - expectedScroll) < 2, `Scroll still targets the original separator within the page bounds: ${JSON.stringify(anchor)}`);
      await page.keyboard.press('Tab');
      await expect(target).not.toBeFocused();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
      await page.keyboard.press('Shift+Tab');
      await expect(target).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.sc-reading-bookmark-action')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(target).toBeFocused();
      assert.equal(await page.evaluate(() => document.querySelector('.chapter-prose > p').tabIndex), -1);
    }
  }
});

test('bookmark action is icon-only, dismisses on outside click, and leaves no outline box on Escape', async t => {
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
    const { page } = await fixture(t, { width, theme });
    const first = page.locator('.chapter-prose > p').first();
    await first.click({ position: { x: 10, y: 10 } });
    const action = page.locator('.sc-reading-bookmark-action');
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName('Bookmark');
    await expect(action).toHaveText('bookmark_add');
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(action).toHaveCSS('border-top-style', 'none');
    await expect(action).toHaveCSS('box-shadow', 'none');
    const box = await action.boundingBox();
    assert.equal(Math.round(box.width), 44);
    assert.equal(Math.round(box.height), 44);

    // Clicking outside the story paragraphs dismisses the floating bookmark icon and line highlight
    await page.locator('.sc-reader-chapter-heading').click({ position: { x: 8, y: 8 } });
    await expect(action).toHaveCount(0);
    await expect(page.locator('.sc-reading-line-highlight')).toHaveCount(0);

    // Reopen and press Escape: dismisses without drawing a rectangular outline or box around the paragraph
    await first.click({ position: { x: 10, y: 10 } });
    await expect(action).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(action).toHaveCount(0);
    await expect(first).toBeFocused();
    await expect(first).toHaveCSS('outline-style', 'none');
    await expect(first).toHaveCSS('box-shadow', 'none');
  }
});

test('bookmark-remove icon maintains WCAG contrast across app theme and reader paper combinations', async t => {
  for (const [theme, background] of [['dark', 'LIGHT'], ['dark', 'SEPIA'], ['dark', 'ROSE'], ['light', 'DARK'], ['light', 'BLACK']]) {
    const { page } = await fixture(t, { theme, background });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.sc-reader-workspace')).toHaveAttribute('data-reader-background', background);
    await page.locator('.chapter-prose > p').first().click({ position: { x: 10, y: 10 } });
    const action = page.locator('.sc-reading-bookmark-action');
    await action.click();
    await expect(action).toHaveAttribute('aria-pressed', 'true');
    await expect(action).toHaveText('bookmark_remove');
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const ratio = await page.evaluate(() => {
      const parseRgb = value => value.match(/\d+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const c = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
      };
      const workspace = document.querySelector('.sc-reader-workspace');
      const icon = document.querySelector('.sc-reading-bookmark-action .material-symbols-outlined');
      const l1 = lum(parseRgb(getComputedStyle(icon).color));
      const l2 = lum(parseRgb(getComputedStyle(workspace).backgroundColor));
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    assert.ok(ratio >= 4.5, `${theme}/${background} bookmark_remove contrast is ${ratio.toFixed(2)}:1`);
  }
});
