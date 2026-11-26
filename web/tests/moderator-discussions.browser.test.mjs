import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const moderatorUser = {
  userId: 'd0744c0e-2222-4333-8444-9c1100000002',
  email: 'moderator-pr03@example.test',
  username: 'prd03_moderator',
  displayName: 'Điều hành viên PR-03',
  role: 'MODERATOR',
  status: 'ACTIVE'
};

const topicId = 'aaaaaaaa-1111-4222-8333-944444444444';
const hiddenTopicId = 'bbbbbbbb-1111-4222-8333-944444444445';
const commentId = 'cccccccc-1111-4222-8333-944444444446';
const fromCategoryId = 'dddddddd-1111-4222-8333-944444444447';
const toCategoryId = 'eeeeeeee-1111-4222-8333-944444444448';

const topic = {
  topicId,
  title: 'Chủ đề cần điều hành',
  status: 'VISIBLE',
  isPinned: false,
  isLocked: false,
  categoryId: fromCategoryId,
  categoryName: 'Góc tác giả',
  authorName: 'author_a',
  createdAt: '2026-02-01T09:00:00.000Z'
};

const hiddenTopic = {
  topicId: hiddenTopicId,
  title: 'Chủ đề đã ẩn',
  status: 'HIDDEN',
  isPinned: false,
  isLocked: false,
  categoryId: fromCategoryId,
  categoryName: 'Góc tác giả',
  authorName: 'author_b',
  createdAt: '2026-02-02T09:00:00.000Z'
};

const comment = {
  commentId,
  body: 'Bình luận đang hiển thị, cần ẩn đi.',
  status: 'VISIBLE',
  authorName: 'reader_b',
  createdAt: '2026-02-03T09:00:00.000Z'
};

const categories = [
  { categoryId: fromCategoryId, slug: 'goc-tac-gia', name: 'Góc tác giả', sortOrder: 30, isActive: true, postAdminOnly: false },
  { categoryId: toCategoryId, slug: 'hoi-dap', name: 'Hỏi đáp', sortOrder: 40, isActive: true, postAdminOnly: false },
  { categoryId: 'ffffffff-1111-4222-8333-944444444449', slug: 'thong-bao-cong-dong', name: 'Thông báo cộng đồng', sortOrder: 60, isActive: true, postAdminOnly: true },
  { categoryId: '99999999-1111-4222-8333-94444444444a', slug: 'thao-luan-truyen', name: 'Thảo luận truyện', sortOrder: 20, isActive: false, postAdminOnly: false }
];

test('PR-03: the moderator workspace operates discussions with one change per call', { timeout: 120000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const topicPatches = [];
  const commentPatches = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname.endsWith('/auth/me')) {
        await route.fulfill({ json: { success: true, data: moderatorUser } });
        return;
      }
      if (url.pathname.endsWith('/moderator/discussions/categories')) {
        await route.fulfill({ json: { success: true, data: categories } });
        return;
      }
      if (method === 'PATCH' && /\/moderator\/discussions\/[^/]+\/comments\/[^/]+\/moderation$/.test(url.pathname)) {
        commentPatches.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: { commentId, topicId, status: 'HIDDEN' } } });
        return;
      }
      if (method === 'PATCH' && /\/moderator\/discussions\/[^/]+\/moderation$/.test(url.pathname)) {
        topicPatches.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: { ...topic, isPinned: true, status: 'VISIBLE', isLocked: false, categoryId: toCategoryId } } });
        return;
      }
      if (/\/moderator\/discussions\/topics\/[^/]+\/comments$/.test(url.pathname)) {
        await route.fulfill({ json: { success: true, data: { items: [comment], hasNext: false } } });
        return;
      }
      if (url.pathname.endsWith('/moderator/discussions/topics')) {
        await route.fulfill({ json: { success: true, data: { items: [topic, hiddenTopic], hasNext: false } } });
        return;
      }
      if (url.pathname.includes('/reading/')) {
        await route.fulfill({ json: { success: true, data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } } });
        return;
      }
      await route.fulfill({ json: { success: true, data: null } });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('ephurin_access_token', 'pr-03-moderator-session');
    });

    await page.goto(base + '/moderator/discussions');
    await expect(page.getByRole('heading', { name: 'Điều hành thảo luận' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(topic.title)).toBeVisible();

    await page.getByTestId(`moderator-topic-pin-${topicId}`).click();
    await expect(page.getByTestId('moderator-reason-input')).toBeVisible();
    await page.getByTestId('moderator-reason-input').fill('Chủ đề quan trọng với cộng đồng.');
    await page.getByTestId('moderator-reason-confirm').click();
    await expect(page.getByRole('status').last()).toContainText('Đã ghi thao tác điều hành.', { timeout: 15_000 });
    assert.equal(topicPatches.length, 1, 'the pin action sends exactly one request');
    assert.deepEqual(
      topicPatches[0],
      { isPinned: true, expected: false, reason: 'Chủ đề quan trọng với cộng đồng.' },
      'a pin is one change and carries the expected prior state'
    );

    await page.getByTestId(`moderator-topic-move-${topicId}`).click();
    await expect(page.getByTestId('moderator-move-destination')).toBeVisible();
    await page.getByTestId('moderator-move-destination').click();
    const optionCount = await page.getByRole('option').count();
    assert.equal(optionCount, 1, 'only the active non-official destination remains selectable');
    await page.getByRole('option', { name: 'Hỏi đáp' }).click();
    await page.getByTestId('moderator-move-confirm').click();
    await expect(page.getByTestId('moderator-reason-input')).toBeVisible();
    await page.getByTestId('moderator-reason-input').fill('Chủ đề thuộc chuyên mục hỏi đáp hơn.');
    await page.getByTestId('moderator-reason-confirm').click();
    await expect(page.getByRole('status').last()).toContainText('Đã ghi thao tác điều hành.', { timeout: 15_000 });
    assert.equal(topicPatches.length, 2, 'the move action sends a second request');
    assert.deepEqual(
      topicPatches[1],
      { destinationCategoryId: toCategoryId, expected: fromCategoryId, reason: 'Chủ đề thuộc chuyên mục hỏi đáp hơn.' },
      'a move carries only the destination and the current category as expected'
    );

    await page.getByTestId(`moderator-topic-comments-toggle-${topicId}`).click();
    await expect(page.getByText(comment.body)).toBeVisible({ timeout: 15_000 });
    assert.equal(
      await page.getByTestId(`moderator-comment-delete-${commentId}`).count(),
      0,
      'the workspace never offers a permanent comment delete'
    );
    await page.getByTestId(`moderator-comment-hide-${commentId}`).click();
    await expect(page.getByTestId('moderator-reason-input')).toBeVisible();
    await page.getByTestId('moderator-reason-input').fill('Bình luận spam quảng cáo.');
    await page.getByTestId('moderator-reason-confirm').click();
    await expect(page.getByRole('status').last()).toContainText('Đã ghi thao tác điều hành.', { timeout: 15_000 });
    assert.equal(commentPatches.length, 1, 'the comment hide sends one request');
    assert.deepEqual(
      commentPatches[0],
      { status: 'HIDDEN', reason: 'Bình luận spam quảng cáo.' },
      'comment moderation carries the new status and the reason only'
    );

    assert.deepEqual(errors, [], 'uncaught page errors during the moderator discussions flow');
  } finally {
    await browser.close();
    await server.close();
  }
});
