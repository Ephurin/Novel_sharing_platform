import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

test('P2-04 mounted M0 requires real activation POST, handles 409/reload and isolates accounts (mocked HTTP)',{timeout:180000},async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
 const server=createServer((req,res)=>{
  if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);}
  res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><link rel="stylesheet" href="/app.css"><script src="/app.js"></script>');
 }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true}),page=await browser.newPage();
 const novel='10000000-0000-0000-0000-000000000001',id='20000000-0000-0000-0000-000000000001';
 const saved={contract_version:'setup-v1',novel_id:novel,job_id:id,snapshot_id:id,setup_version:1,review_version:1,brain_version:2,setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),mode:'extract',job_status:'waiting_review',snapshot:{text:'Reviewed setup',declarations:[],world_rules:[],initial_conditions:[]},proposals:[],review:{status:'review_complete',activation_available:false}};
 let conflict=true,activated=false,body=null;const submissions=[];
 await page.route('**/api/v1/**',async route=>{
  const request=route.request();
  if(request.headers().authorization==='Bearer token-author-B')return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'SETUP_NOT_FOUND',message:'No setup'}})});
  if(request.url().endsWith('/activate')){
   if(request.method()==='POST'){
    body=request.postDataJSON();submissions.push(body);
    if(conflict)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'M0_VERSION_CONFLICT',message:'Reload required'}})});
    activated=true;saved.job_status='completed';saved.brain_version+=1;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{status:'active',baseline_kind:'M0'}})});
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:activated?{contract_version:'setup-m0-v1',eligible:false,reason:'M0_ALREADY_ACTIVE',activation:{status:'active',baseline_kind:'M0',brain_version:saved.brain_version}}:{contract_version:'setup-m0-v1',eligible:true,reason:null,setup_hash:saved.setup_hash,expected_setup_version:1,expected_review_version:1,expected_brain_version:saved.brain_version}})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:saved})});
 });
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);
  const activate=page.getByRole('button',{name:'Kích hoạt thiết lập để bắt đầu viết'});
  await expect(activate).toBeEnabled();assert.equal(submissions.length,0);
  await activate.click();await expect(page.getByRole('alert').filter({hasText:'Tải bản đã lưu rồi kiểm tra lại'})).toBeVisible();
  assert.equal(body.contract_version,'setup-m0-v1');assert.equal(body.expected_review_version,1);assert.equal(body.expected_brain_version,2);
  saved.brain_version=3;await page.getByRole('button',{name:'Tải bản đã lưu',exact:true}).click();
  await expect(activate).toBeEnabled();conflict=false;await activate.click();
  await expect(page.getByText('Thiết lập đã được kích hoạt.',{exact:false})).toBeVisible();
  assert.equal(submissions.length,2);assert.equal(submissions[1].expected_brain_version,3);
  await page.reload();await expect(page.getByText('Thiết lập đã được kích hoạt.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Account B',exact:true}).click();
  await expect(page.getByText('Thiết lập đã được kích hoạt.',{exact:false})).toHaveCount(0);await expect(activate).toHaveCount(0);
  if(process.env.P204_M0_SCREENSHOT){await page.getByRole('button',{name:'Account A',exact:true}).click();await expect(page.getByText('Thiết lập đã được kích hoạt.',{exact:false})).toBeVisible();await page.screenshot({path:process.env.P204_M0_SCREENSHOT,fullPage:true});}
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

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
    async function select(label,option) {await page.getByRole('textbox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
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
    if(process.env.P202_REVIEW_SCREENSHOT) await page.screenshot({path:process.env.P202_REVIEW_SCREENSHOT,fullPage:true});
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('manual future plan editor: 25 chapters, CAS, activation and account isolation (mocked HTTP)',{timeout:180000},async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
 const server=createServer((req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);}res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});const page=await browser.newPage();
 const state={head_version:0,active_plan_id:null,plans:[]};let conflict=false,submitted=null,requests=0,release,delay=false;
 const gate=new Promise(r=>{release=r;});
 await page.route('**/api/v1/**',async route=>{
  const req=route.request();
  if(req.method()==='POST'){
   requests++;submitted=req.postDataJSON();if(delay)await gate;
   if(conflict)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'PLAN_VERSION_CONFLICT',message:'Changed'}})});
   state.head_version++;const source=state.plans.find(p=>p.plan_id===submitted.source_plan_id);
   const plan={plan_id:'plan-'+state.head_version,plan_version:state.head_version,status:submitted.action==='activate'?'active':submitted.action==='skip'?'skipped':'draft',source_outline:submitted.source_outline??source?.source_outline??'',private_notes:submitted.private_notes??source?.private_notes??'',objectives:submitted.objectives?.map(o=>{const {expected_intent_version,...v}=o;return {...v,intent_version:expected_intent_version+1};})??(submitted.action==='activate'?source.objectives:[]),action:submitted.action};
   if(submitted.action==='activate'){state.plans.forEach(p=>{if(p.status==='active')p.status='superseded';});state.active_plan_id=plan.plan_id;}
   if(submitted.action==='skip')state.active_plan_id=null;
   state.plans.push(plan);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:plan})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:req.headers().authorization==='Bearer token-author-B'?{head_version:0,active_plan_id:null,plans:[]}:state})});
 });
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?plan');
  await page.getByRole('button',{name:'Không dùng kế hoạch',exact:true}).click();await expect(page.getByText(/Không có kế hoạch đang dùng · Version 1/)).toBeVisible();
  await page.getByRole('button',{name:'Dàn ý mới',exact:true}).click();
  for(let i=0;i<25;i++)await page.getByRole('button',{name:'Thêm chương dự kiến'}).click();
  await page.getByLabel('Dán hoặc nhập dàn ý tương lai',{exact:true}).fill('Future outline only');
  await page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true}).fill('PlanPrivateOnly');
  await page.getByLabel('Mục tiêu chương 1',{exact:true}).fill('Find Minh');await page.getByRole('button',{name:'Thêm sự kiện chương 8',exact:true}).click();await page.getByLabel('Sự kiện 1 chương 8',{exact:true}).fill('Planned betrayal');
  await page.getByRole('button',{name:'Lưu bản nháp dàn ý',exact:true}).click();await expect(page.getByText(/Đã lưu phiên bản dàn ý/)).toBeVisible();
  assert.equal(submitted.objectives.length,25);const first=submitted.objectives[0].objective_id;
  await page.getByRole('button',{name:'Xuống chương 1',exact:true}).click();await page.getByRole('button',{name:'Xóa chương 25',exact:true}).click();
  conflict=true;await page.getByRole('button',{name:'Lưu bản nháp dàn ý',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'PLAN_VERSION_CONFLICT'})).toBeVisible();
  assert.equal(submitted.objectives[1].objective_id,first);const count=requests;await page.waitForTimeout(150);assert.equal(requests,count);
  conflict=false;await page.getByRole('button',{name:'Tải lại dàn ý',exact:true}).click();await expect(page.getByLabel('Mục tiêu chương 1',{exact:true})).toHaveValue('Find Minh');
  await page.getByRole('button',{name:'Dùng bản đã lưu',exact:true}).click();await expect(page.getByText(/Đang dùng một phiên bản/)).toBeVisible();
  if(process.env.P203_SCREENSHOT)await page.screenshot({path:process.env.P203_SCREENSHOT,fullPage:true});
  delay=true;await page.getByRole('button',{name:'Lưu bản nháp dàn ý',exact:true}).click();await page.getByRole('button',{name:'Account B',exact:true}).click();
  await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('');release();await page.waitForTimeout(200);
  await expect(page.getByLabel('Dán hoặc nhập dàn ý tương lai',{exact:true})).toHaveValue('');await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('');
 }finally{release();await browser.close();await new Promise(r=>server.close(r));}
});

async function planReviewHarness(seed) {
 const bundle=await build({entryPoints:[fileURLToPath(new URL('fixtures/setup-foundation-fixture.tsx',import.meta.url))],bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"','process.env.NODE_ENV':'"test"'}});
 const server=createServer((req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url==='/app.css'?'.css':'.js'))?.contents);}res.end('<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});const page=await browser.newPage();
 const state=structuredClone(seed),calls=[],reads=[];let conflict=false;
 function projected(){const archived=new Set(state.plans.filter(p=>p.action==='delete').map(p=>p.source_plan_id));return {...state,plans:state.plans.map(p=>{const effective_status=p.action==='delete'?'tombstone':p.action==='skip'?'skipped':archived.has(p.plan_id)?'archived':p.status;const content=!['tombstone','skipped'].includes(effective_status);return {...p,effective_status,snapshot_status:p.snapshot_status??p.status,is_historical:p.plan_version!==state.head_version,can_save:content&&effective_status!=='archived'&&p.plan_version===state.head_version,can_activate:content&&effective_status!=='archived'&&!!p.objectives.length,can_fork:content,can_archive:content&&effective_status!=='archived'};})};}
 await page.route('**/api/v1/**',async route=>{
  const req=route.request();
  if(req.method()==='GET'){const data=projected();reads.push(structuredClone(data));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});}
  const b=req.postDataJSON();calls.push(b);
  if(conflict||b.expected_plan_version!==state.head_version)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'PLAN_VERSION_CONFLICT',message:'Changed'}})});
  const source=state.plans.find(p=>p.plan_id===b.source_plan_id);
  state.head_version++;
  if(b.action==='delete'&&state.active_plan_id===source.plan_id)state.active_plan_id=null;
  const record={plan_id:'review-'+state.head_version,plan_version:state.head_version,status:b.action==='delete'?'deleted':'draft',source_outline:b.source_outline??'',private_notes:b.private_notes??'',source_plan_id:b.source_plan_id,action:b.action,objectives:(b.objectives??[]).map(o=>{const {expected_intent_version,...v}=o;return {...v,intent_version:expected_intent_version+1};})};
  state.plans.push(structuredClone(record));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:record})});
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/?plan');
 return {page,state,calls,reads,setConflict:v=>{conflict=v;},close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}

function eventReviewSeed(){
 const ids=['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'];
 const events=[0,1,2].map(i=>({event_id:`20000000-0000-0000-0000-00000000000${i+1}`,text:['First','Middle','Last'][i],participants:i===1?[{entity_id:'30000000-0000-0000-0000-000000000001',name_hint:null}]:[{entity_id:null,name_hint:'Minh '+i}]}));
 return {head_version:1,active_plan_id:null,plans:[{plan_id:'source-1',plan_version:1,status:'draft',source_outline:'Future only',private_notes:'',action:'save',objectives:ids.map((id,i)=>({objective_id:id,intent_version:1,target_chapter:i+1,title:'Goal '+i,description:'',events:i===0?events:[],dependencies:i===1?[ids[0]]:[]}))}]};
}

test('F-01 event cards preserve exact IDs/participants through removal/edit/moves/save/reload/409 (mocked HTTP)',{timeout:180000},async()=>{
 const seed=eventReviewSeed(),original=seed.plans[0].objectives[0].events,chapter=seed.plans[0].objectives[0].objective_id;
 const h=await planReviewHarness(seed),{page}=h;
 const button=name=>page.getByRole('button',{name,exact:true});
 async function save(){const n=h.calls.length;await button('Lưu bản nháp dàn ý').click();await expect(page.getByRole('alert').filter({hasText:'Đã lưu phiên bản dàn ý'})).toBeVisible();assert.equal(h.calls.length,n+1);}
 try{
  await expect(page.getByLabel('Sự kiện 1 chương 1',{exact:true})).toHaveValue('First');
  await expect(page.getByText('Chưa xác định: Minh 0',{exact:true})).toBeVisible();
  await button('Xóa sự kiện 1 chương 1').click();
  await page.getByLabel('Sự kiện 2 chương 1',{exact:true}).fill('Last edited');
  await button('Lên sự kiện 2 chương 1').click();await button('Xuống sự kiện 1 chương 1').click();await button('Lên sự kiện 2 chương 1').click();
  await button('Xuống chương 1').click();await button('Thêm sự kiện chương 2').click();
  await page.getByLabel('Sự kiện 3 chương 2',{exact:true}).fill('New unsaved');await page.getByLabel('Sự kiện 3 chương 2',{exact:true}).fill('');await page.getByLabel('Sự kiện 3 chương 2',{exact:true}).fill('New D');
  await save();const saved=h.calls.at(-1),events=saved.objectives.find(o=>o.objective_id===chapter).events;
  assert.deepEqual(events.slice(0,2),[{...original[2],text:'Last edited'},original[1]]);
  const d=events[2];assert.ok(!original.some(e=>e.event_id===d.event_id));assert.deepEqual(d.participants,[]);
  assert.deepEqual(saved.objectives[0].dependencies,[chapter]);
  assert.deepEqual(h.reads.at(-1).plans.at(-1).objectives.find(o=>o.objective_id===chapter).events,events);
  await page.reload();await expect(page.getByLabel('Sự kiện 3 chương 2',{exact:true})).toHaveValue('New D');
  if(process.env.P203_FIX_EVENT_SCREENSHOT)await page.screenshot({path:process.env.P203_FIX_EVENT_SCREENSHOT,fullPage:true});
  await button('Xóa sự kiện 2 chương 2').click();await button('Thêm sự kiện chương 2').click();await page.getByLabel('Sự kiện 3 chương 2',{exact:true}).fill('Discarded E');
  h.setConflict(true);await button('Lưu bản nháp dàn ý').click();await expect(page.getByRole('alert').filter({hasText:'PLAN_VERSION_CONFLICT'})).toBeVisible();
  const discarded=h.calls.at(-1).objectives.find(o=>o.objective_id===chapter).events[2].event_id;
  h.setConflict(false);await button('Tải lại dàn ý').click();await expect(page.getByLabel('Sự kiện 2 chương 2',{exact:true})).toHaveValue('Middle');
  await button('Xóa sự kiện 2 chương 2').click();await page.getByLabel('Sự kiện 2 chương 2',{exact:true}).fill('New D edited');
  await button('Thêm sự kiện chương 2').click();await page.getByLabel('Sự kiện 3 chương 2',{exact:true}).fill('New F');await save();
  const final=h.calls.at(-1).objectives.find(o=>o.objective_id===chapter).events;
  assert.deepEqual(final.slice(0,2),[events[0],{...d,text:'New D edited'}]);
  assert.ok(![...original.map(e=>e.event_id),d.event_id,discarded].includes(final[2].event_id));
  assert.deepEqual(h.reads.at(-1).plans.at(-1).objectives.find(o=>o.objective_id===chapter).events,final);
  await page.reload();await expect(page.getByLabel('Sự kiện 3 chương 2',{exact:true})).toHaveValue('New F');await save();
  assert.deepEqual(h.calls.at(-1).objectives.find(o=>o.objective_id===chapter).events,final);
 }finally{await h.close();}
});

test('F-02 archived source is read-only and restore requires an explicit fork API call (mocked HTTP)',{timeout:180000},async()=>{
 const h=await planReviewHarness(eventReviewSeed()),{page}=h;
 try{
  await page.getByRole('button',{name:'Lưu trữ bản kế hoạch',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Đã lưu trữ bản đã chọn'})).toBeVisible();
  assert.equal(h.calls.at(-1).action,'delete');assert.equal(h.calls.at(-1).source_plan_id,'source-1');
  await page.reload();await expect(page.getByText(/Biên nhận lưu trữ · chỉ đọc/)).toBeVisible();
  const select=page.getByRole('textbox',{name:'Phiên bản đã lưu',exact:true});await select.click();await page.getByRole('option',{name:'v1 · archived · lịch sử',exact:true}).click();
  await expect(page.getByText(/Bản đã lưu trữ · chỉ đọc/)).toBeVisible();await expect(page.getByLabel('Dán hoặc nhập dàn ý tương lai',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Dùng bản đã lưu',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Lưu bản nháp dàn ý',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Lưu trữ bản kế hoạch',exact:true})).toHaveCount(0);
  if(process.env.P203_FIX_ARCHIVE_SCREENSHOT)await page.screenshot({path:process.env.P203_FIX_ARCHIVE_SCREENSHOT,fullPage:true});
  const count=h.calls.length;await page.getByRole('button',{name:'Khôi phục thành bản nháp mới',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Đã lưu phiên bản dàn ý'})).toBeVisible();assert.equal(h.calls.length,count+1);
  assert.equal(h.calls.at(-1).action,'fork');assert.equal(h.calls.at(-1).expected_plan_version,2);assert.equal(h.calls.at(-1).source_plan_id,'source-1');
  assert.equal(h.reads.at(-1).plans[0].effective_status,'archived');assert.equal(h.reads.at(-1).plans.at(-1).effective_status,'draft');
  await expect(page.getByLabel('Dán hoặc nhập dàn ý tương lai',{exact:true})).toBeEnabled();
 }finally{await h.close();}
});
