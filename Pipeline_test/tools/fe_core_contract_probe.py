"""Focused API/Core compatibility proof. No FE code, production policy or fake DBs."""
import argparse,json,hashlib,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from run_p123_next import NextProbe,ROOT

def run(env,output,optin):
 assert optin,'--allow-test-mutations required'
 p=NextProbe(env,output);p.compose[-1]=str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml')
 rows=[];failure=None
 def row(name,fn):
  try:details=fn();rows.append({'test':name,'status':'PASS','proof':'REAL_HTTP_PG_MONGO','details':details})
  except Exception as exc:rows.append({'test':name,'status':'FAIL','proof':'REAL_HTTP_PG_MONGO','error':str(exc)})
  p.save('matrix-progress',rows)
 try:
  p.setup();p.stage='D1_actual_Core_contract'
  # PG-only chapter is the real controller's pre-draft shape, not a deleted Mongo fixture.
  script="""import {createChapter} from './dist/modules/novels/chapters.repository.js';
import {getPostgresPool,disconnectPostgres} from './dist/core/database/postgres.js';
const c=await createChapter(getPostgresPool(),{novelId:process.argv[1],title:'Contract chapter',chapterNumber:1,wordCount:0,isVip:false,priceCoins:0});console.log(JSON.stringify(c));await disconnectPostgres();"""
  raw=p.command(p.compose+['exec','-T','backend','node','--input-type=module','-e',script,p.novel]);created=json.loads(next(s for s in raw.splitlines() if s.startswith('{')));cid=created['chapterId'];path='/chapters/'+cid
  def view():return p.api('GET',path)
  def save(body,version=None,**extra):
   result=p.api('PATCH',path,{'title':'Contract chapter','content':body,'autosave':True,**({'expectedVersion':version} if version is not None else {}),**extra})
   assert result['draftVersion']==result['draft']['version'],'FE unified draft DTO version mismatch'
   return result
  def db():
   state={t:json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+t+" t where novel_id='"+p.novel+"'")) for t in ['chapters','chapter_revisions','revision_outbox_events']}
   script='JSON.stringify(db.getSiblingDB('+json.dumps(p.env['POSTGRES_DB'])+').draft_chapters.find({novelId:'+json.dumps(p.novel)+'}).sort({chapterId:1}).toArray())'
   state['Mongo_drafts']=json.loads(p.command(p.compose+['exec','-T','mongodb','mongosh','--quiet','--eval',script]))
   return state
  def require(ok,message):assert ok,message
  review_modes=[]
  def review_revision(revision_id):
   # Observe (do not hide or authorize) integration's existing auto-materialization.
   # Baseline approval remains an explicit simulated-author API action below.
   deadline=time.monotonic()+80
   while time.monotonic()<deadline:
    proposals=json.loads(p.sql("select coalesce(json_agg(t),'[]') from narrative.proposals t where novel_id='"+p.novel+"' and evidence @> '[{\"revision_id\":\""+revision_id+"\"}]'::jsonb"))
    if proposals and all(x['status'].lower()=='accepted' for x in proposals):
     observed={'revision_id':revision_id,'explicit_author_review':False,'mode':'integration_worker_auto_materialize','proposals':proposals}
     review_modes.append(observed);p.save('observed-auto-materialization-'+revision_id,observed);return
    time.sleep(.4)
   raise AssertionError('Worker source flow did not settle; no manual acceptance was substituted')
  def signature(state):
   return {'chapters':[{k:v for k,v in c.items() if k!='updated_at'} for c in state['chapters']],
    'revisions':state['chapter_revisions'],'outbox':[{k:e[k] for k in ['event_id','revision_id','content_hash']} for e in state['revision_outbox_events']]}
  body='Mai Linh và Duy đứng tại Cồn Vân. B'
  row('01_absent_draft_version_0',lambda:(require(view()['draft'] is None,'Fixture must have no Mongo draft'),save(body,0),require(view()['draft']['version']==1,'v0 initialization must yield version 1')))
  row('02_valid_version_save',lambda:(save(body+' valid',view()['draft']['version']),require(view()['draft']['content']==body+' valid','durable save missing')))
  row('03_missing_version_integration_428',lambda:p.api('PATCH',path,{'content':body+' legacy'},expected=(428,)))
  current=view()['draft'];before=db();local='LOCAL_UNSAVED_DIFFERENT'
  row('04_stale_different_body_409',lambda:(p.api('PATCH',path,{'content':local,'expectedVersion':0},expected=(409,)),require(view()['draft']==current and db()==before,'stale write changed durable state')))
  v=current['version'];target=body+' response unread'
  response=p.http.patch(p.base+path,json={'title':'Contract chapter','content':target,'expectedVersion':v,'autosave':True},stream=True,timeout=30)
  assert response.status_code==200;response.close() # Client deliberately discards response body after service committed.
  committed=view()['draft'];checkpoint=db();p.save('lost-response-before-retry',{'caller_expected_version':v,'durable_draft':committed,'PG':checkpoint,'fault':'HTTP response body deliberately unread/discarded; not a server crash'})
  row('05_same_body_lost_response_retry',lambda:(save(target,v),require(view()['draft']==committed and signature(db())==signature(checkpoint),'retry added version or semantic durable side effect')))
  row('06_different_body_stale_retry',lambda:(p.api('PATCH',path,{'content':target+' different','expectedVersion':v},expected=(409,)),require(view()['draft']==committed,'different stale retry overwrote draft')))
  # Deliberately test the *whole* payload contract: current replay identity only includes body/title.
  def metadata_retry():
   before=db();draft_before=view()
   r=p.http.patch(p.base+path,json={'title':'Contract chapter','content':target,'expectedVersion':v,'isVip':True,'priceCoins':1},timeout=30)
   p.save('different-metadata-stale-response',{'status':r.status_code,'response':r.json(),'after':view(),'PG':db(),'wallet_or_payment_calls':0})
   require(r.status_code==409 and r.json()['error']['code']=='DRAFT_CONFLICT','Stale semantic metadata must return 409 DRAFT_CONFLICT')
   require(db()==before and view()==draft_before,'Stale metadata changed PostgreSQL or MongoDB')
  row('06b_different_metadata_stale_payload_409',metadata_retry)
  def fresh_metadata():
   start=view()['draft']['version'];fresh=save(target,start,isVip=True,priceCoins=2);before=db();draft=view()
   replay=save(target,start,isVip=True,priceCoins=2)
   require(replay['draftVersion']==fresh['draftVersion'] and db()==before and view()==draft,'Identical semantic pricing replay mutated durable state')
   r=p.api('PATCH',path,{'priceCoins':3,'expectedVersion':fresh['draftVersion']})
   require(r['priceCoins']==3 and r['draftVersion']>fresh['draftVersion'],'Fresh versioned pricing-only mutation must advance the draft CAS')
   frozen=db();p.api('PATCH',path,{'priceCoins':4,'expectedVersion':fresh['draftVersion']},expected=(409,));require(db()==frozen,'stale metadata-only request mutated durable state')
   save(target,r['draftVersion'],isVip=False,priceCoins=0)
   p.save('fresh-metadata-and-semantic-replay',{'version_before':start,'fresh':fresh,'replay':replay,'pricing_only':r,'before_replay':before,'after':db()})
  row('06c_fresh_metadata_and_identical_semantic_replay',fresh_metadata)
  def published_pricing():
   # Fixture status only, not a fabricated Story Brain/canon baseline. No payment API.
   other=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Pricing fixture','content':'Published canonical pricing fixture'})
   oid=other['chapterId'];sql="update chapters set status='PUBLISHED',content='Published canonical pricing fixture' where chapter_id='"+oid+"'"
   p.command(p.compose+['exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U',p.env['POSTGRES_USER'],'-d',p.env['POSTGRES_DB'],'-c',sql])
   op='/chapters/'+oid;before=p.api('GET',op)
   legacy=p.api('PATCH',op,{'isVip':True,'priceCoins':2});require(legacy['draftVersion']==before['draft']['version'],'Legacy published pricing unexpectedly wrote a draft')
   versioned=p.api('PATCH',op,{'priceCoins':3,'expectedVersion':legacy['draftVersion']});require(versioned['draftVersion']>legacy['draftVersion'],'Versioned published pricing did not CAS')
   p.api('PATCH',op,{'priceCoins':4,'expectedVersion':legacy['draftVersion']},expected=(409,))
   after=p.api('GET',op);require(after['content']==before['content'] and after['draft']['content']==before['draft']['content'] and after['priceCoins']==3,'Pricing changed prose or stale price was accepted')
   p.save('published-pricing-only',{'fixture_sql':sql,'before':before,'legacy':legacy,'versioned':versioned,'after':after,'wallet_or_payment_calls':0})
  row('06d_published_pricing_only_compatibility',published_pricing)
  version=view()['draft']['version']
  def concurrent():
   def write(s):
    r=p.http.patch(p.base+path,json={'content':s,'expectedVersion':version},timeout=30);return {'body':s,'status':r.status_code,'response':r.json()}
   with ThreadPoolExecutor(2) as ex:pair=list(ex.map(write,[body+' writer A',body+' writer B']))
   p.save('concurrent-writers',pair);require(sorted(x['status'] for x in pair)==[200,409],'expected one CAS winner')
   winner=next(x for x in pair if x['status']==200);require(view()['draft']['content']==winner['body'],'durable winner mismatch')
  row('07_concurrent_writers_CAS',concurrent)
  def queued():
   start=view()['draft']['version'];r=p.http.patch(p.base+path,json={'content':body+' A','expectedVersion':start},stream=True,timeout=30)
   pending=body+' queued B';require(r.status_code==200,'A failed');a=r.json()['data'];r.close()
   result=save(pending,a['draftVersion']);require(view()['draft']['content']==pending,'B not eventually durable')
   return {'model':'API consumer retains B while A response is pending, then serializes using returned version; NOT a mounted hook or editor test','A_version':a['draftVersion'],'B_version':result['draftVersion']}
  row('08_API_consumer_inflight_A_then_B',queued)
  def switches():
   a=view();p.api('PATCH',path,{'content':'FOREIGN ACCOUNT BUFFER','expectedVersion':a['draft']['version']},headers={'Authorization':'Bearer '+p.foreign},expected=(403,))
   other=p.api('POST','/novels/'+p.novel+'/chapters',{'title':'Other chapter','content':'Other chapter isolated'})
   p.api('PATCH','/chapters/'+other['chapterId'],{'content':'Other chapter B','expectedVersion':other['draftVersion']})
   require(view()==a,'cross-account/chapter change');return {'browser_lifecycle':'NOT_RUN','foreign_write':403,'other_chapter':other['chapterId']}
  row('09_API_chapter_account_isolation',switches)
  p.save('D1-durable-readback',{'HTTP':view(),'PG':db(),'local_conflict_buffer':local})
  p.stage='D2_single_active_baseline_checkpoint'
  p.api('POST',path+'/revisions/snapshot',{'purpose':'MANUSCRIPT_BOOTSTRAP'})
  source=p.latest(cid)
  j=p.api('POST','/ai/story-brains/bootstrap/from-manuscript',{'novel_id':p.novel,'revisions':[{'chapter_id':cid,'revision_id':source['revisionId'],'content_hash':source['contentHash']}]})
  p.wait_job(j['job_id'],{'waiting_review'})
  observed=p.api('GET',p.brain+'/memory',expected=(404,));p.save('integration-memory-route-concern',{'status':404,'response':observed,'canonical_oracle':'real PostgreSQL projection readback, not a repaired memory endpoint'})
  p.approve();activated=p.api('POST',p.brain+'/baseline/activate',{'job_id':j['job_id']})
  require(bool(activated['baseline_revision_id']),'Automatic snapshot requires a revision-anchored active baseline')
  initial_memory=p.read_memory();canon_body='Mai Linh đặt thẻ giấy cạnh máy thu. Duy đứng bên Mai Linh tại Cồn Vân.'
  canonical=save(canon_body,view()['draft']['version']);rid=canonical['analysisRevisionId'];require(bool(rid),'Anchored active baseline save did not produce automatic revision')
  active_draft=view()['draft']
  p.save('active-save-response-versus-durable-draft',{'response':canonical,'durable_draft':active_draft})
  row('10a_active_save_returns_authoritative_version',lambda:require(canonical['draftVersion']==active_draft['version'],'Auto-snapshot changed Mongo version after PATCH captured draftVersion'))
  revision=p.latest(cid);assert revision['revisionId']==rid
  persisted=db();events=[r for r in persisted['revision_outbox_events'] if r['revision_id']==rid]
  require(revision['contentHash']==hashlib.sha256(canon_body.encode()).hexdigest() and len(events)==1,'automatic revision/outbox mismatch')
  review_revision(rid)
  after_save_memory=p.read_memory();p.save('save-canon-side-effects',{'before':initial_memory,'after':after_save_memory,'author_review_performed':False})
  row('10d_save_requires_explicit_canon_review',lambda:require(after_save_memory==initial_memory,'Integration worker auto-approved canon; production worker/policy left unchanged outside this repair'))
  after=p.read_memory()
  checkpoint=db();retry_before=view()['draft'];retried=save(canon_body,canonical['draftVersion']-1);retry_after=view()['draft']
  p.save('active-retry-readback',{'before':retry_before,'response':retried,'after':retry_after,'PG_before':checkpoint,'PG_after':db()})
  row('10b_active_replay_preserves_version',lambda:require(retry_after['version']==retry_before['version'] and signature(db())==signature(checkpoint),'Same-body active-baseline replay changes Mongo version despite stable revision/outbox'))
  def next_versioned_save():
   next_body=canon_body+' Mai Linh tiếp tục nhìn máy thu.'
   before=db();response=save(next_body,canonical['draftVersion']);stored=view();state=db()
   require(response['draftVersion']==stored['draft']['version'] and stored['draft']['content']==next_body,'Next queued save did not use the returned durable version')
   next_revision=p.latest(cid);require(response['analysisRevisionId']==next_revision['revisionId'] and next_revision['contentHash']==hashlib.sha256(next_body.encode()).hexdigest(),'Next save lost revision provenance')
   require(len([x for x in state['revision_outbox_events'] if x['revision_id']==next_revision['revisionId']])==1,'Next save lacks one durable outbox')
   p.save('next-save-returned-version',{'previous_response':canonical,'response':response,'before':before,'after':state,'HTTP':stored})
   review_revision(next_revision['revisionId'])
  row('10c_next_save_using_returned_version',next_versioned_save)
  after=p.read_memory()
  plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'FUTURE_ONLY_CONTRACT_MARKER','description':'Unperformed future intent','target_chapter':3}]})
  p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel});require(p.read_memory()==after,'future plan became official history')
  job,evidence=p.generate(cid);accepted=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']});accepted_checkpoint=db();accepted_draft=view()['draft'];replay=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']})
  accepted_id=accepted['revision']['revisionId'];require(replay['revision']['revisionId']==accepted_id and signature(db())==signature(accepted_checkpoint) and view()['draft']==accepted_draft,'accepted replay duplicate or durable mutation')
  p.save('accepted-replay-durable',{'accepted':accepted,'replay':replay,'PG_Mongo_before':accepted_checkpoint,'PG_Mongo_after':db()})
  review_revision(accepted_id);mfirst=p.read_memory()
  p.save('accept-canon-side-effects',{'before':after,'after':mfirst,'author_review_performed':False})
  row('10e_accept_requires_explicit_canon_review',lambda:require(mfirst==after,'Integration worker auto-approved accepted source; preserved as a genuine contract blocker'))
  approved=json.loads(p.sql("select coalesce(json_agg(t),'[]') from narrative.proposals t where novel_id='"+p.novel+"' and evidence @> '[{\"revision_id\":\""+accepted_id+"\"}]'::jsonb"))
  require(bool(approved) and all(x['status'].lower()=='accepted' for x in approved),'Accepted source lacks approved durable proposal evidence')
  accepted_row=next(x for x in db()['chapter_revisions'] if x['revision_id']==accepted_id)
  require(accepted_row['content_hash']==hashlib.sha256(accepted_row['content'].encode()).hexdigest(),'Accepted source content/hash mismatch')
  accepted_events=[x for x in db()['revision_outbox_events'] if x['revision_id']==accepted_id and x['content_hash']==accepted_row['content_hash']]
  require(len(accepted_events)==1,'Accepted source outbox hash/identity mismatch')
  context=p.api('GET',p.brain+'/context-preview?chapter_id='+cid)
  p.save('accepted-source-consistency',{'revision':accepted_row,'outbox':accepted_events,'approved_proposals':approved,'canonical_projection':mfirst,'supported_context_preview':context,'memory_HTTP_route':'404; NOT_FIXED'})

  stale,_=p.generate(cid);save(canon_body+' newer author checkpoint',view()['draft']['version'])
  p.api('POST',path+'/revisions/accept-draft',{'generationId':stale['job_id']},expected=(409,))
  rows.append({'test':'10_active_checkpoint_accept_outbox_StoryBrain','status':'FAIL' if review_modes else 'PASS','proof':'REAL_HTTP_PG_MONGO_FAKE_PROVIDER','details':{'automatic_saved_revision':rid,'accepted_revision':accepted_id,'accepted_source_generation':job['job_id'],'active_baseline':True,'explicit_author_review':False if review_modes else True,'review_mode':'integration_worker_auto_materialize' if review_modes else 'integration_legacy_proposal_review','pipeline_entity_gate':'NOT_AVAILABLE_IN_INTEGRATION','M_FIRST_from_accepted_source':True,'stale_generation_rejected':409,'future_plan_not_canon':True}})
  p.save('D2-durable-readback',{'PG':db(),'HTTP':view(),'M_FIRST':mfirst,'current_memory':p.read_memory(),'outbound_context':evidence,'fixture':'SIMULATED_HUMAN_VIA_API; focused one-checkpoint proof, not a P123 suite rerun'})
  def snapshot_failure():
   # Fail one real outbox INSERT; transaction must roll back and HTTP must not claim success.
   name='repair_fault_'+cid.replace('-','');frozen=db();before=view();create="create function "+name+"() returns trigger language plpgsql as $$ begin raise exception 'OWNED_PERSISTENCE_REPAIR_OUTBOX_FAULT'; end $$; create trigger "+name+" before insert on revision_outbox_events for each row when (NEW.chapter_id='"+cid+"'::uuid) execute function "+name+"();"
   args=p.compose+['exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U',p.env['POSTGRES_USER'],'-d',p.env['POSTGRES_DB'],'-c']
   try:
    p.command(args+[create]);error=p.api('PATCH',path,{'content':canon_body+' fault checkpoint','expectedVersion':before['draft']['version']},expected=(500,));failed=db()
    require(failed['chapter_revisions']==frozen['chapter_revisions'] and signature(failed)['outbox']==signature(frozen)['outbox'],'Failed snapshot committed revision/outbox')
    p.save('snapshot-transaction-failure',{'fixture_ddl':create,'HTTP_error':error,'before':frozen,'after_failure':failed,'draft_after_failure':view(),'boundary':'Mongo draft/SQL metadata can precede snapshot transaction; HTTP error is explicit, retry must complete canonical work'})
   finally:p.command(args+['drop trigger if exists '+name+' on revision_outbox_events; drop function if exists '+name+'();'])
   current=view()['draft'];recovered=save(current['content'],current['version']);require(bool(recovered['analysisRevisionId']),'Retry failed to finish canonical snapshot after explicit error')
   p.save('snapshot-failure-recovery',{'response':recovered,'HTTP':view(),'PG_Mongo':db()})
  row('11_snapshot_failure_is_explicit_and_retry_recovers',snapshot_failure)
  p.save('gateway-ledger',p.ledger())
 except Exception as exc:failure={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'rows':rows,'failure':failure,'verdict':'FAIL' if failure or any(r['status']=='FAIL' for r in rows) else 'PASS','real_provider_calls':0,'full_AuthorWritingIde_S09':'NOT_RUN'})
 print(json.dumps({'rows':[(r['test'],r['status']) for r in rows],'failure':failure}));return int(failure is not None or any(r['status']=='FAIL' for r in rows))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--env-file',required=True);a.add_argument('--output',required=True);a.add_argument('--allow-test-mutations',action='store_true');v=a.parse_args();raise SystemExit(run(v.env_file,v.output,v.allow_test_mutations))
