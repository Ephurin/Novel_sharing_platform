"""Additional readback/recovery checks, test-owned projects only."""
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p123_next import NextProbe
base=Path(__file__).resolve().parent
# Run the production delayed-reconciliation primitive against an actual obsolete revision.
m=json.loads((base/'final-writer-environment.json').read_text(encoding='utf-8'))
p=NextProbe(m['env_file'],base/'delayed-reconciliation');p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-next.yml')
v=json.loads((base/'final-writer/validation.json').read_text(encoding='utf-8'));p.novel=v['novel_id'];p.preflight()
a=json.loads((base/'final-writer/HTTP-results.json').read_text(encoding='utf-8'))['A']['response']['data']
script="""import {connectMongo,disconnectMongo} from './dist/core/database/mongo.js';
import {syncDraftFromRevisionConditional,findDraftChapterByChapterId} from './dist/modules/novels/draft-chapters.repository.js';
const cid=process.argv[1];const before=await findDraftChapterByChapterId(cid);
const result=await syncDraftFromRevisionConditional({chapterId:cid,revisionId:process.argv[2],content:'P1_ORDERED_A_ body',title:'Ordered writer',wordCount:2,acceptTimestamp:new Date()});
const after=await findDraftChapterByChapterId(cid);console.log(JSON.stringify({result,before,after}));await disconnectMongo();process.exit(0);
"""
raw=p.command(p.compose+['exec','-T','backend','node','--input-type=module','-e',script,a['chapterId'],a['analysisRevisionId']])
receipt=json.loads(next(line for line in raw.splitlines() if line.startswith('{"result"')))
assert receipt['result']['status']=='skipped_newer_draft' and receipt['before']==receipt['after']
p.save('receipt',receipt);p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'verdict':'PASS','channel':'Production delayed sync primitive in owned backend; not an author API mutation','newer_B_preserved':True})
# Explicit legacy-then-versioned writes still work under common writer serialization.
# Separate new author/novel keeps all prior B/latest evidence unchanged.
p.setup();cid=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Mixed clients','content':'Initial'})['chapterId']
p.api('PATCH','/chapters/'+cid,{'content':'Legacy body'})
current=p.api('GET','/chapters/'+cid)
p.api('PATCH','/chapters/'+cid,{'content':'Versioned body','expectedVersion':current['draft']['version']})
p.check('legacy_then_versioned',p.api('GET','/chapters/'+cid)['draft']['content']=='Versioned body')
p.save('mixed-client-validation',{'tested_sha':p.source_sha,'checks':p.checks,'verdict':'PASS','limit':'Serialized writes, not cross-store rollback; no client 428 added'})
# Brain advances after run creation: generation must fail closed without AI acceptance.
m=json.loads((base/'final-p3-existing-environment.json').read_text(encoding='utf-8'))
p=NextProbe(m['env_file'],base/'P3-negative/stale-brain');p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml');p.setup()
j=p.api('POST','/ai/story-brains/bootstrap/from-idea',{'novel_id':p.novel,'idea':'Mai Linh và Duy sống tại Cồn Vân.','mode':'extract'});p.wait_job(j['job_id'],{'waiting_review'});p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'Stale brain','description':'Never accept stale','target_chapter':1,'metadata':{'min_words':1}}]})
p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel})
run=p.api('POST','/ai/autonomous/runs',{'novel_id':p.novel,'plan_id':plan['plan_id'],'max_retries_per_objective':2})
p.api('POST',p.brain+'/author-entities',{'name':'Author declared new person','entity_type':'PER'});p.approve()
response=p.api('POST','/ai/autonomous/runs/'+run['run_id']+'/step',{},expected=(409,))
count=p.sql("select count(*) from chapter_revisions where novel_id='"+p.novel+"' and source_type='AI_DRAFT_ACCEPT'")
assert count=='0'
p.api('POST','/ai/autonomous/runs/'+run['run_id']+'/stop',{'reason':'Bounded stale brain check'})
p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'verdict':'PASS','HTTP':409,'accepted_count':count,'response':response,'in_place_resume':'NOT_CLAIMED'})
print('Delayed stale sync, mixed clients and stale brain checks PASS')
