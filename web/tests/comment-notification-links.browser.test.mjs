import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readerEvidence } from './reader-browser-evidence.mjs';

test('notification links open the right comment and reply page, including existing notifications', { timeout: 180000 }, async () => {
  const output = await readerEvidence('comment-notification-links-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => {
        localStorage.setItem('ephurin_access_token', 'fixture-token');
        localStorage.setItem('storycraft-theme', theme);
      }, theme);
      const chapter = { chapterId: 'c-1', novelId: 'novel-1', title: 'Chương kiểm thử', chapterNumber: 1, isVip: false,
        content: Array(50).fill('Một đoạn văn đủ dài để bình luận nằm ở cuối trang và cần cuộn tới.').join('\n\n') };
      const novel = { novelId: 'novel-1', title: 'Truyện kiểm thử thông báo', authorId: 'author-1', authorName: 'Tác giả', synopsis: 'Giới thiệu truyện.', serialStatus: 'ONGOING', chapters: [chapter] };
      const comment = (id, chapterId = null, parentCommentId = null) => ({
        commentId: id, novelId: 'novel-1', chapterId, parentCommentId, userId: 'other-reader', displayName: 'Người trả lời', avatarUrl: null,
        content: `Nội dung ${id}`, status: 'APPROVED', createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z',
        chapterNumber: chapterId ? 1 : null, chapterTitle: chapterId ? chapter.title : null, repliesCount: parentCommentId ? 0 : 7,
        canReply: true, canDelete: false, isAuthor: false, isSpoiler: false, likesCount: 0, dislikesCount: 0
      });
      const notifications = [
        { notificationId: 'old', type: 'COMMENT_REPLY', payload: { href: '/public/novels/novel-1', commentId: 'linked-general' } },
        { notificationId: 'chapter', type: 'AUTHOR_REPLY', webTarget: { kind: 'chapter', novelId: 'novel-1', novelSlug: 'truyen-thu', chapterId: 'c-1', chapterSlug: 'chuong-1' }, payload: { href: '/reader/chapters/c-1?commentId=linked-chapter#reader-comments', commentId: 'linked-chapter' } },
        { notificationId: 'root', type: 'COMMENT_REPLY', payload: { href: '/public/novels/novel-1', commentId: 'root-general' } },
        { notificationId: 'gone', type: 'COMMENT_REPLY', payload: { href: '/public/novels/novel-1', commentId: 'gone' } }
      ].map(item => ({ ...item, title: 'Có trả lời bình luận mới', content: novel.title, status: 'UNREAD', createdAt: '2026-11-17T00:00:00Z', readAt: null }));
      const requests = [];
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname + url.search);
        let data = [], meta = { totalItems: 0, totalPages: 0 };
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/notifications')) { data = notifications; meta = { totalItems: notifications.length, totalPages: 1 }; }
        else if (url.pathname.endsWith('/read')) data = { ...notifications[0], status: 'READ' };
        else if (url.pathname.endsWith('/locator')) {
          data = url.pathname.includes('/chapters/')
            ? { novelId: 'novel-1', novelSlug: 'truyen-thu', chapterId: 'c-1', chapterSlug: 'chuong-1' }
            : { novelId: 'novel-1', novelSlug: 'truyen-thu' };
        } else if (url.pathname.endsWith('/reading/novels/novel-1')) data = novel;
        else if (url.pathname.endsWith('/reading/chapters/c-1')) data = chapter;
        else if (url.pathname.endsWith('/reading/preferences/me')) data = { fontSize: 18, lineHeight: 1.8, background: 'SEPIA', fontFamily: 'Be Vietnam Pro' };
        else if (url.pathname.endsWith('/reading/bookmarks/me/novel-1')) data = null;
        else if (url.pathname.endsWith('/statistics')) data = { isFollowing: false, ratingsCount: 0, ratingAverage: null };
        else if (url.pathname.endsWith('/location')) {
          const id = url.pathname.split('/').at(-2);
          if (id === 'gone') return route.fulfill({ status: 404, json: { success: false, error: { message: 'Bình luận không còn hiển thị.' } } });
          data = { rootCommentId: id.includes('chapter') ? 'root-chapter' : 'root-general', page: 2, replyPage: id.startsWith('root-') ? 1 : 2 };
        } else if (url.pathname.endsWith('/replies')) {
          const root = url.pathname.split('/').at(-2), chapterId = root.includes('chapter') ? 'c-1' : null;
          data = url.searchParams.get('page') === '2'
            ? [comment(chapterId ? 'linked-chapter' : 'linked-general', chapterId, root)]
            : Array.from({ length: 5 }, (_, i) => comment(`reply-${i}`, chapterId, root));
          meta = { totalItems: 7, totalPages: 2 };
        } else if (url.pathname.endsWith('/comments')) {
          const chapterId = url.pathname.includes('/chapters/') ? 'c-1' : null;
          data = url.searchParams.get('page') === '2'
            ? [comment(chapterId ? 'root-chapter' : 'root-general', chapterId)]
            : Array.from({ length: 10 }, (_, i) => ({ ...comment(`newer-${i}`, chapterId), repliesCount: 0 }));
          meta = { totalItems: 11, totalPages: 2 };
        }
        await route.fulfill({ json: { success: true, data, meta } });
      });
      try {
        for (const [noticeId, linkedId, targetPath] of [
          ['old', 'linked-general', '/truyen/truyen-thu'],
          ['chapter', 'linked-chapter', '/truyen/truyen-thu/chuong/chuong-1'],
          ['root', 'root-general', '/truyen/truyen-thu']
        ]) {
          await page.goto(`${base}/notifications`);
          await page.getByTestId(`notification-card-${noticeId}`).getByRole('link', { name: 'Xem nội dung' }).click();
          await expect(page).toHaveURL(`${base}${targetPath}?commentId=${linkedId}#reader-comments`);
          const article = page.locator(`article.sc-comment-item[data-comment-id="${linkedId}"]`);
          await expect(article).toBeFocused();
          await page.evaluate(() => document.fonts.ready);
          await expect(article).toBeInViewport({ ratio: 1 });
          await expect(article).toHaveClass(/is-focused/);
          if (!linkedId.startsWith('root-')) await expect(page.locator(`.sc-comment-thread[data-comment-id="${linkedId.includes('chapter') ? 'root-chapter' : 'root-general'}"]`).getByRole('button', { name: 'Ẩn trả lời', exact: true })).toBeVisible();
          await article.screenshot({ path: path.join(output, `${noticeId}-${width}-${theme}.png`) });
          await page.reload();
          await expect(page.locator(`article[data-comment-id="${linkedId}"]`)).toBeFocused();
          await expect(page.locator(`article[data-comment-id="${linkedId}"]`)).toBeInViewport({ ratio: 1 });
        }
        assert.ok(requests.some(url => url.includes('/comments?page=2')));
        assert.ok(requests.some(url => url.includes('/replies?page=2')));
        await page.goto(`${base}/notifications`);
        await page.getByTestId('notification-card-gone').getByRole('link', { name: 'Xem nội dung' }).click();
        const missing = page.getByText('Không mở được bình luận này. Bình luận có thể đã bị xóa hoặc không còn hiển thị.', { exact: true });
        await expect(missing).toBeVisible();
        await expect(missing).toBeInViewport();
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log(`Notification link screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});

test('mark all notifications read clears 101+ unread items across pages even under READ filter and reconciles partial failures', { timeout: 120000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('ephurin_access_token', 'fixture-token');
      localStorage.setItem('storycraft-theme', 'light');
    });

    const store = [
      ...Array.from({ length: 105 }, (_, index) => ({
        notificationId: `unread-${index + 1}`,
        type: 'NEW_CHAPTER',
        status: 'UNREAD',
        title: `Thông báo chưa đọc #${index + 1}`,
        content: `Nội dung thông báo #${index + 1}`,
        payload: {},
        createdAt: new Date(Date.UTC(2026, 10, 18, 0, 0, index)).toISOString(),
        readAt: null
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        notificationId: `read-${index + 1}`,
        type: 'SYSTEM',
        status: 'READ',
        title: `Thông báo đã đọc #${index + 1}`,
        content: `Nội dung cũ #${index + 1}`,
        payload: {},
        createdAt: new Date(Date.UTC(2026, 10, 17, 0, 0, index)).toISOString(),
        readAt: '2026-11-17T00:00:00Z'
      }))
    ];
    const failingIds = new Set(['unread-104', 'unread-105']);
    const patchCalls = [];

    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname.endsWith('/auth/me')) {
        return route.fulfill({ json: { success: true, data: { userId: 'reader-1', username: 'reader', role: 'READER', status: 'ACTIVE' }, meta: {} } });
      }
      if (url.pathname.endsWith('/notifications') && method === 'GET') {
        const statusFilter = url.searchParams.get('status');
        const pageNum = Math.max(1, Number(url.searchParams.get('page') || 1));
        const limit = Math.max(1, Number(url.searchParams.get('limit') || 20));
        const filtered = statusFilter ? store.filter(item => item.status === statusFilter) : store;
        const slice = filtered.slice((pageNum - 1) * limit, pageNum * limit);
        return route.fulfill({
          json: {
            success: true,
            data: slice,
            meta: {
              page: pageNum,
              limit,
              totalItems: filtered.length,
              totalPages: Math.max(1, Math.ceil(filtered.length / limit))
            }
          }
        });
      }
      const patchMatch = url.pathname.match(/\/notifications\/([^/]+)\/read$/);
      if (patchMatch && method === 'PATCH') {
        const id = decodeURIComponent(patchMatch[1]);
        patchCalls.push(id);
        if (failingIds.has(id)) {
          return route.fulfill({ status: 500, json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Lỗi đánh dấu tạm thời' } } });
        }
        const entry = store.find(item => item.notificationId === id);
        if (entry) {
          entry.status = 'READ';
          entry.readAt = '2026-11-18T12:00:00Z';
        }
        return route.fulfill({ json: { success: true, data: entry ?? null, meta: {} } });
      }
      return route.fulfill({ json: { success: true, data: [], meta: { totalItems: 0, totalPages: 0 } } });
    });

    await page.goto(`${base}/notifications`);
    const bell = page.locator('.sc-notification-bell');
    await expect(bell).toHaveAttribute('aria-label', /105 chưa đọc/);
    await expect(bell.locator('.sc-notification-count')).toHaveText('99+');

    // Switch to the READ filter while 105 unread items still exist across pages 1..6.
    await page.locator('.mantine-SegmentedControl-label', { hasText: 'Đã đọc' }).click();
    await expect(page.getByText('Thông báo đã đọc #1', { exact: true })).toBeVisible();
    const markAllBtn = page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true });
    await expect(markAllBtn).toBeVisible();

    await markAllBtn.click();
    // 103 succeed and 2 fail -> alert reports partial failure, badge and remaining count reconcile immediately to 2.
    await expect(page.getByRole('alert')).toContainText('2/105 thông báo');
    await expect(bell).toHaveAttribute('aria-label', /2 chưa đọc/);
    await expect(bell.locator('.sc-notification-count')).toHaveText('2');
    assert.equal(store.filter(item => item.status === 'UNREAD').length, 2);

    // Clear transient failures and retry: only the remaining 2 unread notifications are patched.
    failingIds.clear();
    patchCalls.length = 0;
    await expect(markAllBtn).toBeVisible();
    await markAllBtn.click();
    await expect(markAllBtn).toHaveCount(0);
    await expect(bell).toHaveAttribute('aria-label', /0 chưa đọc/);
    await expect(bell.locator('.sc-notification-count')).toHaveCount(0);
    assert.deepEqual(patchCalls.sort(), ['unread-104', 'unread-105']);
    assert.equal(store.filter(item => item.status === 'UNREAD').length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
