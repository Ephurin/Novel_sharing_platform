"""Read/reviewable bounded P3 negative probes; no direct business SQL writes."""
from concurrent.futures import ThreadPoolExecutor
import json,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
base=Path(__file__).resolve().parent
m=json.loads((base/'final-p3-existing-environment.json').read_text(encoding='utf-8'))
results=[]
def setup(name):
 p=NextProbe(m['env_file'],base/'P3-negative'/name);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');p.setup()
 j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'})
 p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
 return p
def plan(p,title):
 d=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':title,'description':'Bounded negative probe','target_chapter':1,'objective_type':'ending','metadata':{'min_words':1,'is_terminal':True}}]})
 p.api('POST','/ai/story-plans/'+d['plan_id']+'/activate',{'novel_id':p.novel});return d
def create(p,planid=None):
 body={'novel_id':p.novel,'max_iterations':3,'max_retries_per_objective':2,'idempotency_key':uuid.uuid4().hex}
 if planid:body['plan_id']=planid
 return p.api('POST','/ai/autonomous/runs',body)
def finish(p,name,verdict,details):
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'case':name,'verdict':verdict,'details':details,'external_provider_calls':0})
 results.append({'case':name,'verdict':verdict,'details':details})
# Actual missing-ending fake plan must be refused before a controller is created.
p=setup('invalid-plan')
try:
 p.command(p.compose+['exec','-T','fake-upstream','python','-c',"from pathlib import Path;Path('/evidence/p3-invalid-plan').touch()"])
 response=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel},expected=(422,))
 finish(p,'invalid_plan','PASS',{'HTTP':422,'response':response,'run_count':p.sql("select count(*) from narrative.autonomous_runs where novel_id='"+p.novel+"'")})
finally:p.command(p.compose+['exec','-T','fake-upstream','python','-c',"from pathlib import Path;Path('/evidence/p3-invalid-plan').unlink(missing_ok=True)"])
# Bounded upstream 500 retry, no immutable AI acceptance or canon advancement.
p=setup('provider-500');d=plan(p,'fault:500 P3 provider failure');r=create(p,d['plan_id']);before=p.read_memory()
a=p.api('POST','/ai/autonomous/runs/'+r['run_id']+'/step',{});b=p.api('POST','/ai/autonomous/runs/'+r['run_id']+'/step',{})
assert b['status']=='failed' and p.read_memory()==before
finish(p,'provider_500_bounded_retry','PASS',{'first':a,'second':b,'accepted_count':p.sql("select count(*) from chapter_revisions where novel_id='"+p.novel+"' and source_type='AI_DRAFT_ACCEPT'")})
# Same-owner cross-novel plan cannot be attached to another novel.
p=setup('cross-novel-plan');d=plan(p,'Owned plan');other=p.api('POST','/novels',{'title':'Other owned novel','synopsis':'Cross-novel negative'})['novelId']
p.api('POST','/ai/autonomous/runs',{'novel_id':other,'plan_id':d['plan_id']},expected=(404,));finish(p,'cross_novel_plan','PASS',{'HTTP':404})
# Two concurrent steps + author skips objective while fake generation is in flight.
p=setup('inflight-objective');d=plan(p,'fault:timeout P3_INFLIGHT');r=create(p,d['plan_id']);rid=r['run_id'];before=p.read_memory()
def step():
 response=p.http.post(p.base+'/ai/autonomous/runs/'+rid+'/step',json={},timeout=65)
 return {'status':response.status_code,'response':response.json()}
with ThreadPoolExecutor(2) as pool:
 future=pool.submit(step)
 seen=False
 for _ in range(100):
  captures=p.http.get(p.base.removesuffix('/api/v1')+'/received',timeout=5).json()
  if any('P3_INFLIGHT' in c.get('prompt_text','') and c.get('operation')=='writing_generation' for c in captures):seen=True;break
  time.sleep(.01)
 assert seen,'inflight receipt not observed'
 competing=pool.submit(step)
 mutation=p.api('PATCH','/ai/story-plans/'+d['plan_id']+'/objectives/'+d['objectives'][0]['objective_id'],{'novel_id':p.novel,'status':'skipped'})
 first=future.result();second=competing.result()
p.save('inflight-receipts',{'first':first,'second':second,'mutation':mutation})
accepted=json.loads(p.sql("select coalesce(json_agg(t),'[]') from chapter_revisions t where novel_id='"+p.novel+"' and source_type='AI_DRAFT_ACCEPT'"))
p.save('accepted-after-objective-skipped',accepted)
current=p.api('GET','/ai/story-plans/'+d['plan_id']);p.save('plan-after-mutation',current)
violated=bool(accepted) and current['objectives'][0]['status']=='skipped'
finish(p,'inflight_objective_fence','EXPECTED_RED' if violated else 'PROTECTED',{'accepted_revision_count':len(accepted),'objective_status':current['objectives'][0]['status'],'step_statuses':[first['status'],second['status']],'canon_unchanged':p.read_memory()==before})
# Restart the controller at the durable human checkpoint, then explicitly stop it.
pre=p.api('GET','/ai/autonomous/runs/'+rid);p.command(p.compose+['restart','backend'])
for _ in range(80):
 try:post=p.api('GET','/ai/autonomous/runs/'+rid);break
 except Exception:time.sleep(.3)
else:raise RuntimeError('Restart timeout')
p.save('checkpoint-restart',{'before':pre,'after':post})
stopped=p.api('POST','/ai/autonomous/runs/'+rid+'/stop',{'reason':'Bounded negative test complete'})
again=p.api('POST','/ai/autonomous/runs/'+rid+'/step',{})
assert stopped['status']=='stopped' and again['status']=='stopped'
p.save('stop-terminal',{'stop':stopped,'replay':again})
(base/'P3-negative/validation.json').write_text(json.dumps({'tested_sha':p.source_sha,'cases':results,'verdict':'PARTIAL_BLOCKED_INFLIGHT_OBJECTIVE_FENCE' if violated else 'BOUNDED_NEGATIVE_CHECKS_PASS'},indent=2)+'\n',encoding='utf-8')
print(json.dumps(results))
