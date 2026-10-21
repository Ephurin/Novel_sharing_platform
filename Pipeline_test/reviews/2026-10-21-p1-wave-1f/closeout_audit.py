"""Read-only closeout of preserved Wave1F evidence; run from repository root."""
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from Pipeline_test.tools.provenance import validate_browser_evidence

REVIEW = Path(__file__).resolve().parent
RUN = ROOT / 'Pipeline_test/runs/2026-10-21-p1-wave1f-workflow-01'
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def save(p, data): p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def table(p, rows):
    with p.open('w', encoding='utf-8', newline='') as f:
        w=csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

protected=load(REVIEW/'protected-baseline.json')['files']
changed=[p for p,h in protected.items() if not (ROOT/p).is_file() or sha(ROOT/p)!=h]
assert not changed, changed
seed=RUN/'browser-attempt-02'
chapters=load(seed/'ACT-S02-CHECKPOINT.readback.json')['chapters']
sources={c['latestRevisionId']:c['canonicalRevision'] for c in chapters}
matrix=load(seed/'five-chapter-checkpoint-matrix.json')
rows=[]
for c in chapters:
    rev=c['canonicalRevision']; assert hashlib.sha256(rev['content'].encode()).hexdigest()==rev['contentHash']
    rows.append(dict(phase='M0',chapter=c['chapterNumber'],chapter_id=c['chapterId'],revision_id=rev['revisionId'],content_hash=rev['contentHash'],scope='seed_import_snapshot_S02'))
increment=load(RUN/'browser-continuation-02/S07-normal-save-source.json')
save_source=increment['chapter']
rows.append(dict(phase='M-FIRST',chapter=6,chapter_id=save_source['chapterId'],revision_id='da241a91-e9aa-40bd-9c90-c9a1601b1aef',content_hash=hashlib.sha256(save_source['draft']['content'].encode()).hexdigest(),scope='ordinary_editor_save'))
table(RUN/'revision_manifest.csv',rows)
span_results=[]
for p in load(seed/'M0-01-pending-canon.json')['proposals']:
    for e in p.get('evidence',[]):
        src=sources[e['revision_id']]['content']; quote=src[e['start']:e['end']]
        span_results.append(dict(proposal_id=p['proposal_id'],revision_id=e['revision_id'],quote_matches=quote==e['quote'],hash_matches=hashlib.sha256(src.encode()).hexdigest()==e['text_hash']))
assert len(span_results)==52 and all(e['quote_matches'] and e['hash_matches'] for e in span_results)
save(RUN/'evidence/memory/P1-M0/source-span-audit.json',span_results)
gold=list(csv.DictReader((RUN/'evidence/memory/P1-M0/source/expected-narrative-items.csv').open(encoding='utf-8')))
assert len(gold)==35
for g in gold:
    c=chapters[int(g['source_chapter'])-1]; text=c['canonicalRevision']['content']; start=text.find(g['source_excerpt'])
    g.update(source_revision_id=c['latestRevisionId'],source_hash=c['contentHash'],excerpt_start=start,excerpt_end=start+len(g['source_excerpt']) if start>=0 else '',raw_quality='NOT_ASSESSED_FAKE_PROVIDER',semantic_result='NOT_ASSESSED',source_excerpt_check='PASS' if start>=0 else 'NOT_EXACT_DIAGNOSTIC')
table(RUN/'memory_items.csv',gold)
memory=load(seed/'M0-02-approved-baseline.json')['memory']; context=load(seed/'M0-03-context.json')
memory_text=json.dumps({k:memory[k] for k in ['entities','aliases','facts','events','relations','transitions']},ensure_ascii=False)
context_text=json.dumps({k:context[k] for k in ['entities','recent_events','world_rules','current_states']},ensure_ascii=False)
probes=[]
for pid,needle,expect in [('G01','hai mươi chín',True),('G12','chưa xác minh danh tính',True),('G14','Tai trái tôi không nghe',True),('G20','vòng chuẩn',True),('FUTURE','83 công nhân',False)]:
    a=needle.casefold() in memory_text.casefold(); b=needle.casefold() in context_text.casefold()
    probes.append(dict(probe_id=pid,query=needle,expected_present=expect,official_memory_present=a,context_preview_present=b,result='PASS_FUNCTIONAL_SAMPLE' if a==expect and b==expect else 'SCRIPTED_SUBSET_OMISSION',channel='READ_ONLY_CONTEXT_PREVIEW_NOT_SEMANTIC_RAG',quality='NOT_ASSESSED'))
table(RUN/'memory_probes.csv',probes)
table(RUN/'memory_checkpoints.csv',[
 dict(checkpoint='M0_SOURCE',status='PASS',evidence='evidence/memory/P1-M0/source/pre-registration.json',scope='35 frozen narrative assertions, not entity count'),
 dict(checkpoint='M0_RAW',status='PASS_FUNCTIONAL',evidence='browser-attempt-02/M0-01-pending-canon.json',scope='52 scripted proposals; 52 exact evidence spans; official memory empty'),
 dict(checkpoint='M0_HUMAN',status='PASS_FUNCTIONAL',evidence='browser-attempt-02/five-chapter-checkpoint-matrix.json',scope='all five entity gates and real canon accept/reject'),
 dict(checkpoint='M0_OFFICIAL',status='PASS_FUNCTIONAL',evidence='browser-attempt-02/M0-02-approved-baseline.json',scope='15 entities,1 alias,5 events,5 facts; brain_version6'),
 dict(checkpoint='M0_CONTEXT',status='PASS_FUNCTIONAL',evidence='browser-attempt-02/M0-03-context.json',scope='cutoff5 preview; semantic quality NOT_ASSESSED'),
 dict(checkpoint='M-FIRST',status='PASS_FUNCTIONAL',evidence='browser-incremental-resume-01/M-FIRST-approved.json',scope='new source review and micro_check_note; accuracy POST_HOC_DIAGNOSTIC'),
 dict(checkpoint='M-FINAL',status='NOT_RUN',evidence='browser-incremental-resume-01/S09-debounce-readback.json',scope='S09 mandatory blocker; no S11 audit')])
table(RUN/'issues.csv',[
 dict(id='H01',status='FIXED_HARNESS',issue='Explicit bootstrap Resume required after entity Continue',resolution='c4b8f82; attempt02 completed five chapters'),
 dict(id='H02',status='FIXED_HARNESS',issue='Wrong suggestion response predicate and reload trace validator',resolution='ce34bed; continuation02 S05 passed'),
 dict(id='H03',status='FIXED_HARNESS',issue='UI selected obsolete revision card; real backend returned 409',resolution='34fff04; bind exact revision and resume owned source; stale guard PASS'),
 dict(id='WF1F-S09-001',status='OPEN_PRODUCT_DEFECT',issue='Undo before debounce leaves stale timer; stale draft/revision persisted',resolution='S09_PATCH_PROPOSAL.md only; no product modification')])
browser=[]
for folder in sorted(RUN.glob('browser-*')):
    result=load(folder/'browser-result.json'); checks=[]
    for p in sorted(folder.glob('ACT-*.json')):
        if p.name.endswith('.readback.json'): continue
        m=load(p)
        if m.get('channel')!='OFFLINE_BROWSER_UI_SMOKE': continue
        ok,reason=validate_browser_evidence(str(p),m['action_id'],result['novel_id'],folder,expected_run_id=m['run_id'],expected_user_id=result['user_id'],expected_session_id=result['session_id'])
        checks.append(dict(action_id=m['action_id'],pass_check=ok,reason=reason))
    assert checks and all(c['pass_check'] for c in checks), (str(folder),checks)
    browser.append(dict(attempt=folder.name,original_status=result['status'],original_reason=result['reason'],actions=result['actions'],checks=checks))
save(REVIEW/'browser-evidence-revalidation.json',browser)
runtime=RUN/'runtime-closeout'; ledger=load(runtime/'gateway-ledger-readback.json')
receipts=[json.loads(s) for s in (runtime/'fake-upstream-receipts.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
tickets=[x['ticket_id'] for x in ledger['call_history']]; dispatch=[x['dispatch_id'] for x in receipts]
assert len(set(tickets))==len(tickets)==76 and sorted(tickets)==sorted(dispatch)
assert not ledger['live_authorized']
resources=load(runtime/'runtime-owned-resources.json')
assert all(not s['real_provider_keys_present'] for s in resources['services'])
save(REVIEW/'audit-results.json',dict(protected_files_checked=len(protected),protected_mismatches=changed,source_spans=len(span_results),source_span_failures=0,gold_assertions=len(gold),exact_excerpt_matches=sum(x['source_excerpt_check']=='PASS' for x in gold),fake_receipts=len(receipts),ledger_calls=ledger['total_calls'],dispatch_id_reconciliation='PASS',external_real_provider_calls=0,provider_scope='isolated fake upstream; no real provider keys; internal worker networks',browser_attempts=len(browser),browser_action_bundles=sum(len(x['checks']) for x in browser),sample_probes=probes))
print('PASS: protected hashes, source spans, all browser bundles and 76 fake dispatch IDs reconciled')
