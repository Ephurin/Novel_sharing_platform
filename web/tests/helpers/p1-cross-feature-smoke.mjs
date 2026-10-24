import assert from 'node:assert/strict';
import { until } from './p1-real-stack.mjs';

export async function crossFeatureSmoke(h, f, x) {
  const { page } = h, results = [];
  let reader, admin, novel, free, vip;
  async function visit(path, heading, evidence) {
    await page.goto(h.origin + path);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await h.shot(evidence);
    results.push({ path, status: 'PASS', scope: 'real mounted page/API read smoke' });
  }
  await h.step('G4 fixture only: local published reader rows, separate private Mongo drafts; no publish endpoint', async () => {
    reader = await h.account('READER'); admin = await h.account('ADMIN');
    novel = (await h.api('POST', '/novels', { title: 'Offline reader fixture ' + reader.userId.slice(0, 8), synopsis: 'Disposable local-only reader fixture' }, x.a.token)).data.novelId;
    free = (await h.api('POST', `/novels/${novel}/chapters`, { title: 'Free fixture', content: 'PRIVATE_FREE_AUTHOR_DRAFT' }, x.a.token)).data.chapterId;
    vip = (await h.api('POST', `/novels/${novel}/chapters`, { title: 'VIP fixture', content: 'PRIVATE_VIP_AUTHOR_DRAFT', isVip: true, priceCoins: 10 }, x.a.token)).data.chapterId;
    // Test data preparation only. No publication API, scheduler or external service is invoked.
    await h.sql("UPDATE novels SET status='PUBLISHED' WHERE novel_id=$1", [novel]);
    await h.sql("UPDATE chapters SET status='PUBLISHED',content=$2,published_at=now() WHERE chapter_id=$1", [free, 'PUBLIC_FREE_READER_CONTENT']);
    await h.sql("UPDATE chapters SET status='PUBLISHED',content=$2,published_at=now() WHERE chapter_id=$1", [vip, 'LOCKED_VIP_READER_CONTENT']);
    x.owned.push(novel); await h.snapshot('G4-reader-fixtures', x.owned);
  });
  await h.step('G4: actual Reader/free content, VIP lock, private draft denial, library/history, wallet and notifications', async () => {
    await f.login(reader);
    await visit('/reader', 'Reader Home', 'g4-reader-home');
    await page.goto(h.origin + '/reader/chapters/' + free);
    await page.getByText('PUBLIC_FREE_READER_CONTENT', { exact: false }).waitFor();
    assert.ok(!(await page.textContent('body')).includes('PRIVATE_FREE_AUTHOR_DRAFT'));
    const locked = page.waitForResponse(r => r.url().endsWith('/api/v1/reading/chapters/' + vip));
    await page.goto(h.origin + '/reader/chapters/' + vip);
    assert.equal((await locked).status(), 402);
    await page.getByRole('heading', { name: 'VIP Chapter Locked', exact: true }).waitFor();
    assert.ok(!(await page.textContent('body')).includes('LOCKED_VIP_READER_CONTENT'));
    await h.shot('g4-vip-unpaid-locked');
    const before = await h.snapshot('G4-before-reader-private-denial', x.owned);
    await h.api('GET', '/chapters/' + x.first, undefined, reader.token, [403]);
    await h.api('GET', `/ai/story-brains/${x.novelA}/memory`, undefined, reader.token, [403]);
    assert.deepEqual(await h.snapshot('G4-after-reader-private-denial', x.owned), before);
    await visit('/reader/library', 'Library', 'g4-reader-library');
    await visit('/reader/history', 'Reading History', 'g4-reader-history');
    await visit('/wallet', 'Ví & Doanh Thu', 'g4-reader-wallet');
    await visit('/notifications', 'Thông báo', 'g4-reader-notifications');
    await h.api('GET', '/admin/users', undefined, reader.token, [403]);
    results.push({ case: 'VIP negative authorization / private draft and Canon isolation', status: 'PASS' });
  });
  await h.step('G4: Author comment/review screens and real media upload round trip', async () => {
    await f.login(x.a);
    await visit(`/author/novels/${x.novelA}/comments`, 'Bình luận độc giả', 'g4-author-comments');
    await visit(`/author/novels/${x.novelA}/reviews`, 'Đánh giá độc giả', 'g4-author-reviews');
    await page.goto(h.origin + `/author/novels/${x.novelA}`);
    await page.getByRole('button', { name: 'Đổi ảnh bìa', exact: true }).click();
    const uploaded = page.waitForResponse(r => r.url().endsWith('/api/v1/media') && r.request().method() === 'POST');
    await page.locator('input[type=file]').setInputFiles({ name: 'offline-pixel.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6WQAAAABJRU5ErkJggg==', 'base64') });
    const response = await uploaded; assert.equal(response.status(), 201);
    const path = (await response.json()).data.path; assert.match(path, /^\/api\/v1\/media\/[a-f0-9-]+\.png$/);
    const stored = page.waitForResponse(r => r.url().endsWith('/api/v1/novels/' + x.novelA) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click(); assert.equal((await stored).status(), 200);
    await until(async () => page.locator('img').evaluateAll(nodes => nodes.some(n => n.src.endsWith(path) && n.complete && n.naturalWidth === 1)), 'Uploaded image did not decode in production UI');
    await h.shot('g4-author-media-upload'); results.push({ case: 'real local media upload/metadata/read/decode', status: 'PASS' });
  });
  await h.step('G4: real Author scheduling form, dark theme/mobile and reload continuity; no schedule/publish', async () => {
    await page.goto(f.ide(x.novelA, x.first));
    await until(async () => await f.editor().inputValue() === x.latestDraft, 'Author draft/session continuity failed');
    await page.getByRole('button', { name: 'Lên lịch', exact: true }).click();
    await page.getByRole('dialog').getByText('Lên lịch xuất bản chương', { exact: true }).waitFor();
    await page.getByLabel('Ngày giờ đăng', { exact: true }).waitFor();
    await h.shot('g4-schedule-form-no-publish'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Tối', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-mantine-color-scheme'), 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await h.shot('g4-author-dark-mobile'); await page.reload();
    await until(async () => await f.editor().inputValue() === x.latestDraft, 'Mobile reload lost draft');
    assert.equal(await page.locator('html').getAttribute('data-mantine-color-scheme'), 'dark');
    await page.setViewportSize({ width: 1440, height: 900 });
    results.push({ case: 'scheduling form/read only, theme/mobile/auth/draft reload', status: 'PASS' });
  });
  await h.step('G4: actual Admin role access and moderation/novel management read smoke', async () => {
    await f.login(admin);
    await visit('/admin', 'Admin Console', 'g4-admin-console');
    await visit('/admin/novels', 'Admin Novel Management', 'g4-admin-novels');
    await visit('/admin/moderation', 'Moderation Queue', 'g4-admin-moderation');
    await h.snapshot('G4-final-local-smoke', x.owned);
  });
  await h.save('G4-smoke-matrix.json', { results, not_run: ['real payment/deposit/withdrawal', 'VIP purchase',
    'publication/scheduler execution', 'moderation resolution', 'live providers', 'P3 autonomous workflows'],
    scope: 'bounded read/UI smoke, local test fixtures and local media only; not complete acceptance of unrelated modules' });
}
