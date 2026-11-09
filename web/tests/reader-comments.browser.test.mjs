import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { readerEvidence } from './reader-browser-evidence.mjs';

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const mediaPath = '/api/v1/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.gif';
const chapter = { chapterId: 'c-1', novelId: 'novel-1', title: 'Một buổi sáng mới', chapterNumber: 1, isVip: false, wordCount: 1000,
  content: Array(12).fill('Một hành trình mới bắt đầu trên con đường nhỏ. Người lữ hành dừng lại để lắng nghe những câu chuyện.').join('\n\n') };
const novel = { novelId: 'novel-1', title: 'Hành trình qua những mùa gió', authorName: 'Người kể chuyện', authorId: 'author-1', synopsis: 'Giới thiệu truyện.', serialStatus: 'ONGOING', chapters: [chapter] };

test('comments keep application surfaces over reading paper and support GIF, emoji, spoilers, reactions, reader replies and source context', { timeout: 180000 }, async () => {
  const output = await readerEvidence('reader-comments-');
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    for (const [width, theme, paper] of [[1440, 'light', 'SEPIA'], [390, 'light', 'SEPIA'], [1440, 'light', 'DARK'], [390, 'dark', 'MINT']]) for (const role of ['READER', 'GUEST']) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const preferences = { fontFamily: 'Be Vietnam Pro', fontSize: 18, lineHeight: 1.8, background: paper, margin: 24, textAlign: 'LEFT' };
      await page.addInitScript(({ role, theme, preferences }) => {
        localStorage.setItem('storycraft-theme', theme);
        if (role === 'READER') localStorage.setItem('ephurin_access_token', 'fixture-token');
        else localStorage.setItem('storycraft-workspace:guest:chapter-reading-preferences', JSON.stringify(preferences));
      }, { role, theme, preferences });
      const makeComment = (commentId, content, chapterId = 'c-1', userId = 'other-reader') => ({
        commentId, content, chapterId, novelId: 'novel-1', userId, displayName: userId === 'reader-1' ? 'Bạn đọc' : 'Một bạn đọc khác', avatarUrl: null,
        chapterNumber: chapterId ? 1 : null, chapterTitle: chapterId ? chapter.title : null,
        parentCommentId: null, repliesCount: 0, status: 'APPROVED', createdAt: '2026-11-09T03:00:00Z', updatedAt: '2026-11-09T03:00:00Z',
        isAuthor: false, canDelete: role === 'READER' && userId === 'reader-1', canReply: role === 'READER', isSpoiler: false,
        likesCount: 0, dislikesCount: 0, myReaction: null, imageUrl: null
      });
      const comments = [makeComment('spoiler', 'Bí mật trong chương này sẽ được hé lộ.'), makeComment('general', 'Cùng trò chuyện về tác phẩm.', null)];
      comments[0].isSpoiler = true; comments[0].likesCount = 2; comments[0].dislikesCount = 1;
      let failCreate = false, failVote = false, nextId = 0, allScopeRequested = false;
      const gifEnabled = role === 'READER' && width === 1440 && paper === 'SEPIA';
      const providerRequests = [];
      const providerGif = index => ({ id: `gif${index}`, title: `Meme ${index}`, images: {
        original: { url: `https://media.giphy.com/media/gif${index}/giphy.gif?cid=fixture` },
        fixed_width_still: { url: `https://media.giphy.com/media/gif${index}/still.gif?cid=fixture` }
      } });
      await page.route('https://api.giphy.com/**', async route => {
        const url = new URL(route.request().url()); providerRequests.push(url.href);
        const single = /\/gif\d$/.test(url.pathname);
        const offset = Number(url.searchParams.get('offset') || 0);
        await route.fulfill({ json: { data: single ? providerGif(Number(url.pathname.at(-1))) : offset ? [providerGif(3)] : [providerGif(1), providerGif(2)],
          pagination: { offset, count: offset ? 1 : 2, total_count: 3 } } });
      });
      await page.route('https://media.giphy.com/**', route => route.fulfill({ contentType: 'image/gif', body: gif }));
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let data = [], meta = { totalItems: 0, totalPages: 0 };
        if (url.pathname === mediaPath) return route.fulfill({ contentType: 'image/gif', body: gif });
        if (url.pathname.endsWith('/auth/me')) data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
        else if (url.pathname.endsWith('/reading/preferences/me')) data = preferences;
        else if (url.pathname.endsWith('/reading/bookmarks/me/novel-1')) data = null;
        else if (url.pathname.endsWith('/media/giphy-config')) data = { apiKey: gifEnabled ? 'fixture-public-key' : null };
        else if (url.pathname.endsWith('/reading/novels/novel-1')) data = novel;
        else if (url.pathname.endsWith('/reading/chapters/c-1')) data = chapter;
        else if (url.pathname.endsWith('/statistics')) data = { isFollowing: false, ratingsCount: 0, ratingAverage: null };
        else if (url.pathname.endsWith('/media')) { assert.equal(route.request().postDataJSON().data, gif.toString('base64')); data = { path: mediaPath }; }
        else if (/\/comments\/[^/]+\/reaction$/.test(url.pathname)) {
          if (failVote) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Chưa lưu phản ứng.' } } });
          const comment = comments.find(item => item.commentId === url.pathname.split('/').at(-2));
          const value = route.request().postDataJSON().reaction;
          if (comment.myReaction === 'LIKE') comment.likesCount--;
          if (comment.myReaction === 'DISLIKE') comment.dislikesCount--;
          if (value === 'LIKE') comment.likesCount++;
          if (value === 'DISLIKE') comment.dislikesCount++;
          comment.myReaction = value;
          data = { likesCount: comment.likesCount, dislikesCount: comment.dislikesCount, myReaction: value };
        } else if (url.pathname.endsWith('/replies')) {
          const parentId = url.pathname.split('/').at(-2), parent = comments.find(item => item.commentId === parentId);
          if (method === 'POST') {
            const reply = { ...makeComment(`reply-${++nextId}`, '', parent.chapterId, 'reader-1'), ...route.request().postDataJSON(), parentCommentId: parentId, canReply: false };
            reply.isSpoiler ||= parent.isSpoiler;
            comments.push(reply); parent.repliesCount++;
            data = reply;
          } else { data = comments.filter(item => item.parentCommentId === parentId); meta = { totalItems: data.length, totalPages: 1 }; }
        } else if (/\/comments\/[^/]+$/.test(url.pathname)) {
          const comment = comments.find(item => item.commentId === url.pathname.split('/').at(-1));
          if (method === 'PATCH') { Object.assign(comment, route.request().postDataJSON()); data = comment; }
        } else if (url.pathname.endsWith('/comments')) {
          if (method === 'POST') {
            if (failCreate) return route.fulfill({ status: 503, json: { success: false, error: { message: 'Chưa gửi bình luận.' } } });
            data = { ...makeComment(`new-${++nextId}`, '', url.pathname.includes('/chapters/') ? 'c-1' : null, 'reader-1'), ...route.request().postDataJSON() };
            comments.push(data);
          } else {
            allScopeRequested ||= url.searchParams.get('scope') === 'ALL';
            data = comments.filter(item => !item.parentCommentId && (url.pathname.includes('/novels/') || item.chapterId === 'c-1'));
            meta = { totalItems: data.length, totalPages: 1 };
          }
        }
        await route.fulfill({ json: { success: true, data, meta } });
      });
      try {
        const prefix = role === 'READER' ? '/reader' : '/public';
        await page.goto(`${base}${prefix}/chapters/c-1`);
        const section = page.locator('.sc-reader-comments .sc-comments');
        await section.scrollIntoViewIfNeeded();
        const expectedPaper = { DARK: 'rgb(36, 34, 31)', MINT: 'rgb(229, 238, 229)', SEPIA: 'rgb(238, 230, 211)' }[paper];
        await expect(page.locator('.sc-reader-workspace')).toHaveCSS('background-color', expectedPaper);
        await expect(section).toHaveCSS('background-color', theme === 'dark' ? 'rgb(36, 34, 31)' : 'rgb(255, 255, 255)');
        await expect(section).toHaveCSS('color', theme === 'dark' ? 'rgb(242, 239, 234)' : 'rgb(37, 43, 42)');
        const spoiler = section.locator('.sc-comment-item[data-comment-id="spoiler"]');
        await expect(spoiler.getByText(comments[0].content, { exact: true })).toHaveCount(0);
        await spoiler.getByRole('button', { name: 'Có spoiler · Bấm để xem', exact: true }).click();
        await expect(spoiler.getByText(comments[0].content, { exact: true })).toBeVisible();
        await spoiler.getByRole('button', { name: 'Ẩn spoiler', exact: true }).click();
        await expect(spoiler.getByRole('link', { name: 'Chương 1', exact: true })).toHaveAttribute('href', `${prefix}/chapters/c-1`);
        if (role === 'READER') {
          const form = section.locator('> .mantine-Stack-root > .sc-comment-composer');
          const input = form.getByRole('textbox', { name: 'Bình luận của bạn', exact: true });
          const bold = form.getByRole('button', { name: 'Chữ đậm', exact: true });
          const italic = form.getByRole('button', { name: 'Chữ nghiêng', exact: true });
          await bold.click(); await expect(input).toHaveText('');
          await input.pressSequentially('Đậm');
          await italic.click(); await input.pressSequentially(' nghiêng');
          await expect(input.locator('strong em')).toHaveText(' nghiêng');
          await expect(input).toHaveText('Đậm nghiêng');
          await input.press('Control+z'); await expect(input).not.toHaveText('Đậm nghiêng');
          await input.press('Control+Shift+z'); await expect(input).toHaveText('Đậm nghiêng');
          await input.fill('x'.repeat(2001)); await expect(form.getByRole('alert')).toContainText('2.000');
          await expect(input).not.toHaveText('x'.repeat(2001));
          await input.fill('');
          if (await bold.getAttribute('aria-pressed') === 'true') await bold.click();
          if (await italic.getAttribute('aria-pressed') === 'true') await italic.click();
          await input.fill('Rất thích chương này.'); await input.selectText();
          await bold.click();
          await expect(input.locator('strong')).toHaveText('Rất thích chương này.');
          await input.press('End');
          await bold.click();
          await form.getByRole('button', { name: 'Chèn emoji', exact: true }).click();
          const emojiPicker = form.getByRole('dialog', { name: 'Chọn emoji', exact: true });
          await expect(emojiPicker.getByLabel('Tìm emoji', { exact: true })).toBeVisible();
          await expect(emojiPicker).toHaveCSS('opacity', '1');
          await expect(emojiPicker.getByRole('gridcell').first()).toHaveCSS('font-size', '28px');
          await emojiPicker.screenshot({ path: path.join(output, `${role}-${width}-${paper}-emoji.png`), timeout: 3000 });
          await emojiPicker.getByLabel('Tìm emoji', { exact: true }).fill('ngón tay cái');
          await emojiPicker.getByRole('gridcell', { name: 'dấu ra hiệu đồng ý', exact: true }).click();
          await expect(input).toHaveText('Rất thích chương này.👍');
          await expect(input).not.toContainText('**');
          await form.screenshot({ path: path.join(output, `${role}-${width}-${paper}-composer.png`) });
          await form.getByRole('button', { name: 'Tìm GIF', exact: true }).click();
          const gifPicker = form.getByRole('dialog', { name: 'Kho GIF', exact: true });
          if (gifEnabled) {
            await gifPicker.getByRole('textbox', { name: 'Tìm GIF', exact: true }).fill('meme');
            await gifPicker.getByRole('button', { name: 'Chọn GIF Meme 1', exact: true }).click({ trial: true });
            await gifPicker.getByRole('button', { name: 'Xem thêm GIF', exact: true }).click();
            await expect(gifPicker).toHaveCSS('opacity', '1');
            await gifPicker.screenshot({ path: path.join(output, `${role}-${width}-${paper}-gif.png`) });
            await gifPicker.getByRole('button', { name: 'Chọn GIF Meme 3', exact: true }).click();
            await expect(form.locator('.sc-comment-giphy-media > img')).toHaveAttribute('src', 'https://media.giphy.com/media/gif3/giphy.gif?cid=fixture');
            assert.ok(providerRequests.some(url => new URL(url).searchParams.get('q') === 'meme'));
            await form.getByRole('button', { name: 'Bỏ GIF', exact: true }).click();
          } else {
            await expect(gifPicker.getByRole('status')).toContainText('API key GIPHY');
            await expect(gifPicker.getByRole('textbox')).toBeDisabled();
            await page.keyboard.press('Escape');
          }
          await form.locator('input[type="file"]').setInputFiles({ name: 'hello.gif', mimeType: 'image/gif', buffer: gif });
          await expect(form.getByRole('img', { name: 'GIF đính kèm', exact: true })).toBeVisible();
          await form.getByRole('checkbox', { name: 'Bình luận này chứa spoiler', exact: true }).check();
          failCreate = true;
          await form.getByRole('button', { name: 'Gửi bình luận', exact: true }).click();
          await expect(section.getByRole('alert')).toContainText('Chưa gửi bình luận.');
          await expect(input).toHaveText('Rất thích chương này.👍');
          failCreate = false;
          await form.getByRole('button', { name: 'Gửi bình luận', exact: true }).click();
          await expect(input).toHaveText('');
          const posted = section.locator('.sc-comment-item[data-comment-id="new-1"]');
          await expect(posted.locator('strong')).toHaveCount(0);
          await posted.getByRole('button', { name: 'Có spoiler · Bấm để xem', exact: true }).click();
          await expect(posted.locator('strong')).toHaveText('Rất thích chương này.');
          await posted.getByRole('button', { name: 'Xem GIF', exact: true }).click();
          await expect(posted.getByRole('img', { name: 'GIF trong bình luận', exact: true })).toBeVisible();
          comments.find(item => item.commentId === 'new-1').content += '\n\n[^author-legacy]\n\n[^author-legacy]: Ghi chú cũ';
          await page.reload();
          await posted.getByRole('button', { name: 'Sửa', exact: true }).click();
          await expect(posted.getByRole('checkbox')).toBeChecked();
          await expect(posted.getByRole('textbox', { name: 'Sửa bình luận', exact: true })).toContainText('[^author-legacy]: Ghi chú cũ');
          await posted.getByRole('textbox', { name: 'Sửa bình luận', exact: true }).fill('Đã sửa bình luận.');
          await posted.getByRole('button', { name: 'Lưu bình luận', exact: true }).click();
          await expect(posted.getByRole('button', { name: 'Có spoiler · Bấm để xem', exact: true })).toBeVisible();
          const like = spoiler.getByRole('button', { name: 'Thích bình luận', exact: true }), dislike = spoiler.getByRole('button', { name: 'Không thích bình luận', exact: true });
          failVote = true; await like.click(); await expect(spoiler.getByRole('alert')).toContainText('Chưa lưu phản ứng.');
          await expect(like).toHaveAttribute('aria-pressed', 'false');
          failVote = false; await like.click(); await expect(like).toHaveAttribute('aria-pressed', 'true'); await expect(like).toHaveText('thumb_up3');
          await dislike.click(); await expect(dislike).toHaveAttribute('aria-pressed', 'true'); await expect(like).toHaveAttribute('aria-pressed', 'false');
          await dislike.click(); await expect(dislike).toHaveAttribute('aria-pressed', 'false');
          await spoiler.getByRole('button', { name: 'Trả lời', exact: true }).click();
          const thread = section.locator('.sc-comment-thread[data-comment-id="spoiler"]');
          await thread.getByRole('textbox', { name: 'Trả lời bình luận', exact: true }).fill('Mình cũng nghĩ vậy.');
          await thread.getByRole('button', { name: 'Gửi trả lời', exact: true }).click();
          const reply = thread.locator('.sc-comment-replies .sc-comment-item');
          await expect(reply.getByRole('button', { name: 'Có spoiler · Bấm để xem', exact: true })).toBeVisible();
          await expect(reply.getByRole('link', { name: 'Chương 1', exact: true })).toBeVisible();
          await reply.getByRole('button', { name: 'Có spoiler · Bấm để xem', exact: true }).click();
          await expect(reply.getByText('Mình cũng nghĩ vậy.', { exact: true })).toBeVisible();
        } else {
          await expect(section.getByRole('button', { name: 'Thích bình luận', exact: true }).first()).toBeDisabled();
          await expect(section.getByRole('button', { name: 'Trả lời', exact: true })).toHaveCount(0);
          await expect(section.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
        }
        await section.getByRole('heading', { name: 'Bình luận chương', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${role}-${width}-${paper}-chapter.png`) });
        await page.goto(`${base}${prefix}/novels/novel-1`);
        const discussion = page.locator('#reader-comments .sc-comments');
        await discussion.scrollIntoViewIfNeeded();
        await expect(discussion.locator('.sc-comment-item[data-comment-id="general"] .sc-comment-source')).toHaveText('Thảo luận chung');
        await expect(discussion.locator('.sc-comment-item[data-comment-id="spoiler"] .sc-comment-source')).toHaveText('Chương 1');
        assert.equal(allScopeRequested, true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
      } catch (error) {
        console.log(JSON.stringify({ role, width, paper, errors }));
        await page.screenshot({ path: path.join(output, 'comment-error.png') });
        throw error;
      } finally { await context.close(); }
    }
    console.log(`Comment screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
