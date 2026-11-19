import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

test('AuthLanding supports password signup, explicit link confirmation, keyboard tabs, theme and login', { timeout: 90000 }, async () => {
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
    let registrationRequests = 0;
    let resendRequests = 0;
    const pendingRegistration = {
      registrationId: '6e32f264-731c-445e-9965-5e1ff6a90062', email: 'reader@gmail.com', resendAfterSeconds: 60
    };
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/google/challenge')) {
        await route.fulfill({ json: { success: true, data: null } });
        return;
      }
      if (url.pathname.endsWith('/auth/register')) {
        registrationRequests++;
        assert.deepEqual(route.request().postDataJSON(), {
          username: 'reader_test', email: 'reader@gmail.com', password: 'MatKhauAnToan123!'
        });
        if (registrationRequests === 1) {
          await route.fulfill({ status: 503, json: { success: false, error: {
            code: 'AUTH_EMAIL_UNAVAILABLE', message: 'Chưa gửi được email xác nhận. Vui lòng thử lại sau.'
          } } });
          return;
        }
        await route.fulfill({ status: 202, json: { success: true, data: pendingRegistration } });
        return;
      }
      if (url.pathname.endsWith('/auth/register/resend')) {
        resendRequests++;
        assert.deepEqual(route.request().postDataJSON(), { registrationId: pendingRegistration.registrationId });
        await route.fulfill({ status: 202, json: { success: true, data: pendingRegistration } });
        return;
      }
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

    await page.clock.install();
    await page.goto(`${base}/login`);
    await expect(page.locator('.sc-author-theme.auth-shell')).toBeVisible();
    await expect(page.getByText('Ephurin Web')).toHaveCount(0);
    await expect(page.getByText(/OAuth callback/i)).toHaveCount(0);

    // Password must NOT be prefilled with sample credentials
    const passwordInput = page.locator('input[autocomplete="current-password"]');
    await expect(passwordInput).toHaveValue('');

    // Keyboard tab switch: Đăng nhập <-> Tạo tài khoản
    const loginTab = page.getByRole('tab', { name: 'Đăng nhập', exact: true });
    const registerTab = page.getByRole('tab', { name: 'Tạo tài khoản', exact: true });
    await loginTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(registerTab).toHaveAttribute('aria-selected', 'true');
    const form = page.getByRole('tabpanel');
    assert.deepEqual(await form.locator('input').evaluateAll(inputs => inputs.map(input =>
      input.labels[0]?.textContent?.replace(/\s*\*\s*$/, '').trim()
    )), ['Username', 'Mật khẩu', 'Nhập lại mật khẩu', 'Email']);
    const confirmation = form.getByLabel('Nhập lại mật khẩu', { exact: true });
    await form.getByLabel('Username', { exact: true }).fill('reader_test');
    await form.locator('input[autocomplete="new-password"]').first().fill('MatKhauAnToan123!');
    await confirmation.fill('MatKhauSai123!');
    await form.getByLabel('Email', { exact: true }).fill('reader@gmail.com');
    const signup = form.getByRole('button', { name: 'Tạo tài khoản', exact: true });
    await signup.click();
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText('Hai mật khẩu chưa khớp.')).toBeVisible();
    assert.equal(registrationRequests, 0);
    await confirmation.fill('MatKhauAnToan123!');
    await signup.click();
    await expect(form.getByRole('alert')).toContainText('Chưa gửi được email xác nhận');
    assert.equal(registrationRequests, 1);
    await form.getByRole('button', { name: 'Thử gửi lại email', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Mở Gmail', exact: true })).toHaveAttribute('href', 'https://mail.google.com/');
    const codeField = page.getByLabel('Mã xác nhận', { exact: true });
    await expect(codeField).toHaveCount(0);
    const resend = page.getByRole('button', { name: /^Gửi lại email/ });
    await expect(resend).toBeDisabled();
    await page.getByRole('button', { name: 'Dùng mã 8 số', exact: true }).click();
    await expect(codeField).toBeVisible();
    await codeField.fill('12345678');
    await page.clock.fastForward(61_000);
    await expect(resend).toBeEnabled();
    await resend.click();
    await expect(page.getByRole('status')).toContainText('Đã gửi lại email xác nhận');
    await expect(codeField).toHaveValue('');
    await expect(resend).toBeDisabled();
    assert.equal(registrationRequests, 2);
    assert.equal(resendRequests, 1);

    await page.getByRole('button', { name: 'Quay lại đăng ký', exact: true }).click();
    await registerTab.focus();
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

    const linkContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const linkPage = await linkContext.newPage();
    const token = 'x'.repeat(43);
    let verificationRequests = 0;
    await linkPage.route('**/api/v1/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/auth/register/verify-link')) {
        verificationRequests++;
        assert.equal(route.request().method(), 'POST');
        assert.deepEqual(route.request().postDataJSON(), { token });
        await route.fulfill({ status: 201, json: { success: true, data: {
          accessToken: 'link-session',
          user: { userId: 'u-2', username: 'reader_test', email: 'reader@gmail.com', role: 'READER', status: 'ACTIVE' }
        } } });
        return;
      }
      await route.fulfill({ json: { success: true, data: [] } });
    });
    await linkPage.goto(`${base}/verify-email#token=${token}`);
    await expect(linkPage.getByRole('heading', { name: 'Xác nhận email' })).toBeVisible();
    assert.equal(verificationRequests, 0);
    await linkPage.getByRole('button', { name: 'Xác nhận tài khoản', exact: true }).click();
    await expect(linkPage).toHaveURL(`${base}/`);
    assert.equal(verificationRequests, 1);
    await linkContext.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
