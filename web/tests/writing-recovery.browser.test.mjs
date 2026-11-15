import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Mounted production IDE, mocked HTTP storage; never starts an AI service.
test('persisted Writing review: reload/session/isolation/accept/reject/stale/races, zero generation', {
  skip: process.env.RUN_DRAFT_BROWSER_TESTS !== '1', timeout: 120000
}, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
  const ids = ['1','2','3','4','5'].map(c => `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`);
  const [user, novelId, chapterA, chapterB, jobId] = ids;
  const chapter = id => ({ chapterId: id, novelId, title: id === chapterA ? 'Chapter A' : 'Chapter B', chapterNumber: id === chapterA ? 1 : 2,
    content: manuscript, wordCount: 3, isVip: false, priceCoins: 0, status: 'DRAFT', draftVersion: 1, updatedAt: '2026-11-01T00:00:00Z' });
  let manuscript = 'Original manuscript unchanged', pending = true, status = 'completed', stale = null;
  let generationCalls = 0, accepts = 0, dismisses = 0, recoveryReads = 0, delayNext = false, release;
  const savedDraft = 'Saved fictional draft: Lam Phong found the jade.';
  const bundle = await build({ entryPoints: [new URL('fixtures/author-ide-fixture.tsx', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1')],
    bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api"', 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req,res) => {
    const file = bundle.outputFiles.find(f => f.path.endsWith(req.url === '/app.css' ? '.css' : '.js'));
    res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html');
    res.end(req.url === '/app.js' || req.url === '/app.css' ? file.contents : '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
    const origin = `http://127.0.0.1:${server.address().port}`;
    const newPage = async () => {
      const context = await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(config => { window.testConfig = config; }, {base:'/api',accounts:[{userId:user,token:'fixture-token',novelId,chapterIds:[chapterA,chapterB]}]});
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) throw Error('Non-local outbound blocked');
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const path = url.pathname.slice(4), method = request.method(); let data = [];
        if (path === '/novels/me') data = [{novelId,title:'QA Novel',genres:[]}];
        else if (path === `/novels/${novelId}`) data = {novelId,title:'QA Novel',genres:[]};
        else if (path.endsWith('/chapters') && method === 'GET') data = [chapter(chapterA),chapter(chapterB)];
        else if (path.startsWith('/chapters/') && !path.endsWith('/accept-draft')) data = chapter(path.split('/')[2]);
        else if (path === '/ai/writing/generations' && method === 'GET') {
          recoveryReads++;
          data = {job: pending && url.searchParams.get('chapter_id') === chapterA ? { job_id:jobId,novel_id:novelId,chapter_id:chapterA,status,stage:status,
            draft:status === 'completed' ? savedDraft : null,validation_status:status === 'failed'?'failed':'passed',stale_reason:stale,patch:{start:0,end:0,replacement:savedDraft}} : null};
          if (delayNext) { delayNext = false; await new Promise(r => { release = r; }); }
        } else if (path.endsWith('/dismiss')) { pending=false; dismisses++; data={status:'dismissed'}; }
        else if (path.endsWith('/accept-draft')) { pending=false; accepts++; manuscript=savedDraft; data={revision_id:jobId}; }
        else if (path === '/ai/writing/generations' && method === 'POST') { generationCalls++; throw Error('Generation forbidden'); }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,meta:{totalPages:1}})});
      });
      const page = await context.newPage(); await page.goto(origin); return page;
    };
    let page = await newPage();
    const accept = () => page.getByRole('button',{name:'Chấp nhận bản thảo',exact:true});
    const reject = () => page.getByRole('button',{name:'Từ chối / Bỏ qua',exact:true});
    await accept().waitFor(); assert.match(await page.locator('body').innerText(), /Saved fictional draft/);
    assert.equal(manuscript,'Original manuscript unchanged');
    await page.reload(); await accept().waitFor(); // T01
    await page.context().close(); page = await newPage(); await accept().waitFor(); // T02
    await page.evaluate(id => window.navigateChapter(id),chapterB); await accept().waitFor({state:'hidden'});
    await page.evaluate(id => window.navigateChapter(id),chapterA); await accept().waitFor(); // T03
    await reject().click(); await reject().waitFor({state:'hidden'}); await page.reload();
    await page.waitForFunction(() => !document.body.innerText.includes('Đang tải bản nháp AI'));
    assert.equal(await accept().count(),0); assert.equal(dismisses,1); assert.equal(manuscript,'Original manuscript unchanged'); // T06
    pending=true; await page.reload(); await accept().waitFor(); await accept().click(); await accept().waitFor({state:'hidden'});
    await page.reload(); await page.waitForTimeout(300); assert.equal(await accept().count(),0); assert.equal(accepts,1); assert.equal(manuscript,savedDraft); // T05 UI contract mock
    pending=true; stale='STALE_BASE_REVISION'; await page.reload(); await accept().waitFor(); assert.equal(await accept().isDisabled(),true); // T07
    stale=null; status='failed'; await page.reload(); await page.waitForTimeout(300); assert.equal(await accept().count(),0);
    status='generating'; await page.reload(); await page.waitForTimeout(300); const reads = recoveryReads; await page.waitForTimeout(2300);
    assert.equal(recoveryReads,reads); assert.equal(await accept().count(),0); // T08 no endless polling
    status='completed'; delayNext=true; await page.reload();
    while (!release) await page.waitForTimeout(20);
    await page.evaluate(id => window.navigateChapter(id),chapterB); release(); release=null;
    await page.waitForTimeout(300); assert.equal(await accept().count(),0); // T09 delayed A must not set B
    await page.evaluate(id => window.navigateChapter(id),chapterA); await accept().waitFor();
    delayNext=true; await page.reload(); while (!release) await page.waitForTimeout(20);
    pending=false; await page.evaluate(() => window.switchAuthor('other-fixture-author')); release(); release=null;
    await page.waitForTimeout(400); assert.equal(await accept().count(),0); // account race
    assert.equal(generationCalls,0); // T10 all endpoints are local mock, no provider
  } finally { await browser?.close(); await new Promise(r => server.close(r)); }
});
