import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('rich serialization preserves source bytes, empty paragraphs and selection boundaries', async () => {
  const result = await build({ stdin: { contents: "import {readRichSource,renderSource} from './src/features/author-ide/RichManuscriptEditor';window.richCodec={readRichSource,renderSource};", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic' });
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html;charset=utf-8'); res.end(req.url === '/app.js' ? result.outputFiles[0].contents : '<!doctype html><div id="editor" contenteditable="true" style="white-space:pre-wrap"></div><script src="/app.js"></script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
    const cases = [
      ['<div>a</div><div><br></div>', 'a\n'],
      ['<div>a</div><div><br></div><div><br></div>', 'a\n\n'],
      ['<p>a</p><p><br></p><p>b</p>', 'a\n\nb'],
      ['<div><br></div>', ''],
      ['<div><br></div><div><br></div>', '\n'],
      ['<div><strong>Xin</strong></div><div><strong>chào</strong></div>', '**Xin**\n**chào**'],
    ];
    for (const [html, expected] of cases) {
      const actual = await page.evaluate(html => { const root = document.querySelector('#editor'); root.innerHTML = html; return window.richCodec.readRichSource(root).text; }, html);
      assert.equal(actual, expected, html);
    }
    const sources = ['', '\n', '\n\n', 'a\n', 'a\n\n', 'Xin chào 🌙\n\n**Nhân vật** nói *nhẹ*.\n', '***Đậm nghiêng*** <u>gạch chân</u> ~~gạch ngang~~', 'Lời thoại[^author-note].\n\n[^author-note]: Cách xưng hô.\n'];
    for (const source of sources) {
      assert.equal(await page.evaluate(source => { const root = document.querySelector('#editor'); window.richCodec.renderSource(root, source); return window.richCodec.readRichSource(root).text; }, source), source);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
