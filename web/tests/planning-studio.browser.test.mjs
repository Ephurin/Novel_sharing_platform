import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';

// Actual Vite main.tsx -> app/router.tsx -> AuthGate -> AuthorWritingIde.
// Only HTTP is recorded/faked; this suite does not claim browser-to-database E2E.
test('mounted /author/ide planning journey, recoverable CAS drafts, real Writer transition and scope isolation (HTTP mocks)',{timeout:240000},async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
 const server=await createServer({root,define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify('/api/v1')},server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('dialog',d=>d.accept());
 const origin=server.resolvedUrls.local[0];
 const out=process.env.P205_EVIDENCE_DIR; if(out)await mkdir(out,{recursive:true});
 const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='20000000-0000-0000-0000-000000000001';
 let setup=null,active=false,m0Conflict=true,first=null,planConflict=false,createFailure=true;
 let gateSummary=false,summaryWaiting=false,releaseSummary;const summaryGate=new Promise(resolve=>{releaseSummary=resolve;});
 let plans={head_version:0,active_plan_id:null,plans:[]},chapter=null;
 const writes=[],errors=[],recoveryTrace=[];page.on('pageerror',e=>errors.push(e.message));
 const novel=id=>({novelId:id,authorId:'author-A',title:id===A?'Bầu trời An Thành':'Other novel',slug:'offline',synopsis:'',status:'DRAFT',genres:[],chaptersCount:chapter?1:0});
 await page.addInitScript(()=>{localStorage.setItem('ephurin_access_token','token-author-A');});
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1',''),method=req.method(),actor=req.headers().authorization;
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data,meta:{totalPages:1}})});
  const fail=(code,status=409)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message:code}})});
  const body=method==='POST'||method==='PATCH'?req.postDataJSON():null;
  if(body)writes.push({path,method,actor,body:path.startsWith('/auth/')?{redacted:true}:body});
  if(path==='/auth/login')return send({accessToken:'token-author-A',user:{userId:'author-A',username:'A',email:'a@example.test',role:'AUTHOR',status:'ACTIVE'}});
  if(path==='/auth/me')return send({userId:'author-A',username:'offline',email:'offline@example.test',role:'AUTHOR',status:'ACTIVE'});
  if(path==='/novels/me')return send([novel(A),novel(B)]);
  if(path===`/novels/${A}`||path===`/novels/${B}`)return send(novel(path.endsWith(A)?A:B));
  if(actor!=='Bearer token-author-A'||path.includes(B)){
   if(path.endsWith('/chapters'))return send([]);
   if(path.includes('edit-v1'))return send({head_version:0,active_plan_id:null,plans:[]});
   return fail('NOT_FOUND',404);
  }
  if(path===`/novels/${A}/chapters`){
   if(method==='GET')return send(chapter?[chapter]:[]);
   if(createFailure){createFailure=false;return fail('OFFLINE_CREATE_RETRY',503);}
   chapter={chapterId:C,novelId:A,chapterNumber:1,title:body.title,content:'',wordCount:0,isVip:false,priceCoins:0,status:'DRAFT',draftVersion:0,updatedAt:new Date().toISOString()};return send(chapter,201);
  }
  if(path===`/chapters/${C}`){if(method==='PATCH'){chapter={...chapter,...body,draftVersion:(chapter.draftVersion??0)+1};first={revision_id:crypto.randomUUID(),chapter_id:C,content_hash:'c'.repeat(64),chapter_number:1};}return send(chapter);}
  if(path.includes('/writing/drafts'))return send({job:null});
  if(path===`/ai/story-brains/by-novel/${A}`)return setup?send({id:setup.job_id,novel_id:A,status:active?'active':'draft',brain_version:setup.brain_version,baseline_revision_id:null,counts:{entities:active?2:0,events:0,pending_proposals:setup.review?0:setup.proposals.length,open_findings:0}}):fail('NOT_FOUND',404);
  if(path===`/ai/story-brains/${A}/setup`)return setup?send(setup):fail('SETUP_NOT_FOUND',404);
  if(path==='/ai/story-brains/bootstrap/from-idea'){
   const id=crypto.randomUUID();setup={contract_version:'setup-v1',novel_id:A,snapshot_id:id,job_id:id,setup_version:(setup?.setup_version??0)+1,brain_version:1,review_version:0,setup_hash:'a'.repeat(64),text_hash:'b'.repeat(64),mode:body.mode,job_status:'waiting_review',snapshot:body.setup,outline:body.outline,proposals:[],approved_identities:[]};
   setup.proposals=[...body.setup.declarations.map(d=>({proposal_id:crypto.randomUUID(),dependency_group_id:id,card_type:'entity',status:'pending',origin:'author_declared',source_kind:'author_setup',source_refs:[{field_path:'/setup/declarations',declaration_id:d.declaration_id}],payload:{canonical_name:d.display_name,entity_type:d.entity_type},expected_brain_version:1})),...body.setup.world_rules.map(r=>({proposal_id:crypto.randomUUID(),dependency_group_id:id,card_type:'world_rule',status:'pending',origin:'author_declared',source_kind:'author_setup',source_refs:[{field_path:'/setup/world_rules',declaration_id:r.declaration_id}],payload:{fact_key:r.declaration_id,fact_value:r.text},expected_brain_version:1}))];
   return send({job_id:id,status:'waiting_review'},202);
  }
  if(path.endsWith('/review')){setup.review={status:'review_complete',activation_available:false};setup.review_version=1;setup.brain_version=2;setup.proposals=setup.proposals.map(c=>{const d=body.decisions.find(x=>x.proposal_id===c.proposal_id);return{...c,status:d.decision==='accept'?'accepted':'rejected',reviewed_payload:d.edited_entity??d.edited_rule};});return send(setup.review);}
  if(path.endsWith('/activate')&&path.includes('/setup/')){
   if(method==='POST'){if(m0Conflict)return fail('M0_VERSION_CONFLICT');active=true;setup.job_status='completed';return send({status:'active',baseline_kind:'M0',brain_version:3});}
   return send(active?{contract_version:'setup-m0-v1',eligible:false,reason:'M0_ALREADY_ACTIVE',activation:{status:'active',baseline_kind:'M0',brain_version:3},first_saved_revision:first}:{contract_version:'setup-m0-v1',eligible:!!setup.review,reason:setup.review?null:'M0_SETUP_NOT_REVIEWED',setup_hash:setup.setup_hash,expected_setup_version:setup.setup_version,expected_review_version:setup.review_version,expected_brain_version:setup.brain_version});
  }
  if(path===`/ai/story-plans/edit-v1/${A}`){
   if(method==='GET')return send(plans);
   if(planConflict)return fail('PLAN_VERSION_CONFLICT');
   const id=crypto.randomUUID();const p={plan_id:id,plan_version:++plans.head_version,status:body.action==='activate'?'active':body.action==='skip'?'skipped':body.action==='delete'?'deleted':'draft',effective_status:body.action==='delete'?'tombstone':body.action==='skip'?'skipped':'draft',source_outline:body.source_outline??'',private_notes:body.private_notes??'',objectives:(body.objectives??[]).map(o=>({...o,intent_version:(o.expected_intent_version??0)+1})),action:body.action,can_save:body.action==='save'||body.action==='fork',can_fork:body.action==='save'||body.action==='fork',can_activate:body.action==='save'||body.action==='fork',can_archive:body.action==='save'||body.action==='fork'};
   plans.plans=plans.plans.map(old=>({...old,can_save:false,is_historical:true}));plans.plans.push(p);if(body.action==='activate')plans.active_plan_id=id;if(body.action==='skip')plans.active_plan_id=null;return send(p);
  }
  if(path.includes('extraction-status')){if(gateSummary){summaryWaiting=true;await summaryGate;}return send(first?[{chapter_id:C,chapter_number:1,status:'waiting_entity_review'}]:[]);}
  return send([]);
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 const step=name=>({click:async()=>{const target=page.getByRole('navigation',{name:'Các bước lập kế hoạch'}).getByRole('button',{name:new RegExp(name)});await target.click();await expect(target).toHaveAttribute('aria-current','step');await expect(page.getByRole('region',{name:'Planning Studio',exact:true})).toHaveAttribute('aria-busy','false');}});
 const choose=async(label,value)=>{await page.getByRole('textbox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();};
 try{
  await page.goto(origin+'author/ide?novelId='+A,{waitUntil:'domcontentloaded',timeout:90000});
  await button('Lập kế hoạch').click();await expect(page.getByRole('region',{name:'Planning Studio'})).toBeVisible();
  await expect(page.getByText('Chưa kích hoạt thiết lập',{exact:true})).toBeVisible();
  assert.equal(writes.length,0);
  await page.getByLabel('Ý tưởng & hướng đi (tương lai)',{exact:true}).fill('An Thành và bầu trời bị phong ấn');
  await step('Thế giới').click();await button('Thêm quy tắc').click();await page.getByLabel('Quy tắc 1',{exact:true}).fill('Không ai bay được');
  await step('Nhân vật').click();for(let i=1;i<=2;i++){await button('Thêm nhân vật hoặc địa danh').click();await page.getByLabel('Tên '+i,{exact:true}).fill('Minh');}
  await step('Ý tưởng').click();await expect(page.getByLabel('Ý tưởng & hướng đi (tương lai)',{exact:true})).toHaveValue('An Thành và bầu trời bị phong ấn');
  assert.equal(writes.length,0,'typing/navigation must not mutate server');
  await page.reload();await button('Lập kế hoạch').click();await button('Khôi phục thiết lập').click();
  await step('Nhân vật').click();await expect(page.getByLabel('Tên 2',{exact:true})).toHaveValue('Minh');
  await button('Lưu và xử lý thiết lập').click();await expect(page.getByText('Tác giả khai báo',{exact:true})).toHaveCount(2);
  const submit=writes.find(w=>w.path.endsWith('/from-idea')).body;
  assert.notEqual(submit.setup.declarations[0].declaration_id,submit.setup.declarations[1].declaration_id);assert.equal(submit.setup.text,'');assert.equal(submit.mode,'extract');
  await expect(page.getByLabel('Tên 1',{exact:true})).toBeDisabled();
  for(let i=1;i<=3;i++){await choose('Quyết định thẻ '+i,'Duyệt');if(i<3)await choose('Danh tính thẻ '+i,'Tạo danh tính mới (ID server)');}
  await page.getByLabel('Nội dung thẻ 1',{exact:true}).fill('Minh phía Đông');await button('Lưu quyết định toàn nhóm').click();
  await expect(page.getByText('Đã duyệt',{exact:true})).toHaveCount(2);
  const activate=button('Kích hoạt thiết lập để bắt đầu viết');await expect(activate).toBeEnabled();await activate.click();await expect(page.getByRole('alert').filter({hasText:'Thiết lập đã thay đổi.'})).toBeVisible();
  m0Conflict=false;await button('Tải bản đã lưu').click();await activate.click();await expect(page.getByText(/Thiết lập đã được kích hoạt/)).toBeVisible();
  await step('Ý tưởng').click();if(out)await page.screenshot({path:join(out,'planning-wide.png'),fullPage:true});
  await step('Dàn ý chương').click();await button('Lưu bản nháp dàn ý').click();await expect(page.getByText(/Đã lưu phiên bản dàn ý/)).toBeVisible();
  assert.equal(writes.filter(w=>w.path.includes('edit-v1')).at(-1).body.objectives.length,0);
  for(const size of [5,10,20]){await button('Dàn ý mới').click();await choose('Số chương khởi đầu',String(size));await button(`Thêm ${size} thẻ chương`).click();await button('Lưu bản nháp dàn ý').click();await expect(page.getByText(/Đã lưu phiên bản dàn ý/)).toBeVisible();assert.equal(writes.filter(w=>w.path.includes('edit-v1')).at(-1).body.objectives.length,size);}
  await button('Dàn ý mới').click();await choose('Số chương khởi đầu','20');await button('Thêm 20 thẻ chương').click();await choose('Số chương khởi đầu','5');await button('Thêm 5 thẻ chương').click();
  await page.getByLabel('Tiêu đề chương 1',{exact:true}).fill('Gặp Minh');await button('Thêm sự kiện chương 1').click();await page.getByLabel('Sự kiện 1 chương 1',{exact:true}).fill('Tương lai gặp nhau');await button('Thêm người tham gia sự kiện 1 chương 1').click();await page.getByLabel('Người tham gia 1 sự kiện 1 chương 1',{exact:true}).fill('Minh chưa xác định');
  const count=writes.length;await page.waitForTimeout(1300);assert.equal(writes.length,count,'no per-keystroke POST');
  await button('Lưu bản nháp dàn ý').click();await expect(page.getByText(/Đã lưu phiên bản dàn ý/)).toBeVisible();
  const saved=writes.filter(w=>w.path.includes('edit-v1')).at(-1).body;assert.equal(saved.objectives.length,25);
  await button('Xuống chương 1').click();planConflict=true;await button('Lưu bản nháp dàn ý').click();await expect(page.getByRole('alert').filter({hasText:'PLAN_VERSION_CONFLICT'})).toBeVisible();
  await button('Tải lại dàn ý').click();await expect(page.getByLabel('Tiêu đề chương 2',{exact:true})).toHaveValue('Gặp Minh');
  const attempted=writes.filter(w=>w.path.includes('edit-v1')).at(-1).body;assert.equal(attempted.objectives[1].objective_id,saved.objectives[0].objective_id);assert.deepEqual(attempted.objectives[1].events,saved.objectives[0].events);
  await page.reload();await button('Lập kế hoạch').click();await step('Dàn ý chương').click();await button('Khôi phục bản sửa dàn ý').click();await expect(page.getByLabel('Tiêu đề chương 2',{exact:true})).toHaveValue('Gặp Minh');
  await button('Dùng bản máy chủ, bỏ bản sửa').click();planConflict=false;await expect(page.getByLabel('Tiêu đề chương 1',{exact:true})).toHaveValue('Gặp Minh');
  await step('Bắt đầu viết').click();assert.equal(writes.filter(w=>w.path.endsWith('/chapters')).length,0);
  await button('Tạo bản nháp chương mới').click();await expect(page.getByText(/OFFLINE_CREATE_RETRY/)).toBeVisible();await button('Tạo bản nháp chương mới').click();
  await expect(page.getByPlaceholder('Bắt đầu câu từ chương truyện của bạn tại đây...')).toBeEditable();
  const creates=writes.filter(w=>w.path.endsWith('/chapters'));assert.equal(creates.length,2);assert.equal(creates[0].body.clientRequestId,creates[1].body.clientRequestId);assert.equal(creates[1].body.content,'');
  await page.getByPlaceholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill('Minh bước vào An Thành.');
  await button('Lập kế hoạch').click();assert.ok(writes.some(w=>w.method==='PATCH'&&w.body.content==='Minh bước vào An Thành.'));
  await button('Đọc trạng thái mới').click();await expect(page.getByText(/Đã xác minh bản lưu đầu tiên/)).toBeVisible();
  await page.setViewportSize({width:390,height:844});await step('Ý tưởng').click();
  await expect(page.getByRole('navigation',{name:'Các bước lập kế hoạch'})).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');
  await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'BODY');
  if(out)await page.screenshot({path:join(out,'planning-mobile.png'),fullPage:true});
  // Same author, different novel: local private plan edits are scoped and recoverable.
  await step('Dàn ý chương').click();assert.ok(await page.getByRole('region',{name:'Planning Studio',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth+1),'mobile Chapter Board must fit its scroll container');if(out)await page.screenshot({path:join(out,'planning-board-mobile.png'),fullPage:true});await page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true}).fill('DevicePrivateOnly');
  async function probe(phase){const state=await page.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key)??'null');return {url:location.href,cached:!!d,cachedNoteMatches:d?.value?.notes==='DevicePrivateOnly',cachedHead:d?.value?.head};},`ephurin-planning:author-A:${A}:plan`);recoveryTrace.push({phase,...state});return state;}
  assert.equal((await probe('before-leave-A')).cachedNoteMatches,true,'note must be backed up before navigating');
  await page.evaluate(async id=>{const {router}=await import('/src/app/router.tsx');await router.navigate('/author/ide?novelId='+id);},B);
  await expect(page.getByText('Phòng lập kế hoạch · Other novel',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toBeEnabled();
  await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('');
  await probe('in-B');gateSummary=true;
  await page.evaluate(async id=>{const {router}=await import('/src/app/router.tsx');await router.navigate('/author/ide?novelId='+id);},A);
  await expect(page.getByText('Phòng lập kế hoạch · Bầu trời An Thành',{exact:true})).toBeVisible();
  assert.equal((await probe('back-A-before-recovery')).cachedNoteMatches,true);
  await expect.poll(()=>summaryWaiting).toBe(true);
  await expect(page.getByRole('region',{name:'Planning Studio',exact:true})).toHaveAttribute('aria-busy','true');
  assert.equal(await button('Khôi phục bản sửa dàn ý').evaluate(b=>!!b.closest('[inert]')),true,'recovery must wait for initial owner-scoped summary');
  releaseSummary();await button('Khôi phục bản sửa dàn ý').click();await probe('after-recovery');await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('DevicePrivateOnly');
  assert.ok(!writes.some(w=>JSON.stringify(w.body).includes('DevicePrivateOnly')),'local private edits never dispatched without Save');
  // Account switching uses actual AuthGate/store; old local edits never populate B.

  await page.evaluate(async()=>{const {useAuthStore}=await import('/src/features/auth/useAuthStore.ts');useAuthStore.getState().setSession({accessToken:'token-author-B',user:{userId:'author-B',role:'AUTHOR',username:'B',email:'b@example.test',status:'ACTIVE'}});});
  await step('Ý tưởng').click();await expect(page.getByLabel('Ý tưởng & hướng đi (tương lai)',{exact:true})).toHaveValue('');await step('Dàn ý chương').click();await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('');
  await page.evaluate(async()=>{const {useAuthStore}=await import('/src/features/auth/useAuthStore.ts');useAuthStore.getState().clearSession();});await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email or username',{exact:true}).fill('offline-author');await page.getByLabel('Password',{exact:true}).fill('offline-test-only');await button('Login').click();await expect(page).toHaveURL(/\/author$/);
  await page.evaluate(async id=>{const {router}=await import('/src/app/router.tsx');await router.navigate('/author/ide?novelId='+id);},A);
  await button('Lập kế hoạch').click();await step('Dàn ý chương').click();await button('Khôi phục bản sửa dàn ý').click();await expect(page.getByLabel('Ghi chú kế hoạch riêng tư',{exact:true})).toHaveValue('DevicePrivateOnly');
  assert.equal(errors.length,0,errors.join('\n'));
  if(out)await writeFile(join(out,'mounted-readback.json'),JSON.stringify({route:page.url(),label:'Chromium actual app + HTTP mocks, not DB E2E',writes,errors},null,2));
 }catch(e){console.error('UI_DIAGNOSTIC',{url:page.url(),errors,recoveryTrace});if(out)await page.screenshot({path:join(out,'failure.png'),fullPage:true});throw e;}finally{releaseSummary();await browser.close();await server.close();}
});
