"""Inverse logical ordering with the same deterministic test-only CAS barrier."""
from concurrent.futures import ThreadPoolExecutor
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter
base=Path(__file__).resolve().parent;m=json.loads((base/'final-writer-environment.json').read_text(encoding='utf-8'))
p=NextProbe(m['env_file'],base/'inverse-order');p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-next.yml');p.setup()
cid=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Inverse order','content':parse_fixture_chapter(1)['body']})['chapterId']
p.api('POST','/chapters/'+cid+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'});r=p.latest(cid)
p.api('POST',p.brain+'/entity-guidance',{'expected_version':0,'entries':[{'name':'Mai Linh'}]})
j=p.api('POST','/ai/story-brains/bootstrap/from-manuscript',{'novel_id':p.novel,'revisions':[{'chapter_id':cid,'revision_id':r['revisionId'],'content_hash':r['contentHash']}]})
p.wait_job(j['job_id'],{'waiting_entity_review'});p.review(p.wait_review(r['revisionId']));p.api('POST','/ai/jobs/'+j['job_id']+'/resume',{});p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
setup="const fs=require('fs'); for(const f of ['p123-ordered-paused','p123-ordered-release']) fs.rmSync('/tmp/'+f,{force:true});fs.writeFileSync('/tmp/p123-ordered-config.json',JSON.stringify({chapterId:process.argv[1]}))"
p.command(p.compose+['exec','-T','backend','node','-e',setup,cid])
# A prefix is ONLY a test-hook marker; logical writer identity B is separate.
b_body='P1_ORDERED_A_B_FIRST';a_body='A logical newer body'
v=p.api('GET','/chapters/'+cid)['draft']['version']
def patch(text,version):
 response=p.http.patch(p.base+'/chapters/'+cid,json={'content':text,'expectedVersion':version},timeout=45)
 return {'status':response.status_code,'response':response.json()}
with ThreadPoolExecutor(1) as pool:
 future=pool.submit(patch,b_body,v)
 for _ in range(80):
  if p.command(p.compose+['exec','-T','backend','node','-e',"console.log(require('fs').existsSync('/tmp/p123-ordered-paused'))"])=='true':break
  time.sleep(.05)
 else:raise RuntimeError('B barrier timeout')
 paused=p.api('GET','/chapters/'+cid);blocked=patch(a_body,paused['draft']['version']);assert blocked['status']==409
 p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').writeFileSync('/tmp/p123-ordered-release','release')"])
 b=future.result();assert b['status']==200
v=p.api('GET','/chapters/'+cid)['draft']['version'];a=patch(a_body,v);assert a['status']==200
latest=p.latest(cid);draft=p.api('GET','/chapters/'+cid)
assert latest['content']==draft['draft']['content']==a_body
assert latest['parentRevisionId']==b['response']['data']['analysisRevisionId']
p.save('receipts',{'logical_first':'B','barrier_prefix_is_test_instrumentation_only':True,'B':b,'A_during_B':blocked,'A_after_reload':a,'latest':latest,'draft':draft})
p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'verdict':'PASS','logical_order':'B then A','newer_A_preserved':True})
print('Inverse logical order PASS')
