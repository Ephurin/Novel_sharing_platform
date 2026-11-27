// Layout regressions for UI review round 2 (C01, V2-04, V2-02, V2-03, C05, C04).
// Runs against the local web/dist build (`npm run build` first) with mocked API responses and measures
// geometry with getBoundingClientRect / scrollWidth at 1440x900, 768x1024 and 390x844.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { mockReadingLocators } from './helpers/reader-locators.mjs';
import { readerEvidence } from './reader-browser-evidence.mjs';

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
const ALL = Object.entries(VIEWPORTS);
const now = '2026-11-20T10:00:00.000Z';

const users = {
  GUEST: null,
  READER: { userId: 'u-reader', publicKey: 'doc-gia', email: 'reader@example.invalid', username: 'docgia', displayName: 'Độc giả Thử', avatarUrl: null, role: 'READER', status: 'ACTIVE' },
  AUTHOR: { userId: 'u-author', publicKey: 'tac-gia', email: 'author@example.invalid', username: 'tacgia', displayName: 'Tác giả Thử', avatarUrl: null, role: 'AUTHOR', status: 'ACTIVE' },
  MODERATOR: { userId: 'u-mod', publicKey: 'dieu-hanh', email: 'mod@example.invalid', username: 'dieuhanh', displayName: 'Điều hành viên Thử', avatarUrl: null, role: 'MODERATOR', status: 'ACTIVE' },
  ADMIN: { userId: 'u-admin', publicKey: 'quan-tri', email: 'admin@example.invalid', username: 'quantri', displayName: 'Quản trị Thử', avatarUrl: null, role: 'ADMIN', status: 'ACTIVE' }
};
const detailUserId = '0b6f3c2e-5a41-4c8e-9d2b-7f1e3a9c4d55';
const withdrawId = '5d2a9e41-3b7c-4f18-a6d0-c9e8b7a61234';
const genres = ['Cultivation', 'Cyberpunk', 'Đời thường', 'Fantasy', 'Hài hước', 'Huyền huyễn hành động', 'Trinh thám'];
const tags = ['Ẩm thực', 'Bí ẩn', 'Chiến trận', 'Chiến tranh', 'Chữa lành', 'Phiêu lưu'];
const novels = Array.from({ length: 6 }, (_, index) => ({
  novelId: `novel-${index + 1}`, authorId: 'u-author', title: `Tác phẩm thử ${index + 1}`, slug: `tac-pham-thu-${index + 1}`,
  synopsis: 'Một câu chuyện thử nghiệm bố cục.', authorNote: null, genres: [genres[index]], genre: genres[index], coverImageUrl: null,
  status: index === 0 ? 'DRAFT' : 'PUBLISHED', serialStatus: 'ONGOING', storyFormat: null, ageRating: 'EVERYONE', likesCount: 0, viewsCount: 10 * index,
  chaptersCount: 5 + index, publishedChaptersCount: index, latestChapter: null, createdAt: now, updatedAt: now
}));
const chapters = [1, 2].map(number => ({ chapterId: `c-${number}`, novelId: 'novel-1', chapterNumber: number, title: `Chương ${number}: Cuộc gặp gỡ`, isVip: false, priceCoins: 0, wordCount: 1200 }));
const chapterText = Array.from({ length: 4 }, (_, index) => `Đoạn ${index + 1}. Buổi sớm, ánh nắng trải dài trên con đường nhỏ.`).join('\n\n');

function apiData(role, url) {
  const p = url.pathname.replace(/^.*\/api\/v1/, '');
  const list = (items, total = items.length) => ({ data: items, meta: { page: 1, limit: 20, totalItems: total, totalPages: 1 } });
  if (p === '/auth/me') return users[role] ? { data: users[role] } : null;
  if (p === '/admin/access') return { data: { scope: 'SUPER_ADMIN', permissions: ['content', 'users', 'finance', 'access', 'audit', 'selection.reconsider', 'placement.manage'] } };
  if (p === `/admin/users/${detailUserId}`) return { data: { user: { user_id: detailUserId, username: 'docgia04', email: 'docgia04@example.invalid', role: 'READER', status: 'ACTIVE', created_at: now, last_login_at: now, display_name: 'Độc giả Bốn', bio: 'Tài khoản thử nghiệm bố cục.', avatar_url: null, admin_scope: null }, novels: [], sanctions: [], history: [] } };
  if (p === '/admin/taxonomy') return { data: { genres: genres.map((name, i) => ({ genreId: `g-${i}`, name, usageCount: i + 1, slug: `g-${i}`, description: null, createdAt: now })), tags: tags.map((name, i) => ({ tagId: `t-${i}`, name, usageCount: i + 1, slug: `t-${i}`, createdAt: now })) } };
  if (p === '/admin/jobs') return { data: [] };
  if (p === '/admin/audit') return list(Array.from({ length: 4 }, (_, i) => ({ audit_id: `a-${i}`, actor_id: 'u-mod', action: 'REVIEW_DETAIL_VIEW', target_type: 'NOVEL', target_id: '7b3b65e7-cad6-5326-93fe-8da088ac77b8', affected_user_id: null, reason: null, before_state: null, after_state: null, created_at: now, actor_username: 'dieuhanh' })));
  if (p === '/admin/withdraw-requests') return list([{ withdrawRequestId: withdrawId, userId: 'u-author', username: 'tacgia', walletId: 'w-1', amountCoins: 110, bankAccountLabel: 'Tài khoản ngân hàng thử •••• 2026', rejectionReason: null, status: 'PENDING', transactionId: 'tx-1', createdAt: now }]);
  if (p === `/admin/withdraw-requests/${withdrawId}/reconciliation`) return { data: { request: { withdraw_request_id: withdrawId, wallet_id: 'w-1', amount_coins: 110, bank_account_label: 'Tài khoản ngân hàng thử •••• 2026', status: 'PENDING', transaction_id: 'tx-1', reviewed_by: null, reviewed_at: null, rejection_reason: null, created_at: now, updated_at: now, username: 'tacgia' }, state: { withdraw_request_id: withdrawId, status: 'UNCONFIRMED', version: 0 }, history: [] } };
  if (p === '/moderator/access') return { data: { role: 'MODERATOR', permissions: ['publication.review', 'selection.review'] } };
  if (p === '/moderator/reviews') return list([{ reviewId: 'r-1', reviewSlug: 'tac-pham-thu-1--1', targetType: 'NOVEL', targetId: 'novel-1', source: 'PUBLICATION_REQUEST', status: 'PENDING', evidenceId: 'e-1', targetTitle: 'Tác phẩm thử 1', targetContext: null, excerpt: null, matchedKeywords: [], topReason: null, reportCount: 0, createdAt: now }]);
  if (p === '/account/nominations') return { data: { items: [], hasMore: false } };
  if (p === '/novels/me') return list(novels);
  if (p === '/novels/genres') return { data: genres };
  if (p === '/reading/novels/novel-1') return { data: { novelId: 'novel-1', title: 'Hành trình của mây', authorName: 'Người kể chuyện', authorId: 'u-author', coverImageUrl: null, synopsis: 'Giới thiệu.', chapters } };
  if (p.startsWith('/reading/chapters/')) { const chapter = chapters.find(item => p.endsWith('/' + item.chapterId)); return chapter ? { data: { ...chapter, content: chapterText } } : null; }
  if (p === '/reading/preferences/me') return { data: { fontFamily: 'Be Vietnam Pro', fontSize: 18, background: 'LIGHT', lineHeight: 1.8, margin: 24, textAlign: 'LEFT' } };
  if (p.endsWith('/statistics')) return { data: { isFollowing: false, notificationsEnabled: false, ratingsCount: 0, ratingAverage: null } };
  if (p === '/wallet/me') return { data: { walletId: 'w-1', coinsBalance: 0, lockedCoins: 0 } };
  return list([]);
}

async function openPage(browser, base, role, viewport, route) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, reducedMotion: 'reduce', locale: 'vi-VN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(signedIn => {
    localStorage.setItem('storycraft-theme', 'light');
    if (signedIn) localStorage.setItem('ephurin_access_token', 'layout-r2-fixture-token');
  }, Boolean(users[role]));
  await page.route('**/api/v1/**', async request => {
    const body = apiData(role, new URL(request.request().url()));
    if (!body) return request.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_FOUND', message: 'fixture' } } });
    return request.fulfill({ json: { success: true, error: null, meta: {}, ...body } });
  });
  await mockReadingLocators(page, [{ novelId: 'novel-1', chapters }]);
  await page.goto(base + route);
  return { page, context, errors };
}

const rect = locator => locator.evaluate(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });
const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const noPageOverflow = async (page, label) => {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(size.scroll <= size.client + 1, `${label}: page scrolls sideways (${size.scroll} > ${size.client})`);
};

test('UI review round 2 layout regressions', { timeout: 420000 }, async t => {
  const output = await readerEvidence('layout-review-r2-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    await t.test('C01: admin pages keep readable columns and in-card controls', async () => {
      const pages = [
        ['user-detail', `/quan-tri/nguoi-dung/${detailUserId}`, 'Tài khoản'],
        ['taxonomy', '/quan-tri/the-loai-va-nhan', 'Thể loại và thẻ'],
        ['audit', '/quan-tri/nhat-ky', 'Nhật ký quản trị'],
        ['withdraws', '/quan-tri/rut-tien', 'Yêu cầu rút xu'],
        ['withdraw-detail', `/quan-tri/rut-tien/${withdrawId}`, 'Đối soát thanh toán']
      ];
      for (const [size, viewport] of ALL) {
        for (const [name, route, heading] of pages) {
          const { page, context, errors } = await openPage(browser, base, 'ADMIN', viewport, route);
          const label = `${name}@${viewport.width}`;
          try {
            await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible({ timeout: 20000 });
            await page.waitForTimeout(300);
            await noPageOverflow(page, label);
            const sidebar = page.getByRole('complementary', { name: 'Điều hướng quản trị', includeHidden: true });
            const main = await rect(page.locator('.admin-main'));
            if (viewport.width > 1150) {
              await expect(sidebar).toBeVisible();
              assert.ok(main.left >= 240, `${label}: desktop content still starts after the sidebar`);
            } else {
              await expect(sidebar).toBeHidden();
              assert.ok(main.left < 1, `${label}: content uses the full width (left=${main.left})`);
            }
            for (const dd of await page.locator('.admin-definition dd').all()) {
              const box = await rect(dd);
              assert.ok(box.width >= 120, `${label}: definition value is ${box.width}px wide`);
            }
            for (const panel of await page.locator('.admin-panel').all()) {
              const panelBox = await rect(panel);
              for (const control of await panel.locator('input:visible, button:visible, select:visible').all()) {
                if (await control.evaluate(element => Boolean(element.closest('.admin-table-scroll')))) continue;
                const box = await rect(control);
                assert.ok(box.right <= panelBox.right + 1 && box.left >= panelBox.left - 1, `${label}: control leaves its card (${box.left}-${box.right} vs ${panelBox.left}-${panelBox.right})`);
              }
            }
            if (name === 'taxonomy' && viewport.width >= 768) {
              const cell = page.getByRole('cell', { name: 'Cultivation', exact: true }).first();
              const box = await rect(cell);
              assert.ok(box.width >= 120 && box.height < 60, `${label}: genre name cell is ${box.width}x${box.height}`);
            }
            if (viewport.width <= 1150) {
              await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
              await expect(sidebar).toBeVisible();
              await page.keyboard.press('Escape');
              await expect(sidebar).toBeHidden();
            }
            if (name === 'user-detail' || name === 'taxonomy') await shot(page, `c01-${name}-${size}`);
            assert.deepEqual(errors, [], `${label}: page errors`);
          } finally { await context.close(); }
        }
      }
    });

    await t.test('V2-04: no header nav link is clipped for reader, author and moderator', async () => {
      const widths = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, VIEWPORTS.tablet, VIEWPORTS.mobile];
      for (const viewport of widths) {
        for (const [role, route] of [['READER', '/danh-sach'], ['AUTHOR', '/sang-tac'], ['MODERATOR', '/kiem-duyet/hang-doi']]) {
          const { page, context, errors } = await openPage(browser, base, role, viewport, route);
          const label = `${role}@${viewport.width}`;
          try {
            const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
            await expect(nav).toBeVisible({ timeout: 20000 });
            await page.waitForTimeout(300);
            const items = await nav.evaluate(element => [...element.children].map(child => ({ text: child.textContent.trim(), scroll: child.scrollWidth, client: child.clientWidth })));
            for (const item of items) assert.ok(item.scroll <= item.client + 1, `${label}: "${item.text}" is cut (${item.scroll} > ${item.client})`);
            const navSize = await nav.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth, hint: element.hasAttribute('data-overflow-end') }));
            if (viewport.width >= 1280) assert.ok(navSize.scroll <= navSize.client + 1, `${label}: nav is clipped (${navSize.scroll} > ${navSize.client})`);
            else if (navSize.scroll > navSize.client + 1) assert.ok(navSize.hint, `${label}: nav scrolls without a faded-edge hint`);
            await noPageOverflow(page, label);
            if (role === 'MODERATOR') {
              assert.equal(await page.getByRole('link', { name: 'Hồ sơ điều hành', exact: true }).count(), 0, 'moderator links live in the menu');
              await page.getByRole('button', { name: 'Điều hành', exact: true }).click();
              await expect(page.getByRole('menuitem', { name: 'Hồ sơ điều hành', exact: true })).toBeVisible();
              await expect(page.getByRole('menuitem', { name: 'Lịch sử thao tác', exact: true })).toBeVisible();
              await page.keyboard.press('Escape');
              if (viewport.width >= 1280) {
                await page.getByRole('button', { name: 'Tìm kiếm truyện', exact: true }).click();
                const input = page.getByRole('combobox', { name: 'Tìm kiếm truyện' }).or(page.getByRole('textbox', { name: 'Tìm kiếm truyện' })).first();
                await expect(input).toBeVisible();
                const box = await rect(input);
                assert.ok(box.left >= 0 && box.right <= viewport.width, `${label}: search popover leaves the viewport`);
                await shot(page, `v204-moderator-search-${viewport.width}`);
              }
            }
            if (viewport.width >= 1280) await shot(page, `v204-${role.toLowerCase()}-${viewport.width}`);
            assert.deepEqual(errors, [], `${label}: page errors`);
          } finally { await context.close(); }
        }
      }
    });

    await t.test('V2-02: My nominations renders inside the app shell', async () => {
      for (const [size, viewport] of ALL) {
        const { page, context, errors } = await openPage(browser, base, 'READER', viewport, '/de-cu-cua-toi');
        const label = `nominations@${viewport.width}`;
        try {
          await expect(page.getByRole('heading', { name: 'Đề cử của tôi', exact: true })).toBeVisible({ timeout: 20000 });
          await expect(page.locator('header.sc-navbar')).toBeVisible();
          await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
          const main = page.locator('main.sc-shell-content');
          await expect(main.getByRole('heading', { name: 'Đề cử của tôi', exact: true })).toBeVisible();
          // Same centred frame as the header (and every other account page that uses sc-shell-content).
          const box = await rect(main);
          const frame = await rect(page.locator('.sc-navbar-inner'));
          assert.ok(Math.abs(box.left - frame.left) <= 1 && Math.abs(box.right - frame.right) <= 1, `${label}: content frame ${box.left}-${box.right} differs from header ${frame.left}-${frame.right}`);
          const heading = await rect(main.getByRole('heading', { name: 'Đề cử của tôi', exact: true }));
          assert.ok(heading.left >= 16, `${label}: title touches the edge`);
          await noPageOverflow(page, label);
          await shot(page, `v202-${size}`);
          assert.deepEqual(errors, [], `${label}: page errors`);
        } finally { await context.close(); }
      }
    });

    await t.test('V2-03: reader tool rail never covers the comment form', async () => {
      for (const [size, viewport] of ALL) {
        const { page, context, errors } = await openPage(browser, base, 'READER', viewport, '/reader/chapters/c-1');
        const label = `chapter@${viewport.width}`;
        try {
          await expect(page.getByRole('article', { name: 'Nội dung chương', includeHidden: true })).toBeVisible({ timeout: 20000 });
          const comments = page.locator('section.sc-comments');
          const textbox = comments.locator('.sc-comment-composer [contenteditable="true"]').first();
          await textbox.scrollIntoViewIfNeeded();
          await expect(textbox).toBeVisible();
          const rail = page.getByRole('complementary', { name: 'Công cụ đọc chương', includeHidden: true });
          await page.waitForTimeout(300);
          // Phones use the bottom bar that only appears on a deliberate tap; it must stay out of the way until then.
          if (viewport.width < 768) await expect(rail).toBeHidden();
          else {
            await expect(rail).toBeVisible();
            const railBox = await rect(rail);
            const targets = [['comment card', comments], ['comment box', textbox], ['submit', comments.getByRole('button', { name: 'Gửi bình luận', exact: true })], ['counter', comments.locator('.sc-comment-character-count')]];
            for (const [name, locator] of targets) {
              if (!(await locator.count())) continue;
              assert.ok(!intersects(railBox, await rect(locator)), `${label}: tool rail covers the ${name}`);
            }
          }
          await noPageOverflow(page, label);
          await shot(page, `v203-${size}`);
          assert.deepEqual(errors, [], `${label}: page errors`);
        } finally { await context.close(); }
      }
    });

    await t.test('C05: phone header is two rows with one search and a visible scroll hint', async () => {
      for (const [size, viewport] of ALL) {
        for (const role of ['GUEST', 'READER', 'AUTHOR', 'MODERATOR']) {
          const { page, context, errors } = await openPage(browser, base, role, viewport, '/danh-sach');
          const label = `${role}@${viewport.width}`;
          try {
            const header = page.locator('header.sc-navbar');
            await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible({ timeout: 20000 });
            await page.waitForTimeout(300);
            // Count rows by vertical centre: children whose centres are within 20px share a row.
            const rows = await page.locator('.sc-navbar-inner').evaluate(inner => [...inner.children]
              .filter(child => { const r = child.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(child).visibility !== 'hidden'; })
              .map(child => { const r = child.getBoundingClientRect(); return r.top + r.height / 2; })
              .sort((a, b) => a - b)
              .reduce((centres, centre) => (centres.length && centre - centres.at(-1) <= 20 ? centres : [...centres, centre]), []).length);
            assert.ok(rows <= 2, `${label}: header uses ${rows} rows`);
            const searches = await header.locator('input[aria-label="Tìm kiếm truyện"]:visible, button[aria-label="Tìm kiếm truyện"]:visible').count();
            assert.equal(searches, 1, `${label}: header shows ${searches} search controls`);
            const nav = await page.getByRole('navigation', { name: 'Điều hướng chính' }).evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth, hint: element.hasAttribute('data-overflow-end') || element.hasAttribute('data-overflow-start') }));
            if (nav.scroll > nav.client + 1) assert.ok(nav.hint, `${label}: tabs are cut without a scroll hint`);
            if (viewport.width <= 640 && role !== 'GUEST') {
              assert.equal(await header.getByRole('button', { name: 'Giao diện', exact: true }).count(), 0, `${label}: theme button belongs in the account menu`);
              assert.equal(await header.locator('.sc-workspace-tools button:visible').count(), 0, `${label}: shortcut buttons belong in the account menu`);
              await header.locator('[data-testid="shell-avatar-btn"]').click();
              await expect(page.getByRole('menuitem', { name: 'Tối', exact: true })).toBeVisible();
              if (role !== 'READER') await expect(page.getByRole('menuitem', { name: 'Lệnh nhanh', exact: true })).toBeVisible();
              await page.keyboard.press('Escape');
            }
            await noPageOverflow(page, label);
            if (viewport.width === 390) await shot(page, `c05-${role.toLowerCase()}`);
            assert.deepEqual(errors, [], `${label}: page errors`);
          } finally { await context.close(); }
        }
      }
    });

    await t.test('C04: first author work starts on the first screen', async () => {
      for (const [size, viewport] of ALL) {
        const { page, context, errors } = await openPage(browser, base, 'AUTHOR', viewport, '/sang-tac');
        const label = `author-projects@${viewport.width}`;
        try {
          const first = page.getByRole('article').first();
          await expect(first).toBeVisible({ timeout: 20000 });
          await page.waitForTimeout(300);
          const box = await rect(first);
          if (viewport.width === 390) assert.ok(box.top < viewport.height, `${label}: first work starts at y=${box.top}`);
          const stats = await page.getByRole('region', { name: 'Tổng quan tác phẩm' }).evaluate(section => [...section.children].map(card => Math.round(card.getBoundingClientRect().top)));
          assert.equal(new Set(stats).size, 1, `${label}: statistics are not one row`);
          const genre = page.getByRole('combobox', { name: 'Lọc theo thể loại' });
          if (viewport.width < 768) {
            await expect(genre).toBeHidden();
            await page.getByRole('button', { name: /^Bộ lọc khác/ }).click();
            await expect(genre).toBeVisible();
            await expect(page.getByRole('checkbox', { name: 'Chỉ tác phẩm đã ghim' })).toBeVisible();
          } else {
            await expect(genre).toBeVisible();
            assert.equal(await page.getByRole('button', { name: /^Bộ lọc khác/ }).isVisible(), false);
          }
          await noPageOverflow(page, label);
          await shot(page, `c04-${size}`);
          assert.deepEqual(errors, [], `${label}: page errors`);
        } finally { await context.close(); }
      }
    });
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
