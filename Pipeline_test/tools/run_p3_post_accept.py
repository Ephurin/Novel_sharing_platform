"""Owned real-service post-accept interleavings; no fabricated canon or provider output."""
import argparse,json,time,uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from run_p123_next import NextProbe,ROOT

def run(env,output,seam,action,expect_red=False):
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');error=None;rid=None
 try:
  p.setup();p.stage=seam+'-'+action
  j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'})
  p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
  plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Post accept fence','description':'Bounded objective','target_chapter':1,'objective_type':'ending','metadata':{'min_words':1,'is_terminal':True}}]})
  pid=plan['plan_id'];oid=plan['objectives'][0]['objective_id'];op='/ai/story-plans/'+pid+'/objectives/'+oid
  p.api('POST','/ai/story-plans/'+pid+'/activate',{'novel_id':p.novel})
  r=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel,'plan_id':pid,'max_iterations':3,'idempotency_key':uuid.uuid4().hex});rid=r['run_id'];rp='/ai/autonomous/runs/'+rid
  def step():
   response=p.http.post(p.base+rp+'/step',json={},timeout=65)
   return {'status':response.status_code,'response':response.json()}
  def state():
   return {'run':p.api('GET',rp),'plan':p.api('GET','/ai/story-plans/'+pid),'memory':p.read_memory(),
    **{t:json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+t+" t where novel_id='"+p.novel+"'")) for t in ['chapter_revisions','revision_outbox_events','narrative.proposals','narrative.writing_generations']}}
  if seam!='post_commit':
   first=step();p.save('initial-HITL-step',first)
   for _ in range(10):
    r=p.api('GET',rp)
    if r['stop_reason']=='waiting_for_entity_review':break
    time.sleep(.3);step()
   else:raise RuntimeError('Expected HITL wait')
   revision=p.latest(r['current_chapter_id']);p.review(p.wait_review(revision['revisionId']))
   if seam=='pre_progress':p.approve()
  setup="const fs=require('fs');for(const f of ['p3-intent-paused','p3-intent-release','p3-intent-committed'])fs.rmSync('/tmp/'+f,{force:true});fs.writeFileSync('/tmp/p3-intent-config.json',process.argv[1]);"
  p.command(p.compose+['exec','-T','backend','node','-e',setup,json.dumps({'runId':rid,'seam':seam})])
  with ThreadPoolExecutor(2) as pool:
   future=pool.submit(step)
   for _ in range(100):
    if p.command(p.compose+['exec','-T','backend','node','-e',"console.log(require('fs').existsSync('/tmp/p3-intent-paused'))"])=='true':break
    time.sleep(.05)
   else:raise RuntimeError('Post accept seam not reached')
   before=state();p.save('at-seam',before)
   p.check('accepted_history_already_committed',len([x for x in before['chapter_revisions'] if x['source_type']=='AI_DRAFT_ACCEPT'])==1)
   p.api('PATCH',op,{'novel_id':p.novel,'status':'skipped'},headers={'Authorization':'Bearer '+p.foreign},expected=(403,))
   p.api('POST',rp+'/stop',{},headers={'Authorization':'Bearer invalid'},expected=(401,))
   if action in ['stop','kill_stop']:
    p.save('author-cancel',p.api('POST',rp+'/stop',{'reason':'SIMULATED_HUMAN_VIA_API post accept stop'}))
    p.save('author-cancel-repeat',p.api('POST',rp+'/stop',{'reason':'SIMULATED_HUMAN_VIA_API repeated stop'}))
   else:
    p.save('author-cancel',p.api('PATCH',op,{'novel_id':p.novel,'status':'skipped'}))
    p.save('author-cancel-repeat',p.api('PATCH',op,{'novel_id':p.novel,'status':'skipped'}))
    if action=='ABA':
     p.api('PATCH',op,{'novel_id':p.novel,'status':'pending'});p.api('PATCH',op,{'novel_id':p.novel,'status':'in_progress'})
   if action=='kill_stop':p.command(p.compose+['kill','-s','SIGKILL','backend'])
   else:p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').writeFileSync('/tmp/p3-intent-release','release')"])
   try:p.save('worker-result',future.result())
   except Exception as exc:p.save('worker-result',{'interrupted':type(exc).__name__})
  if action=='kill_stop':p.command(p.compose+['start','backend'])
  p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').rmSync('/tmp/p3-intent-config.json',{force:true})"])
  after=state();p.save('after',after)
  safe=after['memory']==before['memory'] and after['plan']['objectives'][0]['status']!='completed'
  p.check('post_cancel_no_canon_or_completed_overwrite',safe if not expect_red else not safe)
  p.check('accepted_revision_retained_once',len([x for x in after['chapter_revisions'] if x['source_type']=='AI_DRAFT_ACCEPT'])==1)
  p.check('single_analysis_outbox',len(after['revision_outbox_events'])==1)
  # Quiesce explicitly before restart so a valid next objective cannot obscure readback.
  if after['run']['status']=='running':p.api('POST',rp+'/stop',{'reason':'Bounded test finished'})
  p.command(p.compose+['restart','backend'])
  for _ in range(80):
   try:restarted=state();break
   except Exception:time.sleep(.25)
  p.save('restart',restarted);p.save('terminal-replay',step())
  p.check('restart_retains_memory',restarted['memory']==after['memory'])
  p.save('gateway-ledger',p.ledger())
 except Exception as exc:error={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'run_id':rid,'seam':seam,'action':action,'checks':p.checks,'failure':error,'verdict':'FAIL' if error else 'EXPECTED_RED' if expect_red else 'PASS','external_provider_calls':0})
 print(json.dumps({'seam':seam,'action':action,'failure':error,'checks':len(p.checks)}));return int(error is not None)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--env-file',required=True);a.add_argument('--output',required=True);a.add_argument('--seam',choices=['post_commit','pre_approval','pre_progress'],required=True);a.add_argument('--action',choices=['skip','stop','ABA','kill_stop'],required=True);a.add_argument('--expect-red',action='store_true');v=a.parse_args();raise SystemExit(run(v.env_file,v.output,v.seam,v.action,v.expect_red))
