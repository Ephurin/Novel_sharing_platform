import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

test('setup mounted form: real browser, mocked HTTP submit/reload/conflict/unavailable', {timeout:180000}, async () => {
  const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],
    bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',
    define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
  const server=createServer((req,res)=>{
    if(req.url==='/app.js'||req.url==='/app.css') {
      res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');
      return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);
    }
    res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage();
  let saved=null, failure=null, submitted=null;
  await page.route('**/api/v1/**',async route=>{
    const request=route.request();
    if(request.method()==='POST') {
      submitted=request.postDataJSON();
      if(failure) return route.fulfill({status:failure,contentType:'application/json',body:JSON.stringify({error:{code:failure===409?'SETUP_VERSION_CONFLICT':'SETUP_EXTRACT_PROVIDER_UNAVAILABLE',message:'Fixture rejection'}})});
      saved={contract_version:'setup-v1',novel_id:submitted.novel_id,job_id:'snapshot-one',snapshot_id:'snapshot-one',
        setup_version:1,brain_version:1,review_version:0,setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),
        mode:submitted.mode,job_status:'waiting_review',snapshot:submitted.setup,outline:submitted.outline,
        proposals:[{proposal_id:'card-one',dependency_group_id:'group-one',card_type:'entity',status:'pending',
          origin:'author_declared',source_kind:'author_setup',source_refs:[{kind:'setup_declaration',field_path:'/setup/declarations/0',declaration_id:submitted.setup.declarations[0].declaration_id}],
          payload:{canonical_name:submitted.setup.declarations[0].display_name,entity_type:'character'},expected_brain_version:1}]};
      return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({data:{job_id:saved.job_id,status:'waiting_review'}})});
    }
    return route.fulfill({status:saved?200:404,contentType:'application/json',body:JSON.stringify(saved?{data:saved}:{error:{code:'SETUP_NOT_FOUND',message:'None saved'}})});
  });
  try {
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:'Thêm nhân vật hoặc địa danh'}).click();
    await page.getByLabel('Tên',{exact:true}).fill('Minh');
    await page.getByLabel('Dàn ý tương lai (có thể bỏ trống)').fill('Future betrayal in chapter 8');
    await page.getByRole('button',{name:'Lưu và xử lý thiết lập'}).click();
    await expect(page.getByText('Đã lưu bản thiết lập chờ duyệt.',{exact:true})).toBeVisible();
    assert.equal(submitted.contract_version,'setup-v1');assert.equal(submitted.mode,'extract');
    assert.equal(submitted.expected_setup_version,0);assert.ok(submitted.idempotency_key);
    assert.equal(submitted.idea,undefined);assert.equal(submitted.setup.text,'');
    await expect(page.getByText('Tác giả khai báo',{exact:true})).toBeVisible();
    await page.reload();await expect(page.getByLabel('Tên',{exact:true})).toHaveValue('Minh');
    failure=409;
    await page.getByRole('button',{name:'Lưu và xử lý thiết lập'}).click();
    await expect(page.getByRole('alert').filter({hasText:'SETUP_VERSION_CONFLICT'})).toBeVisible();
    await page.getByRole('button',{name:'Tải bản đã lưu'}).click();
    failure=503;
    await page.getByLabel('Thiết lập rõ ràng (tùy chọn)').fill('Unsupported natural prose');
    await page.getByRole('button',{name:'Lưu và xử lý thiết lập'}).click();
    await expect(page.getByRole('alert').filter({hasText:'SETUP_EXTRACT_PROVIDER_UNAVAILABLE'})).toBeVisible();
    await expect(page.getByText('Đã lưu bản thiết lập chờ duyệt.',{exact:true})).toHaveCount(0);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});


test('setup account/novel switches clear sources, operation keys and late replies (mocked HTTP)', {timeout:180000}, async () => {
  const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],
    bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',
    define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
  const server=createServer((req,res)=>{
    if(req.url==='/app.js'||req.url==='/app.css') {
      res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');
      return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);
    }
    res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage();
  const novelA='10000000-0000-0000-0000-000000000001', novelB='10000000-0000-0000-0000-000000000002';
  const submissions=[], reads=[];let releasePost,releaseRead;
  const postGate=new Promise(resolve=>{releasePost=resolve;});
  const readGate=new Promise(resolve=>{releaseRead=resolve;});
  let delayA=false;
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),actor=req.headers().authorization;
    if(req.method()==='POST') {
      submissions.push({actor,body:req.postDataJSON()});
      if(actor==='Bearer token-author-A') {
        await postGate;
        return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({data:{job_id:'late-owner-A-job',status:'waiting_review'}})});
      }
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SETUP_EXTRACT_PROVIDER_UNAVAILABLE',message:'Offline fixture'}})});
    }
    reads.push({actor,url:req.url()});
    if(actor==='Bearer token-author-A' && req.url().includes(novelA)) {
      if(delayA) await readGate;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{
        contract_version:'setup-v1',novel_id:novelA,job_id:'snapshot-A',snapshot_id:'snapshot-A',setup_version:3,brain_version:1,review_version:0,
        setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),mode:'extract',job_status:'waiting_review',
        snapshot:{text:'Owner A source',declarations:[{declaration_id:'a',entity_type:'character',display_name:'Owner A Name'}],world_rules:[],initial_conditions:[]},outline:'Owner A future',proposals:[]}})});
    }
    return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'SETUP_NOT_FOUND',message:'Not found'}})});
  });
  try {
    await page.goto('http://127.0.0.1:'+server.address().port);
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('Owner A source');
    const latePostResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.request().headers().authorization==='Bearer token-author-A');
    await page.getByRole('button',{name:'Lưu và xử lý thiết lập'}).click();
    await expect.poll(()=>submissions.length).toBe(1);
    await page.getByRole('button',{name:'Account B',exact:true}).click();
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('');
    await expect(page.getByLabel('Tên',{exact:true})).toHaveCount(0);
    await page.getByLabel('Thiết lập rõ ràng (tùy chọn)').fill('Owner B source');
    await page.getByRole('button',{name:'Lưu và xử lý thiết lập'}).click();
    await expect.poll(()=>submissions.length).toBe(2);
    assert.equal(submissions[1].actor,'Bearer token-author-B');
    assert.equal(submissions[1].body.expected_setup_version,0);
    assert.notEqual(submissions[1].body.idempotency_key,submissions[0].body.idempotency_key);
    assert.ok(!JSON.stringify(submissions[1]).includes('Owner A'));
    await expect(page.getByRole('alert').filter({hasText:'SETUP_EXTRACT_PROVIDER_UNAVAILABLE'})).toBeVisible();
    const count=reads.length;releasePost();await (await latePostResponse).finished();
    await page.getByRole('button',{name:'Novel B',exact:true}).click();
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('');
    await expect.poll(()=>reads.length).toBeGreaterThan(count);
    assert.ok(reads.slice(count).every(r=>r.url.includes(novelB)));
    // A late GET from a previous account/novel cannot repopulate B's empty form.
    delayA=true;
    const oldReadCount=reads.length;
    const lateResponse=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes(novelA)&&r.request().headers().authorization==='Bearer token-author-A');
    await page.getByRole('button',{name:'Account A',exact:true}).click();
    await page.getByRole('button',{name:'Novel A',exact:true}).click();
    await expect.poll(()=>reads.slice(oldReadCount).some(r=>r.actor==='Bearer token-author-A'&&r.url.includes(novelA))).toBeTruthy();
    await page.getByRole('button',{name:'Account B',exact:true}).click();
    await page.getByRole('button',{name:'Novel B',exact:true}).click();
    releaseRead();await lateResponse;
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('');
    await expect(page.getByLabel('Dàn ý tương lai (có thể bỏ trống)')).toHaveValue('');
    await expect(page.getByLabel('Tên',{exact:true})).toHaveCount(0);
  } finally {releasePost();releaseRead();await browser.close();await new Promise(resolve=>server.close(resolve));}
});


test('mounted AuthorMemoryPanel isolates accounts and novels (mocked HTTP)', {timeout:180000}, async () => {
  const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],
    bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',
    define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
  const server=createServer((req,res)=>{
    if(req.url==='/app.js'||req.url==='/app.css') {
      res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');
      return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);
    }
    res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('FULL_PANEL_ERROR',e.message);});
  const novelA='10000000-0000-0000-0000-000000000001', novelB='10000000-0000-0000-0000-000000000002';
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),url=req.url(),actor=req.headers().authorization;
    let data=[];let status=200;
    if(url.includes('/setup')) {
      if(actor==='Bearer token-author-A'&&url.includes(novelA)) data={contract_version:'setup-v1',novel_id:novelA,
        job_id:'snapshot-panel-A',snapshot_id:'snapshot-panel-A',setup_version:1,brain_version:1,review_version:0,
        setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),mode:'extract',job_status:'waiting_review',
        snapshot:{text:'Panel private world A',declarations:[],world_rules:[],initial_conditions:[]},outline:'Future A',proposals:[]};
      else status=404;
    } else if(url.includes('/entity-guidance')) data={version:0,entries:actor==='Bearer token-author-A'?[{name:'Private hint A',kind:'hint',entity_type:'PER',aliases:[],notes:''}]:[]};
    else if(url.includes('/memory')) data={story_id:novelA,brain_id:'brain',brain_version:1,entities:[],aliases:[],mentions:[],events:[],facts:[],relations:[],transitions:[],current_state:{},metadata:{},provenance:[]};
    else if(url.includes('/by-novel/')) data={id:'brain',status:'importing',counts:{entities:0,events:0,pending_proposals:0}};
    else if(url.includes('/story-plans/')||url.includes('/autonomous/')) status=404;
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{data}:{error:{code:'NOT_FOUND',message:'No source'}})});
  });
  try {
    await page.goto('http://127.0.0.1:'+server.address().port+'/?full');
    await expect(page.getByLabel('Tên cần chú ý (mỗi dòng một tên)')).toHaveValue('Private hint A');
    await page.getByRole('tab',{name:'Trích xuất',exact:true}).click();
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('Panel private world A');
    await page.evaluate(()=>window.switchFixtureAccount('author-B'));
    await expect(page.getByLabel('Tên cần chú ý (mỗi dòng một tên)')).toHaveValue('');
    await page.getByRole('tab',{name:'Trích xuất',exact:true}).click();
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('');
    await expect(page.getByLabel('Dàn ý tương lai (có thể bỏ trống)')).toHaveValue('');
    await page.getByLabel('Thiết lập rõ ràng (tùy chọn)').fill('B unsaved draft');
    await page.evaluate(n=>window.switchFixtureNovel(n),novelB);
    await page.getByRole('tab',{name:'Trích xuất',exact:true}).click();
    await expect(page.getByLabel('Thiết lập rõ ràng (tùy chọn)')).toHaveValue('');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('mounted review group edits, explicit identities, rejection, 409 and persisted reload (mocked HTTP)', {timeout:180000}, async()=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
  const server=createServer((req,res)=>{
    if(req.url==='/app.js'||req.url==='/app.css') {res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);}
    res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage();let submitted=null,conflict=true;
  const saved={contract_version:'setup-v1',novel_id:'10000000-0000-0000-0000-000000000001',snapshot_id:'snapshot',job_id:'snapshot',setup_version:1,review_version:0,brain_version:1,setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),mode:'extract',job_status:'waiting_review',snapshot:{text:'',declarations:[],world_rules:[],initial_conditions:[]},outline:'Chapter 8 planned betrayal',approved_identities:[],proposals:[
    {proposal_id:'one',dependency_group_id:'group',card_type:'entity',origin:'author_declared',source_kind:'author_setup',status:'pending',source_refs:[],payload:{canonical_name:'Minh',entity_type:'character'}},
    {proposal_id:'two',dependency_group_id:'group',card_type:'entity',origin:'author_declared',source_kind:'author_setup',status:'pending',source_refs:[],payload:{canonical_name:'Minh',entity_type:'character'}},
    {proposal_id:'rule',dependency_group_id:'group',card_type:'world_rule',origin:'author_declared',source_kind:'author_setup',status:'pending',source_refs:[],payload:{fact_key:'gravity',fact_value:'No flight'}}]};
  await page.route('**/api/v1/**',async route=>{
    if(route.request().method()==='POST') {
      assert.ok(route.request().url().endsWith('/setup/snapshot/review'));
      submitted=route.request().postDataJSON();
      if(conflict)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'SETUP_REVIEW_VERSION_CONFLICT',message:'Changed'}})});
      saved.review={status:'review_complete',activation_available:false};saved.review_version=1;saved.brain_version=2;
      saved.proposals=saved.proposals.map(c=>{const d=submitted.decisions.find(d=>d.proposal_id===c.proposal_id);return {...c,status:d.decision==='accept'?'accepted':'rejected',reviewed_payload:d.edited_entity??d.edited_rule??c.payload};});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:saved.review})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:saved})});
  });
  try {
    await page.goto('http://127.0.0.1:'+server.address().port);
    const button=page.getByRole('button',{name:'Lưu quyết định toàn nhóm'});
    await expect(button).toBeDisabled();
    async function select(label,option) {await page.getByLabel(label,{exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
    await select('Quyết định thẻ 1','Duyệt');await select('Danh tính thẻ 1','Tạo danh tính mới (ID server)');
    await page.getByLabel('Nội dung thẻ 1',{exact:true}).fill('Minh reviewed');
    await select('Quyết định thẻ 2','Loại');
    await select('Quyết định thẻ 3','Duyệt');await page.getByLabel('Nội dung thẻ 3',{exact:true}).fill('No flight without wings');
    await button.click();await expect(page.getByRole('alert').filter({hasText:'SETUP_REVIEW_VERSION_CONFLICT'})).toBeVisible();
    const key=submitted.idempotency_key;assert.equal(submitted.expected_review_version,0);assert.equal(submitted.decisions.length,3);
    assert.equal(submitted.decisions[0].identity.kind,'new');assert.equal(submitted.decisions[1].decision,'reject');
    conflict=false;await button.click();await expect(page.getByText('Đã duyệt',{exact:true})).toHaveCount(2);
    assert.equal(submitted.idempotency_key,key);
    await page.reload();await expect(page.getByText('Minh reviewed',{exact:true})).toBeVisible();
    await expect(page.getByText('Đã loại',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Lưu quyết định toàn nhóm'})).toHaveCount(0);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
