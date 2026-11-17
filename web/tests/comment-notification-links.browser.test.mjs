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
        { notificationId: 'chapter', type: 'AUTHOR_REPLY', payload: { href: '/reader/chapters/c-1?commentId=linked-chapter#reader-comments', commentId: 'linked-chapter' } },
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
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = novel;
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
          ['old', 'linked-general', '/reader/novels/novel-1'],
          ['chapter', 'linked-chapter', '/reader/chapters/c-1'],
          ['root', 'root-general', '/reader/novels/novel-1']
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
