"""Read-only audit of executed Wave1E artifacts and new worker network isolation."""
import hashlib,json,subprocess,sys
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'ai-service'))
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter
from Pipeline_test.tools.provenance import verify_manuscript_gold_hashes
from services.entity_pipeline.verification import _validate,EntityDecisionBatch
from services.entity_pipeline.candidates import EntityCandidate
REVIEW=Path(__file__).parent;RUN=ROOT/'Pipeline_test/runs/2026-10-21-p1-wave1e-functional-01';BROWSER=RUN/'browser-attempt-04'
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def dt(value):return datetime.fromisoformat(value)
def main():
 result=load(BROWSER/'browser-result.json');assert result['status']=='OFFLINE_BROWSER_UI_SMOKE' and not result['reason']
 human=load(BROWSER/'human-review-result.json');assert human['status']=='OFFLINE_HUMAN_ENTITY_REVIEW_PASS'
 mapping=load(BROWSER/'source-to-canonical-manifest.json');assert len(mapping['source_to_canonical'])==5
 actions=[json.loads(x) for x in (BROWSER/'actions.jsonl').read_text(encoding='utf-8').splitlines()]
 rb=load(BROWSER/'ACT-HITL-CONTINUE.readback.json');chapters=rb['chapters']
 ok,reason=verify_manuscript_gold_hashes(chapters,expected_novel_id=result['novel_id'],expected_owner_id=result['user_id']);assert ok,reason
 assert rb['readback_scope']=='final_post_run_readback'
 assert dt(rb['observation']['started_at'])>=max(dt(a['finished_at']) for a in actions)
 assert rb['observation']['observed_after_action_id']=='ACT-HITL-CONTINUE'
 for index,chapter in enumerate(chapters,1):
  f=parse_fixture_chapter(index);m=mapping['source_to_canonical'][index-1]
  assert m['source_file_sha256']==f['source_file_sha256']!=m['canonical_body_sha256']==chapter['contentHash']
  assert m['chapter_id']==chapter['chapterId'] and m['revision_id']==chapter['latestRevisionId']
  immediate=load(BROWSER/f'ACT-S01-FILL-{index}.immediate-draft.json');action=next(a for a in actions if a['action_id']==f'ACT-S01-FILL-{index}')
  assert dt(action['started_at'])<=dt(immediate['captured_at'])<=dt(action['finished_at'])
  assert immediate['chapter']['title']==f['title'] and immediate['chapter']['draft']['content']==f['body']
 before=load(BROWSER/'HITL-01-before-author-review.json');frozen=load(BROWSER/'HITL-02-entities-reviewed-before-continue.json');after=load(BROWSER/'HITL-03-after-continue.json')
 review=next(r for r in frozen['reviews'] if r['analysis_run_id']==human['analysis_run_id'])
 assert review['status']=='entities_reviewed' and len(review['reviewed_decisions'])==len(review['candidates'])
 parsed=EntityDecisionBatch.model_validate({'decisions':review['reviewed_decisions']})
 _validate(parsed.decisions,[EntityCandidate(**c) for c in review['candidates']],parse_fixture_chapter(1)['body'],{},[c['surface'] for c in review['candidates']])
 for state in (before,frozen):assert not any(r['operation'] in ('events','facts') for r in state['receipts'])
 downstream=[r for r in after['receipts'] if r['operation'] in ('events','facts')]
 assert {r['operation'] for r in downstream}=={'events','facts'}
 assert min(r['received_at'] for r in downstream)>dt(frozen['captured_at']).timestamp()
 assert before['memory']==frozen['memory']==after['memory'] and not after['memory']['entities']
 assert all(p['status']=='pending' for p in after['proposals']) and len(after['proposals'])==3
 for p in after['proposals']:
  for evidence in p['evidence']:
   assert evidence['revision_id']==human['revision_id']
   assert evidence['text_hash']==chapters[0]['contentHash']
   assert chapters[0]['canonicalRevision']['content'][evidence['start']:evidence['end']]==evidence['quote']
 receipts=[json.loads(x) for x in (RUN/'runtime-final/fake-upstream-receipts.jsonl').read_text().splitlines()]
 ledger=load(RUN/'runtime-final/gateway-ledger-readback.json')
 assert ledger['total_calls']==len(receipts)==len({r['dispatch_id'] for r in receipts})
 assert {e['ticket_id'] for e in ledger['call_history']}=={r['dispatch_id'] for r in receipts}
 assert ledger['live_authorized'] is False
 protected=load(REVIEW/'protected-baseline.json')
 for name,sha in protected['files'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==sha,name
 project='p1-wave1e-20261021-functional-01';network_checks=[]
 def owned(service):
  ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+service],text=True).splitlines();assert len(ids)==1
  return ids[0]
 for service in ('ai-service','backend'):
  cid=owned(service);data=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
  env=dict(v.split('=',1) for v in data['Config']['Env'] if '=' in v)
  assert not any(env.get(k) for k in ('GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY'))
  assert env['BUDGET_GUARD_MODE']=='proxy' and len(data['NetworkSettings']['Networks'])==1
  for name in data['NetworkSettings']['Networks']:assert json.loads(subprocess.check_output(['docker','network','inspect',name],text=True))[0]['Internal']
  if service=='ai-service':
   command=['python','-c',"import socket\nfor host,port in [('1.1.1.1',443),('fake-upstream',18091)]:\n try:\n  s=socket.create_connection((host,port),timeout=1);s.close()\n except OSError:continue\n raise RuntimeError('DIRECT_EGRESS_REACHABLE')\nprint('DENIED')"]
  else:
   command=['node','--input-type=module','-e',"import net from 'node:net';for(const [host,port] of [['1.1.1.1',443],['fake-upstream',18091]]){await new Promise((resolve,reject)=>{const s=net.connect(port,host);s.setTimeout(1000);s.on('connect',()=>{s.destroy();reject(Error('DIRECT_EGRESS_REACHABLE'))});s.on('error',resolve);s.on('timeout',()=>{s.destroy();resolve()})})}console.log('DENIED');"]
  assert subprocess.check_output(['docker','exec',cid,*command],text=True).strip()=='DENIED'
  network_checks.append({'service':service,'direct_egress':'DENIED','real_provider_keys_present':False})
 summary={'status':'PASS','tested_source_commit':'ba9245d848db131b703951f883b7fcc9660ed546','actions':len(actions),'canonical_chapters':5,'immediate_draft_observations':5,'chronology':'PASS','pending_proposals':3,'receipts_matched_to_reservations':len(receipts),'unmetered_dispatches':0,'frozen_files_unchanged':len(protected['files']),'worker_network_checks':network_checks,'external_provider_calls':0}
 (REVIEW/'FUNCTIONAL_EVIDENCE_AUDIT.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
if __name__=='__main__':main()
