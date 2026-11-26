
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.STORYCRAFT_URL_TEST_ORIGIN;
const novelId = '451e1280-214c-4500-980b-34b9af0989eb';
const novelSlug = 'sample-thanh-van-test-story';

test('the deployed SPA opens old and canonical content links with the real API', {
  skip: !base,
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

    await page.goto(base + '/');
    await expect(page.getByTestId('home-hero-explore')).toHaveAttribute('href',
      process.env.STORYCRAFT_EXPECT_LEGACY_HREF === '1' ? '/public' : '/danh-sach');
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
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
