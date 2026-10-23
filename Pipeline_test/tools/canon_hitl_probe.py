"""Real HTTP/PG/Mongo canon gate diagnostic. Fresh resources and explicit opt-in only."""
import argparse,hashlib,json,time,uuid
from run_p123_next import NextProbe,ROOT

def run(env,output,optin):
 assert optin
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml')
 rows=[];failure=None
 def check(name,ok,detail=None):
  rows.append(dict(test=name,status='PASS' if ok else 'FAIL',proof='REAL_HTTP_PG_MONGO_FAKE_PROVIDER',details=detail));p.save('matrix-progress',rows)
 def version():return p.api('GET','/ai/story-brains/by-novel/'+p.novel)['brain_version']
 def proposals(rid):return json.loads(p.sql("select coalesce(json_agg(t),'[]') from narrative.proposals t where novel_id='"+p.novel+"' and evidence @> '[{\"revision_id\":\""+rid+"\"}]'::jsonb"))
 def durable():
  state={t:json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+t+" t where novel_id='"+p.novel+"'")) for t in ['chapters','chapter_revisions','revision_outbox_events','narrative.proposals','narrative.story_brains']}
  script='JSON.stringify(db.getSiblingDB('+json.dumps(p.env['POSTGRES_DB'])+').draft_chapters.find({novelId:'+json.dumps(p.novel)+'}).toArray())'
  state['Mongo']=json.loads(p.command(p.compose+['exec','-T','mongodb','mongosh','--quiet','--eval',script]));state['canon']=p.read_memory();return state
 def settle(rid):
  end=time.monotonic()+80
  while time.monotonic()<end:
   q=proposals(rid);out=json.loads(p.sql("select coalesce(json_agg(t),'[]') from revision_outbox_events t where revision_id='"+rid+"'"))
   if q and out and all(x['status']=='COMPLETED' for x in out):return q,out
   time.sleep(.4)
  raise AssertionError('Extraction/outbox did not settle: '+json.dumps(out))
 def duplicate(rid):
  script="""import {handleOutboxEvent} from './dist/jobs/outbox-processor.js';import {getPostgresPool,disconnectPostgres} from './dist/core/database/postgres.js';const r=(await getPostgresPool().query('select * from revision_outbox_events where revision_id=$1',[process.argv[1]])).rows[0];const e={eventType:r.event_type,revisionId:r.revision_id,novelId:r.novel_id,chapterId:r.chapter_id,contentHash:r.content_hash,createdBy:r.created_by};await handleOutboxEvent(e);await disconnectPostgres();"""
  p.command(p.compose+['exec','-T','backend','node','--input-type=module','-e',script,rid])
 try:
  p.setup();p.stage='bootstrap_supported_human_review'
  c=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Canon gate','content':'Mai Linh và Duy đứng tại Cồn Vân.'});cid=c['chapterId'];path='/chapters/'+cid
  p.api('POST',path+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'});source=p.latest(cid)
  j=p.api('POST','/ai/story-brains/bootstrap/from-manuscript',{'novel_id':p.novel,'revisions':[{'chapter_id':cid,'revision_id':source['revisionId'],'content_hash':source['contentHash']}]});p.wait_job(j['job_id'],{'waiting_review'})
  p.save('bootstrap-pending',durable());p.approve();p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']});p.save('baseline',durable())
  routes=[]
  for method,route,body in [('GET',p.brain+'/memory',None),('GET',p.brain+'/entity-reviews',None),('POST',p.brain+'/entity-reviews/'+str(uuid.uuid4())+'/review',{'expected_version':1,'decisions':[]}),('POST',p.brain+'/entity-reviews/'+str(uuid.uuid4())+'/continue',{}),('GET',p.brain+'/context-preview?chapter_id='+cid,None)]:
   r=p.http.request(method,p.base+route,json=body,timeout=30);routes.append(dict(method=method,path=route,status=r.status_code,response=r.json()))
  p.save('gateway-route-audit',routes)
  p.stage='manual_save_no_author_decision';before=durable();bv=version();v=p.api('GET',path)['draft']['version']
  saved=p.api('PATCH',path,{'content':'Mai Linh đặt thẻ giấy cạnh máy thu. Duy đứng tại Cồn Vân.','expectedVersion':v});rid=saved['analysisRevisionId'];q,out=settle(rid);after=durable();newbv=version()
  p.save('save-canon-transition',dict(before=before,after=after,response=saved,revision_id=rid,brain_before=bv,brain_after=newbv,proposals=q,outbox=out,author_review_performed=False))
  revision=p.latest(cid);check('01_save_revision_outbox_hash',revision['contentHash']==hashlib.sha256(revision['content'].encode()).hexdigest() and len(out)==1 and out[0]['content_hash']==revision['contentHash'])
  pending=all(x['status']=='pending' for x in q);check('02_save_pending_proposals',pending,q);check('03_save_canon_unchanged',before['canon']==after['canon'] and bv==newbv,dict(before=bv,after=newbv))
  # Re-deliver through the real production worker, against the same real persistence.
  duplicate(rid);dup=durable();check('07_duplicate_outbox_no_proposals_or_approval',dup['canon']==after['canon'] and dup['narrative.proposals']==after['narrative.proposals']);p.save('duplicate-readback',dup)
  if pending:
   p.stage='explicit_author_decisions';g=q[0]['dependency_group_id'];group=[x for x in q if x['dependency_group_id']==g];payload={'proposal_ids':[x['id'] for x in group],'expected_brain_version':version(),'reason':'EXPLICIT_AUTHOR_REVIEW_CANON_GATE'};route='/ai/proposal-groups/'+g+'/accept'
   frozen=durable();p.api('POST',route,payload,headers={'Authorization':'Bearer '+p.foreign},expected=(403,));check('09_wrong_owner_denied',durable()==frozen)
   bad={**payload,'expected_brain_version':max(1,version()-1)}
   if bad['expected_brain_version']==version():bad['expected_brain_version']=version()+1
   p.api('POST',route,bad,expected=(409,));check('10_stale_brain_version_conflict',durable()==frozen)
   accepted=p.api('POST',route,payload);canon=p.read_memory();av=version();p.api('POST',route,{**payload,'expected_brain_version':av},expected=(409,));check('04_author_accept_exactly_once',canon!=frozen['canon'] and p.read_memory()==canon and version()==av,accepted);p.save('author-accept-readback',durable())
   # Review remaining bootstrap-derived entity candidates; first save event reviewed above is independent.
   p.approve()
  p.stage='accept_draft_no_author_decision';before=durable();bv=version();job,_=p.generate(cid);accepted=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']});arid=accepted['revision']['revisionId'];aq,ao=settle(arid);after=durable();nbv=version()
  p.save('accept-canon-transition',dict(before=before,after=after,response=accepted,revision_id=arid,brain_before=bv,brain_after=nbv,proposals=aq,outbox=ao,author_review_performed=False))
  apending=all(x['status']=='pending' for x in aq);check('02b_accept_pending_proposals',apending,aq);check('03b_accept_canon_unchanged',before['canon']==after['canon'] and bv==nbv,dict(before=bv,after=nbv))
  frozen=durable();replay=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']});check('13_accepted_generation_replay',replay['revision']['revisionId']==arid and durable()==frozen)
  if apending:
   # Reject one candidate, prove no official projection mutation.
   target=aq[0];canon=p.read_memory();bv=version();p.api('POST','/ai/proposals/'+target['id']+'/reject',{'reason':'EXPLICIT_AUTHOR_REJECT'});check('05_reject_no_canon',canon==p.read_memory() and bv==version());p.save('reject-readback',durable())
   remaining=[x for x in proposals(arid) if x['status']=='pending'];event=next((x for x in remaining if 'summary' in x['payload']),None)
   if event is None:
    # A new source gets an independently extracted event; never manufacture a proposal through SQL.
    current=p.api('GET',path)['draft']['version'];r=p.api('PATCH',path,{'content':'Mai Linh nhìn máy thu. Duy đứng tại Cồn Vân.','expectedVersion':current});eq,_=settle(r['analysisRevisionId']);event=next(x for x in eq if 'summary' in x['payload'])
   original=event['payload'];edited={**original,'summary':'Mai Linh nhìn máy thu (tác giả đã duyệt).'}
   er=p.api('POST','/ai/proposals/'+event['id']+'/edit-and-accept',{'edited_payload':edited,'expected_brain_version':version(),'reason':'EXPLICIT_AUTHOR_EDIT'});memory=p.read_memory();check('06_edit_accept_reviewed_content',any(e['summary']==edited['summary'] for e in memory['events']));p.save('edit-readback',dict(original=original,edited=edited,response=er,durable=durable()))
  # Lose the response after real extraction completes; retry the same persisted event.
  frozen=durable()
  script="""import {handleOutboxEvent} from './dist/jobs/outbox-processor.js';import {getPostgresPool,disconnectPostgres} from './dist/core/database/postgres.js';const r=(await getPostgresPool().query('select * from revision_outbox_events where revision_id=$1',[process.argv[1]])).rows[0];const e={eventType:r.event_type,revisionId:r.revision_id,novelId:r.novel_id,chapterId:r.chapter_id,contentHash:r.content_hash,createdBy:r.created_by};const f=globalThis.fetch;globalThis.fetch=async(...args)=>{await f(...args);throw new Error('OWNED_LOST_EXTRACTION_RESPONSE');};let failed=false;try{await handleOutboxEvent(e);}catch(err){failed=String(err).includes('OWNED_LOST_EXTRACTION_RESPONSE');}finally{globalThis.fetch=f;}if(!failed)throw new Error('fault did not execute');await handleOutboxEvent(e);console.log('EXPLICIT_FAILURE_SAFE_RETRY');await disconnectPostgres();"""
  result=p.command(p.compose+['exec','-T','backend','node','--input-type=module','-e',script,arid]);check('08_interrupted_extraction_retry_review_preserved',durable()==frozen and 'EXPLICIT_FAILURE_SAFE_RETRY' in result);p.save('retry-readback',dict(before=frozen,after=durable(),result=result))
  script="""import os,json,urllib.request,urllib.error,uuid
rows=[]
for name,token,target in [('anonymous',None,'RID'),('empty','','RID'),('arbitrary','arbitrary','RID'),('valid',os.environ['PLATFORM_SERVICE_TOKEN'],'RID'),('not_found_valid',os.environ['PLATFORM_SERVICE_TOKEN'],str(uuid.uuid4()))]:
 req=urllib.request.Request('http://backend:4000/internal/v1/revisions/'+target,headers={} if token is None else {'Authorization':'Bearer '+token})
 try:r=urllib.request.urlopen(req)
 except urllib.error.HTTPError as err:r=err
 rows.append(dict(case=name,status=r.status,body=json.loads(r.read())))
print(json.dumps(rows))""".replace('RID',arid)
  auth=json.loads(p.command(p.compose+['exec','-T','ai-service','python','-'],stdin=script));p.save('internal-auth-real-http',auth);check('14_internal_authorization_real_http',[r['status'] for r in auth]==[401,401,401,200,404] and auth[3]['body']['data']['content_hash']==accepted['revision']['contentHash'])
  p.save('final-durable',durable());p.save('gateway-ledger',p.ledger())
  # Source lacks the entity checkpoint architecture. Never label legacy autonomous as HITL.
  for name in ['11_P3_HITL_waiting_for_entity_review','12_controller_continue_after_human_checkpoint']:
   rows.append(dict(test=name,status='BLOCKED',proof='SOURCE_AND_HTTP_ROUTE_AUDIT',details='Integration lacks AI entity-review routes, flag and waiting status. No broad route/state-machine port authorized.'))
 except Exception as exc:failure=dict(type=type(exc).__name__,message=str(exc))
 p.save('validation',dict(tested_sha=p.source_sha,source_dirty_at_start=p.source_dirty,rows=rows,failure=failure,project=p.project,real_provider_calls=0));print(json.dumps(dict(rows=[(r['test'],r['status']) for r in rows],failure=failure)));return int(bool(failure) or any(r['status']=='FAIL' for r in rows))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--env-file',required=True);a.add_argument('--output',required=True);a.add_argument('--allow-test-mutations',action='store_true');v=a.parse_args();raise SystemExit(run(v.env_file,v.output,v.allow_test_mutations))
