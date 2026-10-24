import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

for (const phase of ['before-import', 'after-import']) {
  test(`FE-15 browser-controlled destination cannot receive credentials: ${phase}`, { timeout: 30000 }, async () => {
    const received = { trusted: [], untrusted: [] };
    const attacker = createServer((req, res) => {
      received.untrusted.push({ method: req.method, authorization_present: Boolean(req.headers.authorization) });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: 'untrusted' }));
    });
    let browser;
    const bundle = await build({ stdin: {
      contents: `import { apiClient } from './src/shared/api/api-client'; window.probe = () => apiClient.get('/probe').then(r => r.data);`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
      bundle: true, write: false, format: 'iife',
      define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api/v1' }) } });
    const trusted = createServer((req, res) => {
      if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].contents); }
      else if (req.url === '/api/v1/probe') {
        received.trusted.push({ authorization_present: Boolean(req.headers.authorization) });
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: 'trusted' }));
      } else { res.setHeader('Content-Type', 'text/html'); res.end('<script src="/app.js"></script>'); }
    });
    try {
      await new Promise(resolve => attacker.listen(0, '127.0.0.1', resolve));
      await new Promise(resolve => trusted.listen(0, '127.0.0.1', resolve));
      const untrusted = `http://127.0.0.1:${attacker.address().port}/api/v1`;
      browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
      const page = await browser.newPage();
      await page.addInitScript(({ phase, untrusted }) => {
        localStorage.setItem('ephurin_access_token', 'nonsecret-fixture-token');
        if (phase === 'before-import') {
          window.__API_BASE__ = untrusted;
          localStorage.setItem('ephurin_api_base_url', untrusted);
        }
      }, { phase, untrusted });
      await page.goto(`http://127.0.0.1:${trusted.address().port}`);
      await page.waitForFunction(() => typeof window.probe === 'function');
      if (phase === 'after-import') await page.evaluate(url => {
        window.__API_BASE__ = url;
        localStorage.setItem('ephurin_api_base_url', url);
      }, untrusted);
      const result = await page.evaluate(() => window.probe());
      assert.equal(received.untrusted.length, 0, 'No request/preflight/token may reach the untrusted origin');
      assert.deepEqual(received.trusted, [{ authorization_present: true }]);
      assert.equal(result.data, 'trusted');
    } finally {
      if (process.env.P1_EVIDENCE_DIR) {
        await mkdir(process.env.P1_EVIDENCE_DIR, { recursive: true });
        await writeFile(`${process.env.P1_EVIDENCE_DIR}/fe15-${phase}.json`, JSON.stringify(received, null, 2));
      }
      await browser?.close();
      await Promise.all([trusted, attacker].map(server => new Promise(resolve => server.close(resolve))));
    }
  });
}
