"""Revalidate preserved Wave1G evidence offline, without application writes."""
from pathlib import Path
import csv
import hashlib
import json
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.provenance import validate_browser_evidence, verify_manuscript_gold_hashes
REVIEW=Path(__file__).resolve().parent
RUN=ROOT/'Pipeline_test/runs/2026-10-22-p1-wave1g-s09-red-01'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
protected=read(REVIEW/'protected-baseline.json')
changed=[p for p,h in protected['files'].items() if not (ROOT/p).is_file() or hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=h]
assert not changed,changed
pr=read(REVIEW/'github-closeout.json')
assert pr['pr']['head_sha']==protected['pr55_head']
assert pr['reviews']['reviews']==[] and pr['issue56_comments']['comments']==[]
source_hashes={}
for file in (REVIEW/'sources').iterdir():
    name=file.name.removeprefix('pr55-')
    target=('web/src/features/author-ide/' if name in {'AuthorWritingIde.tsx','useDraftPersistence.ts'} else 'backend/src/modules/novels/')+name
    raw=subprocess.check_output(['git','show',protected['pr55_head']+':'+target],cwd=ROOT)
    assert raw==file.read_bytes(),target
    source_hashes[target]=hashlib.sha256(raw).hexdigest()
old_path='web/src/features/author-ide/AuthorWritingIde.tsx'
assert subprocess.check_output(['git','show',protected['head']+':'+old_path],cwd=ROOT)==subprocess.check_output(['git','show','HEAD:'+old_path],cwd=ROOT)
browser=RUN/'browser-red-01'; result=read(browser/'browser-result.json'); repro=read(browser/'S09-independent-red.json')
assert result['reason']=='RuntimeError: PRODUCT_S09_STALE_DEBOUNCE_SAVE_AFTER_UNDO'
assert repro['verdict']=='FAIL' and repro['editor_matches_B'] and not repro['draft_matches_B']
assert repro['edit_window_seconds']<1.2 and not repro['zero_stale_A_requests']
assert len(repro['patch_receipts'])==1 and repro['patch_receipts'][0]['status']==200
assert repro['patch_receipts'][0]['payload']['content']==repro['temporary_body']
final=read(RUN/'read-only-final.json')
assert final['chapter']['draft']['content']==repro['temporary_body']
assert final['brain']['status']!='active' and final['revisions'][0]['content']==repro['expected_body']
assert read(RUN/'read-only-outbox.json')==[]
checks=[]
for p in sorted(browser.glob('ACT-*.json')):
    if p.name.endswith('.readback.json'):continue
    m=read(p)
    if m.get('channel')!='OFFLINE_BROWSER_UI_SMOKE':continue
    ok,reason=validate_browser_evidence(str(p),m['action_id'],result['novel_id'],browser,expected_run_id=m['run_id'],expected_user_id=result['user_id'],expected_session_id=result['session_id'])
    checks.append({'action_id':m['action_id'],'pass':ok,'reason':reason})
assert len(checks)==18 and all(c['pass'] for c in checks)
write(REVIEW/'browser-evidence-revalidation.json',checks)
seed=read(browser/'ACT-S02-CHECKPOINT.readback.json')
ok,reason=verify_manuscript_gold_hashes(seed['chapters'],expected_novel_id=result['novel_id'],expected_owner_id=result['user_id'])
assert ok,reason
runtime=RUN/'runtime-final'; resources=read(runtime/'runtime-owned-resources.json'); ledger=read(runtime/'gateway-ledger-readback.json')
receipts=[json.loads(s) for s in (runtime/'fake-upstream-receipts.jsonl').read_text().splitlines() if s.strip()]
assert len(resources['services'])==7 and all(not s['real_provider_keys_present'] for s in resources['services'])
assert all(n['internal'] for n in resources['networks'] if not n['name'].endswith('_browser-edge'))
assert not ledger['live_authorized']
tickets=[h['ticket_id'] for h in ledger['call_history']]
assert len(set(tickets))==len(tickets)==ledger['total_calls']==9
assert sorted(tickets)==sorted(x['dispatch_id'] for x in receipts)
audit={'protected_files_checked':len(protected['files']),'protected_mismatches':changed,'product_FE_unchanged':True,
       'pr55_head':protected['pr55_head'],'pr55_source_hashes':source_hashes,'reviewed_patch_available':False,
       'browser_bundles':len(checks),'five_seed_sources':reason,'browser_verdict':'FAIL_STALE_PATCH_AND_DRAFT',
       'stale_immutable_revision_in_this_run':False,'outbox_events_in_this_run':0,
       'immutable_scope':'brain not active, snapshotSavedChapter skips revision/outbox; historical Wave1F remains the active-brain RED evidence',
       'fake_requests':len(receipts),'ledger_requests':ledger['total_calls'],'dispatch_reconciliation':'PASS',
       'external_real_provider_calls':0,'account_switch_finding_scope':'source hook test double; remount behavior E2E NOT_RUN'}
write(REVIEW/'audit-results.json',audit)
print(json.dumps({k:audit[k] for k in ['protected_files_checked','browser_bundles','fake_requests','external_real_provider_calls']},indent=2))
