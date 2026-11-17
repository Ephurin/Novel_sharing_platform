// Verifies WCAG AA (>= 4.5:1) contrast ratios for all StoryCraft mobile light, dark, and reader paper tokens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/theme/colors.ts', import.meta.url), 'utf8');

function extractPalette(name) {
  const start = source.indexOf(`export const ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('};', open);
  const block = source.slice(open + 1, close);
  const palette = {};
  for (const match of block.matchAll(/(\w+)\s*:\s*'(#[0-9A-Fa-f]{6})'/g)) {
    palette[match[1]] = match[2];
  }
  return palette;
}

function rgb(hex) {
  assert.ok(hex && hex.startsWith('#') && hex.length === 7, `invalid hex ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(hexA, hexB) {
  const [hi, lo] = [luminance(rgb(hexA)), luminance(rgb(hexB))].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [mode, paletteName] of [
  ['light', 'lightColors'],
  ['dark', 'darkColors']
]) {
  const p = extractPalette(paletteName);
  const pairs = [
    ['body text on background', p.text, p.background],
    ['body text on surface', p.text, p.surface],
    ['muted text on background', p.textMuted, p.background],
    ['muted text on surface', p.textMuted, p.surface],
    ['muted placeholder on surfaceMuted', p.textMuted, p.surfaceMuted],
    ['muted text on neutral chip', p.textMuted, p.neutralBg],
    ['primary button label on primary fill', p.onPrimary, p.primary],
    ['primary button label on primary hover', p.onPrimary, p.primaryHover],
    ['primary accent text on surface', p.primaryMuted, p.surface],
    ['primary accent text on primarySoft', p.primaryMuted, p.primarySoft],
    ['success badge text on successBg', p.success, p.successBg],
    ['warning badge text on warningBg', p.warning, p.warningBg],
    ['danger badge text on dangerBg', p.danger, p.dangerBg],
    ['danger error text on surface', p.danger, p.surface],
    ['reader LIGHT ink on page', p.lightText, p.lightBackground],
    ['reader SEPIA ink on page', p.sepiaText, p.sepiaBackground],
    ['reader DARK ink on page', p.darkText, p.darkBackground]
  ];

  for (const [label, fg, bg] of pairs) {
    test(`mobile ${mode}: ${label} reaches 4.5:1`, () => {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${mode} ${label} is ${ratio.toFixed(2)}:1 (${fg} on ${bg})`);
    });
  }
}
