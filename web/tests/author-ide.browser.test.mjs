import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { evidenceDirectory } from './helpers/evidence-output.mjs';

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
  const evidenceDir = await evidenceDirectory('author-ide-browser');

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

    const chapterId = config.accounts[0].chapterIds[0];

    // 1. Verify Real AuthorWritingIde Initial State
    const textarea = page.locator('textarea.sc-manuscript');
    await textarea.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('textarea.sc-manuscript')?.value === 'B');
    assert.equal(await textarea.inputValue(), 'B');

    // Breadcrumbs check
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await breadcrumb.getByText('Browser draft', { exact: true }).waitFor();
    await breadcrumb.getByText('Draft', { exact: true }).waitFor();

    // Autosave indicator: initial saved status
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    // Capture initial IDE screenshot
    await page.screenshot({ path: fileURLToPath(new URL('author-ide-initial.png', evidenceDir)) });

    // 1b. Rapid Undo B -> A -> B before debounce: zero unintended PATCH (<1200ms)
    let patchCount = 0;
    const patchListener = req => {
      if (req.method() === 'PATCH') patchCount++;
    };
    page.on('request', patchListener);

    await textarea.focus();
    await textarea.press('ControlOrMeta+A');
    await textarea.press('A');
    await textarea.press('ControlOrMeta+Z');
    assert.equal(await textarea.inputValue(), 'B');
    await page.waitForTimeout(1400);
    assert.equal(patchCount, 0, 'Zero PATCH requests dispatched for rapid Undo B->A->B');
    page.off('request', patchListener);
    const rbInitial = await readback(chapterId);
    assert.equal(rbInitial.draft.content, 'B');

    // 2. S10: Contradictory Detail Injection & Detection (MOCKED_UI_PASS)
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

    // 4. S11: Real Browser Reload, Remount & Writing Continuity
    // Verify chapter remains in DRAFT status on backend
    const chapterRes = await fetch(config.base + '/chapters/' + chapterId, {
      headers: { Authorization: 'Bearer ' + config.accounts[0].token }
    });
    const chapterData = (await chapterRes.json()).data;
    assert.equal(chapterData.status, 'DRAFT', 'Chapter status must remain DRAFT');

    // S11a: Real browser reload (page.reload())
    await page.reload();
    const reloadedAfterRealReload = page.locator('textarea.sc-manuscript');
    await reloadedAfterRealReload.waitFor({ timeout: 15000 });
    await page.waitForFunction(
      expected => document.querySelector('textarea.sc-manuscript')?.value === expected,
      remediatedText,
      { timeout: 10000 }
    );

    // S11b: Route remount (window.remount())
    await page.evaluate(() => window.remount());

    // Wait for reloaded IDE editor
    const reloadedTextarea = page.locator('textarea.sc-manuscript');
    await reloadedTextarea.waitFor({ timeout: 15000 });

    // Verify remediated content persisted across reload and remount
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

    // 5. In-flight A -> B Serialization Check
    let releaseFlight, flightStarted;
    const startedPromise = new Promise(resolve => flightStarted = resolve);
    const holdPromise = new Promise(resolve => releaseFlight = resolve);
    await page.route(config.base + '/chapters/' + chapterId, async route => {
      if (route.request().method() === 'PATCH') {
        const postData = route.request().postDataJSON();
        if (postData?.content === 'in-flight A prose') {
          flightStarted();
          await holdPromise;
        }
      }
      return route.fallback();
    });

    await reloadedTextarea.focus();
    await reloadedTextarea.fill('in-flight A prose');
    await startedPromise;
    await reloadedTextarea.fill('in-flight B prose final');
    releaseFlight();
    await page.waitForTimeout(1500);
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });
    const rbFlight = await readback(chapterId);
    assert.equal(rbFlight.draft.content, 'in-flight B prose final', 'In-flight B must win over in-flight A');

    // 6. Two-tab 409 Conflict Recovery & Authoritative Readback
    const currentVersion = rbFlight.draft.version;
    const remoteWinner = await fetch(config.base + '/chapters/' + chapterId, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + config.accounts[0].token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Remote second-tab winner prose',
        expectedVersion: currentVersion
      })
    });
    assert.equal(remoteWinner.status, 200);

    // Local tab types conflict edit
    await reloadedTextarea.focus();
    await reloadedTextarea.fill('Local conflict edit prose');
    await page.waitForTimeout(1500);

    // Server authoritative readback confirms remote winner is intact in DB
    const rbAuthoritative = await readback(chapterId);
    assert.equal(rbAuthoritative.draft.content, 'Remote second-tab winner prose');

    // Local recovery copy is preserved in localStorage
    const localSaved = await page.evaluate(
      ([userId, chId]) => localStorage.getItem(`storycraft-draft:${userId}:${chId}`),
      [config.accounts[0].userId, chapterId]
    );
    assert.ok(localSaved, 'Local conflict buffer retained in localStorage');

    // 7. Active Story Brain Snapshot & Revision/Outbox Readback
    const snapshotRes = await fetch(config.base + '/chapters/' + chapterId + '/revisions/snapshot', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.accounts[0].token,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(snapshotRes.status, 201);
    const snapData = (await snapshotRes.json()).data;
    const finalRb = await readback(chapterId);
    assert.equal(finalRb.revisions.at(-1).content_hash, snapData.contentHash);
    assert.ok(finalRb.outbox.length > 0, 'Outbox event created for snapshot revision');

    // 8. Test Story Bible modal continuity
    const bibleBtn = page.getByTitle('Cẩm nang thế giới truyện (Story Bible)');
    await bibleBtn.click();
    await page.getByText('Cẩm Nang Thế Giới (Story Bible)').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /Mối quan hệ/i }).click();
    await page.getByRole('button', { name: /Dòng thời gian/i }).click();
    await page.getByRole('button', { name: /Tóm tắt hồi/i }).click();

    // Capture S11 continuity screenshot
    await page.screenshot({ path: fileURLToPath(new URL('s11-continuity-reload.png', evidenceDir)) });

    // 9. UX-02 Regression: Session expiry / logout with dirty draft exits cleanly to /login without useBlocker deadlock
    await page.evaluate(
      ([userId, chId]) => localStorage.removeItem(`storycraft-draft:${userId}:${chId}`),
      [config.accounts[0].userId, chapterId]
    );
    await page.evaluate(() => window.remount());
    const finalEditor = page.locator('textarea.sc-manuscript');
    await finalEditor.waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelector('textarea.sc-manuscript')?.value === 'Remote second-tab winner prose',
      null,
      { timeout: 10000 }
    );
    await finalEditor.focus();
    const unsavedBeforeLogout = 'Bản nháp chưa lưu trước khi hết phiên đăng nhập (UX-02 verification).';
    await finalEditor.fill(unsavedBeforeLogout);

    // Immediately trigger session expiry / logout before the 1200ms autosave debounce fires
    await page.evaluate(() => window.logout());
    await page.getByTestId('login-page').waitFor({ timeout: 5000 });

    const logoutState = await page.evaluate(([authorAId, authorBId, chId]) => ({
      pathname: window.router.state.location.pathname,
      blockerCount: window.router.state.blockers.size,
      authorABackup: localStorage.getItem(`storycraft-draft:${authorAId}:${chId}`),
      authorBBackup: localStorage.getItem(`storycraft-draft:${authorBId}:${chId}`)
    }), [config.accounts[0].userId, config.accounts[1].userId, chapterId]);

    assert.equal(logoutState.pathname, '/login', 'AuthGate must redirect cleanly to /login on session exit');
    assert.equal(logoutState.blockerCount, 0, 'useBlocker must unregister on unmount without deadlocking /login redirect');
    assert.ok(logoutState.authorABackup?.includes(unsavedBeforeLogout), 'Unsaved draft must remain preserved in author-scoped localStorage');
    assert.equal(logoutState.authorBBackup, null, 'Another account must never inherit the previous author draft');

    // Switch to Author 2 and verify Author 2 never sees Author 1's local draft
    await page.evaluate(
      ([accountB, novelBId, chapterBId]) => window.loginAuthor(accountB, novelBId, chapterBId),
      [config.accounts[1], config.accounts[1].novelId, config.accounts[1].chapterIds[0]]
    );
    const author2Editor = page.locator('textarea.sc-manuscript');
    await author2Editor.waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelector('textarea.sc-manuscript')?.value === 'B',
      null,
      { timeout: 10000 }
    );
    assert.equal(await author2Editor.inputValue(), 'B', 'Author 2 must only see Author 2 chapter content');
    assert.equal(await page.getByText('Có bản lưu trên máy chưa đồng bộ').count(), 0, 'Author 2 must not see Author 1 local recovery banner');

    // Log Author 1 back in and confirm Author 1 recovers the unsaved local draft via recovery banner
    await page.evaluate(
      ([accountA, novelAId, chapterAId]) => window.loginAuthor(accountA, novelAId, chapterAId),
      [config.accounts[0], config.accounts[0].novelId, chapterId]
    );
    await page.getByText('Có bản lưu trên máy chưa đồng bộ').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Khôi phục vào trình soạn thảo' }).click();
    const recoveredEditor = page.locator('textarea.sc-manuscript');
    await page.waitForFunction(
      expected => document.querySelector('textarea.sc-manuscript')?.value === expected,
      unsavedBeforeLogout,
      { timeout: 10000 }
    );
    assert.equal(await recoveredEditor.inputValue(), unsavedBeforeLogout, 'Author 1 must recover unsaved local draft after re-login');
    await page.waitForTimeout(1500);
    await page.getByText(/Đã lưu/i).first().waitFor({ timeout: 10000 });

    assert.equal(pageErrors.length, 0, 'No unexpected browser console/page errors');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    child.send({ action: 'close' });
  }
});
