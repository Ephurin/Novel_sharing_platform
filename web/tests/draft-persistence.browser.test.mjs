import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { evidenceDirectory, sanitizedTrace } from './helpers/evidence-output.mjs';

test('mounted draft hook: Undo, serial saves, chapter/account isolation, 409 and durable readback', {
  skip: process.env.RUN_DRAFT_BROWSER_TESTS !== '1', timeout: 120000
}, async () => {
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
  const child = spawn(process.execPath, ['--import', './node_modules/tsx/dist/loader.mjs', 'test-support/draft-browser-server.ts'], {
    cwd: backend, env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  const config = await new Promise((resolve, reject) => {
    child.on('message', message => { if (message.ready) resolve(message); });
    child.once('exit', code => reject(Error('Fixture exited ' + code + ': ' + logs)));
  });
  let sequence = 0;
  const readback = chapterId => new Promise(resolve => {
    const id = ++sequence;
    const listener = message => { if (message.id === id) { child.off('message', listener); resolve(message); } };
    child.on('message', listener); child.send({ action: 'readback', id, chapterId });
  });
  let browser, server;
  const evidence = await evidenceDirectory('draft-persistence-browser');
  try {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('fixtures/draft-persistence.tsx', import.meta.url))], bundle: true, write: false,
      outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(config.base), 'process.env.NODE_ENV': '"test"' } });
    server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html');
      res.end(req.url === '/app.js' ? bundle.outputFiles.find(file => file.path.endsWith('.js')).contents : req.url === '/app.css' ? bundle.outputFiles.find(file => file.path.endsWith('.css')).contents : '<link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
    const page = await browser.newPage();
    await page.context().tracing.start({ screenshots: true, snapshots: true });
    const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(config => window.testConfig = config, config);
    // Actual API calls remain local and use an isolated schema/database.
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin);
    const ready = async () => {
      try { await page.waitForFunction(() => document.querySelector('[data-testid=ready]')?.textContent === 'true'); }
      catch (cause) { throw Error(cause.message + '\n' + pageErrors.join('\n')); }
    };
    const saved = () => page.waitForFunction(() => window.draft.status === 'saved' && !window.draft.dirty);
    const edit = content => page.getByRole('textbox', { name: 'Manuscript' }).fill(content);
    await ready();
    await page.getByText('Điểm trung bình của nhận xét có nội dung', { exact: true }).waitFor();
    assert.equal(await page.getByText('1 nhận xét có điểm', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('progressbar').getAttribute('value'), '10');
    const statistics = await fetch(config.base + '/novels/' + config.accounts[0].novelId + '/statistics');
    assert.equal((await statistics.json()).data.ratingAverage, 7);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('reviews').screenshot({ path: fileURLToPath(new URL('reviews-light-desktop.png', evidence)) });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.setTheme('dark'));
    await page.getByTestId('reviews').screenshot({ path: fileURLToPath(new URL('reviews-dark-mobile.png', evidence)) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    const [x, y] = config.accounts[0].chapterIds;
    const snapshot = async chapterId => {
      const response = await fetch(config.base + '/chapters/' + chapterId + '/revisions/snapshot', { method: 'POST',
        headers: { Authorization: 'Bearer ' + config.accounts[0].token, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 201); return (await response.json()).data;
    };
    await snapshot(x);
    const initial = await readback(x);
    // B -> A -> B before debounce: no request, no stale revision/outbox.
    let writes = 0; page.on('request', request => { if (request.method() === 'PATCH') writes++; });
    const manuscript = page.getByRole('textbox', { name: 'Manuscript' });
    await manuscript.focus(); await manuscript.press('ControlOrMeta+A'); await manuscript.press('A');
    await manuscript.press('ControlOrMeta+Z');
    assert.equal(await manuscript.inputValue(), 'B');
    await page.waitForTimeout(1400); await saved();
    assert.equal(writes, 0); assert.equal((await readback(x)).draft.content, 'B');
    assert.deepEqual((await readback(x)).revisions, initial.revisions); assert.deepEqual((await readback(x)).outbox, initial.outbox);
    // Only the newest complete buffer is dispatched within the debounce window.
    await edit('A'); await page.evaluate(() => window.draft.edit({ title: 'Latest', content: 'C', isVip: true, priceCoins: 7 }));
    await page.evaluate(() => window.draft.flush()); await saved();
    assert.equal(writes, 1); assert.equal((await readback(x)).draft.content, 'C');
    assert.equal((await readback(x)).draft.title, 'Latest');
    const metadata = await fetch(config.base + '/chapters/' + x, { headers: { Authorization: 'Bearer ' + config.accounts[0].token } });
    const chapterMetadata = (await metadata.json()).data;
    assert.equal(chapterMetadata.isVip, true); assert.equal(chapterMetadata.priceCoins, 7);
    // A dispatched request may complete, but queued B follows with its new version.
    let release, entered;
    const started = new Promise(resolve => entered = resolve);
    const hold = new Promise(resolve => release = resolve);
    await page.route(config.base + '/chapters/' + x, async route => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      const body = route.request().postDataJSON();
      if (body.content === 'in-flight A') { entered(); await hold; }
      return route.fallback();
    });
    await edit('in-flight A'); await started; await edit('B');
    assert.equal(await page.getByTestId('status').textContent(), 'saving');
    release(); await saved(); assert.equal((await readback(x)).draft.content, 'B');
    // Pending chapter X remains recoverable and is flushed to X when Y is active.
    await edit('X pending'); await page.evaluate(y => window.draft.select(y), y); await ready();
    assert.equal(await page.getByRole('textbox', { name: 'Manuscript' }).inputValue(), 'B');
    await edit('Y pending'); await page.evaluate(() => window.draft.flush()); await saved();
    assert.equal((await readback(x)).draft.content, 'X pending'); assert.equal((await readback(y)).draft.content, 'Y pending');
    // The router blocks leaving with unsaved content.
    await edit('blocked draft'); await page.evaluate(() => window.draft.navigate());
    await page.waitForFunction(() => window.draft.blocker.state === 'blocked');
    await page.evaluate(() => window.draft.blocker.reset());
    // Reusing the same hook with another account and same chapter must not expose its buffer.
    await page.evaluate(() => window.draft.switchAccount(1, true)); await page.waitForTimeout(100);
    const otherBuffer = await page.evaluate(y => window.draft.initialize({ chapterId: y, title: 'Other', content: 'Other baseline', isVip: false, priceCoins: 0, draftVersion: 1 }), y);
    assert.equal(otherBuffer.content, 'Other baseline');
    await page.waitForTimeout(1400); assert.equal((await readback(y)).draft.content, 'Y pending');
    await page.evaluate(() => window.draft.switchAccount(0)); await ready();
    await page.evaluate(y => window.draft.select(y), y); await ready();
    assert.equal(await page.getByTestId('recovery').textContent(), 'blocked draft');
    // A second tab's save wins; this tab keeps its conflicting local recovery.
    const token = config.accounts[0].token, version = (await readback(y)).draft.version;
    const remote = await fetch(config.base + '/chapters/' + y, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Remote winner', expectedVersion: version }) });
    assert.equal(remote.status, 200);
    await edit('Local conflict'); await page.evaluate(() => window.draft.flush().catch(() => {}));
    assert.equal(await page.getByTestId('status').textContent(), 'error');
    assert.equal((await readback(y)).draft.content, 'Remote winner');
    assert.ok(await page.evaluate(y => localStorage.getItem('storycraft-draft:' + window.testConfig.accounts[0].userId + ':' + y), y));
    await page.evaluate(() => window.draft.reload()); await edit('Final B'); await page.evaluate(() => window.draft.flush()); await saved();
    assert.equal((await readback(y)).draft.content, 'Final B');
    const finalRevision = await snapshot(y), finalState = await readback(y);
    const hash = createHash('sha256').update('Final B').digest('hex');
    assert.equal(finalRevision.contentHash, hash);
    assert.equal(finalState.revisions.at(-1).content_hash, hash);
    assert.deepEqual(finalState.outbox.map(event => event.content_hash), [hash]);
    // An old account's in-flight response cannot drain its next queued write or
    // change the next account's status/recovery, even on the same hook instance.
    let releaseAccount, enteredAccount;
    const accountStarted = new Promise(resolve => enteredAccount = resolve);
    const accountHold = new Promise(resolve => releaseAccount = resolve);
    await page.route(config.base + '/chapters/' + y, async route => {
      if (route.request().method() === 'PATCH' && route.request().postDataJSON().content === 'account-flight') {
        enteredAccount(); await accountHold;
      }
      return route.fallback();
    });
    await edit('account-flight'); await page.evaluate(() => { void window.draft.flush().catch(() => {}); }); await accountStarted;
    await edit('old-account queued secret');
    await page.evaluate(() => window.draft.switchAccount(1)); await ready();
    releaseAccount();
    await page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/' + y));
    await page.waitForTimeout(1400);
    assert.equal((await readback(y)).draft.content, 'account-flight');
    assert.equal((await readback(config.accounts[1].chapterIds[0])).draft.content, 'B');
    assert.equal(await page.getByTestId('status').textContent(), 'saved');
    await page.evaluate(() => window.draft.switchAccount(0)); await ready();
    const beforeRemount = (await readback(x)).draft.content;
    await edit('Remount recovery'); await page.evaluate(() => window.remount()); await ready();
    assert.equal(await page.getByTestId('recovery').textContent(), 'Remount recovery');
    await page.waitForTimeout(1400); assert.equal((await readback(x)).draft.content, beforeRemount);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: fileURLToPath(new URL('draft-persistence.png', evidence)), fullPage: true });
    const sourceHashes = {};
    for (const relative of ['src/features/author-ide/useDraftPersistence.ts', 'src/features/author-ide/AuthorWritingIde.tsx']) {
      sourceHashes[relative] = createHash('sha256').update(await readFile(new URL('../' + relative, import.meta.url))).digest('hex');
    }
    await writeFile(new URL('draft-readback.json', evidence), JSON.stringify({
      testedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8' }).trim(),
      sourceState: 'working tree; hashes identify tested frontend source', sourceHashes,
      rapidUndo: { writes: 0, initialHash: initial.revisions[0].content_hash, unchangedRevisionsAndOutbox: true },
      finalSnapshot: { contentHash: finalRevision.contentHash, revisionHashes: finalState.revisions.map(row => row.content_hash), outboxHashes: finalState.outbox.map(row => row.content_hash) },
      passed: ['rapid Undo', 'latest full buffer', 'in-flight serial save', 'chapter isolation', 'route blocker', 'same chapter account switch', 'account-scoped recovery', '409 recovery', 'immutable revision/outbox hash', 'in-flight account switch', 'router remount recovery', 'React Strict Mode', 'review labels with score-only rating', 'light desktop', 'dark mobile']
    }, null, 2) + '\n');
  } finally {
    if (browser) await sanitizedTrace(browser.contexts()[0], evidence, 'draft-trace');
    await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
    child.send({ action: 'close' }); await new Promise(resolve => child.once('exit', resolve));
  }
});
