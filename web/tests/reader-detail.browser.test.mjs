import test from 'node:test';
import assert from 'node:assert/strict';
import { readerEvidence } from './reader-browser-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

async function toggleWithStableLayout(page, button, pressed, message) {
  await expect(button).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const buttonWidth = (await button.boundingBox()).width;
  await page.evaluate(() => {
    const selectors = ['.sc-reader-detail-metrics', '.sc-reader-description-section', '#reader-reviews', '#reader-chapters', '#reader-comments'];
    const nodes = selectors.map(selector => document.querySelector(selector));
    const initial = nodes.map(node => node.getBoundingClientRect().top + scrollY);
    const probe = { nodes, selectors, initial, maximumShift: 0, frame: 0 };
    const measure = () => {
      probe.maximumShift = Math.max(probe.maximumShift, ...nodes.map((node, index) => Math.abs(node.getBoundingClientRect().top + scrollY - initial[index])));
      probe.frame = requestAnimationFrame(measure);
    };
    window.__readerLayoutProbe = probe;
    measure();
  });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(pressed));
  await expect(button).toBeEnabled();
  await expect(page.locator('.sc-toast').filter({ hasText: message }).last()).toBeVisible();
  await expect(page.locator('.sc-toast-viewport')).toHaveCSS('position', 'fixed');
  await expect(page.locator('.sc-toast-viewport')).toHaveCSS('bottom', '16px');
  await expect(page.locator('.sc-toast-viewport')).toHaveCSS('right', '16px');
  await expect(page.locator('.sc-reader-overview .sc-reader-detail-notice')).toHaveCount(0);
  const updatedWidth = (await button.boundingBox()).width;
  assert.ok(Math.abs(updatedWidth - buttonWidth) < 1, `Button width changed from ${buttonWidth}px to ${updatedWidth}px at viewport ${page.viewportSize().width}px`);
  const result = await page.evaluate(() => {
    const probe = window.__readerLayoutProbe;
    cancelAnimationFrame(probe.frame);
    const result = { maximumShift: probe.maximumShift, sameNodes: probe.nodes.every((node, index) => document.querySelector(probe.selectors[index]) === node) };
    delete window.__readerLayoutProbe;
    return result;
  });
  assert.ok(result.sameNodes, 'Lower content must stay mounted during feedback');
  assert.ok(result.maximumShift < 1, `Lower content shifted ${result.maximumShift}px`);
}

test('reader detail: unified follow/library, five-line synopsis and dedicated 10-point review page', { timeout: 180000 }, async () => {
  const output = await readerEvidence('storycraft-reader-detail-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const cover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#775f55"/><circle cx="100" cy="100" r="60" fill="#e9c899"/><text x="100" y="225" text-anchor="middle" fill="white" font-size="20">StoryCraft</text></svg>');
  const chapters = Array.from({ length: 7 }, (_, index) => ({ chapterId: `chapter-${index + 1}`, novelId: 'novel-1', chapterNumber: index + 1, title: `Chương ${index + 1}: Ngày nắng trở về`, wordCount: 100, isVip: index === 1, priceCoins: index === 1 ? 10 : 0, publishedAt: '2026-10-20T12:00:00Z' }));
  const novel = { novelId: 'novel-1', authorId: 'author-1', authorName: 'Người kể chuyện', title: 'Hành Trình Qua Những Mùa Gió', synopsis: Array.from({ length: 12 }, () => 'Câu chuyện về những người trẻ trên hành trình tìm lại ký ức và những lời hẹn chưa thành.').join('\n\n'), authorNote: 'Cảm ơn bạn đã ghé qua.', genres: ['Fantasy', 'Đời thường'], tags: ['Adventure'], status: 'ONGOING', coverImageUrl: cover, chaptersCount: 99, viewsCount: 18, lastUpdatedAt: '2026-10-20T12:00:00Z', chapters };
  try {
    for (const role of ['GUEST', 'READER']) for (const width of [1440, 650, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let stats = { novelId: 'novel-1', totalWords: 99999, followersCount: 2, ratingAverage: 9, ratingsCount: 2, isFollowing: false, notificationsEnabled: false, myRating: null, myReview: null };
      let searchParams;
      let reviews = [{ userId: 'other-reader', displayName: 'Độc giả mùa thu', avatarUrl: null, score: 9, review: 'Một câu chuyện nhẹ nhàng và ấm áp.', createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }];
      await page.addInitScript(({ role, theme }) => { localStorage.setItem('storycraft-theme', theme); if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token'); }, { role, theme });
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let data = [], meta = { totalPages: 1, totalItems: 0 };
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = novel;
        else if (url.pathname.endsWith('/reading/filters')) data = { genres: ['Fantasy', 'Đời thường'], tags: ['Adventure'] };
        else if (url.pathname.endsWith('/reading/search')) { searchParams = url.searchParams; data = [novel]; }
        else if (url.pathname.endsWith('/reading/library/me')) data = stats.isFollowing ? [novel] : [];
        else if (url.pathname.endsWith('/reading/history/me/novel-1')) data = null;
        else if (url.pathname.endsWith('/novels/novel-1/follow')) { await new Promise(resolve => setTimeout(resolve, 150)); stats = { ...stats, isFollowing: method === 'PUT' }; data = stats; }
        else if (url.pathname.endsWith('/novels/novel-1/notifications')) { await new Promise(resolve => setTimeout(resolve, 150)); stats = { ...stats, notificationsEnabled: route.request().postDataJSON().enabled }; data = stats; }
        else if (url.pathname.endsWith('/novels/novel-1/rating')) {
          reviews = reviews.filter(item => item.userId !== 'reader-1');
          if (method === 'DELETE') stats = { ...stats, myRating: null, myReview: null };
          else {
            const input = route.request().postDataJSON();
            assert.ok(Number.isInteger(input.score) && input.score >= 1 && input.score <= 10);
            stats = { ...stats, myRating: input.score, myReview: input.review, ratingAverage: 9.5, ratingsCount: 3 };
            reviews = [{ userId: 'reader-1', displayName: 'reader', avatarUrl: null, score: input.score, review: input.review, createdAt: '2026-11-05T12:00:00Z', updatedAt: '2026-11-05T12:00:00Z' }, ...reviews];
          }
          data = stats;
        } else if (url.pathname.endsWith('/novels/novel-1/statistics')) data = stats;
        else if (url.pathname.endsWith('/novels/novel-1/reviews')) { data = reviews; meta = { ...meta, totalItems: reviews.length, ratingAverage: stats.ratingAverage }; }
        await route.fulfill({ json: { success: true, data, meta } });
      });
      try {
        const prefix = role === 'READER' ? '/reader' : '/public', detail = `${base}${prefix}/novels/novel-1`;
        await page.goto(detail);
        await expect(page.getByRole('heading', { name: novel.title, exact: true })).toBeVisible();
        await expect(page.locator('.sc-reader-detail-metrics dt')).toHaveText(['Cập nhật', 'Tổng chương', 'Lượt đọc', 'Đánh giá', 'Số từ']);
        await expect(page.locator('.sc-reader-detail-metrics > div').nth(1).locator('dd')).toHaveText('7');
        await expect(page.locator('.sc-reader-detail-metrics > div').last().locator('dd')).toHaveText('700');
        await expect(page.getByTestId('reader-add-library-btn')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Thao tác khác với truyện', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Theo dõi tác giả', exact: true })).toHaveCount(0);
        const coverBounds = await page.locator('.sc-reader-detail-cover').boundingBox();
        assert.equal(Math.round(coverBounds.width), width > 640 ? 192 : 144);
        const genreBounds = await page.locator('.sc-reader-genres').boundingBox(), tagBounds = await page.locator('.sc-reader-tags').boundingBox();
        assert.ok(tagBounds.y >= genreBounds.y + genreBounds.height);
        for (const selector of ['.sc-reader-genres a', '.sc-reader-tags a']) {
          const link = page.locator(selector).first();
          const normalColor = await link.evaluate(element => getComputedStyle(element).color);
          await link.hover();
          await expect(link).toHaveCSS('text-decoration-line', 'none');
          await expect(link).not.toHaveCSS('color', normalColor);
          await page.mouse.move(0, 0);
        }
        assert.ok(await page.locator('.sc-reader-detail-metrics > div').nth(3).evaluate(element => {
          const column = element.getBoundingClientRect(), value = element.querySelector('.sc-rating-metric').getBoundingClientRect();
          return Math.abs(column.x + column.width / 2 - value.x - value.width / 2) < 1;
        }));
        const synopsis = page.locator('#reader-synopsis-novel-1');
        await expect(synopsis).toHaveCSS('-webkit-line-clamp', '5');
        const collapsedHeight = (await synopsis.boundingBox()).height;
        await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
        assert.ok((await synopsis.boundingBox()).height > collapsedHeight);
        await page.getByRole('button', { name: 'Ẩn bớt', exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator('.sc-navbar')).not.toHaveClass(/sc-navbar-hidden/);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-detail.png`), fullPage: true });
        await page.locator('.sc-reader-genres').getByRole('link', { name: 'Fantasy', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}?genre=Fantasy`);
        if (width < 768) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.locator('.mantine-MultiSelect-pill').filter({ hasText: 'Fantasy' })).toBeVisible();
        await expect.poll(() => searchParams?.get('genres')).toBe('Fantasy');
        await page.goto(detail);
        await page.locator('.sc-reader-status').click();
        await expect(page).toHaveURL(`${base}${prefix}?status=ONGOING`);
        if (width < 768) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.getByRole('group', { name: 'Lọc theo trạng thái', exact: true }).getByRole('button', { name: 'Đang ra', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => searchParams?.get('status')).toBe('ONGOING');
        await page.goto(detail);
        await page.locator('.sc-reader-tags').getByRole('link', { name: '#Adventure', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}?tag=Adventure`);
        if (width < 768) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await expect(page.locator('.mantine-MultiSelect-pill').filter({ hasText: 'Adventure' })).toBeVisible();
        await expect.poll(() => searchParams?.get('tags')).toBe('Adventure');
        await page.goto(detail);
        if (role === 'READER') {
          const bell = page.getByTestId('reader-notifications-btn');
          await toggleWithStableLayout(page, bell, true, 'Đã bật thông báo chương mới.');
          await expect(page.getByTestId('reader-follow-novel-btn')).toHaveAttribute('aria-pressed', 'false');
          await page.reload();
          await expect(bell).toHaveAttribute('aria-pressed', 'true');
          await toggleWithStableLayout(page, bell, false, 'Đã tắt thông báo chương mới.');
          await toggleWithStableLayout(page, page.getByTestId('reader-follow-novel-btn'), true, 'Đã theo dõi truyện.');
          await toggleWithStableLayout(page, page.getByTestId('reader-follow-novel-btn'), false, 'Đã bỏ theo dõi truyện.');
          await toggleWithStableLayout(page, page.getByTestId('reader-follow-novel-btn'), true, 'Đã theo dõi truyện.');
          await page.reload();
          await expect(page.getByTestId('reader-follow-novel-btn')).toHaveAttribute('aria-pressed', 'true');
          await page.goto(`${base}/reader/library`);
          await expect(page.locator('.sc-novel-card')).toHaveCount(1);
          await page.getByRole('button', { name: 'Bỏ theo dõi', exact: true }).click();
          await expect(page.locator('.sc-novel-card')).toHaveCount(0);
          await expect(page.locator('.sc-toast').filter({ hasText: 'Đã bỏ theo dõi truyện.' }).last()).toBeVisible();
          await page.goto(detail);
          await expect(page.getByTestId('reader-follow-novel-btn')).toHaveAttribute('aria-pressed', 'false');
        }
        const shortcuts = page.getByRole('navigation', { name: 'Thao tác với truyện', exact: true });
        await shortcuts.getByRole('link', { name: 'Mục lục', exact: true }).click();
        await expect(page.locator('#reader-chapters tbody tr')).toHaveCount(5);
        await page.getByRole('button', { name: 'Xem toàn bộ 7 chương', exact: true }).click();
        await expect(page.locator('#reader-chapters tbody tr')).toHaveCount(7);
        await expect(page.getByTestId('read-chapter-chapter-7')).toHaveAttribute('href', `${prefix}/chapters/chapter-7`);
        await shortcuts.getByRole('button', { name: 'Chia sẻ', exact: true }).click();
        const share = page.getByRole('dialog', { name: 'Chia sẻ truyện', exact: true });
        await share.getByRole('button', { name: 'Sao chép đường dẫn', exact: true }).click();
        await expect(share.getByRole('status')).toHaveText('Đã sao chép đường dẫn.');
        await page.keyboard.press('Escape'); await expect(share).toHaveCount(0);
        await shortcuts.getByRole('link', { name: 'Đánh giá', exact: true }).click();
        await expect(page).toHaveURL(`${detail}/reviews`);
        await expect(page.getByRole('heading', { name: `Đánh giá truyện ${novel.title}`, exact: true })).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        if (role === 'GUEST') await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
        else {
          const input = page.getByRole('textbox', { name: 'Điểm của bạn /10', exact: true });
          await input.fill('11');
          assert.ok(Number(await input.inputValue()) <= 10);
          const slider = page.getByRole('slider', { name: 'Kéo để chọn điểm', exact: true });
          await slider.focus(); await page.keyboard.press('End');
          await expect(input).toHaveValue('10');
          await input.fill('8'); await expect(slider).toHaveAttribute('aria-valuenow', '8');
          await page.getByRole('textbox', { name: 'Nhận xét về tác phẩm', exact: true }).fill('Rất thích nhịp kể và các nhân vật.');
          await page.getByRole('button', { name: 'Đăng đánh giá', exact: true }).click();
          await expect(page.getByText('Đã lưu đánh giá.', { exact: true })).toBeVisible();
          await page.reload();
          await expect(input).toHaveValue('8');
          await expect(page.getByRole('textbox', { name: 'Nhận xét về tác phẩm', exact: true })).toHaveValue('Rất thích nhịp kể và các nhân vật.');
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        await page.screenshot({ path: path.join(output, `${role}-${width}-${theme}-reviews.png`), fullPage: true });
        if (role === 'READER') {
          await page.getByRole('button', { name: 'Xóa đánh giá', exact: true }).click();
          await expect(page.getByText('Đã xóa đánh giá.', { exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Đăng đánh giá', exact: true })).toBeDisabled();
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Reader detail/review screenshots: ${output}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
