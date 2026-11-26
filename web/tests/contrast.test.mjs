// Guards WCAG AA contrast (4.5:1 for normal text) for the StoryCraft color tokens that carry labels.
// Tokens come from theme/storycraft.css, overridden by theme/refinements.css in load order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = ['../src/theme/storycraft.css', '../src/theme/refinements.css'].map((path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
);

function readBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = source.slice(start, source.indexOf('}', start));
  const tokens = {};
  for (const match of body.matchAll(/(--(?:sc|reader)-[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

function tokensFor(theme) {
  const merged = {};
  for (const source of css) Object.assign(merged, readBlock(source, ':root'));
  if (theme === 'dark') for (const source of css) Object.assign(merged, readBlock(source, ':root[data-theme="dark"]'));
  return merged;
}

function rgb(tokens, name) {
  const value = tokens[name];
  assert.ok(value, `missing token ${name}`);
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  }
  const parts = value.split(/\s+/).map(Number);
  assert.equal(parts.length, 3, `${name} is not an "r g b" triple: ${value}`);
  return parts;
}

function luminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const blend = (top, bottom, alpha) => top.map((value, index) => Math.round(value * alpha + bottom[index] * (1 - alpha)));

const readerCss = readFileSync(new URL('../src/features/reader/chapter-reading-workspace.css', import.meta.url), 'utf8');
for (const [background, selector] of [
  ['default', '.sc-reader-workspace'],
  ...['LIGHT', 'SEPIA', 'MINT', 'BLUE', 'ROSE', 'DARK', 'BLACK'].map((bg) => [bg, `[data-reader-background="${bg}"]`])
]) {
  const tokens = readBlock(readerCss, selector);
  for (const foreground of ['--reader-ink', '--reader-muted', '--reader-accent', '--reader-danger']) {
    test(`reader ${background}: ${foreground} reaches 4.5:1`, () => {
      const ratio = contrast(rgb(tokens, foreground), rgb(tokens, '--reader-page'));
      assert.ok(ratio >= 4.5, `${background} ${foreground} is ${ratio.toFixed(2)}:1`);
    });
  }
}

for (const theme of ['light', 'dark']) {
  const tokens = tokensFor(theme);
  const color = (name) => rgb(tokens, name);
  const surface = color('--sc-surface-rgb');
  const pairs = [
    ['filled button label', color('--sc-on-primary-rgb'), color('--sc-primary-rgb')],
    ['filled button label (hover)', color('--sc-on-primary-rgb'), color('--sc-primary-hover-rgb')],
    ['orange text on surface', color('--sc-primary-text-rgb'), surface],
    ['soft button / active nav label', color('--sc-primary-text-rgb'), color('--sc-primary-soft-rgb')],
    ['soft button label (hover)', color('--sc-primary-text-strong-rgb'), blend(color('--sc-primary-rgb'), color('--sc-primary-soft-rgb'), 0.16)],
    ['body text on surface', color('--sc-text-rgb'), surface],
    ['body text on page background', color('--sc-text-rgb'), color('--sc-bg-rgb')],
    ['danger label on surface', color('--sc-danger'), surface],
    ['success label on surface', color('--sc-success'), surface],
    ['warning label on surface', color('--sc-warning'), surface],
    ['success badge label', color('--sc-success'), color('--sc-success-bg')],
    ['warning badge label', color('--sc-warning'), color('--sc-warning-bg')],
    ['danger badge label', color('--sc-danger'), color('--sc-danger-bg')],
    ['neutral filled badge label', color('--sc-text-rgb'), color('--sc-neutral-bg')],
    ['neutral light badge label', theme === 'dark' ? color('--sc-muted-rgb') : [99, 94, 90], color('--sc-neutral-bg')],
    ['library unfollow label', color('--sc-danger'), color('--sc-danger-bg')],
    ['library unfollow label (hover)', surface, color('--sc-danger')],
    ['support button label', color('--sc-warning'), color('--sc-warning-bg')],
    ['filled success status button label', theme === 'dark' ? color('--sc-on-primary-rgb') : [255, 255, 255], color('--sc-success')],
    ['filled warning status button label', theme === 'dark' ? color('--sc-on-primary-rgb') : [255, 255, 255], color('--sc-warning')],
    ['filled danger status button label', theme === 'dark' ? color('--sc-on-primary-rgb') : [255, 255, 255], color('--sc-danger')]
  ];

  for (const [label, foreground, background] of pairs) {
    test(`${theme}: ${label} reaches 4.5:1`, () => {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${label} is ${ratio.toFixed(2)}:1 (${foreground} on ${background})`);
    });
  }
}

// Community board (features/discussions/discussions.css). The board keeps its own
// `--forum-*` palette scoped to `.sc-discussions-shell`, so the ink/wash pairs are
// checked the same way as the global tokens: every category ink against the page
// wash, the 10% category wash it labels, and the two section cards.
const forumCss = readFileSync(new URL('../src/features/discussions/discussions.css', import.meta.url), 'utf8');

// Anchored at the start of a line so `.sc-discussions-shell` does not also match
// the dark rule, whose selector ends with the same substring.
function forumTokens(selector) {
  const merged = {};
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'gm');
  for (const block of forumCss.matchAll(rule)) {
    for (const match of block[1].matchAll(/(--forum-[\w-]+)\s*:\s*([^;]+);/g)) merged[match[1]] = match[2].trim();
  }
  return merged;
}

const forumLight = forumTokens('.sc-discussions-shell');
const forumDark = forumTokens(':root[data-theme="dark"] .sc-discussions-shell');
const FORUM_HUES = ['coral', 'sage', 'blue', 'plum', 'amber'];

for (const [theme, forum] of [['light', forumLight], ['dark', forumDark]]) {
  const sc = tokensFor(theme);
  const merged = { ...sc, ...forum };
  // One level of `var(--token)` indirection is enough: `--forum-coral-ink` points at
  // the global primary text token so the brand colour is declared once.
  const v = (name) => {
    // Follow the `var()` chain (forum ink → primary text → its rgb triple).
    let current = name;
    for (let hop = 0; hop < 4; hop += 1) {
      const value = merged[current];
      const alias = typeof value === 'string' && value.match(/^(?:rgb\()?var\((--[\w-]+)\)\)?$/);
      if (!alias) break;
      current = alias[1];
    }
    return rgb(merged, current);
  };
  const surface = v('--sc-surface-rgb');
  const page = v('--forum-page');
  const paper = v('--forum-paper');
  const field = v('--forum-field');
  const notice = v('--forum-notice');
  const pairs = FORUM_HUES.map((hue) => [
    `${hue} ink on page wash`,
    v(`--forum-${hue}-ink`),
    page
  ]).concat(FORUM_HUES.map((hue) => [
    `${hue} ink on its 10% wash`,
    v(`--forum-${hue}-ink`),
    blend(v(`--forum-${hue}`), surface, 0.10)
  ])).concat(FORUM_HUES.map((hue) => [
    // Selected tab pill: 12% of the hue over the paper surface.
    `${hue} ink on its selected tab pill`,
    v(`--forum-${hue}-ink`),
    blend(v(`--forum-${hue}`), paper, 0.12)
  ])).concat([
    ['body text on page wash', v('--sc-text-rgb'), page],
    ['muted strong on page wash', v('--forum-muted-strong'), page],
    ['muted text on the notices card', v('--forum-muted-strong'), v('--sc-subtle-rgb')],
    ['muted text on the trending card', v('--forum-muted-strong'), v('--sc-primary-soft-rgb')],
    ['notice heading on the notices card', v('--sc-text-rgb'), v('--sc-subtle-rgb')],
    ['accent on the trending card', v('--sc-primary-text-rgb'), v('--sc-primary-soft-rgb')],
    // Paper surfaces: the article, the comment panel and the composer field.
    ['body text on paper', v('--sc-text-rgb'), paper],
    ['muted strong on paper', v('--forum-muted-strong'), paper],
    ['body text on composer field', v('--sc-text-rgb'), field],
    ['placeholder on composer field', v('--forum-muted-strong'), field],
    // Secondary notices sit on their own surface inside the notices panel.
    ['notice title on notice surface', v('--sc-text-rgb'), notice],
    ['notice meta on notice surface', v('--forum-muted-strong'), notice],
    ['coral kicker on notice surface', v('--forum-coral-ink'), notice],
    ['sage kicker on notice surface', v('--forum-sage-ink'), notice],
    ['amber kicker on notice surface', v('--forum-amber-ink'), notice],
    // Trending ranks ride a 15% terracotta chip (24% for the lead row).
    ['trending rank on 15% chip', v('--sc-text-rgb'), blend(v('--sc-primary-rgb'), paper, 0.15)],
    ['trending rank on 24% chip', v('--sc-text-rgb'), blend(v('--sc-primary-rgb'), paper, 0.24)]
  ]);

  for (const [label, foreground, background] of pairs) {
    test(`${theme}: community ${label} reaches 4.5:1`, () => {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${label} is ${ratio.toFixed(2)}:1 (${foreground} on ${background})`);
    });
  }
}
