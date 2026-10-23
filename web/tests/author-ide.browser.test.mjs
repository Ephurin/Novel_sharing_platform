import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('Real AuthorWritingIde: editor typing, autosave, S10 consistency checking & S11 continuity', {
  skip: process.env.RUN_DRAFT_BROWSER_TESTS !== '1',
  timeout: 120000
}, async () => {
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
  const child = spawn(
    process.execPath,
    ['--import', './node_modules/tsx/dist/loader.mjs', 'test-support/draft-browser-server.ts'],
    {
      cwd: backend,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    }
  );

  let logs = '';
  child.stdout.on('data', data => logs += data);
  child.stderr.on('data', data => logs += data);

  const config = await new Promise((resolve, reject) => {
    child.on('message', message => { if (message.ready) resolve(message); });
    child.once('exit', code => reject(Error('Fixture exited ' + code + ': ' + logs)));
  });

  let sequence = 0;
  const readback = (chapterId) => new Promise(resolve => {
    const id = ++sequence;
    const listener = (message) => {
      if (message.id === id) {
        child.off('message', listener);
        resolve(message);
      }
    };
    child.on('message', listener);
    child.send({ action: 'readback', id, chapterId });
  });

  let browser, server;
  const evidenceDir = new URL('../../docs/development/integration/p1-author/evidence/screenshots/', import.meta.url);
  await mkdir(evidenceDir, { recursive: true });

  try {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('fixtures/author-ide-fixture.tsx', import.meta.url))],
      bundle: true,
      write: false,
      outfile: 'app.js',
      format: 'iife',
      jsx: 'automatic',
      define: {
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify(config.base),
        'process.env.NODE_ENV': '"test"'
      }
    });

    server = createServer((req, res) => {
      res.setHeader(
        'Content-Type',
        req.url === '/app.js'
          ? 'text/javascript'
          : req.url === '/app.css'
          ? 'text/css'
          : 'text/html'
      );
      res.end(
        req.url === '/app.js'
          ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents
          : req.url === '/app.css'
          ? bundle.outputFiles.find(file => file.path.endsWith('.css')).contents
          : '<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'
      );
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
    browser = await chromium.launch({ channel, headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    // Mock AI Story Brain and consistency endpoints for offline hermetic testing
    await page.route('**/ai/story-brains/**', async route => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/memory') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              entities: [
                { entity_id: 'ent-1', name: 'Trần Vân', entity_type: 'character', status: 'Alive', location: 'Thanh Vân Tông' }
              ],
              events: [
                { event_id: 'ev-1', summary: 'Trần Vân bái nhập Thanh Vân Tông', event_type: 'join', participants: ['Trần Vân'], chapter: 1, metadata: {} }
              ],
              facts: [],
              transitions: [],
              metadata: { brain_version: '1' }
            }
          })
        });
      }

      if (url.includes('/by-novel') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              brain_version: 1,
              status: 'active',
              baseline_revision_id: 'rev-baseline-1'
            }
          })
        });
      }

      if (url.includes('/review-queue') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] })
        });
      }

      if (url.includes('/extraction-status') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] })
        });
      }

      if (url.includes('/author-operation') && method === 'POST') {
        const body = route.request().postDataJSON();
        if (body.operation === 'check_consistency') {
          if (body.content && body.content.includes('Trần Vân đã hy sinh')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  findings: [
                    {
                      description: 'Mâu thuẫn thực thể: Trần Vân được ghi nhận còn sống trong Story Brain nhưng bản thảo nêu đã hy sinh',
                      evidence: 'Trần Vân đã hy sinh',
                      revision_id: body.revision_id || 'rev-mock'
                    }
                  ]
                }
              })
            });
          } else {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  findings: []
                }
              })
            });
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} })
        });
      }

      return route.fallback();
    });

    await page.addInitScript(cfg => window.testConfig = cfg, config);
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin);

    // 1. Verify Real AuthorWritingIde Initial State
    const textarea = page.locator('textarea.sc-manuscript');
    await textarea.waitFor({ timeout: 15000 });
    assert.equal(await textarea.inputValue(), 'B');

    // Breadcrumbs check
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await breadcrumb.getByText('Browser draft', { exact: true }).waitFor();
    await breadcrumb.getByText('Draft', { exact: true }).waitFor();

    // Autosave indicator: initial saved status
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    // Capture initial IDE screenshot
    await page.screenshot({ path: fileURLToPath(new URL('author-ide-initial.png', evidenceDir)) });

    // 2. S10: Contradictory Detail Injection & Detection
    const contradictionText = 'Bản thảo mới: Trần Vân đã hy sinh tại đại chiến năm xưa, để lại bí tịch thất truyền.';
    await textarea.focus();
    await textarea.fill(contradictionText);

    // Wait for autosave to complete
    await page.waitForTimeout(1500);
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    // Open Story Brain drawer from toolbar
    const storyBrainBtn = page.locator('[data-testid="btn-story-brain"]');
    await storyBrainBtn.click();

    // Verify Drawer opened
    await page.getByText('Bộ nhớ và định hướng tiểu thuyết').waitFor({ timeout: 10000 });
    await page.getByText(/Bộ nhớ chính thức v1/).waitFor({ timeout: 10000 });

    // Switch to "Sự kiện" tab (value="history")
    const historyTab = page.getByRole('tab', { name: 'Sự kiện' });
    await historyTab.click();

    // Click "Kiểm tra nhất quán chương đang mở"
    const checkBtn = page.getByRole('button', { name: 'Kiểm tra nhất quán chương đang mở' });
    await checkBtn.click();

    // Verify findings are displayed in UI
    const findingText = page.getByText(/Mâu thuẫn thực thể: Trần Vân được ghi nhận còn sống/i);
    await findingText.waitFor({ timeout: 10000 });
    await page.getByText('“Trần Vân đã hy sinh”').waitFor({ timeout: 10000 });

    // Capture S10 findings screenshot
    await page.screenshot({ path: fileURLToPath(new URL('s10-consistency-findings.png', evidenceDir)) });

    // 3. S10 Remediation: Fix Contradiction & Re-check
    const remediatedText = 'Bản thảo mới: Trần Vân vẫn còn sống uy nghiêm tại đại chiến năm xưa, trao lại bí tịch cho hậu nhân.';
    await textarea.focus();
    await textarea.fill(remediatedText);

    // Wait for autosave to complete
    await page.waitForTimeout(1500);
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    // Re-run consistency check
    await checkBtn.click();

    // Verify findings cleared and clean status message appears
    await page.getByText('Không tìm thấy mâu thuẫn trong lần kiểm tra này.').waitFor({ timeout: 10000 });

    // Capture S10 clean remediation screenshot
    await page.screenshot({ path: fileURLToPath(new URL('s10-consistency-clean.png', evidenceDir)) });

    // 4. S11: Reload, Continue Writing & Memory Continuity
    const chapterId = config.accounts[0].chapterIds[0];

    // Verify chapter remains in DRAFT status on backend
    const chapterRes = await fetch(config.base + '/chapters/' + chapterId, {
      headers: { Authorization: 'Bearer ' + config.accounts[0].token }
    });
    const chapterData = (await chapterRes.json()).data;
    assert.equal(chapterData.status, 'DRAFT', 'Chapter status must remain DRAFT');

    // Trigger page remount / reload
    await page.evaluate(() => window.remount());

    // Wait for reloaded IDE editor
    const reloadedTextarea = page.locator('textarea.sc-manuscript');
    await reloadedTextarea.waitFor({ timeout: 15000 });

    // Log actual value and backend readback
    const actualVal = await page.evaluate(() => document.querySelector('textarea.sc-manuscript')?.value);
    const rbPre = await readback(chapterId);
    console.log('REMOUNT CHECK:', { actualVal, rbDraftContent: rbPre.draft?.content });

    // Verify remediated content persisted across reload
    await page.waitForFunction(
      expected => document.querySelector('textarea.sc-manuscript')?.value === expected,
      remediatedText,
      { timeout: 10000 }
    );

    // Continue writing additional prose
    const continuationProse = remediatedText + '\n\nTrời quang đãng, toàn bộ đệ tử môn phái đều nghiêm trang lắng nghe giáo huấn.';
    await reloadedTextarea.focus();
    await reloadedTextarea.fill(continuationProse);

    // Wait for autosave
    await page.waitForTimeout(1500);
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    // Verify readback in backend DB: content matches continuation and status is DRAFT
    const rb = await readback(chapterId);
    assert.equal(rb.draft.content, continuationProse, 'Draft content must match continuation prose in backend');

    const chapterResAfter = await fetch(config.base + '/chapters/' + chapterId, {
      headers: { Authorization: 'Bearer ' + config.accounts[0].token }
    });
    assert.equal((await chapterResAfter.json()).data.status, 'DRAFT', 'Chapter status must strictly stay DRAFT');

    // Test Story Bible modal continuity
    const bibleBtn = page.getByTitle('Cẩm nang thế giới truyện (Story Bible)');
    await bibleBtn.click();
    await page.getByText('Cẩm Nang Thế Giới (Story Bible)').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /Mối quan hệ/i }).click();
    await page.getByRole('button', { name: /Dòng thời gian/i }).click();
    await page.getByRole('button', { name: /Tóm tắt hồi/i }).click();

    // Capture S11 continuity screenshot
    await page.screenshot({ path: fileURLToPath(new URL('s11-continuity-reload.png', evidenceDir)) });

    assert.equal(pageErrors.length, 0, 'No unexpected browser console/page errors');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    child.send({ action: 'close' });
  }
});
