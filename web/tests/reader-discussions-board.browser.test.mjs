import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

// Regression for PR #215 review P2-1: the board must never drop pinned or announcement
// topics that do not fit the four-entry "Đáng chú ý" card.
test('board keeps excess pinned topics visible in the chronological list', { timeout: 180000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const category = { categoryId: 'cat-1', slug: 'thao-luan-chung', name: 'Thảo luận chung', sortOrder: 10, postAdminOnly: false };
    const makeTopic = (topicId, title, isPinned) => ({
      topicId,
      category,
      author: { userId: 'author-1', displayName: 'Tác giả A', avatarUrl: null, role: 'AUTHOR' },
      isPinned,
      isLocked: false,
      status: 'VISIBLE',
      title,
      body: 'Nội dung chủ đề.',
      viewCount: 5,
      replyCount: 0,
      likeCount: 0,
      viewerLiked: false,
      lastActivityAt: '2026-11-21T10:00:00Z',
      lastActivityUser: null,
      createdAt: '2026-11-20T10:00:00Z',
      editedAt: null,
      viewerViewed: false
    });
    // Page 1 (limit 20) carries six pinned topics and two regular ones.
    const pinned = [1, 2, 3, 4, 5, 6].map(n => makeTopic(`pinned-${n}`, `Ghim số ${n}`, true));
    const regular = [7, 8].map(n => makeTopic(`regular-${n}`, `Chủ đề thường ${n}`, false));

    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      let data;
      if (url.pathname.endsWith('/auth/me')) data = null;
      else if (url.pathname.endsWith('/discussions/categories')) data = [category];
      else if (url.pathname.endsWith('/discussions/community')) data = { stats: { memberCount: 12, topicCount: 8, commentCount: 3 }, trending: [] };
      else if (url.pathname.endsWith('/discussions')) data = { items: [...pinned, ...regular], nextCursor: null };
      await route.fulfill({ json: { success: true, data, meta: {} } });
    });

    await page.goto(`${base}/discussions`);
    await page.waitForLoadState('networkidle');

    const appearances = async name => (await page.getByRole('link', { name }).all()).length;
    for (const n of [1, 2, 3, 4]) {
      assert.equal(await appearances(`Ghim số ${n}`), 1, `pinned ${n} renders exactly once (in the card)`);
    }
    for (const n of [5, 6]) {
      assert.equal(await appearances(`Ghim số ${n}`), 1, `excess pinned ${n} still renders exactly once (in the list)`);
    }
    assert.equal(await appearances('Chủ đề thường 7'), 1, 'regular topic renders');
    assert.equal(await appearances('Chủ đề thường 8'), 1, 'regular topic renders');

    const latest = page.getByRole('heading', { name: 'Thảo luận mới nhất' });
    await latest.scrollIntoViewIfNeeded();
    const listText = await page.locator('.forum-latest').innerText();
    assert.ok(listText.includes('Ghim số 5'), 'pinned 5 stays in the chronological list');
    assert.ok(listText.includes('Ghim số 6'), 'pinned 6 stays in the chronological list');
    assert.ok(!listText.includes('Ghim số 1'), 'card entries are not duplicated in the list');

    assert.ok(errors.length === 0, `no page errors: ${errors}`);
  } finally {
    await browser.close();
    await server.httpServer.close();
  }
});
