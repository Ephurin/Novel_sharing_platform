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
      ['a<br><br>', 'a\n'],
      ['<div>a<br></div><div>b</div>', 'a\nb'],
      ['<div><strong>Xin</strong></div><div><strong>chào</strong></div>', '**Xin**\n**chào**'],
    ];
    for (const [html, expected] of cases) {
      const actual = await page.evaluate(html => { const root = document.querySelector('#editor'); root.innerHTML = html; return window.richCodec.readRichSource(root).text; }, html);
      assert.equal(actual, expected, html);
    }
    const sources = ['', '\n', '\n\n', 'a\n', 'a\n\n', 'a\r\nb\r\n', 'Xin chào 🌙\n\n**Nhân vật** nói *nhẹ*.\n', '***Đậm nghiêng*** <u>gạch chân</u> ~~gạch ngang~~', 'Lời thoại[^author-note].\n\n[^author-note]: Cách xưng hô.\n'];
    for (const source of sources) {
      assert.equal(await page.evaluate(source => { const root = document.querySelector('#editor'); window.richCodec.renderSource(root, source); return window.richCodec.readRichSource(root).text; }, source), source);
    }
    assert.deepEqual(await page.evaluate(() => { const root = document.querySelector('#editor'); root.innerHTML = '<div>a</div><div><br></div>'; const parsed = window.richCodec.readRichSource(root); return [parsed.offset(root, 1), parsed.offset(root.children[1], 0)]; }), [1, 2]);
    assert.deepEqual(await page.evaluate(() => { const root = document.querySelector('#editor'); root.innerHTML = 'a<br><br>'; const parsed = window.richCodec.readRichSource(root); return [0,1,2,3].map(index => parsed.offset(root,index)); }), [0,1,2,2]);
    const editor = page.locator('#editor');
    await page.evaluate(() => { const root = document.querySelector('#editor'); window.richCodec.renderSource(root, 'Xin chào'); root.focus(); const range = document.createRange(); range.selectNodeContents(root); range.collapse(false); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
    for (let count = 1; count <= 3; count++) {
      await editor.press('Enter');
      assert.equal(await editor.evaluate(root => window.richCodec.readRichSource(root).text), 'Xin chào' + '\n'.repeat(count), await editor.innerHTML());
    }
    await page.keyboard.insertText('Bạn 🌙');
    assert.equal(await editor.evaluate(root => window.richCodec.readRichSource(root).text), 'Xin chào\n\n\nBạn 🌙');
    await page.evaluate(() => { const root = document.querySelector('#editor'); window.richCodec.renderSource(root, '**Xin chào**'); root.focus(); const range = document.createRange(); range.setStart(root.querySelector('strong').firstChild, 3); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
    await editor.press('Enter');
    assert.equal(await editor.evaluate(root => window.richCodec.readRichSource(root).text), '**Xin**\n** chào**', await editor.innerHTML());
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
