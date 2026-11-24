import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const moderatorUser = {
  userId: 'd0744c0e-2222-4333-8444-9c1100000002',
  email: 'moderator-pr02@example.test',
  username: 'prd02_moderator',
  displayName: 'Điều hành viên PR-02',
  role: 'MODERATOR',
  status: 'ACTIVE'
};

const reviewId = '11111111-2222-3333-4444-555555555555';
const commentReviewId = '12121212-2323-4343-5454-656565656565';

const listReview = {
  reviewId,
  targetType: 'NOVEL',
  targetId: '99999999-8888-7777-6666-555555555555',
  targetTitle: 'Truyện chờ duyệt của tác giả A',
  source: 'PUBLICATION_REQUEST',
  status: 'PENDING',
  evidenceId: null,
  createdAt: '2026-01-20T09:00:00.000Z'
};

const detailReview = {
  reviewId,
  targetType: 'NOVEL',
  targetId: '99999999-8888-7777-6666-555555555555',
  status: 'PENDING',
  source: 'PUBLICATION_REQUEST',
  createdAt: '2026-01-20T09:00:00.000Z',
  reason: null,
  reviewedAt: null,
  target: {
    title: 'Truyện chờ duyệt của tác giả A',
    content: 'Nội dung truyện cần điều hành viên xem xét trước khi xuất bản công khai.',
    username: 'author_a',
    novelTitle: null,
    chapterTitle: null,
    novelId: null,
    isSubmittedVersion: true
  },
  sanctions: [],
  reportReasons: [],
  reportDescriptions: [],
  ownerViolations: [
    { sanction_id: '22222222-3333-4444-5555-666666666666', action: 'WARN', active: true, created_at: '2026-01-10T08:00:00.000Z', reason: 'Vi phạm trước đó' }
  ],
  evidenceSummary: { matchedRules: [], reportCount: 0, summary: null }
};

const commentReviewDetail = {
  reviewId: commentReviewId,
  targetType: 'COMMENT',
  targetId: '65656565-7575-8686-9797-a8a8a8a8a8a8',
  status: 'PENDING',
  source: 'KEYWORD_FILTER',
  createdAt: '2026-01-21T10:00:00.000Z',
  reason: null,
  reviewedAt: null,
  target: {
    title: null,
    content: 'Bình luận chứa từ khóa bị lọc và đang chờ điều hành viên xử lý.',
    username: 'reader_b',
    novelTitle: 'Truyện chờ duyệt của tác giả A',
    chapterTitle: null,
    novelId: '99999999-8888-7777-6666-555555555555',
    isSubmittedVersion: false
  },
  sanctions: [],
  reportReasons: [],
  reportDescriptions: [],
  ownerViolations: [],
  evidenceSummary: { matchedRules: ['harassment'], reportCount: 0, summary: 'Từ khóa bị lọc: harassment' }
};

test('PR-02: the moderator workspace lists reviews, requires decisions with reasons, and hides the LOCK path', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const resolveCalls = [];
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
      if (method === 'POST' && /\/moderator\/reviews\/[^/]+\/resolve$/.test(url.pathname)) {
        resolveCalls.push(route.request().postDataJSON());
        await route.fulfill({ json: { success: true, data: { reviewId, status: 'REVISION_REQUIRED' } } });
        return;
      }
      if (/\/moderator\/reviews\/[^/]+$/.test(url.pathname)) {
        const isCommentReview = url.pathname.endsWith(commentReviewId);
        await route.fulfill({ json: { success: true, data: isCommentReview ? commentReviewDetail : detailReview } });
        return;
      }
      if (url.pathname.endsWith('/moderator/reviews')) {
        await route.fulfill({
          json: {
            success: true,
            data: [listReview, { ...listReview, reviewId: commentReviewId, targetType: 'COMMENT', source: 'KEYWORD_FILTER', targetTitle: null }],
            meta: { page: 1, limit: 8, totalItems: 2, totalPages: 1 }
          }
        });
        return;
      }
      if (url.pathname.includes('/reading/')) {
        await route.fulfill({ json: { success: true, data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } } });
        return;
      }
      await route.fulfill({ json: { success: true, data: null } });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('ephurin_access_token', 'pr-02-moderator-session');
    });

    await page.goto(base + '/moderator/reviews');
    await expect(page.locator(`[data-testid="moderator-review-card-${reviewId}"]`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Hồ sơ điều hành' })).toBeVisible();

    await page.getByTestId(`moderator-review-inspect-${reviewId}`).click();
    await page.waitForURL(`**/moderator/reviews/${reviewId}`);
    await expect(page.getByRole('heading', { name: 'Chi tiết hồ sơ điều hành' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Truyện chờ duyệt của tác giả A' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lịch sử vi phạm chủ thể' })).toBeVisible();
    await expect(page.getByTestId('moderator-owner-violation')).toHaveCount(1);

    await page.getByTestId('moderator-revision-review-btn').click();
    const confirmButton = page.getByRole('button', { name: 'Xác nhận xử lý' });
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Khóa tài khoản' })).toHaveCount(0);

    await page.getByLabel('Lý do xử lý').fill('Cần sửa lại chương mở đầu trước khi duyệt.');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.getByRole('status')).toContainText('Đã lưu quyết định xử lý.', { timeout: 15_000 });
    assert.equal(resolveCalls.length, 1, 'exactly one resolve request is sent');
    assert.equal(resolveCalls[0].decision, 'REVISION_REQUIRED');
    assert.equal(resolveCalls[0].reason, 'Cần sửa lại chương mở đầu trước khi duyệt.');
    assert.equal(resolveCalls[0].action, undefined, 'publication reviews carry no report action');

    assert.deepEqual(errors, [], 'uncaught page errors during the moderator workspace flow');

    await page.goto(base + `/moderator/reviews/${commentReviewId}`);
    await expect(page.getByRole('heading', { name: 'Chi tiết hồ sơ điều hành' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('moderator-approve-review-btn')).toBeVisible();
    await expect(page.getByTestId('moderator-reject-review-btn')).toBeVisible();
    assert.equal(await page.getByTestId('moderator-revision-review-btn').count(), 0, 'comment reviews have no revision decision');
    assert.deepEqual(errors, [], 'uncaught page errors during the comment review visit');
  } finally {
    await browser.close();
    await server.close();
  }
});
