import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

const chapters = [
  {
    chapterId: 'c-1',
    novelId: 'novel-1',
    chapterNumber: 1,
    title: 'Chương 1: Khởi đầu',
    isVip: false,
    priceCoins: 0,
    wordCount: 120
  }
];

async function installApiMocks(page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/auth/me')) {
      data = { userId: 'reader-1', username: 'reader', email: 'reader@example.invalid', role: 'READER', status: 'ACTIVE' };
    } else if (url.pathname.endsWith('/reading/preferences/me')) {
      data = { fontFamily: 'Be Vietnam Pro', fontSize: 18, background: 'LIGHT', lineHeight: 1.8, margin: 24, textAlign: 'LEFT' };
    } else if (url.pathname.endsWith('/reading/bookmarks/me/novel-1')) {
      data = null;
    } else if (url.pathname.endsWith('/reading/novels/novel-1')) {
      data = {
        novelId: 'novel-1',
        title: 'Hành trình qua những mùa gió',
        authorName: 'Người kể chuyện',
        authorId: 'author-1',
        coverImageUrl: null,
        synopsis: 'Giới thiệu.',
        chapters
      };
    } else if (url.pathname.endsWith('/reading/chapters/c-1')) {
      data = { ...chapters[0], content: 'Đoạn văn mở đầu với phông chữ dự phòng.' };
    } else if (url.pathname.endsWith('/statistics')) {
      data = { isFollowing: false, notificationsEnabled: false, ratingsCount: 0, ratingAverage: null };
    }
    await route.fulfill({ json: { success: true, data, meta: { totalItems: 0, totalPages: 1 } } });
  });
}

test('useReadingFonts swallows failed reading-fonts chunk load without unhandled rejection in public and reader routes', { timeout: 120000 }, async () => {
  const server = await preview({
    root: fileURLToPath(new URL('../', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0 }
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PLAYWRIGHT_CHANNEL || undefined
    });

    for (const { routePath, authenticated } of [
      { routePath: '/public/chapters/c-1', authenticated: false },
      { routePath: '/reader/chapters/c-1', authenticated: true }
    ]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.addInitScript(({ authenticated }) => {
        if (authenticated) {
          localStorage.setItem('ephurin_access_token', 'fixture-token');
        }
        window.__unhandledRejections = [];
        window.addEventListener('unhandledrejection', (event) => {
          window.__unhandledRejections.push(String(event.reason));
        });
      }, { authenticated });

      await installApiMocks(page);

      let failFontChunk = true;
      const fontRequests = [];
      const fontResponses = [];
      page.on('response', (response) => {
        if (response.url().includes('/assets/reading-fonts')) {
          fontResponses.push(response.status());
        }
      });
      await page.route('**/assets/reading-fonts*', async (route) => {
        const requestUrl = route.request().url();
        if (failFontChunk) {
          fontRequests.push({ url: requestUrl, action: 'abort' });
          return route.abort('failed');
        }
        fontRequests.push({ url: requestUrl, action: 'continue' });
        return route.continue();
      });

      try {
        await page.goto(`${base}${routePath}`);
        const prose = page.getByRole('article', { name: 'Nội dung chương', includeHidden: true });
        await expect(prose).toBeVisible();
        await expect.poll(() => fontRequests.filter((r) => r.action === 'abort').length).toBeGreaterThanOrEqual(1);
        // Allow microtasks from failed dynamic preload to settle before checking unhandled rejections.
        await page.waitForTimeout(100);

        const rejectionsAfterFailure = await page.evaluate(() => window.__unhandledRejections);
        assert.deepEqual(pageErrors, [], `${routePath}: expected no pageerror when reading-fonts chunk fails, got: ${pageErrors.join('; ')}`);
        assert.deepEqual(rejectionsAfterFailure, [], `${routePath}: expected no unhandledrejection when reading-fonts chunk fails, got: ${rejectionsAfterFailure.join('; ')}`);

        // Navigate away and back within the SPA; remount must also stay free of unhandled rejections.
        failFontChunk = false;
        const prefix = authenticated ? '/reader' : '/public';
        await page.getByRole('link', { name: 'Về trang truyện', exact: true }).click();
        await expect(page).toHaveURL(`${base}${prefix}/novels/novel-1`);
        await page.getByTestId('read-chapter-c-1').click();
        await expect(page).toHaveURL(`${base}${routePath}`);
        await expect(prose).toBeVisible();
        await page.waitForTimeout(100);

        assert.deepEqual(pageErrors, []);
        assert.deepEqual(await page.evaluate(() => window.__unhandledRejections), []);

        // Reload once network recovers and confirm the reading-fonts chunk loads cleanly with HTTP 200.
        await page.reload();
        await expect(prose).toBeVisible();
        await expect.poll(() => fontResponses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(1);
        assert.deepEqual(pageErrors, []);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
});
