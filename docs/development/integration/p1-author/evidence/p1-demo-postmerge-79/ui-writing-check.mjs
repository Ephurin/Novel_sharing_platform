import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=process.env.P1_SOURCE_ROOT;
const {createHarness,until,hash}=await import(pathToFileURL(join(root,'web/tests/helpers/p1-real-stack.mjs')));
const {fixtures}=await import(pathToFileURL(join(root,'web/tests/helpers/p1-fixtures.mjs')));
const results=JSON.parse(await readFile(process.env.P1_CODEX_RESULTS,'utf8')).evidence;
const x=results['AX-E2E-01'], h=await createHarness(),f=fixtures(h),{page}=h;
h.secrets.add(process.env.QA_PASSWORD);
try {
 const email=(await h.sql('SELECT email FROM users WHERE user_id=$1',[x.authorId]))[0].email;
 await f.login({email,password:process.env.QA_PASSWORD});
 await page.goto(f.ide(x.novelId,x.chapterIds[3]));await f.editor().waitFor();await until(async()=>Boolean((await f.editor().inputValue()).trim()),'Saved chapter did not hydrate');
 // Browser token stays in its normal client storage; use independent DB reads instead of extracting it.
 const before=await h.sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1',[x.novelId]);
 const privateRow=(await h.sql('SELECT author_profile,private_author_notes FROM narrative.entities WHERE id=$1',[x.lamPhongEntityId]))[0];
 h.secrets.add(privateRow.private_author_notes);assert.ok(privateRow.private_author_notes);
 await page.getByRole('button',{name:/AI Hỗ trợ viết/}).click();
 await page.locator('#studio-ai-panel select').selectOption('bible');
 const instruction='Viết tiếp cảnh Lâm Phong bước đi trong sương sớm, giữ tính cách đã xác nhận trong hồ sơ.';
 await page.getByPlaceholder('Nhập yêu cầu phát triển tình tiết, miêu tả tâm lý nhân vật...',{exact:true}).fill(instruction);
 const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/ai/writing/generations')&&r.request().method()==='POST'),page.getByTitle('Gửi yêu cầu',{exact:true}).click()]);assert.equal(response.status(),202);const jobId=(await response.json()).data.job_id;
 let row;
 await until(async()=>{row=(await h.sql('SELECT job_id,status,context_summary FROM narrative.writing_generations WHERE job_id=$1',[jobId]))[0];return row&&['completed','failed'].includes(row.status);},'UI writing did not terminate');assert.equal(row.status,'completed');
 const verifier=`import sys,json,hashlib
p=json.load(sys.stdin)
rs=[json.loads(x) for x in open('/evidence/requests.jsonl') if x.strip()]
rs=[r for r in rs if p['instruction'] in r.get('prompt_text','') and 'Bối cảnh tiểu thuyết (Story Brain): ' in r.get('prompt_text','')]
assert len(rs)==1,'Natural UI request must have unique fake match'
r=rs[0];prompt=r['prompt_text'];part=prompt.split('Bối cảnh tiểu thuyết (Story Brain): ',1)[1]
for delim in ['\\nPhong cách văn phong (Style):','\\nRàng buộc bắt buộc (Constraints):','\\n\\n']:
 if delim in part:part=part.split(delim,1)[0]
c=json.loads(part.strip());entity=next(e for e in c['entities'] if e['entity_id']==p['entity_id'])
assert entity['approved_profile']['appearance']==p['appearance']
assert entity['approved_profile']['personality']==p['personality']
assert p['private_note'] not in prompt
print(json.dumps({'context_hash':hashlib.sha256(json.dumps(c,ensure_ascii=False,sort_keys=True,separators=(',',':'),default=str).encode()).hexdigest(),'request_sha256':r['request_sha256'],'profile_present':True,'private_note_excluded':True}))`;
 const verified=spawnSync('docker',['exec','-i',h.v.WAVE1D_PROJECT+'-fake-upstream-1','python','-c',verifier],{input:JSON.stringify({instruction,entity_id:x.lamPhongEntityId,appearance:privateRow.author_profile.appearance,personality:privateRow.author_profile.personality,private_note:privateRow.private_author_notes}),encoding:'utf8'});
 assert.equal(verified.status,0,verified.stderr);const proof=JSON.parse(verified.stdout);assert.equal(proof.context_hash,row.context_summary.context_hash);
 await page.getByRole('button',{name:'Từ chối / Bỏ qua',exact:true}).waitFor();await h.shot('ui-writing-fake-result');
 await page.getByRole('button',{name:'Từ chối / Bỏ qua',exact:true}).click();
 assert.deepEqual(await h.sql('SELECT brain_version FROM narrative.story_brains WHERE novel_id=$1',[x.novelId]),before);
 await h.save('ui-writing-proof.json',{job_id:jobId,novel_id:x.novelId,chapter_id:x.chapterIds[3],...proof,persisted_hash_matches:true,natural_instruction_no_correlation_marker:true,no_separate_preview_button:true,completed_draft_rejected:true,brain_version_unchanged:true});
 console.log('PASS: actual UI generation -> fake prompt -> exact persisted job/context hash; private note excluded');
}catch(error){await h.shot('failure');await h.save('failure-dom.json',{text:await page.locator('body').innerText()});throw error;}finally{await h.finish();}
