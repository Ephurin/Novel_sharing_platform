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
  for (const match of body.matchAll(/(--sc-[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
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
    ['support button label', color('--sc-warning'), color('--sc-warning-bg')]
  ];

  for (const [label, foreground, background] of pairs) {
    test(`${theme}: ${label} reaches 4.5:1`, () => {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${label} is ${ratio.toFixed(2)}:1 (${foreground} on ${background})`);
    });
  }
}
