import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('real backend + PostgreSQL/Mongo: recovery, reject, accept, reload and stale HITL',{
  skip:process.env.RUN_DRAFT_BROWSER_TESTS!=='1',timeout:90000
},async()=>{
  const require=createRequire(import.meta.url), {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
  const child=spawn(process.execPath,['--import','./node_modules/tsx/dist/loader.mjs','test-support/writing-recovery-browser-server.ts'],{
    cwd:fileURLToPath(new URL('../../backend/',import.meta.url)),env:process.env,stdio:['ignore','ignore','ignore','ipc']});
  let server,browser,sequence=0;
  const config=await new Promise((resolve,reject)=>{child.on('message',m=>{if(m.ready)resolve(m);});child.once('exit',()=>reject(Error('Fixture startup failed')));});
  const command=action=>new Promise((resolve,reject)=>{const id=++sequence;const listener=m=>{if(m.id===id){child.off('message',listener);m.error?reject(Error(m.error)):resolve(m.state);}};child.on('message',listener);child.send({id,action});});
  try{
    const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/author-ide-fixture.tsx',import.meta.url))],bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',
      define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify(config.base),'process.env.NODE_ENV':'"test"'}});
    server=createServer((req,res)=>{const ext=req.url==='/app.js'?'.js':req.url==='/app.css'?'.css':null;
      res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/html');
      res.end(ext?bundle.outputFiles.find(f=>f.path.endsWith(ext)).contents:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(c=>{window.testConfig=c;},config);
    let generations=0;
    await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());
      if(u.hostname!=='127.0.0.1')throw Error('Non-local outbound blocked');
      if(r.method()==='POST'&&u.pathname.endsWith('/ai/writing/generations')){generations++;return route.abort();}return route.continue();});
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
    const accept=()=>page.getByRole('button',{name:'Chấp nhận bản thảo',exact:true}),reject=()=>page.getByRole('button',{name:'Từ chối / Bỏ qua',exact:true});
    await accept().waitFor();assert.match(await page.locator('body').innerText(),/Saved fictional draft/);
    const before=await command('state');await page.reload();await accept().waitFor();
    const account=config.accounts[0],url=`${config.base}/ai/writing/generations?novel_id=${account.novelId}&chapter_id=${account.chapterIds[0]}`;
    assert.equal((await context.request.get(url)).status(),401);
    assert.equal((await context.request.get(url,{headers:{Authorization:`Bearer ${config.otherToken}`}})).status(),403);
    const otherReject=await context.request.post(`${config.base}/ai/writing/generations/11111111-1111-4111-8111-111111111111/dismiss`,{
      headers:{Authorization:`Bearer ${config.otherToken}`},data:{novel_id:account.novelId,chapter_id:account.chapterIds[0]}});
    assert.equal(otherReject.status(),403);
    await reject().click();await reject().waitFor({state:'hidden'});await page.reload();await page.waitForTimeout(350);
    assert.equal(await accept().count(),0);assert.deepEqual(await command('state'),before);
    await command('seed');await page.reload();await accept().waitFor();await accept().click();await reject().waitFor({state:'hidden'});
    const after=await command('state');assert.equal(after.revisions.length,2);assert.equal(after.outbox.length,1);
    assert.equal(after.draft,'Base QA prose Saved fictional draft');await page.reload();await page.waitForTimeout(350);assert.equal(await accept().count(),0);
    await command('seed');await command('stale');await page.reload();await accept().waitFor();assert.equal(await accept().isDisabled(),true);
    assert.equal(generations,0);
  }finally{
    await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(child.connected){child.send({id:++sequence,action:'close'});await new Promise(r=>child.once('exit',r));}
  }
});
