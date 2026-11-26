
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('localized URLs retain edit authorization and scoped admin navigation', { timeout: 90_000 }, async () => {
  const server = process.env.STORYCRAFT_URL_TEST_ORIGIN ? null : await preview({
    root: fileURLToPath(new URL('../', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0 }
  });
  const base = process.env.STORYCRAFT_URL_TEST_ORIGIN ?? ('http://127.0.0.1:' + server.httpServer.address().port);
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const topicId = '4f2f91b0-33fc-4e8f-ae31-abf33dfe811e';
  const topicSlug = 'di-qua-pho-a82f309c';
  const category = { categoryId: 'public-forum', slug: 'thao-luan-chung', name: 'Thảo luận chung' };
  const owner = { userId: 'owner', role: 'AUTHOR', status: 'ACTIVE', username: 'author' };
  const topic = {
    topicId, topicSlug, category, author: owner, status: 'VISIBLE', title: 'Đi qua phố',
    body: 'Một nội dung thảo luận.', viewCount: 0, replyCount: 0, likeCount: 0, createdAt: '2026-01-01'
  };
  const novelId = '02b216e1-1900-4522-867d-1a1a032362b0';
  const novel = { novelId, slug: 'thien-su-nha-ben-20abc18e', title: 'Thiên sứ nhà bên', authorId: owner.userId, status: 'DRAFT', genres: [] };
  const chapterId = 'c4d79a04-c3e6-4148-8d37-98a22398b0a6';
  const chapter = { chapterId, novelId, slug: 'chuong-1-bat-dau-2aeedda0', title: 'Bắt đầu', chapterNumber: 1, status: 'DRAFT' };
  const reviewId = 'd1b18436-62be-4b97-9d27-c9b544cc4743';
  const review = { reviewId, reviewSlug: novel.slug + '--13', targetId: novelId, targetType: 'NOVEL', status: 'PENDING', target: novel };
  const errors = [];
  let editRequests = 0;
  let financeRequests = 0;

  async function session(user) {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('ephurin_access_token', 'route-test-token'));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let data = [];
      if (pathname.endsWith('/auth/me')) data = user;
      else if (pathname.endsWith('/admin/access')) data = { scope: 'MODERATOR', permissions: ['content'] };
      else if (pathname.includes('/admin/withdraw-requests')) financeRequests++;
      else if (pathname.includes('/novels/workspace/') || pathname.includes('/admin/novels/') && pathname.endsWith('/locator')) data = novel;
      else if (pathname.endsWith('/novels/me')) data = [novel];
      else if (pathname.endsWith('/novels/' + novelId + '/chapters')) data = [chapter];
      else if (pathname.endsWith('/novels/' + novelId + '/statistics')) data = { ratingAverage: null, followersCount: 0, totalWords: 0 };
      else if (pathname.endsWith('/novels/' + novelId)) data = { ...novel, chapters: [] };
      else if (pathname.endsWith('/chapters/' + chapterId)) data = chapter;
      else if (pathname.includes('/moderator/reviews/') || pathname.includes('/admin/moderation/reviews/')) data = review;
      else if (pathname.endsWith('/discussions/categories')) data = [category];
      else if (pathname.endsWith('/locator')) data = { topicId, topicSlug };
      else if (pathname.endsWith('/discussions/' + topicId) && method === 'PATCH') {
        editRequests++;
        topic.title = route.request().postDataJSON().title;
        data = { ok: true };
      } else if (pathname.endsWith('/discussions/' + topicId)) data = topic;
      else if (pathname.includes('/comments')) data = { items: [], nextCursor: null };
      await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: 0 } } });
    });
    return { context, page };
  }

  try {
    const editable = await session(owner);
    await editable.page.goto(base + '/discussions/' + topicId + '/edit?source=old');
    await expect(editable.page).toHaveURL(base + '/thao-luan/' + topicSlug + '/chinh-sua?source=old');
    await expect(editable.page.locator('link[rel="canonical"]')).toHaveCount(0);
    await editable.page.reload();
    await expect(editable.page.getByRole('textbox', { name: 'Tiêu đề' })).toHaveValue('Đi qua phố');
    await editable.page.getByRole('textbox', { name: 'Tiêu đề' }).fill('Đi qua phố sau khi sửa');
    await editable.page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(editable.page).toHaveURL(base + '/thao-luan/' + topicSlug);
    assert.equal(editRequests, 1);
    await editable.page.goto(base + '/author/novels/' + novelId + '?source=old#top');
    await expect(editable.page).toHaveURL(base + '/sang-tac/tac-pham/' + novel.slug + '?source=old#top');
    await expect(editable.page.locator('link[rel="canonical"]')).toHaveCount(0);
    await editable.page.reload();
    await expect(editable.page.getByRole('heading', { name: novel.title, exact: true })).toBeVisible();
    await editable.page.goto(base + '/author/ide?novelId=' + novelId + '&chapterId=' + chapterId + '&source=old#top');
    await expect(editable.page).toHaveURL(base + '/sang-tac/viet?source=old&tac-pham=' + novel.slug + '&chuong=' + chapter.slug + '#top');
    await editable.context.close();

    const other = await session({ userId: 'another-reader', role: 'READER', status: 'ACTIVE', username: 'reader' });
    await other.page.goto(base + '/thao-luan/' + topicSlug + '/chinh-sua');
    await expect(other.page.getByRole('button', { name: 'Lưu thay đổi' })).toHaveCount(0);
    await expect(other.page.getByText(/Tác giả chủ đề/)).toBeVisible();
    await other.context.close();

    const admin = await session({ userId: 'scoped-admin', role: 'ADMIN', status: 'ACTIVE', username: 'admin' });
    await admin.page.goto(base + '/admin/withdraws');
    await expect(admin.page).toHaveURL(base + '/quan-tri/kiem-duyet');
    await admin.page.goto(base + '/quan-tri/rut-tien');
    await expect(admin.page).toHaveURL(base + '/quan-tri/kiem-duyet');
    assert.equal(financeRequests, 0);
    await admin.page.goto(base + '/admin/novels/' + novelId);
    await expect(admin.page).toHaveURL(base + '/quan-tri/tac-pham/' + novel.slug);
    await admin.page.goto(base + '/admin/moderation/' + reviewId);
    await expect(admin.page).toHaveURL(base + '/quan-tri/kiem-duyet/' + review.reviewSlug);
    await admin.context.close();

    const moderator = await session({ userId: 'test-moderator', role: 'MODERATOR', status: 'ACTIVE', username: 'moderator' });
    await moderator.page.goto(base + '/moderator/reviews/' + reviewId);
    await expect(moderator.page).toHaveURL(base + '/kiem-duyet/hang-doi/' + review.reviewSlug);
    await moderator.context.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (server) {
      server.httpServer.closeAllConnections();
      await new Promise(resolve => server.httpServer.close(resolve));
    }
  }
});
