import { test } from 'node:test';
import { createHarness } from './helpers/p1-real-stack.mjs';
import { assertOfflineAssets, assertActualMaterialGlyph, assertMobileControls } from './helpers/p1-offline-assets.mjs';
import { fixtures } from './helpers/p1-fixtures.mjs';

test('Actual production SPA has offline styling/fonts and no CDN runtime exception', async () => {
  const h = await createHarness();
  try {
    await h.page.goto(h.origin + '/login'); await assertOfflineAssets(h);
    const f = fixtures(h), x = await f.seed();
    await f.login(x.a); await h.page.goto(f.ide(x.novelA, x.first));
    await assertActualMaterialGlyph(h);
    await h.page.setViewportSize({ width: 390, height: 844 });
    await h.page.getByTitle('Đóng/Mở thanh danh sách chương', { exact: true }).click();
    await assertMobileControls(h); await h.shot('actual-mobile-controls');
  }
  finally { await h.finish(); }
});
