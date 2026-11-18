import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

test('AuthLanding renders StoryCraft Vietnamese UI, empty password, keyboard tab switch, theme persistence, and login redirect', { timeout: 90000 }, async () => {
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
      if (url.pathname.endsWith('/auth/login')) {
        const body = route.request().postDataJSON();
        assert.equal(body.identifier, 'tacgia@vidu.vn');
        assert.equal(body.password, 'MatKhauAnToan123!');
        await route.fulfill({
          json: {
            success: true,
            data: {
              accessToken: 'test-token',
              user: { userId: 'u-1', username: 'tacgia', email: 'tacgia@vidu.vn', role: 'AUTHOR', status: 'ACTIVE' }
            }
          }
        });
        return;
      }
      await route.fulfill({ json: { success: true, data: [] } });
    });

    await page.goto(`${base}/login`);
    await expect(page.locator('.sc-author-theme.auth-shell')).toBeVisible();
    await expect(page.getByText('Ephurin Web')).toHaveCount(0);
    await expect(page.getByText(/OAuth callback/i)).toHaveCount(0);

    // Password must NOT be prefilled with sample credentials
    const passwordInput = page.getByLabel('Mật khẩu', { exact: true });
    await expect(passwordInput).toHaveValue('');

    // Keyboard tab switch: Đăng nhập <-> Tạo tài khoản
    const loginTab = page.getByRole('tab', { name: 'Đăng nhập', exact: true });
    const registerTab = page.getByRole('tab', { name: 'Tạo tài khoản', exact: true });
    await loginTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(registerTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Tên người dùng', { exact: true })).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(loginTab).toHaveAttribute('aria-selected', 'true');

    // Fill fields and verify theme switch does not clear form input
    const identifierInput = page.getByLabel('Email hoặc tên đăng nhập', { exact: true });
    await identifierInput.fill('tacgia@vidu.vn');
    await passwordInput.fill('MatKhauAnToan123!');

    await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Tối', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(identifierInput).toHaveValue('tacgia@vidu.vn');
    await expect(passwordInput).toHaveValue('MatKhauAnToan123!');

    // Check mobile viewport overflow
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

    // Submit login using the exact single submit button role
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/author$/);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
