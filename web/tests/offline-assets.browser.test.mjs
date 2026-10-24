import { test } from 'node:test';
import { createHarness } from './helpers/p1-real-stack.mjs';
import { assertOfflineAssets } from './helpers/p1-offline-assets.mjs';

test('Actual production SPA has offline styling/fonts and no CDN runtime exception', async () => {
  const h = await createHarness();
  try { await h.page.goto(h.origin + '/login'); await assertOfflineAssets(h); }
  finally { await h.finish(); }
});
