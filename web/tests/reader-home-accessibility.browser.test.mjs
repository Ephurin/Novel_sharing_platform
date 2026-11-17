import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

test('home maintains contrast, focus, reduced motion and reflow at narrow widths and 200% zoom', { timeout: 90000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width === 320 });
      const page = await context.newPage();
      await page.addInitScript(theme => localStorage.setItem('storycraft-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        const data = url.pathname.endsWith('/reading/filters') ? { genres: ['Fantasy', 'Đời thường', 'Trinh thám', 'Lãng mạn', 'Kỳ ảo'], tags: [] } : url.pathname.endsWith('/reading/search') ? Array.from({ length: 8 }, (_, i) => ({ novelId: `n-${i}`, authorId: 'writer', title: `Truyện với nhan đề dài và từkhóacầntựxuốngdòng${i}`, chaptersCount: 4, viewsCount: 100, serialStatus: 'ONGOING' })) : [];
        await route.fulfill({ json: { success: true, data } });
      });
      try {
        await page.goto(base);
        await expect(page.locator('.sc-home-feature-cover')).toHaveCount(4);
        await expect(page.locator('.sc-home-feature-grid')).toHaveCSS('opacity', '1');
        const featuredCover = page.locator('.sc-home-feature-cover').first();
        const featuredTitle = featuredCover.locator('h2');
        const normalColor = await featuredTitle.evaluate(title => getComputedStyle(title).color);
        const accentColor = await page.locator('.sc-home-more').first().evaluate(link => getComputedStyle(link).color);
        await featuredCover.hover();
        await expect(featuredTitle).toHaveCSS('color', accentColor);
        await expect(featuredTitle).toHaveCSS('text-decoration-line', 'none');
        await expect(featuredCover).toHaveCSS('text-decoration-line', 'none');
        assert.notEqual(normalColor, accentColor);
        await page.mouse.move(0, 0);
        const pairs = await page.evaluate(() => {
          const rgba = value => { const values = value.match(/[\d.]+/g).map(Number); return [...values.slice(0, 3), values[3] ?? 1]; };
          const background = element => {
            const layers = [];
            for (let node = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor));
            return layers.reduce((bg, top) => top.slice(0, 3).map((channel, i) => channel * top[3] + bg[i] * (1 - top[3])), [255, 255, 255]);
          };
          const luminance = rgb => rgb.map(channel => channel / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
          const ratio = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };
          return ['.sc-home-footer', '.sc-home-ranking li a > span', '.sc-home-results-summary', '.sc-home-feature-caption h2', '.sc-home-feature-caption > span'].map(selector => {
            const element = document.querySelector(selector);
            return { selector, ratio: ratio(rgba(getComputedStyle(element).color).slice(0, 3), background(element)) };
          });
        });
        for (const pair of pairs) assert.ok(pair.ratio >= 4.5, `${theme} ${pair.selector}: ${pair.ratio}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.getByRole('button', { name: 'Truyện nổi bật tiếp theo', exact: true }).click();
        await expect(page.locator('.sc-home-feature-grid')).toHaveCSS('transform', 'none');
        await page.locator('.sc-home-preview-trigger').first().focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCSS('opacity', '1');
        await expect(dialog.getByRole('button', { name: 'Đóng xem nhanh', exact: true })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.sc-home-preview-trigger').first()).toBeFocused();
        if (width === 1440) {
          await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
          await expect(page.getByRole('heading', { name: 'Góc đọc truyện', exact: true })).toBeVisible();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});

test('home and catalog cards disable hover transforms under reduced motion while retaining them otherwise', { timeout: 90000 }, async () => {
  const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const cover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#775f55"/></svg>');
  const novels = Array.from({ length: 6 }, (_, i) => ({
    novelId: `n-${i}`, authorId: 'writer', title: `Truyện thử nghiệm ${i + 1}`,
    coverImageUrl: cover, chaptersCount: 4, viewsCount: 100 - i, serialStatus: 'ONGOING'
  }));
  try {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('storycraft-theme', 'light'));
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        const data = url.pathname.endsWith('/reading/filters')
          ? { genres: ['Fantasy'], tags: [] }
          : url.pathname.endsWith('/reading/search')
            ? novels
            : [];
        await route.fulfill({ json: { success: true, data, meta: { totalPages: 1, totalItems: Array.isArray(data) ? data.length : 1 } } });
      });
      try {
        await page.goto(base);
        const featuredCover = page.locator('.sc-home-feature-cover').first();
        const featuredImg = featuredCover.locator('img');
        const rankingRow = page.locator('.sc-home-ranking li').first();
        await expect(featuredCover).toBeVisible();
        await expect(featuredImg).toBeVisible();
        await expect(rankingRow).toBeVisible();
        const accentColor = await page.locator('.sc-home-more').first().evaluate(el => getComputedStyle(el).color);

        await featuredCover.hover();
        await expect(featuredCover.locator('h2')).toHaveCSS('color', accentColor);
        if (reducedMotion === 'reduce') {
          await expect(featuredCover).toHaveCSS('transform', 'none');
          await expect(featuredImg).toHaveCSS('transform', 'none');
        } else {
          await expect(featuredCover).not.toHaveCSS('transform', 'none');
          await expect(featuredImg).not.toHaveCSS('transform', 'none');
        }

        await rankingRow.hover();
        if (reducedMotion === 'reduce') await expect(rankingRow).toHaveCSS('transform', 'none');
        else await expect(rankingRow).not.toHaveCSS('transform', 'none');

        await page.goto(`${base}/public`);
        const catalogCard = page.locator('.sc-catalog-card').first();
        await expect(catalogCard).toBeVisible();
        await catalogCard.hover();
        if (reducedMotion === 'reduce') await expect(catalogCard).toHaveCSS('transform', 'none');
        else await expect(catalogCard).not.toHaveCSS('transform', 'none');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
