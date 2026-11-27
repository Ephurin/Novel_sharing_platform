import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const moderatorUser = {
  userId: 'd0744c0e-1111-4222-8333-9c1100000001',
  email: 'moderator@example.test',
  username: 'prd01_moderator',
  displayName: 'Điều hành viên PR-01',
  role: 'MODERATOR',
  status: 'ACTIVE'
};

test('E02: a MODERATOR session keeps the ordinary web shell, menus and reader landing page', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me')) {
        await route.fulfill({ json: { success: true, data: moderatorUser } });
        return;
      }
      if (url.pathname.includes('/reading/')) {
        await route.fulfill({ json: { success: true, data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } } });
        return;
      }
      await route.fulfill({ json: { success: true, data: null } });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('ephurin_access_token', 'pr-01-moderator-session');
    });
    await page.goto(base + '/');

    await expect(page.getByRole('button', { name: 'Tài khoản Điều hành viên PR-01' })).toBeVisible({ timeout: 20_000 });
    const marker = page.locator('[data-user-role="MODERATOR"]');
    await expect(marker).toHaveCount(1);

    await expect(page.getByRole('link', { name: 'Tác phẩm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Danh sách truyện', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Trang tác giả' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viết tiếp' })).toBeVisible();
    assert.equal(await page.getByRole('link', { name: 'Tổng quan quản trị' }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Kiểm duyệt' }).count(), 0);

    const writeLink = page.getByRole('link', { name: 'Viết tiếp' });
    await writeLink.click();
    await page.waitForURL('**/sang-tac');
    await expect(page.locator('[data-user-role="MODERATOR"]')).toHaveCount(1);

    assert.deepEqual(errors, [], 'uncaught page errors during the moderator session');
  } finally {
    await browser.close();
    await server.close();
  }
});
