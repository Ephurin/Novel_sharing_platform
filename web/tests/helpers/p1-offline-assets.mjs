import assert from 'node:assert/strict';

export async function assertOfflineAssets(h) {
  const { page } = h;
  await page.getByLabel('Email or username', { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(h.browserErrors, [], 'The actual SPA must not throw when external CDNs are unavailable');
  const assets = await page.evaluate(async () => {
    const probe = document.createElement('div');
    probe.className = 'flex p-4'; probe.style.visibility = 'hidden'; document.body.append(probe);
    const style = getComputedStyle(probe), utility = { display: style.display, padding: style.padding };
    probe.remove();
    await document.fonts.load('400 16px "Be Vietnam Pro"');
    await document.fonts.load('400 18px "Material Symbols Outlined Variable"');
    return { utility, textFont: document.fonts.check('400 16px "Be Vietnam Pro"'),
      symbolFont: document.fonts.check('400 18px "Material Symbols Outlined Variable"') };
  });
  assert.equal(assets.utility.display, 'flex'); assert.equal(assets.utility.padding, '16px');
  assert.equal(assets.textFont, true); assert.equal(assets.symbolFont, true);
  assert.equal(h.blockedExternal.filter(r => /tailwind|fonts\.google/.test(r.host)).length, 0,
    'Production styling and icons must be locally bundled, not silently absent in offline evidence');
  await h.save('offline-asset-contract.json', assets);
}
