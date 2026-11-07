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
