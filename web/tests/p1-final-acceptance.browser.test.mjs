import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness, until } from './helpers/p1-real-stack.mjs';
import { fixtures } from './helpers/p1-fixtures.mjs';
import { entityAcceptance } from './helpers/p1-entity-acceptance.mjs';
import { canonAcceptance } from './helpers/p1-canon-acceptance.mjs';
import { crossFeatureSmoke } from './helpers/p1-cross-feature-smoke.mjs';
import { assertOfflineAssets } from './helpers/p1-offline-assets.mjs';

test('Real production Author IDE: mandatory S09–S11 and cross-feature acceptance', { timeout: 900000 }, async () => {
  const h = await createHarness(), f = fixtures(h), { page } = h;
  const matrix = { G0: 'NOT_RUN', G1: 'NOT_RUN', G2: 'NOT_RUN', G3: 'NOT_RUN', G4: 'NOT_RUN', G5: 'NOT_RUN' };
  let x;
  try {
    await h.step('G4 prerequisite: actual locally built styles/fonts, no CDN substitution', async () => {
      await page.goto(h.origin + '/login'); await assertOfflineAssets(h);
    });
    await h.step('FIXTURE only: owned accounts/projects and empty baseline; no pre-approved named Canon', async () => {
      x = await f.seed(); await h.snapshot('fixture-empty-approved-canon', x.owned);
    });
    await h.step('G1: draft 401/403/404 and required-version 428 do not mutate scoped durable state', async () => {
      const before = await h.snapshot('G1-before-draft-negatives', x.owned);
      await h.api('GET', '/chapters/' + x.first, undefined, undefined, [401]);
      await h.api('GET', '/chapters/' + x.first, undefined, x.b.token, [403]);
      await h.api('GET', '/chapters/' + randomUUID(), undefined, x.a.token, [404]);
      await h.api('PATCH', '/chapters/' + x.first, { content: 'Must never save without expectedVersion' }, x.a.token, [428]);
      assert.deepEqual(await h.snapshot('G1-after-draft-negatives', x.owned), before);
    });
    await h.step('G2: real login, production SPA, B→A→B Undo before debounce', async () => {
      await f.login(x.a); await page.goto(f.ide(x.novelA, x.first));
      await until(async () => await f.editor().inputValue() === 'bản thảo ban đầu.', 'Initial draft did not finish loading');
      const before = await f.chapterState(x.first), start = h.requests.length;
      await f.editor().focus(); await f.editor().press('ControlOrMeta+A'); await f.editor().press('A'); await f.editor().press('ControlOrMeta+Z');
      assert.equal(await f.editor().inputValue(), before.draft.content);
      await page.waitForTimeout(1500);
      assert.equal(h.requests.slice(start).filter(r => r.method === 'PATCH' && r.path.endsWith('/chapters/' + x.first)).length, 0);
      assert.deepEqual(await f.chapterState(x.first), before);
      await h.snapshot('G2-rapid-undo-no-write', x.owned); await h.shot('s09-rapid-undo');
    });
    await h.step('G2: in-flight A→B serial saves, real revisions/outbox/Mongo', async () => {
      const before = await f.chapterState(x.first);
      let release, arrived, intercepted = false;
      const held = new Promise(resolve => release = resolve), committed = new Promise(resolve => arrived = resolve);
      await page.route(`**/api/v1/chapters/${x.first}`, async route => {
        if (route.request().method() !== 'PATCH' || intercepted) return route.continue();
        intercepted = true;
        const response = await route.fetch(); // Delay a genuine server response; never fabricate an API result.
        assert.equal(response.status(), 200); arrived(); await held; await route.fulfill({ response });
      });
      try {
        await f.editor().fill('bản nháp nối tiếp a.'); await committed;
        const mid = await f.changed(x.first, 'bản nháp nối tiếp a.', before);
        await f.editor().fill('bản nháp nối tiếp b.'); await page.waitForTimeout(1500);
        assert.equal((await f.chapterState(x.first)).draft.content, 'bản nháp nối tiếp a.');
        const response = f.patchResponse(x.first); release(); assert.equal((await response).status(), 200);
        await f.changed(x.first, 'bản nháp nối tiếp b.', mid);
      } finally { release(); await page.unroute(`**/api/v1/chapters/${x.first}`); }
      await h.snapshot('G2-ordered-two-commits', x.owned);
    });
    await h.step('G2: real stale 409 displayed in UI and server-version recovery', async () => {
      const before = await f.chapterState(x.first);
      await h.api('PATCH', `/chapters/${x.first}`, { content: 'bản máy chủ từ phiên thứ hai.', expectedVersion: before.draft.version, autosave: true }, x.a.token);
      const server = await f.changed(x.first, 'bản máy chủ từ phiên thứ hai.', before);
      const stale = f.patchResponse(x.first);
      await f.editor().fill('bản đang viết cần giữ lại.'); assert.equal((await stale).status(), 409);
      await page.getByText('Có thay đổi từ phiên khác.', { exact: false }).waitFor();
      assert.equal(await f.editor().inputValue(), 'bản đang viết cần giữ lại.'); assert.deepEqual(await f.chapterState(x.first), server);
      await h.snapshot('G2-409-server-and-local-buffer', x.owned); await h.shot('s09-409-recovery');
      await page.getByRole('button', { name: 'Tải bản máy chủ', exact: true }).click();
      await until(async () => await f.editor().inputValue() === 'bản máy chủ từ phiên thứ hai.', 'Server draft did not reload after conflict recovery');
      const saved = f.patchResponse(x.first); await f.editor().fill('bản được lưu sau phục hồi.'); assert.equal((await saved).status(), 200);
      await f.changed(x.first, 'bản được lưu sau phục hồi.', server);
    });
    await h.step('G2: switch chapter while dirty, flush only the old chapter', async () => {
      const before = await f.chapterState(x.first), other = await f.chapterState(x.second);
      await f.editor().fill('bản cần lưu khi đổi chương.');
      await page.getByRole('button', { name: /Chapter Beta/ }).click();
      await page.getByRole('button', { name: 'Lưu và rời trang', exact: true }).click();
      await page.waitForURL(new RegExp('chapterId=' + x.second));
      await until(async () => await f.editor().inputValue() === 'chương thứ hai.', 'Wrong chapter after navigation');
      await f.changed(x.first, 'bản cần lưu khi đổi chương.', before); assert.deepEqual(await f.chapterState(x.second), other);
      await h.snapshot('G2-pending-chapter-navigation', x.owned);
    });
    await h.step('G2: novel navigation before debounce cannot write the next context', async () => {
      const before = await f.chapterState(x.second);
      await f.editor().fill('nội dung chưa lưu thuộc chương beta.'); f.leave(); await page.goto(f.ide(x.novelOther));
      await until(async () => await f.editor().inputValue() === 'bản thảo tác phẩm khác.', 'Novel switch copied old draft');
      await page.waitForTimeout(1500); assert.deepEqual(await f.chapterState(x.second), before);
      await h.snapshot('G2-pending-novel-navigation', x.owned);
    });
    await h.step('G2: pending account switch cannot restore the previous owner context', async () => {
      await page.goto(f.ide(x.novelA, x.first));
      await until(async () => await f.editor().inputValue() === 'bản cần lưu khi đổi chương.', 'Owned chapter did not finish reloading');
      const before = await f.chapterState(x.first);
      await f.editor().fill('riêng tư chưa gửi của tác giả a.'); f.leave(); await f.login(x.b);
      await page.goto(h.origin + '/author/ide');
      await until(async () => await f.editor().inputValue() === 'bản thảo tác giả khác.', 'Account B restored account A context');
      assert.ok(!(await page.textContent('body')).includes('P1 primary manuscript'));
      await page.waitForTimeout(1500); assert.deepEqual(await f.chapterState(x.first), before);
      assert.equal((await f.chapterState(x.foreign)).draft.content, 'bản thảo tác giả khác.');
      await h.snapshot('G2-account-isolation', x.owned); await h.shot('s09-account-isolation');
    });
    matrix.G2 = 'PASS';
    x.entities = await entityAcceptance(h, f, x);
    x.canon = await canonAcceptance(h, f, x);
    matrix.G3 = 'PASS';
    await crossFeatureSmoke(h, f, x);
    assert.deepEqual(h.browserErrors, [], 'Unexpected runtime exceptions invalidate mounted acceptance');
    matrix.G4 = 'PASS';
    // Development guard: incomplete browser work must never report overall acceptance.
    assert.equal(matrix.G3, 'PASS', 'S10/S11 UI stages have not executed yet');
    assert.equal(matrix.G4, 'PASS', 'Cross-feature smoke has not executed yet');
  } finally { await h.save('integration-gates.json', matrix); await h.finish(); }
});
