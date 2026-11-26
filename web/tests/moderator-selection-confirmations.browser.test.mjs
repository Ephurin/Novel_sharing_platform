import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

test('selection decisions require fresh confirmations after a conflict, refetch and case navigation', { timeout: 90000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'selection-confirmations-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (!/^\/moderator\/selections\/case-[ab]$/.test(request.url)) return next();
          try {
            const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="vi"><head><script src="/theme-init.js"></script></head><body>
              <div id="root"></div><script type="module">
                import React from 'react';
                import { createRoot } from 'react-dom/client';
                import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
                import { useQueryClient } from '@tanstack/react-query';
                import { AppProviders } from '/src/app/providers.tsx';
                import '/src/styles.css';
                import { ModeratorSelectionDetailPage } from '/src/features/novel-selection/SelectionPages.tsx';
                const h = React.createElement;
                function Fixture() {
                  const cache = useQueryClient();
                  return h(React.Fragment, null,
                    h('button', { onClick: () => cache.invalidateQueries({ queryKey: ['selection-detail'] }) }, 'Tải dữ liệu mới'),
                    h(Link, { to: '/moderator/selections/case-a' }, 'Mở hồ sơ A'),
                    h(Link, { to: '/moderator/selections/case-b' }, 'Mở hồ sơ B'),
                    h(Routes, null, h(Route, { path: '/moderator/selections/:caseId', element: h(ModeratorSelectionDetailPage) })));
                }
                createRoot(document.getElementById('root')).render(h(AppProviders, null, h(BrowserRouter, null, h(Fixture))));
              </script></body></html>`);
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(html);
          } catch (error) {
            next(error);
          }
        });
      }
    }]
  });
  let browser;
  let recovery;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    const requests = [];
    let version = 5;
    await page.route('**/api/v1/moderator/selections/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'POST') {
        requests.push(request.postDataJSON());
        version = requests.length === 1 ? 6 : 8;
        if (requests.length === 1) {
          return route.fulfill({ status: 409, json: {
            success: false, error: { code: 'SELECTION_STALE', message: 'Hồ sơ đã thay đổi.' }
          } });
        }
        return route.fulfill({ json: { success: true, data: { status: 'SELECTED' } } });
      }
      const caseId = pathname.split('/').at(-1);
      if (recovery && version === 6) {
        await recovery.promise;
      }
      const title = caseId === 'case-a' ? 'Hồ sơ A' : 'Hồ sơ B';
      const itemVersion = caseId === 'case-a' ? version : 7;
      return route.fulfill({ json: { success: true, data: {
        case_id: caseId, novel_id: caseId, title, version: itemVersion, status: 'PENDING',
        eligibility: 'SHORT_STORY', allowedDecisions: ['APPROVE'], nominations: [],
        current: { title, synopsis: 'Bản công khai ' + itemVersion, chapters: [] }, baseline: null
      } } });
    });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/moderator/selections/case-a', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const decision = page.getByRole('textbox', { name: 'Quyết định', exact: true });
    const reason = page.getByLabel('Lý do xử lý');
    const save = page.getByRole('button', { name: 'Lưu quyết định' });
    const checks = page.getByRole('checkbox');
    const chooseApproval = async () => {
      await decision.click();
      await page.getByRole('option', { name: 'Công nhận', exact: true }).click();
      await expect(checks).toHaveCount(5);
    };
    const confirmAll = async () => {
      for (const checkbox of await checks.all()) await checkbox.check();
    };
    const verifyReset = async (expectedReason) => {
      await expect(decision).toHaveValue('');
      await expect(save).toBeDisabled();
      await expect(reason).toHaveValue(expectedReason);
      await chooseApproval();
      for (const checkbox of await checks.all()) await expect(checkbox).not.toBeChecked();
      await expect(save).toBeDisabled();
    };

    await chooseApproval();
    await reason.fill('Lý do cho hồ sơ A');
    await confirmAll();
    recovery = Promise.withResolvers();
    const recoveryRequest = page.waitForRequest(request =>
      request.method() === 'GET' && new URL(request.url()).pathname === '/api/v1/moderator/selections/case-a');
    await save.click();
    await recoveryRequest;
    await expect(save).toBeDisabled();
    await expect(decision).toBeDisabled();
    assert.deepEqual(requests.map(request => request.expectedVersion), [5]);
    recovery.resolve();
    await expect(page.getByText('Bản công khai 6', { exact: true })).toBeVisible();
    await verifyReset('Lý do cho hồ sơ A');

    await confirmAll();
    version = 7;
    await page.getByRole('button', { name: 'Tải dữ liệu mới' }).click();
    await expect(page.getByText('Bản công khai 7', { exact: true })).toBeVisible();
    await verifyReset('Lý do cho hồ sơ A');

    await confirmAll();
    await page.getByRole('link', { name: 'Mở hồ sơ B' }).click();
    await expect(page.getByRole('heading', { name: 'Hồ sơ B' })).toBeVisible();
    await verifyReset('');
    await page.getByRole('link', { name: 'Mở hồ sơ A' }).click();
    await expect(page.getByRole('heading', { name: 'Hồ sơ A' })).toBeVisible();
    await verifyReset('');

    await reason.fill('Đã xét lại trên bản mới');
    await confirmAll();
    await save.click();
    await expect(page.getByText('Đã lưu quyết định.', { exact: true })).toBeVisible();
    assert.deepEqual(requests.map(request => request.expectedVersion), [5, 7]);
    assert.equal(requests[1].shortStoryVerified, true);
  } finally {
    recovery?.resolve();
    await browser?.close();
    await server.close();
  }
});
