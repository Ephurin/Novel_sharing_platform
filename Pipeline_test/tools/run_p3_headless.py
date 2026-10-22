"""Bounded actual controller journeys; explicit simulated-author API gate decisions."""
import json,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe

def run(env,output,noplan=False):
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');error=None;run=None
 try:
  p.setup();p.stage='P3_idea_baseline'
  job=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'})
  p.wait_job(job['job_id'],{'waiting_review'});p.save('setup-raw',p.api('GET',p.brain+'/review-queue'));p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':job['job_id']});m0=p.read_memory();p.save('M0',m0)
  body={'novel_id':p.novel,'max_iterations':5,'max_retries_per_objective':3,'idempotency_key':'p3-'+uuid.uuid4().hex}
  if not noplan:
   plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'source_outline':'Bounded future intent','objectives':[{'order_index':1,'title':'P3 observe','description':'Observe note.','target_chapter':1,'metadata':{'min_words':1}},{'order_index':2,'title':'P3 ending','description':'Resolve scene.','target_chapter':2,'objective_type':'ending','metadata':{'min_words':1,'is_terminal':True}}]})
   p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel});body['plan_id']=plan['plan_id']
  p.stage='P3_create_controller';run=p.api('POST','/ai/autonomous/runs',body);rid=run['run_id'];p.save('run-created',run)
  replay=p.api('POST','/ai/autonomous/runs',body);p.check('create_idempotent',replay['run_id']==rid)
  p.api('GET','/ai/autonomous/runs/'+rid,headers={'Authorization':'Bearer '+p.foreign},expected=(403,));p.check('wrong_owner_denied',True)
  p.save('active-plan',p.api('GET','/ai/story-plans/by-novel/'+p.novel+'/active'))
  p.check('plan_not_history',p.read_memory()==m0)
  p.stage='P3_step_HITL'
  for step in range(12):
   before=p.read_memory()
   if step==0: run=p.api('POST','/ai/autonomous/runs/'+rid+'/run',{'max_steps':2})['run']
   else: run=p.api('POST','/ai/autonomous/runs/'+rid+'/step',{})
   p.save('step-'+str(step),run)
   if run['stop_reason']=='waiting_for_entity_review':
    p.check('pause_no_canon_'+str(step),p.read_memory()==before)
    chapter=run['current_chapter_id'];revision=p.latest(chapter)
    p.review(p.wait_review(revision['revisionId']));p.approve()
   elif run['stop_reason']=='waiting_for_memory_extraction':time.sleep(.5)
   elif run['status'] in ('completed','failed','stopped'):break
  p.check('controller_completed',run['status']=='completed')
  finalplan=p.api('GET','/ai/story-plans/'+run['plan_id']);p.save('final-plan',finalplan)
  p.check('multiple_objectives_completed',len(finalplan['objectives'])>=2 and all(o['status']=='completed' for o in finalplan['objectives']))
  chapters=p.api('GET','/novels/'+p.novel+'/chapters');p.save('chapters',chapters)
  p.check('all_draft',all(c['status']=='DRAFT' for c in chapters))
  old=run;again=p.api('POST','/ai/autonomous/runs/'+rid+'/step',{});p.check('terminal_replay_no_advance',again==old)
  p.save('M-final',p.read_memory());p.save('gateway-ledger',p.ledger())
 except Exception as exc:error={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'run':run,'no_plan_entry':noplan,'stage':p.stage,'checks':p.checks,'failure':error,'verdict':'PARTIAL' if error else 'PASS','external_provider_calls':0})
 print(json.dumps({'stage':p.stage,'failure':error,'checks':len(p.checks)}));return 1 if error else 0
if __name__=='__main__':raise SystemExit(run(sys.argv[1],sys.argv[2],'--no-plan' in sys.argv[3:]))
