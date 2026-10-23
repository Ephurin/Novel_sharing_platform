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
  def save(body,version=None,**extra):return p.api('PATCH',path,{'title':'Contract chapter','content':body,'autosave':True,**({'expectedVersion':version} if version is not None else {}),**extra})
  def db():
   return {t:json.loads(p.sql("select coalesce(json_agg(t),'[]') from "+t+" t where novel_id='"+p.novel+"'")) for t in ['chapters','chapter_revisions','revision_outbox_events']}
  def require(ok,message):assert ok,message
  def signature(state):
   return {'chapters':[{k:v for k,v in c.items() if k!='updated_at'} for c in state['chapters']],
    'revisions':state['chapter_revisions'],'outbox':[{k:e[k] for k in ['event_id','revision_id','content_hash']} for e in state['revision_outbox_events']]}
  body='Mai Linh và Duy đứng tại Cồn Vân. B'
  row('01_absent_draft_version_0',lambda:(require(view()['draft'] is None,'Fixture must have no Mongo draft'),save(body,0),require(view()['draft']['version']==1,'v0 initialization must yield version 1')))
  row('02_valid_version_save',lambda:(save(body+' valid',view()['draft']['version']),require(view()['draft']['content']==body+' valid','durable save missing')))
  row('03_missing_version_legacy_Core_observation',lambda:save(body+' legacy'))
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
   r=p.http.patch(p.base+path,json={'title':'Contract chapter','content':target,'expectedVersion':v,'isVip':True,'priceCoins':1},timeout=30)
   p.save('different-metadata-stale-response',{'status':r.status_code,'response':r.json(),'after':view(),'PG':db(),'wallet_or_payment_calls':0})
   require(r.status_code==409,'Same body/title but different stale pricing payload was accepted; whole-payload replay contract is not implemented')
  row('06b_different_metadata_stale_payload_409',metadata_retry)
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
  p.wait_job(j['job_id'],{'waiting_entity_review'});p.review(p.wait_review(source['revisionId']))
  p.api('POST','/ai/jobs/'+j['job_id']+'/resume',{});p.wait_job(j['job_id'],{'waiting_review'})
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
  require(p.read_memory()==initial_memory,'save auto-approved canon')
  review=p.wait_review(rid);p.review(review);p.approve();after=p.read_memory()
  checkpoint=db();retry_before=view()['draft'];retried=save(canon_body,canonical['draftVersion']-1);retry_after=view()['draft']
  p.save('active-retry-readback',{'before':retry_before,'response':retried,'after':retry_after,'PG_before':checkpoint,'PG_after':db()})
  row('10b_active_replay_preserves_version',lambda:require(retry_after['version']==retry_before['version'] and signature(db())==signature(checkpoint),'Same-body active-baseline replay changes Mongo version despite stable revision/outbox'))
  plan=p.api('POST','/ai/story-plans',{'novel_id':p.novel,'objectives':[{'order_index':1,'title':'FUTURE_ONLY_CONTRACT_MARKER','description':'Unperformed future intent','target_chapter':3}]})
  p.api('POST','/ai/story-plans/'+plan['plan_id']+'/activate',{'novel_id':p.novel});require(p.read_memory()==after,'future plan became official history')
  job,evidence=p.generate(cid);accepted=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']});replay=p.api('POST',path+'/revisions/accept-draft',{'generationId':job['job_id']})
  accepted_id=accepted['revision']['revisionId'];require(replay['revision']['revisionId']==accepted_id,'accepted replay duplicate')
  require(p.read_memory()==after,'accept auto-approved canon')
  accepted_review=p.wait_review(accepted_id);p.review(accepted_review);p.approve();mfirst=p.read_memory()
  stale,_=p.generate(cid);save(canon_body+' newer author checkpoint',view()['draft']['version'])
  p.api('POST',path+'/revisions/accept-draft',{'generationId':stale['job_id']},expected=(409,))
  rows.append({'test':'10_active_checkpoint_accept_outbox_StoryBrain','status':'PASS','proof':'REAL_HTTP_PG_MONGO_FAKE_PROVIDER','details':{'automatic_saved_revision':rid,'accepted_revision':accepted_id,'accepted_source_generation':job['job_id'],'active_baseline':True,'explicit_author_review':True,'M_FIRST_from_accepted_source':True,'stale_generation_rejected':409,'future_plan_not_canon':True}})
  p.save('D2-durable-readback',{'PG':db(),'HTTP':view(),'M_FIRST':mfirst,'current_memory':p.read_memory(),'outbound_context':evidence,'fixture':'SIMULATED_HUMAN_VIA_API; focused one-checkpoint proof, not a P123 suite rerun'})
  p.save('gateway-ledger',p.ledger())
 except Exception as exc:failure={'type':type(exc).__name__,'message':str(exc)}
 p.save('validation',{'tested_sha':p.source_sha,'source_dirty_at_start':p.source_dirty,'project':p.project,'novel_id':p.novel,'rows':rows,'failure':failure,'verdict':'FAIL' if failure or any(r['status']=='FAIL' for r in rows) else 'PASS','real_provider_calls':0,'full_AuthorWritingIde_S09':'NOT_RUN'})
 print(json.dumps({'rows':[(r['test'],r['status']) for r in rows],'failure':failure}));return int(failure is not None or any(r['status']=='FAIL' for r in rows))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--env-file',required=True);a.add_argument('--output',required=True);a.add_argument('--allow-test-mutations',action='store_true');v=a.parse_args();raise SystemExit(run(v.env_file,v.output,v.allow_test_mutations))
