import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { isolatedIdeServer } from './helpers/isolated-ide-server.mjs';
import { readerEvidence } from './reader-browser-evidence.mjs';

test('Expo mobile app uses real social APIs and discards private content on background/account changes', { timeout: 180000 }, async () => {
  const fixture = await isolatedIdeServer({ serverFile: 'reader-social-browser-server.ts' });
  const { accounts: [author, a, b, outsider], novelId, chapterId, base: api } = fixture.config;
  const request = async (account, url, method = 'GET', body) => {
    const response = await fetch(api + url, { method, headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = response.status === 204 ? null : await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const directory = fileURLToPath(new URL('../../mobile/dist-social/', import.meta.url));
  const server = createServer(async (req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; const file = path.resolve(directory, relative);
    if (!file.startsWith(path.resolve(directory) + path.sep)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(file); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(body); } catch { res.writeHead(404).end(); }
  }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = await readerEvidence('mobile-social-real-'); let page;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('**/api/v1/**', async route => { const url = new URL(route.request().url()); const response = await route.fetch({ url: api + url.pathname.split('/api/v1')[1] + url.search }); await route.fulfill({ response }); });
    page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(token => { if (!localStorage.getItem('mobile-test-initialized')) { localStorage.setItem('ephurin_mobile_access_token', token); localStorage.setItem('mobile-test-initialized', '1'); } }, a.token);
    await page.goto(base); await expect(page.getByText('Social browser', { exact: true })).toBeVisible();
    await page.getByText('Profile', { exact: true }).last().click(); await page.getByRole('button', { name: 'Bạn bè', exact: true }).click();
    await page.getByLabel('Tìm độc giả', { exact: true }).fill('social2'); await page.getByRole('button', { name: 'Theo dõi', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bỏ theo dõi', exact: true })).toBeVisible(); await request(b, `/users/${a.userId}/follow`, 'POST');
    await page.reload(); await page.getByText('Social browser', { exact: true }).last().click(); await page.getByRole('button', { name: 'Read first chapter' }).click();
    const paragraph = page.getByText('Middle paragraph.', { exact: true }); await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox(); await page.mouse.move(box.x + 20, box.y + 12); await page.mouse.down(); await new Promise(resolve => setTimeout(resolve, 650)); await page.mouse.up();
    await expect(page.getByRole('button', { name: '✓ Tất cả bạn bè hiện tại' })).toBeVisible();
    await page.getByLabel('Nội dung', { exact: true }).fill('Mobile friends secret.'); await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByLabel('Nội dung', { exact: true })).toHaveValue('');
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toBeVisible(); await fixture.command('approve');
    const root = (await request(a, `/chapters/${chapterId}/comments?channel=FRIENDS_ALL`)).data[0].commentId;
    await page.getByRole('button', { name: '✓ Tất cả bạn bè hiện tại' }).click();
    await page.getByRole('button', { name: 'Công khai', exact: true }).click(); await page.getByRole('button', { name: '@ Nhắc đến bạn bè', exact: true }).click();
    await page.getByRole('button', { name: 'Social 2 (@social2)', exact: true }).click(); await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByLabel('Nội dung', { exact: true })).toHaveValue('');
    await expect(page.getByText('@social2', { exact: true })).toBeVisible(); await fixture.command('approve');
    assert.equal((await request(a, `/chapters/${chapterId}/comments`)).data[0].mentions[0].userId, b.userId);
    let reply; for (let i = 0; i < 7; i++) { reply = await request(b, `/comments/${root}/replies`, 'POST', { content: `Mobile reply ${i}` }); await fixture.command('approve'); } await fixture.command('notify');
    await page.reload(); await page.getByText('Notifications', { exact: true }).last().click();
    const notifications = await request(a, '/notifications?limit=20'); const position = notifications.data.findIndex(item => item.payload.commentId === reply.data.commentId); assert.ok(position >= 0);
    await page.getByRole('button', { name: 'Mở thông báo', exact: true }).nth(position).click();
    await expect(page.getByText('Mobile reply 6', { exact: true })).toBeVisible(); await expect(page.getByText('2/2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Trả lời Social 1', exact: true }).click();
    await page.getByRole('textbox', { name: 'Trả lời Social 1', exact: true }).fill('Reply from Expo.'); await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Trả lời Social 1', exact: true })).toHaveCount(0);
    await expect(page.getByText('Reply from Expo.', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'expo-mobile-thread.png'), fullPage: true });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    await request(b, `/users/${a.userId}/follow`, 'DELETE');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    // Root author retains access; use a recipient session below to verify revocation.
    await page.reload(); await page.getByText('Profile', { exact: true }).last().click(); await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByText('Login', { exact: true }).last().click(); await page.getByText('Go to login', { exact: true }).click();
    await page.getByLabel('Email or username').fill('social3'); await page.getByLabel('Password', { exact: true }).fill('SocialTest123!'); await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('Social browser', { exact: true })).toBeVisible();
    await page.getByText('Notifications', { exact: true }).last().click(); await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    // Recipient loses access on unfollow, including after returning from background.
    await request(b, `/users/${a.userId}/follow`, 'POST');
    await page.evaluate(token => localStorage.setItem('ephurin_mobile_access_token', token), b.token); await page.reload();
    await page.getByText('Social browser', { exact: true }).last().click(); await page.getByRole('button', { name: 'Read first chapter' }).click(); await page.getByRole('button', { name: 'Open comments' }).click();
    await page.getByRole('button', { name: 'Tất cả bạn bè hiện tại', exact: true }).click();
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Mở trao đổi/ }).click();
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    await request(b, `/users/${a.userId}/follow`, 'DELETE');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    await request(b, `/users/${a.userId}/follow`, 'POST'); await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toBeVisible();
    await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toBeVisible();
    await fixture.command('detach'); await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByText(/Đoạn gốc đã thay đổi/).first()).toBeVisible();
    await fixture.command('vip');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await expect(page.getByText('Mobile friends secret.', { exact: true })).toHaveCount(0);
    await page.evaluate(token => localStorage.setItem('ephurin_mobile_access_token', token), a.token); await page.reload();
    await page.getByText('Social browser', { exact: true }).last().click(); await page.getByRole('button', { name: 'Bình luận và góp ý' }).click();
    await page.getByRole('button', { name: 'Chỉ tác giả', exact: true }).click();
    await page.getByLabel('Nội dung', { exact: true }).fill('Mobile author feedback.'); await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.getByLabel('Nội dung', { exact: true })).toHaveValue(''); await expect(page.getByText('Mobile author feedback.', { exact: true })).toBeVisible();
    await fixture.command('approve'); await page.reload(); await page.getByText('Profile', { exact: true }).last().click(); await page.getByRole('button', { name: 'Góp ý đã gửi', exact: true }).click();
    await expect(page.getByText('Mobile author feedback.', { exact: true })).toBeVisible();
    await page.evaluate(token => localStorage.setItem('ephurin_mobile_access_token', token), author.token); await page.reload();
    await page.getByText('Profile', { exact: true }).last().click(); await page.getByRole('button', { name: 'Góp ý gửi tôi', exact: true }).click();
    await expect(page.getByText('Mobile author feedback.', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []); console.log(JSON.stringify({ evidence: output, expoWeb: true, nativeDevice: false }));
  } catch (error) { if (page) { console.log((await page.locator('body').innerText()).slice(-7000)); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); } throw error; }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.close(); }
});
