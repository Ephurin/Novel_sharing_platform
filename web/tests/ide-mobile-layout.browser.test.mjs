// Author IDE phone layout (review findings C03 + V2-06).
// Runs against the local web/dist build (`npm run build` first) with mocked API responses and measures
// geometry with getBoundingClientRect, elementFromPoint and scrollWidth at 1440x900, 768x1024 and 390x844.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readerEvidence } from './reader-browser-evidence.mjs';

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
const now = '2026-11-20T10:00:00.000Z';
const author = { userId: 'u-author', publicKey: 'tac-gia', email: 'author@example.invalid', username: 'tacgia', displayName: 'Tác giả Thử', avatarUrl: null, role: 'AUTHOR', status: 'ACTIVE' };
const novel = { novelId: 'novel-1', authorId: 'u-author', title: 'Mùa Hạ Không Tên', slug: null, synopsis: 'Một câu chuyện thử nghiệm bố cục.', genres: ['Fantasy'], genre: 'Fantasy', coverImageUrl: null, status: 'DRAFT', serialStatus: 'ONGOING', ageRating: 'EVERYONE', chaptersCount: 2, publishedChaptersCount: 0, createdAt: now, updatedAt: now };
const longTitle = 'Chương 1: Lớp 12A3 và cây phượng già bên cửa sổ';
const content = Array.from({ length: 6 }, (_, index) => `Đoạn ${index + 1}. Mùa hè năm ấy, cây phượng trước lớp nở muộn hơn mọi năm.`).join('\n\n');
const chapter = { chapterId: 'chapter-1', novelId: 'novel-1', title: longTitle, chapterNumber: 1, status: 'DRAFT', content, isVip: false, priceCoins: 0, wordCount: 90, draftVersion: 1, draft: { content, title: longTitle, version: 1 }, createdAt: now, updatedAt: now };
const other = { ...chapter, chapterId: 'chapter-2', chapterNumber: 2, title: 'Chương 2: Cơn mưa đầu hạ', draft: undefined };

function apiData(url) {
  const p = url.pathname.replace(/^.*\/api\/v1/, '');
  const list = items => ({ data: items, meta: { page: 1, limit: 20, totalItems: items.length, totalPages: 1 } });
  if (p === '/auth/me') return { data: author };
  if (p === '/novels/me') return list([novel]);
  if (p === '/novels/novel-1') return { data: novel };
  if (p === '/novels/novel-1/chapters') return list([chapter, other]);
  if (p === '/chapters/chapter-1') return { data: chapter };
  if (p === '/chapters/chapter-2') return { data: other };
  return list([]);
}

async function openIde(browser, base, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, reducedMotion: 'reduce', locale: 'vi-VN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('storycraft-theme', 'light');
    localStorage.setItem('ephurin_access_token', 'ide-mobile-fixture-token');
  });
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ json: { success: true, error: null, meta: {}, data: chapter } });
    return route.fulfill({ json: { success: true, error: null, meta: {}, ...apiData(new URL(route.request().url())) } });
  });
  await page.goto(`${base}/sang-tac/viet?novelId=novel-1&chapterId=chapter-1`);
  const title = page.getByRole('textbox', { name: 'Tiêu đề chương', exact: true });
  await expect(title).toHaveValue(longTitle, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { page, context, errors, title };
}

const noPageOverflow = async (page, label) => {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, body: document.body.scrollWidth }));
  assert.ok(size.scroll <= size.client + 1 && size.body <= size.client + 1, `${label}: page scrolls sideways (${size.scroll}/${size.body} > ${size.client})`);
};

// Every visible interactive control inside `root` (default: the whole document): its box, and whether a hit test
// at the centre of its on-screen part lands on it.
const measureControls = (page, rootSelector) => page.evaluate(selector => {
  const root = selector ? document.querySelector(selector) : document.body;
  const query = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]';
  const out = [];
  for (const element of root.querySelectorAll(query)) {
    if (element.closest('[inert], [aria-hidden="true"]')) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const r = element.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth), top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (right - left < 1 || bottom - top < 1) continue; // scrolled out of view
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    const name = element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40) || element.tagName;
    out.push({ name, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, top: r.top, bottom: r.bottom, left: r.left, right: r.right, hit: Boolean(hit && (hit === element || element.contains(hit) || hit.closest('label')?.control === element)) });
  }
  return out;
}, rootSelector);

const assertTargets = (controls, label) => {
  assert.ok(controls.length > 0, `${label}: found no controls`);
  for (const control of controls) {
    assert.ok(control.width >= 32 && control.height >= 32, `${label}: "${control.name}" is ${control.width}x${control.height}`);
    assert.ok(control.hit, `${label}: "${control.name}" is covered at its centre`);
    assert.ok(control.left >= -1 && control.right <= 391, `${label}: "${control.name}" leaves the viewport`);
  }
};

// Rows of the editor toolbar: controls whose vertical centres lie within 12px share a row.
const toolbarRows = controls => {
  const centres = controls.map(c => (c.top + c.bottom) / 2).sort((a, b) => a - b);
  const rows = [];
  for (const centre of centres) if (!rows.length || centre - rows[rows.length - 1] > 12) rows.push(centre);
  return rows.length;
};

test('Author IDE phone layout (C03, V2-06)', { timeout: 300000 }, async t => {
  const output = await readerEvidence('ide-mobile-layout-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    await t.test('phone 390x844: title near the top, two toolbar rows, 32px targets, one "Thêm" sheet', async () => {
      const { page, context, errors, title } = await openIde(browser, base, VIEWPORTS.mobile);
      try {
        await shot(page, 'mobile');
        // 1. Title starts within the top 260px and shows the whole title.
        const titleBox = await title.evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top, right: r.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }; });
        assert.ok(titleBox.top <= 260, `title starts at ${titleBox.top}px`);
        assert.ok(titleBox.right <= 390, 'title box leaves the viewport');
        assert.ok(titleBox.scrollWidth <= titleBox.clientWidth + 1 && titleBox.scrollHeight <= titleBox.clientHeight + 1, `title is cut off (${JSON.stringify(titleBox)})`);

        // 2. The editor toolbar (workbench rows and any format toolbar above the page) takes at most two rows.
        const toolbar = [...await measureControls(page, '.sc-studio-workbench'), ...(await page.locator('.sc-format-toolbar').count() ? await measureControls(page, '.sc-format-toolbar') : [])];
        assert.ok(toolbarRows(toolbar) <= 2, `editor toolbar has ${toolbarRows(toolbar)} rows`);
        const commands = page.getByRole('toolbar', { name: 'Công cụ bản thảo', exact: true });
        for (const name of ['Tệp', 'Chèn', 'Chỉnh sửa', 'Xem', 'Ghi chú', 'Hoàn tác nội dung', 'Làm lại nội dung', 'Xem trước như độc giả']) await expect(commands.getByRole('button', { name, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Trợ lý viết', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Thêm lệnh trợ lý viết', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Gửi duyệt chương' })).toBeVisible();
        await expect(page.getByTestId('btn-story-brain')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cẩm nang', exact: true })).toBeVisible();

        // 3. Every visible control is at least 32x32 and reachable at its centre.
        assertTargets(await measureControls(page), 'mobile');
        await noPageOverflow(page, 'mobile');

        // AI menu still opens from the toolbar.
        await page.getByRole('button', { name: 'Thêm lệnh trợ lý viết', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: 'Viết tiếp từ con trỏ' })).toBeVisible();
        await page.keyboard.press('Escape');

        // Secondary actions live in one "Thêm" sheet and stay usable.
        await page.getByRole('button', { name: 'Thêm', exact: true }).click();
        const sheet = page.getByRole('dialog', { name: 'Thêm công cụ', exact: true });
        await expect(sheet).toBeVisible();
        await page.waitForTimeout(400);
        for (const name of ['Lịch sử bản thảo', 'Lên lịch', 'Miễn phí', 'Chương VIP', 'Căn đều hai bên (Chuẩn sách xuất bản)', 'Căn trái', 'Căn giữa (Thơ, tiêu đề phụ, lời đề từ)', 'Căn phải (Ký tên, ngày tháng, xuất xứ)',
          'Đổi kiểu chữ (7 phông chữ Việt hóa)', 'Giảm cỡ chữ (A-)', 'Tăng cỡ chữ (A+)', 'Chọn mức giãn dòng', 'Thụt đầu dòng đoạn văn (~2.5rem - Quy chuẩn tiểu thuyết)', 'In đậm (**văn bản**)', 'In nghiêng (*văn bản*)',
          'Gạch chân (<u>văn bản</u>)', 'Gạch ngang (~~văn bản~~)', 'Trích dẫn lời thoại “...”', 'Gạch đầu dòng lời thoại (— )', 'Chèn ký tự đặc biệt', 'Giao diện', 'Chế độ tập trung']) {
          await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
        }
        await expect(sheet.getByRole('spinbutton', { name: 'Cỡ chữ', exact: true })).toBeVisible();
        await expect(sheet.getByRole('spinbutton', { name: 'Giãn dòng', exact: true })).toBeVisible();
        await shot(page, 'mobile-more-sheet');
        assertTargets(await measureControls(page, '.sc-studio-more-sheet'), 'mobile sheet');
        await noPageOverflow(page, 'mobile sheet');
        await sheet.getByRole('button', { name: 'Căn trái', exact: true }).click();
        await expect(sheet.getByRole('button', { name: 'Căn trái', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await sheet.getByRole('button', { name: 'Lịch sử bản thảo', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Lịch sử bản thảo', exact: true })).toBeVisible();
        await expect(sheet).toHaveCount(0);
        assert.deepEqual(errors, [], 'mobile: page errors');
      } finally { await context.close(); }
    });

    for (const [size, viewport] of [['tablet', VIEWPORTS.tablet], ['desktop', VIEWPORTS.desktop]]) {
      await t.test(`${size} ${viewport.width}x${viewport.height}: layout keeps the full toolbars`, async () => {
        const { page, context, errors, title } = await openIde(browser, base, viewport);
        try {
          await shot(page, size);
          assert.equal(await title.evaluate(element => element.tagName), 'INPUT');
          await expect(page.getByRole('button', { name: 'Thêm', exact: true })).toHaveCount(0);
          await expect(page.locator('#studio-format-toolbar')).toBeVisible();
          await expect(page.locator('.sc-studio-command-row .sc-studio-settings-controls').getByRole('button', { name: 'Lịch sử bản thảo', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Căn trái', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Giao diện', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Chế độ tập trung', exact: true })).toBeVisible();
          await noPageOverflow(page, size);
          assert.deepEqual(errors, [], `${size}: page errors`);
        } finally { await context.close(); }
      });
    }
  } finally {
    await browser.close();
    await server.close();
    console.log(`IDE mobile layout screenshots: ${output}`);
  }
});
