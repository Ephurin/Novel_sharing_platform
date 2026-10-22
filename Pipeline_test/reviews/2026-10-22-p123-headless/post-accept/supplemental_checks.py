"""Evidence client only: supported API replacement and stale HITL replay."""
import json,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT/'Pipeline_test/tools'))
from run_p123_next import NextProbe
import run_p3_post_accept

def replacement(env,out):
 original=NextProbe.api;seen=set()
 def api(self,method,path,body=None,**kwargs):
  result=original(self,method,path,body,**kwargs)
  if method=='POST' and path.endswith('/stop') and self.project not in seen and body.get('reason','').endswith('post accept stop'):
   seen.add(self.project)
   plan=original(self,'POST','/ai/story-plans',{'novel_id':self.novel,'objectives':[{'order_index':1,'title':'Replacement intent','description':'New author plan','target_chapter':2}]})
   self.save('replacement-plan',original(self,'POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':self.novel}))
  return result
 NextProbe.api=api
 try:return run_p3_post_accept.run(env,out,'pre_approval','stop')
 finally:NextProbe.api=original

def hitl(env,out):
 p=NextProbe(env,out);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');error=None;rid=None
 try:
  p.setup();j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'})
  p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']});before=p.read_memory()
  plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Stale HITL','description':'No automatic advancement','target_chapter':1,'objective_type':'ending','metadata':{'min_words':1}}]})
  pid=plan['plan_id'];oid=plan['objectives'][0]['objective_id'];p.api('POST','/ai/story-plans/'+pid+'/activate',{'novel_id':p.novel})
  r=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel,'plan_id':pid,'idempotency_key':uuid.uuid4().hex});rid=r['run_id'];rp='/ai/autonomous/runs/'+rid
  for _ in range(10):
   r=p.api('POST',rp+'/step',{})
   if r['stop_reason']=='waiting_for_entity_review':break
   time.sleep(.3)
  else:raise RuntimeError('HITL gate missing')
  p.save('run-at-HITL',r);rev=p.latest(r['current_chapter_id'])
  review=p.wait_review(rev['revisionId']);p.api('PATCH','/ai/story-plans/'+pid+'/objectives/'+oid,{'novel_id':p.novel,'status':'skipped'})
  # Explicit author freeze/continue is permitted diagnostic extraction, not canon approval.
  p.review(review);p.save('stale-HITL-step',p.api('POST',rp+'/step',{}))
  p.check('stale_HITL_no_canon',p.read_memory()==before)
  final=p.api('GET','/ai/story-plans/'+pid);p.save('final-plan',final)
  p.check('stale_HITL_preserves_skipped',final['objectives'][0]['status']=='skipped')
  p.check('stale_HITL_terminal',p.api('GET',rp)['status']=='stopped')
  p.save('pending-author-reconciliation',p.api('GET',p.brain+'/review-queue'))
  p.save('gateway-ledger',p.ledger());p.command(p.compose+['restart','backend'])
  for _ in range(80):
   try:r=p.api('POST',rp+'/step',{});break
   except Exception:time.sleep(.25)
  p.check('restart_no_revive',r['status']=='stopped' and p.read_memory()==before)
 except Exception as exc:error={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'run_id':rid,'checks':p.checks,'failure':error,'verdict':'FAIL' if error else 'PASS','external_provider_calls':0})
 print(json.dumps({'case':'hitl','failure':error}));return int(error is not None)
if __name__=='__main__':raise SystemExit((replacement if sys.argv[1]=='replacement' else hitl)(sys.argv[2],sys.argv[3]))
