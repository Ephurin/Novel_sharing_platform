"""Terminal stop/restart: supported author API, zero late controller writes."""
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
base=Path(__file__).resolve().parent;m=json.loads((base/'terminal-stop-environment.json').read_text(encoding='utf-8'))
p=NextProbe(m['env_file'],base/'terminal-stop');p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');p.setup()
j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'});p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Stop before step','description':'No late accept','target_chapter':1}]});p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel})
r=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel,'plan_id':plan['plan_id']});rid=r['run_id']
stopped=p.api('POST','/ai/autonomous/runs/'+rid+'/stop',{'reason':'Author stop'});before=p.read_memory()
for i in range(2):
 result=p.api('POST','/ai/autonomous/runs/'+rid+'/step',{});p.check('terminal_step_'+str(i),result['status']=='stopped')
p.command(p.compose+['restart','backend'])
for _ in range(80):
 try:current=p.api('GET','/ai/autonomous/runs/'+rid);break
 except Exception:time.sleep(.25)
else:raise RuntimeError('Restart unavailable')
result=p.api('POST','/ai/autonomous/runs/'+rid+'/run',{'max_steps':2})
p.check('restart_does_not_resume',result['run']['status']=='stopped' and result['iterations_executed']==0)
p.check('no_new_accepts',p.sql("select count(*) from chapter_revisions where novel_id='"+p.novel+"' and source_type='AI_DRAFT_ACCEPT'")=='0')
p.check('memory_unchanged',p.read_memory()==before)
p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'run_id':rid,'checks':p.checks,'verdict':'PASS','external_provider_calls':0})
print('Terminal stop/restart PASS')
