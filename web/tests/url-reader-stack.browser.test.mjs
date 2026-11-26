
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.STORYCRAFT_URL_TEST_ORIGIN;
assert.ok(base, 'Set STORYCRAFT_URL_TEST_ORIGIN to a running StoryCraft stack.');
const legacy = process.env.STORYCRAFT_EXPECT_LEGACY_HREF === '1';
const loginHref = legacy ? '/login' : '/dang-nhap';

async function recordNavigation(page) {
  await page.addInitScript(() => {
    window.storycraftTestNavigation = [];
    for (const operation of ['replaceState', 'pushState']) {
      const original = history[operation];
      history[operation] = function (state, title, url) {
        if (url) window.storycraftTestNavigation.push(new URL(url, location.origin).pathname);
        return original.call(this, state, title, url);
      };
    }
  });
}

async function mockLogin(page, role, onLogin = () => {}) {
  await page.route('**/api/v1/auth/login', route => {
    onLogin();
    return route.fulfill({ json: { success: true, data: {
      accessToken: 'url-smoke-fixture',
      user: { userId: 'url-smoke-user', role, status: 'ACTIVE', username: 'url-smoke' }
    } } });
  });
}

async function submitLogin(page) {
  await page.locator('input[autocomplete="username"]').fill('url-smoke');
  await page.locator('input[autocomplete="current-password"]').fill('FixturePassword123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}
const novelId = '451e1280-214c-4500-980b-34b9af0989eb';
const novelSlug = 'sample-thanh-van-test-story';

test('the deployed SPA opens old and canonical content links with the real API', {
  timeout: 120_000
}, async () => {
  const health = await fetch(base + '/api/v1/health');
  assert.equal(health.status, 200);
  const reading = await fetch(base + '/api/v1/reading/novels/' + novelId);
  assert.equal(reading.status, 200);
  const { data: novel } = await reading.json();
  assert.equal(novel.novelSlug, novelSlug);
  const chapter = novel.chapters.find(item => !item.isVip);
  assert.ok(chapter?.chapterSlug);
  const detailsPath = '/truyen/' + novelSlug;
  const chapterPath = detailsPath + '/chuong/' + chapter.chapterSlug;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await recordNavigation(page);

    await page.goto(base + '/');
    await expect(page.getByTestId('home-hero-explore')).toHaveAttribute('href',
      legacy ? '/public' : '/danh-sach');
    await page.getByTestId('home-hero-explore').click();
    await expect(page).toHaveURL(base + '/danh-sach');

    await page.goto(base + '/reader/novels/' + novelId + '?source=legacy#reader-comments');
    await expect(page).toHaveURL(base + detailsPath + '?source=legacy#reader-comments');
    await expect(page.getByRole('heading', { name: novel.title, exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', base + detailsPath);

    await page.goto(base + '/public/chapters/' + chapter.chapterId);
    await expect(page).toHaveURL(base + chapterPath);
    await expect(page.locator('.chapter-prose')).toBeVisible();
    await page.reload();
    await expect(page.locator('.chapter-prose')).toBeVisible();

    await page.goto(base + '/public/novels/' + novelId + '/reviews');
    await expect(page).toHaveURL(base + detailsPath + '/danh-gia');
    await expect(page.getByRole('heading', { name: 'Đánh giá truyện ' + novel.title })).toBeVisible();

    await page.goto(base + '/verify-email#token=' + 'a'.repeat(43));
    await expect(page).toHaveURL(base + '/xac-thuc-email#token=' + 'a'.repeat(43));
    await expect(page.getByRole('button', { name: 'Xác nhận tài khoản', exact: true })).toBeVisible();

    await page.goto(base + '/admin/users');
    await expect(page).toHaveURL(base + '/dang-nhap');
    const loginPaths = await page.evaluate(() => window.storycraftTestNavigation);
    assert.equal(loginPaths.find(path => path === '/login' || path === '/dang-nhap'), loginHref);
    assert.deepEqual(errors, []);

    for (const [role, oldHome, canonicalHome] of [
      ['AUTHOR', '/author', '/sang-tac'],
      ['MODERATOR', '/moderator/reviews', '/kiem-duyet/hang-doi'],
      ['ADMIN', '/admin', '/quan-tri'],
      ['READER', '/', '/']
    ]) {
      const signIn = await browser.newPage();
      await recordNavigation(signIn);
      await mockLogin(signIn, role);
      await signIn.goto(base + '/dang-nhap');
      await submitLogin(signIn);
      await expect(signIn).toHaveURL(base + canonicalHome);
      const destinations = await signIn.evaluate(() => window.storycraftTestNavigation);
      assert.equal(destinations.find(path => path === oldHome || path === canonicalHome),
        legacy ? oldHome : canonicalHome, `${role} role home respects the emission flag`);
      await signIn.close();
    }

    const chapterResponse = await fetch(base + '/api/v1/reading/chapters/' + chapter.chapterId);
    assert.equal(chapterResponse.status, 200);
    const unlocked = await chapterResponse.json();
    const vip = await browser.newPage();
    let loggedIn = false;
    await mockLogin(vip, 'READER', () => { loggedIn = true; });
    await vip.route(`**/api/v1/reading/chapters/${chapter.chapterId}`, route => loggedIn ? route.fulfill({ json: unlocked }) : route.fulfill({
      status: 402,
      json: { success: false, error: { code: 'PAYMENT_002', message: 'Locked fixture', details: { novelId, priceCoins: 5 } } }
    }));
    const suffix = '?source=vip#reader-comments';
    await vip.goto(base + chapterPath + suffix);
    const unlockLogin = vip.getByRole('link', { name: 'Đăng nhập để mở khóa' });
    await expect(unlockLogin).toHaveAttribute('href', loginHref);
    await unlockLogin.click();
    await expect(vip).toHaveURL(base + '/dang-nhap');
    await submitLogin(vip);
    await expect(vip).toHaveURL(base + chapterPath + suffix);
    await expect(vip.locator('.chapter-prose')).toBeVisible();
    await vip.close();
  } finally {
    await browser.close();
  }
});
