import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('moderators can inspect a submitted GIF before approving its comment', { timeout: 60000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => {
        localStorage.setItem('ephurin_access_token', 'fixture-token');
        localStorage.setItem('storycraft-theme', theme);
      }, theme);
      let decision;
      const review = { reviewId: 'review-1', targetType: 'COMMENT', targetId: 'comment-1', source: 'KEYWORD_FILTER', status: 'PENDING',
        target: { title: 'Bình luận kèm GIF', content: '', gifId: 'fixtureGif', isSubmittedVersion: true },
        evidenceSummary: { matchedRules: [], reportCount: 0, summary: 'GIF attachment requires administrator review.' } };
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path.endsWith('/auth/me')) data = { userId: 'admin-1', username: 'moderator', role: 'ADMIN', status: 'ACTIVE' };
        else if (path.endsWith('/admin/access')) data = { scope: 'MODERATOR', permissions: ['content', 'audit'] };
        else if (path.endsWith('/media/giphy-config')) data = { apiKey: 'fixture-public-key' };
        else if (path.endsWith('/resolve')) { decision = route.request().postDataJSON().decision; review.status = decision; data = { status: decision }; }
        else if (path.endsWith('/admin/moderation/reviews/review-1')) data = review;
        await route.fulfill({ json: { success: true, data } });
      });
      await page.route('https://api.giphy.com/**', route => route.fulfill({ json: { data: { id: 'fixtureGif', title: 'GIF cần duyệt',
        images: { original: { url: 'https://media.giphy.com/media/fixtureGif/giphy.gif' } } } } }));
      await page.route('https://media.giphy.com/**', route => route.fulfill({ contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') }));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/admin/moderation/review-1`);
      await expect(page.getByRole('img', { name: 'GIF cần duyệt', exact: true })).toBeVisible();
      assert.equal(decision, undefined);
      const approve = page.getByTestId('admin-approve-review-btn');
      await approve.click();
      await page.getByRole('button', { name: 'Xác nhận xử lý', exact: true }).click();
      await expect(approve).toBeDisabled();
      assert.equal(decision, 'APPROVED');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
