"""Deterministic HTTP two-version race against instrumented real Mongo/PG backend."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys,time
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter

def run(env,output,protected=False):
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-next.yml');p.setup()
 fixture=parse_fixture_chapter(1)
 cid=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Ordered writer','content':fixture['body']})['chapterId']
 p.api('POST','/chapters/'+cid+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'});r=p.latest(cid)
 p.api('POST',p.brain+'/entity-guidance',{'expected_version':0,'entries':[{'name':'Mai Linh'}]})
 job=p.api('POST','/ai/story-brains/bootstrap/from-manuscript',{'novel_id':p.novel,'revisions':[{'chapter_id':cid,'revision_id':r['revisionId'],'content_hash':r['contentHash']}]})
 p.wait_job(job['job_id'],{'waiting_entity_review'});p.review(p.wait_review(r['revisionId']));p.api('POST','/ai/jobs/'+job['job_id']+'/resume',{});p.wait_job(job['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':job['job_id']})
 def state():
  return {'chapter':p.api('GET','/chapters/'+cid),'latest':p.latest(cid),'outbox':json.loads(p.sql("select coalesce(json_agg(t),'[]') from revision_outbox_events t where chapter_id='"+cid+"'"))}
 initial=state();p.save('initial',initial)
 script="require('fs').writeFileSync('/tmp/p123-ordered-config.json',JSON.stringify({chapterId:process.argv[1]}))"
 p.command(p.compose+['exec','-T','backend','node','-e',script,cid])
 def patch(body,version):
  response=p.http.patch(p.base+'/chapters/'+cid,json={'content':body,'expectedVersion':version},timeout=60)
  return {'status':response.status_code,'response':response.json()}
 version=initial['chapter']['draft']['version']
 with ThreadPoolExecutor(2) as pool:
  a=pool.submit(patch,'P1_ORDERED_A_ body',version)
  for _ in range(100):
   exists=p.command(p.compose+['exec','-T','backend','node','-e',"console.log(require('fs').existsSync('/tmp/p123-ordered-paused'))"])
   if exists=='true':break
   time.sleep(.05)
  else:raise RuntimeError('A did not pause after CAS')
  paused=p.api('GET','/chapters/'+cid);p.save('A-after-CAS',paused)
  b=patch('P1_ORDERED_B_ newer body',paused['draft']['version']);p.save('B-before-A-release',{'result':b,'state':state()})
  p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').writeFileSync('/tmp/p123-ordered-release','release')"])
  ar=a.result()
 if protected:
  assert b['status']==409,b
  b=patch('P1_ORDERED_B_ newer body',p.api('GET','/chapters/'+cid)['draft']['version'])
 p.save('HTTP-results',{'A':ar,'B':b})
 final=state();p.save('final',final)
 p.command(p.compose+['restart','backend','ai-service'])
 for _ in range(60):
  try: after=state();break
  except Exception:time.sleep(.3)
 else:raise RuntimeError('Restart unavailable')
 p.save('after-restart',after);p.save('gateway-ledger',p.ledger())
 safe=final['chapter']['draft']['content']=='P1_ORDERED_B_ newer body' and final['latest']['content']=='P1_ORDERED_B_ newer body'
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'A_status':ar['status'],'B_status':b['status'],'safe':safe,'verdict':'PASS' if safe else 'EXPECTED_RED','protected':protected,'external_provider_calls':0})
 print(json.dumps({'safe':safe,'A_status':ar['status'],'B_status':b['status']}))
 return 0 if safe else 1
if __name__=='__main__':raise SystemExit(run(sys.argv[1],sys.argv[2],'--protected' in sys.argv[3:]))
