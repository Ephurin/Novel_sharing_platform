import test from 'node:test';
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isolatedIdeServer } from './helpers/isolated-ide-server.mjs';
import { readerEvidence } from './reader-browser-evidence.mjs';

test('reader social uses real APIs: follow, mention, private replies, anchors and revocation', { timeout: 240000 }, async () => {
  const fixture = await isolatedIdeServer({ serverFile: 'reader-social-browser-server.ts' });
  const { accounts: [author, a, b, outsider], novelId, chapterId, base: api } = fixture.config;
  const send = (account, path, method = 'GET', body) =>
    fetch(api + path, { method, headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const request = async (...args) => {
    const response = await send(...args);
    const value = response.status === 204 ? null : await response.json();
    assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0, proxy: { '/api': new URL(api).origin } } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const output = await readerEvidence('reader-social-real-');
  const connect = async context => context.route('**/api/v1/**', async route => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: api + original.pathname.split('/api/v1')[1] + original.search });
    await route.fulfill({ response });
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await connect(context);
    await context.addInitScript(token => localStorage.setItem('ephurin_access_token', token), a.token);
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/reader/connections');
    await page.getByLabel('Tìm độc giả').fill('social2');
    await page.getByRole('button', { name: 'Theo dõi', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bỏ theo dõi' })).toBeVisible();
    await request(b, `/users/${a.userId}/follow`, 'POST');
    await page.reload(); await expect(page.getByText(/@social2 · Bạn bè/)).toBeVisible();
    await page.getByRole('link', { name: 'Social 2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hồ sơ độc giả' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bỏ theo dõi', exact: true })).toBeVisible();
    await page.goto(base + `/reader/chapters/${chapterId}`);
    const privatePanel = page.locator('#reader-private-comments');
    await expect(privatePanel).toHaveCount(0);
    const chapterComments = page.getByRole('region', { name: 'Bình luận chương', exact: true });
    await expect(chapterComments.getByRole('button', { name: 'Nhắn riêng cho tác giả' })).toBeVisible();
    await expect(chapterComments.getByRole('textbox', { name: 'Nội dung riêng' })).toHaveCount(0);
    await page.locator('.sc-reader-manuscript .chapter-prose > p').filter({ hasText: 'Middle paragraph.' }).press('Enter');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('button', { name: 'Trao đổi riêng', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Trao đổi với bạn bè' })).toBeVisible();
    await expect(privatePanel.getByRole('textbox')).toHaveCount(1);
    await expect(privatePanel.locator('.sc-comment-editor-tools')).toHaveCount(0);
    await expect(page.locator('[data-discussion-open]')).toHaveText('Middle paragraph.');
    assert.equal(await page.evaluate(() => window.scrollY), scrollBefore);
    const anchorBox = await page.locator('[data-discussion-open]').boundingBox();
    const discussionBox = await privatePanel.boundingBox();
    assert.ok(discussionBox.x >= anchorBox.x + anchorBox.width || discussionBox.y >= anchorBox.y + anchorBox.height);
    await expect(privatePanel.getByText('Tất cả bạn bè · Gõ @ để chọn')).toHaveCount(0);
    await expect(privatePanel.getByText('Đang tải trao đổi…')).toHaveCount(0);
    await expect(privatePanel.locator('form .sc-private-chat-name')).toHaveCount(0);
    const chatHeight = await privatePanel.evaluate(panel => panel.getBoundingClientRect().height);
    await privatePanel.getByRole('textbox', { name: 'Nội dung riêng', exact: true }).fill('Only mutual friends see this.');
    await privatePanel.getByRole('button', { name: 'Gửi riêng', exact: true }).click();
    await expect(privatePanel.locator('article').getByText('Only mutual friends see this.', { exact: true })).toBeVisible();
    await fixture.command('approve');
    const roots = await request(a, `/chapters/${chapterId}/comments?channel=FRIENDS_ALL`); const root = roots.data[0].commentId;
    await privatePanel.getByRole('button', { name: 'Đóng hộp trao đổi' }).click();
    const otherParagraph = page.locator('.sc-reader-manuscript .chapter-prose > p').filter({ hasText: 'Opening paragraph.' });
    await otherParagraph.press('Enter');
    await page.getByRole('button', { name: 'Trao đổi riêng', exact: true }).click();
    await expect(privatePanel.getByRole('textbox', { name: 'Nội dung riêng' })).toBeVisible();
    await expect(privatePanel.getByText('Only mutual friends see this.', { exact: true })).toHaveCount(0);
    await privatePanel.getByRole('textbox', { name: 'Nội dung riêng' }).fill('Discarded draft');
    await privatePanel.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(privatePanel).toHaveCount(0);
    await expect(otherParagraph).toBeFocused();
    const publicSection = page.getByRole('region', { name: 'Bình luận chương', exact: true });
    const publicEditor = publicSection.getByRole('textbox', { name: 'Bình luận của bạn', exact: true });
    await publicEditor.fill('🌿 Chào  nhé');
    await publicEditor.press('End');
    for (let i = 0; i < 4; i++) await publicEditor.press('ArrowLeft');
    await publicEditor.pressSequentially('@soc');
    await expect(page.getByRole('option', { name: /@social2/ })).toBeVisible();
    await publicEditor.press('Enter');
    await expect(publicEditor.locator('[data-comment-mention]')).toHaveText('@social2');
    await expect.poll(async () => {
      await publicEditor.press('Home');
      return publicEditor.evaluate(element => {
        const selection = window.getSelection();
        if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return false;
        const prefix = document.createRange();
        prefix.selectNodeContents(element);
        prefix.setEnd(selection.anchorNode, selection.anchorOffset);
        return prefix.toString() === '';
      });
    }).toBe(true);
    await page.keyboard.insertText('Hi ');
    await expect(publicEditor).toHaveText('Hi 🌿 Chào @social2 nhé');
    await publicSection.getByRole('button', { name: 'Gửi bình luận', exact: true }).click();
    await expect(publicSection.locator('article').getByText('Hi 🌿 Chào @social2 nhé', { exact: true })).toBeVisible();
    await fixture.command('approve');
    const publicComments = await request(a, `/chapters/${chapterId}/comments`);
    assert.equal(publicComments.data[0].mentions[0].userId, b.userId);
    assert.equal(publicComments.data[0].mentions[0].start, 'Hi 🌿 Chào '.length);
    await publicSection.getByRole('button', { name: 'Trả lời', exact: true }).click();
    await publicSection.getByRole('textbox', { name: 'Trả lời bình luận', exact: true }).fill('@');
    await page.getByRole('option', { name: /@social2/ }).click();
    await publicSection.getByRole('button', { name: 'Gửi trả lời', exact: true }).click();
    await expect(publicSection.locator('article').getByText('@social2', { exact: true })).toBeVisible();
    const publicReplies = await request(a, `/comments/${publicComments.data[0].commentId}/replies`);
    assert.equal(publicReplies.data[0].mentions[0].userId, b.userId);
    await page.locator('.sc-reader-manuscript .chapter-prose > p').filter({ hasText: 'Middle paragraph.' }).press('Enter');
    await page.getByRole('button', { name: 'Trao đổi riêng', exact: true }).click();
    const chatEditor = privatePanel.getByRole('textbox', { name: 'Nội dung riêng', exact: true });
    const sendPrivate = privatePanel.getByRole('button', { name: 'Gửi riêng', exact: true });
    await chatEditor.fill('Selected friend only. @soc');
    await expect(sendPrivate).toBeDisabled();
    await page.getByRole('listbox', { name: 'Chọn bạn nhận tin' }).getByRole('option', { name: /@social2/ }).click();
    await expect(privatePanel.getByText('Chỉ 1 bạn được chọn')).toBeVisible();
    await chatEditor.fill('Selected friend only.');
    await expect(sendPrivate).toBeDisabled();
    await chatEditor.fill('Selected friend only. @soc');
    await expect(page.getByRole('option', { name: /@social2/ })).toBeVisible();
    await chatEditor.press('Enter');
    await sendPrivate.click();
    await expect(privatePanel.locator('article').getByText('Selected friend only. @social2', { exact: true })).toBeVisible();
    await expect(privatePanel.locator('article').last()).toContainText('Selected friend only. @social2');
    await expect(privatePanel.getByRole('button', { name: 'Trả lời', exact: true })).toHaveCount(0);
    assert.ok(await privatePanel.evaluate(panel => panel.getBoundingClientRect().height) > chatHeight);
    await expect(privatePanel.getByText('Đã gửi.', { exact: true })).toHaveCount(0);
    await fixture.command('approve');
    const selected = await request(a, `/chapters/${chapterId}/comments?channel=FRIENDS_SELECTED`);
    assert.equal(selected.data[0].content, 'Selected friend only. @social2');
    await expect(page.locator('[data-private-count="2"]')).toHaveCount(1);
    const chapter = (await request(a, `/reading/chapters/${chapterId}`)).data;
    await request(a, `/chapters/${chapterId}/comments`, 'POST', {
      content: 'Anchored feedback for the author.', audience: 'AUTHOR_PRIVATE',
      anchor: { contentVersion: chapter.contentVersion, paragraphId: chapter.paragraphs[0].paragraphId }
    });
    await request(a, `/chapters/${chapterId}/comments`, 'POST', {
      content: 'Feedback on a different paragraph.', audience: 'AUTHOR_PRIVATE',
      anchor: { contentVersion: chapter.contentVersion, paragraphId: chapter.paragraphs[2].paragraphId }
    });
    await fixture.command('approve');
    await fixture.command('prepend');
    await page.reload();
    await expect(otherParagraph).toHaveAttribute('data-private-count', '1');
    await expect(otherParagraph).not.toHaveAttribute('data-paragraph-id', chapter.paragraphs[0].paragraphId);
    const authorFeedback = chapterComments.getByRole('region', { name: 'Góp ý riêng cho tác giả', exact: true });
    const feedbackEditor = authorFeedback.getByRole('textbox', { name: 'Nội dung riêng', exact: true });
    await chapterComments.getByRole('button', { name: 'Nhắn riêng cho tác giả' }).click();
    await expect(authorFeedback.getByRole('textbox')).toHaveCount(1);
    await expect(authorFeedback.getByRole('combobox')).toHaveCount(0);
    await expect(authorFeedback.getByText('Feedback on a different paragraph.', { exact: true })).toBeVisible();
    await expect(authorFeedback.getByText('Anchored feedback for the author.', { exact: true })).toBeVisible();
    const followup = 'Private feedback for the whole chapter.';
    await feedbackEditor.fill(followup);
    await otherParagraph.scrollIntoViewIfNeeded();
    await otherParagraph.press('Enter');
    await page.getByRole('button', { name: 'Trao đổi riêng', exact: true }).click();
    await expect(privatePanel.getByRole('textbox')).toBeVisible();
    await expect(privatePanel.locator('article')).toHaveCount(0);
    await privatePanel.getByRole('button', { name: 'Xem góp ý riêng cho tác giả' }).click();
    await expect(privatePanel).toHaveCount(0);
    await expect(authorFeedback).toBeFocused();
    await expect(authorFeedback).toBeInViewport();
    await expect(authorFeedback.getByText('Anchored feedback for the author.', { exact: true })).toBeVisible();
    await expect(authorFeedback.getByText('Feedback on a different paragraph.', { exact: true })).toBeVisible();
    await expect(feedbackEditor).toHaveText(followup);
    const [feedbackResponse] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1/chapters/${chapterId}/comments`),
      authorFeedback.getByRole('button', { name: 'Gửi riêng', exact: true }).click()
    ]);
    assert.equal(feedbackResponse.status(), 201);
    assert.equal(feedbackResponse.request().postDataJSON().anchor, undefined);
    const { commentId: followupId } = (await feedbackResponse.json()).data;
    const savedFollowup = (await request(a, `/comments/${followupId}/thread`)).data.root;
    assert.equal(savedFollowup.audience, 'AUTHOR_PRIVATE');
    assert.equal(savedFollowup.anchor ?? null, null);
    await expect(authorFeedback.locator('article').getByText(followup, { exact: true })).toBeVisible();
    await expect(feedbackEditor).toHaveText('');
    await chapterComments.getByRole('button', { name: 'Nhắn riêng cho tác giả' }).click();
    let reply;
    for (let index = 0; index < 7; index++) { reply = await request(b, `/comments/${root}/replies`, 'POST', { content: `Private reply ${index}` }); await fixture.command('approve'); }
    const recipient = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await connect(recipient);
    await recipient.addInitScript(token => { localStorage.setItem('ephurin_access_token', token); localStorage.setItem('storycraft-theme', 'dark'); }, b.token);
    const mobile = await recipient.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(base + `/reader/chapters/${chapterId}`);
    const marker = mobile.locator('[data-private-count="2"]').filter({ hasText: 'Middle paragraph.' });
    await expect(marker).toBeVisible();
    await expect(mobile.locator('.sc-reader-manuscript .chapter-prose > p').filter({ hasText: 'Opening paragraph.' })).not.toHaveAttribute('data-private-count', /.+/);
    await marker.press('Enter');
    await mobile.getByRole('button', { name: 'Trao đổi riêng', exact: true }).click();
    const recipientPanel = mobile.getByRole('dialog', { name: 'Trao đổi với bạn bè' });
    await expect(recipientPanel.getByRole('button', { name: 'Xem góp ý riêng cho tác giả' })).toHaveCount(0);
    const selectedMessage = recipientPanel.locator('article').filter({ hasText: 'Selected friend only. @social2' });
    const allMessage = recipientPanel.locator('article').filter({ hasText: 'Only mutual friends see this.' });
    const replySelected = selectedMessage.getByRole('button', { name: 'Trả lời Social 1', exact: true });
    const replyAll = allMessage.getByRole('button', { name: 'Trả lời Social 1', exact: true });
    const replyBox = recipientPanel.getByRole('textbox', { name: 'Trả lời bình luận', exact: true });
    const rootBox = recipientPanel.getByRole('textbox', { name: 'Nội dung riêng', exact: true });
    await rootBox.fill('Unsent new discussion.');
    await replySelected.click();
    await expect(recipientPanel.getByText('Trả lời Social 1 · Chỉ bạn bè được chọn')).toBeVisible();
    await expect(replyBox).toHaveText('');
    await replyBox.fill('Selected reply from paragraph.');
    await replyAll.click();
    await expect(replyBox).toHaveText('');
    await replyBox.fill('Draft for all friends.');
    await replySelected.click();
    await expect(replyBox).toHaveText('Selected reply from paragraph.');
    const { promise: releaseReply, resolve: allowReply } = Promise.withResolvers();
    await mobile.route(`**/comments/${selected.data[0].commentId}/replies`, async route => {
      if (route.request().method() === 'POST') await releaseReply;
      await route.fallback();
    });
    await recipientPanel.getByRole('button', { name: 'Gửi trả lời', exact: true }).click();
    try {
      await expect(replyAll).toBeDisabled();
      await expect(replyBox).toHaveAttribute('contenteditable', 'false');
    } finally {
      const submitted = mobile.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1/comments/${selected.data[0].commentId}/replies`);
      allowReply();
      assert.equal((await submitted).status(), 201);
    }
    await expect(recipientPanel.locator('article').getByText('Selected reply from paragraph.', { exact: true })).toBeVisible();
    await fixture.command('approve');
    const selectedReplies = await request(a, `/comments/${selected.data[0].commentId}/replies`);
    assert.deepEqual(selectedReplies.data.map(reply => [reply.content, reply.audience]), [['Selected reply from paragraph.', 'FRIENDS_SELECTED']]);
    assert.equal((await request(b, `/chapters/${chapterId}/comments?channel=FRIENDS_ALL`)).data.length, 1);
    await replyAll.click();
    await expect(replyBox).toHaveText('Draft for all friends.');
    await recipientPanel.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(rootBox).toHaveText('Unsent new discussion.');
    await replySelected.click();
    await expect(replyBox).toHaveText('');
    const ownReplyId = selectedReplies.data[0].commentId;
    assert.equal((await send(outsider, '/reports', 'POST', { targetType: 'COMMENT', targetId: root, reason: 'SPAM' })).status, 404);
    assert.equal((await send(outsider, `/comments/${ownReplyId}`, 'DELETE')).status, 404);
    assert.equal((await send(outsider, `/comments/${ownReplyId}`, 'PATCH', { content: 'Forbidden edit.' })).status, 404);
    const ownActions = recipientPanel.locator('article').filter({ hasText: 'Selected reply from paragraph.' })
      .getByRole('button', { name: 'Thao tác với tin nhắn của Social 2', exact: true });
    await ownActions.click();
    await expect(mobile.getByRole('menuitem', { name: 'Báo cáo' })).toHaveCount(0);
    await mobile.getByRole('menuitem', { name: 'Sửa' }).click();
    await recipientPanel.getByRole('textbox', { name: 'Sửa bình luận' }).fill('Edited selected reply.');
    await recipientPanel.getByRole('button', { name: 'Lưu bình luận' }).click();
    const editedReply = recipientPanel.locator('article').filter({ hasText: 'Edited selected reply.' });
    await expect(editedReply.getByText('Edited selected reply.', { exact: true })).toBeVisible();
    await editedReply.getByRole('button', { name: 'Thao tác với tin nhắn của Social 2', exact: true }).click();
    await mobile.getByRole('menuitem', { name: 'Xóa' }).click();
    const selectedRootId = selected.data[0].commentId;
    const selectedReplyList = url => url.pathname === `/api/v1/comments/${selectedRootId}/replies` && url.searchParams.has('page');
    const { promise: holdReplyReads, resolve: releaseReplyReads } = Promise.withResolvers();
    await mobile.route(selectedReplyList, async route => {
      await holdReplyReads;
      await route.fallback();
    });
    try {
      await Promise.all([
        mobile.waitForResponse(async response => {
          const url = new URL(response.url());
          if (!response.ok() || response.request().method() !== 'GET' ||
            url.pathname !== `/api/v1/chapters/${chapterId}/comments` || url.searchParams.get('channel') !== 'FRIENDS_SELECTED') return false;
          return (await response.json()).data.some(comment => comment.commentId === selectedRootId && comment.repliesCount === 0);
        }),
        editedReply.getByRole('button', { name: 'Xác nhận xóa' }).click()
      ]);
      await expect(selectedMessage).toBeVisible();
      await expect(editedReply).toHaveCount(0);
    } finally {
      releaseReplyReads();
      await mobile.unroute(selectedReplyList);
    }
    assert.equal((await send(b, `/comments/${ownReplyId}/thread`)).status, 404);
    await fixture.command('notify');
    const notifications = await request(a, '/notifications?limit=20');
    const deepLink = notifications.data.find(item => item.payload.commentId === reply.data.commentId)?.payload.href;
    assert.ok(deepLink?.includes(`threadId=${root}`), JSON.stringify(notifications));
    await mobile.goto(base + deepLink);
    await expect(mobile.locator('.is-focused').getByText('Private reply 6', { exact: true })).toBeVisible();
    await expect(mobile.locator('#reader-private-comments .sc-comment-item')).toHaveCount(0);
    const cappedHeight = await mobile.locator('#reader-private-comments').evaluate(panel => panel.getBoundingClientRect().height);
    await mobile.getByRole('textbox', { name: 'Trả lời bình luận', exact: true }).fill('Reply from browser.');
    await mobile.getByRole('button', { name: 'Gửi trả lời', exact: true }).click();
    await expect(mobile.locator('article').getByText('Reply from browser.', { exact: true })).toBeVisible();
    await expect(mobile.locator('#reader-private-comments article').last()).toContainText('Reply from browser.');
    assert.equal(await mobile.locator('.sc-paragraph-chat-history').evaluate(history => history.scrollHeight > history.clientHeight), true);
    assert.equal(await mobile.locator('#reader-private-comments').evaluate(panel => panel.getBoundingClientRect().height), cappedHeight);
    await expect(mobile.getByRole('button', { name: 'Đóng hộp trao đổi' })).toBeInViewport();
    await expect(mobile.getByRole('textbox', { name: 'Trả lời bình luận', exact: true })).toBeInViewport({ ratio: 0.9 });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.screenshot({ path: path.join(output, 'mobile-dark-thread.png'), fullPage: true });
    await allMessage.getByRole('button', { name: 'Thao tác với tin nhắn của Social 1', exact: true }).click();
    await expect(mobile.getByRole('menuitem', { name: 'Xóa' })).toHaveCount(0);
    await expect(mobile.getByRole('menuitem', { name: 'Sửa' })).toHaveCount(0);
    await mobile.getByRole('menuitem', { name: 'Báo cáo' }).click();
    await allMessage.getByRole('textbox', { name: 'Lý do báo cáo' }).fill('Tin nhắn gây quấy rối.');
    await allMessage.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(allMessage.getByRole('status')).toHaveText('Đã gửi báo cáo cho quản trị viên.');
    await page.screenshot({ path: path.join(output, 'desktop-light-comments.png'), fullPage: true });
    await page.goto(base + `/reader/novels/${novelId}`);
    const novelComments = page.getByRole('region', { name: 'Bình luận tác phẩm', exact: true });
    await novelComments.getByRole('button', { name: 'Nhắn riêng cho tác giả' }).click();
    await novelComments.getByRole('textbox', { name: 'Nội dung riêng', exact: true }).fill('Feedback for author only.');
    await novelComments.getByRole('button', { name: 'Gửi riêng', exact: true }).click();
    await expect(novelComments.locator('article').getByText('Feedback for author only.', { exact: true })).toBeVisible();
    await fixture.command('approve'); await page.goto(base + '/reader/feedback');
    await expect(page.getByText('Feedback for author only.', { exact: true })).toBeVisible();
    await fixture.command('detach'); await mobile.reload();
    await expect(mobile.getByText(/Đoạn gốc đã thay đổi/)).toBeVisible();
    await request(b, `/users/${a.userId}/follow`, 'DELETE'); await mobile.reload();
    await expect(mobile.getByText('Không còn quyền xem cuộc trao đổi này')).toBeVisible();
    await expect(mobile.getByText('Only mutual friends see this.', { exact: true })).toHaveCount(0);
    await request(b, `/users/${a.userId}/follow`, 'POST');
    // Account switching in the same browser context must not restore private content.
    await page.evaluate(token => localStorage.setItem('ephurin_access_token', token), outsider.token);
    await context.clearCookies();
    // The init script belongs to the original account, so use a fresh page script for the switch.
    await page.addInitScript(token => localStorage.setItem('ephurin_access_token', token), outsider.token);
    await page.goto(base + deepLink);
    await expect(page.getByText('Không còn quyền xem cuộc trao đổi này')).toBeVisible();
    await expect(page.getByText('Only mutual friends see this.', { exact: true })).toHaveCount(0);
    await mobile.reload(); await expect(mobile.getByText('Only mutual friends see this.', { exact: true })).toBeVisible();
    await fixture.command('vip'); await mobile.reload();
    await expect(mobile.getByText('Only mutual friends see this.', { exact: true })).toHaveCount(0);
    const authorContext = await browser.newContext(); await connect(authorContext); await authorContext.addInitScript(token => localStorage.setItem('ephurin_access_token', token), author.token);
    const authorPage = await authorContext.newPage(); await authorPage.goto(base + `/author/novels/${novelId}/comments`);
    await authorPage.getByRole('tab', { name: 'Góp ý riêng', exact: true }).click();
    await expect(authorPage.getByText('Feedback for author only.', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ evidence: output, realBackend: true }));
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); await fixture.close(); }
});
