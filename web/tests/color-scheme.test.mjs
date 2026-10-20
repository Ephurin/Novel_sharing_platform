import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
function browser({ stored, legacy, dark = false, blocked = false } = {}) {
  const values = new Map();
  if (stored !== undefined) values.set('storycraft-theme', stored);
  if (legacy !== undefined) values.set('mantine-color-scheme-value', legacy);
  const listeners = {};
  const media = { matches: dark, addEventListener: (_event, handler) => { listeners.media = handler; } };
  const root = { dataset: {}, style: {}, classList: { toggle: (_name, value) => { root.dark = value; } } };
  const localStorage = {
    getItem: key => { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error('blocked'); values.set(key, value); }
  };
  const window = { matchMedia: () => media, addEventListener: (event, handler) => { listeners[event] = handler; } };
  vm.runInNewContext(bootstrap, { window, localStorage, document: { documentElement: root } });
  return { theme: window.storycraftTheme, root, values, media, listeners };
}

test('initial theme is applied before app rendering, with system and legacy preferences', () => {
  assert.equal(browser({ dark: true }).root.dataset.theme, 'dark');
  assert.equal(browser({ dark: false }).root.dataset.theme, 'light');
  assert.equal(browser({ legacy: 'dark' }).root.dataset.theme, 'dark');
  assert.equal(browser({ stored: 'light', legacy: 'dark', dark: true }).root.dataset.theme, 'light');
  assert.equal(browser({ stored: 'invalid', dark: true }).root.dataset.theme, 'dark');
});

test('manual preference persists and overrides OS, system responds to OS changes', () => {
  const b = browser({ dark: true });
  b.theme.write('light');
  b.listeners.media();
  assert.equal(b.root.dataset.theme, 'light');
  assert.equal(b.values.get('storycraft-theme'), 'light');
  assert.equal(browser({ stored: b.values.get('storycraft-theme'), dark: true }).root.dataset.theme, 'light');
  b.theme.write('auto');
  assert.equal(b.root.dataset.theme, 'dark');
  b.media.matches = false; b.listeners.media();
  assert.equal(b.root.dataset.theme, 'light');
  assert.equal(b.root.style.colorScheme, 'light');
  assert.equal(b.root.dark, false);
});

test('blocked storage still renders and allows an in-memory preference', () => {
  const b = browser({ blocked: true, dark: true });
  assert.equal(b.root.dataset.theme, 'dark');
  assert.doesNotThrow(() => b.theme.write('light'));
  assert.equal(b.root.dataset.theme, 'light');
});

test('cross-tab preference and deletion are synchronized', () => {
  const b = browser(); b.theme.write('light');
  b.values.set('storycraft-theme', 'dark'); b.listeners.storage({ key: 'storycraft-theme' });
  assert.equal(b.root.dataset.theme, 'dark');
  b.values.clear(); b.listeners.storage({ key: null });
  assert.equal(b.theme.read(), 'auto');
});

const css = readFileSync(new URL('../src/theme/storycraft.css', import.meta.url), 'utf8');
function palette(selector) {
  const block = css.slice(css.indexOf(selector));
  return Object.fromEntries([...block.slice(0, block.indexOf('}')).matchAll(/--(sc-[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
function color(value) {
  if (value.startsWith('#')) { const hex = value.slice(1); const full = hex.length === 3 ? [...hex].map(x => x + x).join('') : hex; return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)); }
  return value.split(' ').map(Number);
}
function luminance(rgb) { const c = rgb.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
function ratio(a, b) { const x = luminance(color(a)), y = luminance(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
for (const selector of [':root {', ':root[data-theme="dark"] {']) {
  test(selector + ' semantic text and controls meet contrast targets', () => {
    const p = { ...palette(':root {'), ...palette(selector) };
    const pairs = [['text-rgb','bg-rgb'], ['text-rgb','surface-rgb'], ['muted-rgb','surface-rgb'], ['primary-text-rgb','primary-soft-rgb'], ['on-primary-rgb','primary-rgb'], ['on-primary-rgb','primary-hover-rgb'], ['success','success-bg'], ['warning','warning-bg'], ['danger','danger-bg']];
    for (const [a, b] of pairs) assert.ok(ratio(p['sc-' + a], p['sc-' + b]) >= 4.5, a + '/' + b + ': ' + ratio(p['sc-' + a], p['sc-' + b]));
    assert.ok(ratio(p['sc-control-border'], p['sc-surface-rgb']) >= 3);
  });
}
