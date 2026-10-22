"""Fresh-owned deterministic intent/accept interleavings via real HTTP and PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
import argparse,json,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe

def run(env,output,mode):
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');error=None;rid=None
 try:
  p.setup();p.stage=mode
  j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'})
  p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
  plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Intent gate '+mode,'description':'P3 bounded intent case','target_chapter':1,'objective_type':'ending','metadata':{'min_words':1,'is_terminal':True}}]})
  p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel})
  r=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel,'plan_id':plan['plan_id'],'max_iterations':3,'max_retries_per_objective':3,'idempotency_key':uuid.uuid4().hex});rid=r['run_id']
  seam='before_fence' if mode in ('skip_first','stop_first','ABA','plan_replaced') else 'pre_commit' if mode in ('accept_first','kill_pre_commit') else 'post_commit'
  setup="const fs=require('fs');for(const f of ['p3-intent-paused','p3-intent-release','p3-intent-committed'])fs.rmSync('/tmp/'+f,{force:true});fs.writeFileSync('/tmp/p3-intent-config.json',process.argv[1]);"
  p.command(p.compose+['exec','-T','backend','node','-e',setup,json.dumps({'runId':rid,'seam':seam})])
  before=p.read_memory();objective=plan['objectives'][0]['objective_id']
  def change(status):return p.api('PATCH','/ai/story-plans/'+plan['plan_id']+'/objectives/'+objective,{'novel_id':p.novel,'status':status})
  def state():
   return {'run':p.api('GET','/ai/autonomous/runs/'+rid),'plan':p.api('GET','/ai/story-plans/'+plan['plan_id']),
    'revisions':json.loads(p.sql("select coalesce(json_agg(t),'[]') from chapter_revisions t where novel_id='"+p.novel+"'")),
    'outbox':json.loads(p.sql("select coalesce(json_agg(t),'[]') from revision_outbox_events t where novel_id='"+p.novel+"'")), 'memory':p.read_memory()}
  def step():
   try:
    response=p.http.post(p.base+'/ai/autonomous/runs/'+rid+'/step',json={},timeout=65)
    return {'status':response.status_code,'response':response.json()}
   except Exception as exc:return {'network_error':type(exc).__name__}
  with ThreadPoolExecutor(3) as pool:
   future=pool.submit(step)
   for _ in range(100):
    if p.command(p.compose+['exec','-T','backend','node','-e',"console.log(require('fs').existsSync('/tmp/p3-intent-paused'))"])=='true':break
    time.sleep(.05)
   else:raise RuntimeError('Intent seam not reached')
   p.save('at-seam',state())
   competing=step();p.save('competing-step',competing);p.check('two_step_busy',competing['status']==409)
   if mode in ('skip_first','ABA'):
    edits=[change('skipped')]
    if mode=='ABA':edits += [change('pending'),change('in_progress')]
    p.save('author-edits-before-accept',edits)
   elif mode in ('stop_first','plan_replaced'):
    p.save('author-stop',p.api('POST','/ai/autonomous/runs/'+rid+'/stop',{'reason':'Author cancellation'}))
    if mode=='plan_replaced':
     newer=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Replacement','description':'New intent','target_chapter':2}]})
     p.api('POST','/ai/story-plans/'+newer['plan_id']+'/activate',{'novel_id':p.novel});p.save('replacement-plan',newer)
   if mode.startswith('kill_'):
    p.command(p.compose+['kill','-s','SIGKILL','backend']);receipt=future.result()
    # Skip through the API after restart; committed rows are retained if commit won.
    p.command(p.compose+['start','backend'])
    p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').rmSync('/tmp/p3-intent-config.json',{force:true})"])
    for _ in range(80):
     try:p.api('GET','/ai/autonomous/runs/'+rid);break
     except Exception:time.sleep(.25)
    change('skipped');p.api('POST','/ai/autonomous/runs/'+rid+'/stop',{'reason':'Crash cancellation'})
   elif mode=='accept_first':
    edit=pool.submit(change,'skipped');time.sleep(.15);p.check('edit_waits_for_accept_transaction',not edit.done())
    p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').writeFileSync('/tmp/p3-intent-release','release')"])
    p.save('later-author-skip',edit.result());receipt=future.result()
   else:
    p.command(p.compose+['exec','-T','backend','node','-e',"require('fs').writeFileSync('/tmp/p3-intent-release','release')"]);receipt=future.result()
  p.save('step-result',receipt);after=state();p.save('after',after)
  accepted=[x for x in after['revisions'] if x['source_type']=='AI_DRAFT_ACCEPT']
  should_exist=mode in ('accept_first','kill_post_commit')
  p.check('accepted_count_matches_commit_order',len(accepted)==(1 if should_exist else 0))
  p.check('canon_unchanged_without_author_review',after['memory']==before)
  p.check('outbox_matches_accepted_count',len([x for x in after['outbox'] if x['event_type']=='INCREMENTAL_ANALYSIS'])==len(accepted))
  generations=json.loads(p.sql("select json_agg(t) from narrative.writing_generations t where novel_id='"+p.novel+"'"));p.save('generations',generations)
  latestgen=generations[-1];cid=latestgen['chapter_id'];body={'generationId':latestgen['job_id']}
  replay=p.api('POST','/chapters/'+cid+'/revisions/accept-draft',body,expected=(200,201) if should_exist else (409,));p.save('late-replay',replay)
  if should_exist:p.check('accepted_replay_same_id',replay['revision']['revisionId']==accepted[0]['revision_id'])
  p.command(p.compose+['restart','backend'])
  for _ in range(80):
   try:restarted=state();break
   except Exception:time.sleep(.25)
  else:raise RuntimeError('Readback restart timeout')
  p.save('restart',restarted)
  p.check('restart_preserves_accepted_count',len([x for x in restarted['revisions'] if x['source_type']=='AI_DRAFT_ACCEPT'])==len(accepted))
  if restarted['run']['status']=='running':p.api('POST','/ai/autonomous/runs/'+rid+'/stop',{'reason':'Bounded test complete'})
  p.save('gateway-ledger',p.ledger())
 except Exception as exc:error={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'run_id':rid,'mode':mode,'checks':p.checks,'failure':error,'verdict':'FAIL' if error else 'PASS','external_provider_calls':0})
 print(json.dumps({'mode':mode,'failure':error,'checks':len(p.checks)}));return 1 if error else 0
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--env-file',required=True);parser.add_argument('--output',required=True);parser.add_argument('--mode',required=True,choices=['skip_first','stop_first','accept_first','ABA','plan_replaced','kill_pre_commit','kill_post_commit']);a=parser.parse_args();raise SystemExit(run(a.env_file,a.output,a.mode))
