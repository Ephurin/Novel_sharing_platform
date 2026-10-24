import assert from 'node:assert/strict';

export async function assertActualMaterialGlyph(h) {
  const icon = h.page.locator('.material-symbols-outlined').first();
  await icon.waitFor();
  const glyph = await icon.evaluate(async node => {
    const style = getComputedStyle(node), font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const faces = await document.fonts.load(font, node.textContent);
    return { family: style.fontFamily, loadedFaces: faces.length, width: node.getBoundingClientRect().width,
      fontSize: parseFloat(style.fontSize), text: node.textContent };
  });
  await h.save('actual-material-glyph.json', glyph);
  assert.ok(glyph.loadedFaces > 0, 'The author theme must use an actual bundled icon face, not text fallback');
  assert.ok(glyph.width <= glyph.fontSize * 1.5, 'Material ligature rendered as a word rather than an icon');
}

export async function assertMobileControls(h) {
  const layout = await h.page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('.sc-studio-toolbar button, .sc-studio-toolbar a, .sc-studio-settings button, .sc-format-toolbar button')]
      .map(node => { const r = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.title || node.textContent.trim(),
        x: r.x, right: r.right, width: r.width, height: r.height }; }).filter(r => r.width > 0 && r.height > 0);
    return { width, controls };
  });
  await h.save('mobile-control-geometry.json', layout);
  assert.ok(layout.controls.length > 10, 'The actual editor controls must be mounted');
  assert.deepEqual(layout.controls.filter(r => r.x < -1 || r.right > layout.width + 1), [], 'Visible mobile controls are clipped outside the viewport');
}

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
