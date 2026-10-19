"""Offline consolidation of captured evidence; never calls product/provider or writes DB."""
import csv, hashlib, json, shutil
from pathlib import Path
from datetime import datetime
from collections import Counter

p = Path(__file__).resolve().parent
now = datetime.now().astimezone().isoformat()
history = p / 'evidence' / 'before-live-consolidation'
history.mkdir(exist_ok=True)
for name in ['REPORT.md','MEMORY_AUDIT.md','checkpoint.json','run_config.json',
             'short_loop_results.csv','memory_checkpoints.csv','memory_items.csv','revision_manifest.csv']:
    if not (history/name).exists(): shutil.copy2(p/name, history/name)
def read(name): return json.loads((p/name).read_text(encoding='utf-8-sig'))
def write(name, data): (p/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def rows(name):
    with (p/name).open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))
def table(name, data, append=False):
    with (p/name).open(encoding='utf-8-sig',newline='') as f: fields=next(csv.reader(f))
    with (p/name).open('a' if append else 'w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore')
        if not append: w.writeheader()
        w.writerows(data)
d=read('evidence/memory/P1-M0/readonly-after-author-review.json')
raw=read('evidence/memory/P1-M0/readonly-after-retry-02.json')
traces=read('evidence/readonly-after-author-review-structured-traces.json')
novel=d['novel_id']; revs={r['revision_id']:r for r in d['chapter_revisions']}
chapter_ids=['57d56c84-7b75-491e-9876-d8e255e2e63a','783d81e6-9a26-4c9b-b48a-e5d5e4f408af','094ea587-c8b3-4c17-850c-9933ee6978aa','91a25305-aae7-4d6a-8869-4a52e34e0b9c','1cb10eda-ec02-4712-86e4-85bf48f8539b']
by_ch={chapter_ids.index(r['chapter_id'])+1:r for r in revs.values()}
gold=rows('evidence/memory/P1-M0/expected-items-before-extraction.csv')
binding=[]; manifests=[]; novel_parts=[]
(p/'final'/'chapters').mkdir(exist_ok=True)
for n,r in sorted(by_ch.items()):
    body=r['content']; export=f'final/chapters/ch{n:02d}.md'
    (p/export).write_text(body,encoding='utf-8')
    assert hashlib.sha256(body.encode()).hexdigest()==r['content_hash']
    manifests.append(dict(chapter_number=n,chapter_id=r['chapter_id'],revision_id=r['revision_id'],api_content_hash=r['content_hash'],export_file_sha256=r['content_hash'],canonical_words=r['word_count'],export_path=export,readback_at=d['time'],manual_edit_present='false',title=f'Chương {n}'))
    binding.append(dict(chapter_number=n,chapter_id=r['chapter_id'],revision_id=r['revision_id'],content_hash=r['content_hash']))
    novel_parts.append(f'# Chương {n}\n\n'+body)
table('revision_manifest.csv',manifests)
(p/'final'/'novel-partial.md').write_text('\n\n'.join(novel_parts),encoding='utf-8')
write('evidence/memory/P1-M0/revision-bindings.json',{'created_at':now,'note':'Separate binding after bootstrap; frozen expected CSV remains unchanged. Export is actual saved product revision, only 4747 seed words, not completed novel.','revisions':binding})
span_results=[]
for proposal in raw['proposals']:
    for e in proposal['evidence']:
        r=revs.get(e.get('revision_id')); start=e.get('start',0); end=e.get('end',0)
        body=r['content'] if r else ''; name=proposal['payload'].get('canonical_name','')
        substring=bool(name and ((start>0 and body[start-1].isalnum()) or (end<len(body) and body[end].isalnum())))
        span_results.append(dict(proposal_id=proposal['id'],proposal_type=proposal['proposal_type'],name=name,revision_id=e.get('revision_id'),start=start,end=end,excerpt=body[max(0,start-30):end+30],matched_text=body[start:end],hash_matches=bool(r and e.get('text_hash')==r['content_hash']),word_boundary_wrong=substring))
write('evidence/memory/P1-M0/provenance-span-review.json',span_results)
bad=[s for s in span_results if s['word_boundary_wrong']]
usage={k:sum(t.get('usage',{}).get(k,0) or 0 for t in traces) for k in ['prompt_token_count','candidates_token_count','total_token_count']}
write('evidence/provider-usage-summary.json',{'captured_at':now,'structured_responses':len(traces),'usage':usage,'models':sorted({t['model'] for t in traces}),'finish_reasons':dict(Counter(t['finish_reason'] for t in traces)),'cost_usd':None,'fallback_key_rotation':'NOT_VERIFIED','raw_response_text':'NOT_CAPTURED; trace hashes and parsed proposals retained','prose_generation_calls':0})
strict_matches={'G11','G12','G16','G24','G28','G35'}
for g in gold:
    r=by_ch[int(g['source_chapter'])]; g['source_revision_or_request_id']=r['revision_id']
    g.update(raw_match='MATCH' if g['item_id'] in strict_matches else 'MISSING_OR_INCOMPLETE',persisted_match='NOT_READY_PARTIAL_REVIEW',post_correction_match='NOT_READY',manual_correction='NONE_FOR_THIS_ASSERTION',extraction_method='LIVE_GEMINI_PARSED_PROPOSALS',issue_id='MEM-CRITICAL-001' if g['item_id'] not in strict_matches else '',evidence='evidence/memory/P1-M0/readonly-after-retry-02.json; evidence/memory/P1-M0/revision-bindings.json')
table('memory_items.csv',gold)
c=read('checkpoint.json')
c.update(updated_at=now,status='BLOCKED',main_novel_id=novel,current_chapter_number=1,current_chapter_id=by_ch[1]['chapter_id'],latest_canonical_revision_id=by_ch[1]['revision_id'],latest_content_hash=by_ch[1]['content_hash'],brain_version=2,canonical_word_count=4747,completed_chapters_by_content_review=[1,2,3,4],pending_jobs=[{'job_id':d['bootstrap_jobs'][0]['id'],'status':'waiting_review','pending_proposals':65}],unresolved_issue_ids=['MEM-CRITICAL-001','MEM-PROVENANCE-001','UI-REVIEW-001','EXTRACT-SCHEMA-001'],next_action='Resolve documented UI memory repair gaps in a separate development task, then retest S03 with retained evidence. Before writes, re-read queue/revisions. Do not activate incomplete baseline, run P2/P3 or long test as PASS. Current browser and login recovered; historical quota is not current blocker.')
c['budget'].update(provider_generation_calls_in_run=0,provider_structured_responses=len(traces),cost_usd=None)
c['memory_audit'].update(completed_audit_ids_by_pipeline={'P1':[],'P2':[],'P3':[]},pending_audit_ids=['P1-M0'],unresolved_issue_ids=['MEM-CRITICAL-001','MEM-PROVENANCE-001','UI-REVIEW-001'])
write('checkpoint.json',c)
config=read('run_config.json'); config.update(status='BLOCKED',main_novel_id=novel,mode='UI_ONLY',runtime_web_url='http://localhost:18080',model_observed='models/gemini-3.5-flash-lite',structured_max_output_tokens_observed=8192,provider_permission='Explicit user permission for manuscript/blueprint/generated Pipeline_test prose to Google Gemini API; budget unlimited subject rate limits.',provider_usage=usage,prose_generation_calls=0,semantic_lane='NOT_ASSESSED',fallback_rotation='NOT_VERIFIED',updated_at=now); write('run_config.json',config)
ss=rows('short_loop_results.csv')
for s in ss:
    n=s['step']; s['channel']='LIVE_UI + READ_ONLY_DIAGNOSTIC'
    s['issue_ids']=''; s['evidence']='REPORT.md; MEMORY_AUDIT.md'
    if n=='S01': s.update(actual='5/5 bodies match fixture; 4747 words; five revision/hash bindings; all drafts',verdict='PASS',evidence='evidence/s01-source-manifest.json; revision_manifest.csv')
    elif n=='S02': s.update(actual='Real Gemini; 5/5 processed after two manual UI retries; 93 proposals; zero official records before author approval',verdict='PASS',issue_ids='EXTRACT-SCHEMA-001',evidence='evidence/memory/P1-M0/readonly-after-retry-02.json; evidence/s02-schema-failure.png')
    elif n=='S03': s.update(actual='Rejected two wrong proposals; approved 26 checked entities; 65 pending. Critical facts missing and no suitable UI repair fields; baseline not activated',verdict='BLOCKED',issue_ids='MEM-CRITICAL-001;MEM-PROVENANCE-001;UI-REVIEW-001')
    elif n=='S04': s.update(actual='Four tabs inspected after relogin/reload: approved entities persist, characters Unknown/Unknown, events empty. Actual writing context not exercised; baseline incomplete',verdict='BLOCKED',evidence='evidence/s04-characters.png; evidence/s04-locations.txt; evidence/s04-items.txt; evidence/s04-history.png')
    else: s.update(actual='NOT_RUN: prerequisite S03 baseline/memory gate blocked; no author API write substitute',verdict='NOT_RUN',issue_ids='MEM-CRITICAL-001;UI-REVIEW-001')
table('short_loop_results.csv',ss)
issues=[('EXTRACT-SCHEMA-001','S2','EXTRACTION','consequences must be a list','Natural Gemini event schema failures at ch2 and ch4; two UI retries eventually waiting_review','evidence/s02-schema-failure.png; evidence/s02-retry01-failed.png','RECOVERED_WITH_MANUAL_RETRIES'),('MEM-CRITICAL-001','S1','MEMORY','Critical canonical facts represented before baseline activation','Only entity/event summaries and one relationship transition; death/hearing/scan state and conservation limit missing','evidence/memory/P1-M0/readonly-after-retry-02.json; memory_items.csv','OPEN'),('MEM-PROVENANCE-001','S1','PROVENANCE','Span must point to the named entity in source','An span points inside another word; see exact excerpts and hash checks','evidence/memory/P1-M0/provenance-span-review.json','OPEN'),('UI-REVIEW-001','S1','UI','Author can inspect and repair required memory','State object rendered [object Object]; no fact/status/provenance repair control in inspected drawer','evidence/s03-uneditable-state.png; evidence/s03-resumed-queue.txt','OPEN'),('AUTH-SESSION-001','S2','UI','Reload/session can resume pending work','Expired token shown; reload sent to login; UI relogin restored 65 pending and v2','evidence/s04-auth-expired.png; evidence/s04-characters.png','RECOVERED'),('TOOL-UI-002','S2','TEST_TOOL','Browser approval review available','Previous quota rejection interrupted tabs; resumed this turn through same supported browser after gate recovered','REPORT.md','RECOVERED')]
existing={r['issue_id'] for r in rows('issues.csv')}
table('issues.csv',[dict(issue_id=i,severity=sev,category=cat,first_seen_iso=now,code_sha='390b09fd043ec29db84519a9d195b59b76eec003',expected=exp,actual=act,repro_steps='See chronological evidence and REPORT.md',evidence_paths=ev,natural_or_injected='natural',workaround='No code/DB patch or author API writes',impact_on_completion='P1 gate prevents downstream test' if state=='OPEN' else 'Recovery recorded',status=state) for i,sev,cat,exp,act,ev,state in issues if i not in existing],append=True)
table('memory_checkpoints.csv',[dict(audit_id='P1-M0',pipeline='P1',novel_id=novel,checkpoint_labels='AFTER_IMPORT; EARLY_STOP_PARTIAL_REVIEW',completed_chapters=4,chapter_cutoff=5,source_manifest='evidence/memory/P1-M0/revision-bindings.json',expected_items_hash=hashlib.sha256((p/'evidence/memory/P1-M0/expected-items-before-extraction.csv').read_bytes()).hexdigest(),analysis_job_ids=d['bootstrap_jobs'][0]['id'],extraction_model_observed='models/gemini-3.5-flash-lite',execution_evidence='evidence/readonly-after-author-review-structured-traces.json',raw_snapshot='evidence/memory/P1-M0/readonly-after-retry-02.json',accepted_snapshot='evidence/memory/P1-M0/readonly-after-author-review.json',brain_before=1,brain_after=2,expected_n=35,correct_expected_n=6,reviewed_output_n=93,supported_output_n='NOT_ASSESSED_ATOMIC_PRECISION',critical_expected_n=sum(g['critical']=='true' for g in gold),critical_correct_n='NOT_FINALIZED',provenance_checked_n=len(span_results),provenance_correct_n='NOT_FULLY_SCORED',future_leaks='NONE_OBSERVED_NOT_CONTEXT_PROVEN',stale_current_states='NOT_ASSESSED',manual_corrections='2 rejected; 26 entity approvals; 65 pending',llm_execution='PASS_WITH_TWO_SCHEMA_FAILURES',raw_extraction_quality='FAIL_CRITICAL_RECALL_AND_PROVENANCE',memory_materialization='PARTIAL_AUTHOR_GATE_OBSERVED',context_retrieval='NOT_RUN',post_correction_quality='NOT_READY',overall_memory='BLOCKED_BASELINE',shared_evidence='false',issue_ids='MEM-CRITICAL-001;MEM-PROVENANCE-001;UI-REVIEW-001',report_path='MEMORY_AUDIT.md'),dict(audit_id='P2-M0',pipeline='P2',overall_memory='NOT_RUN_P1_GATE'),dict(audit_id='P3-M0',pipeline='P3',overall_memory='NOT_RUN_P1_GATE')])
summary={'saved_at':now,'proposal_types':dict(Counter(q['proposal_type'] for q in raw['proposals'])),'proposal_statuses':dict(Counter(q['status'] for q in d['proposals'])),'bad_word_boundary_spans':len(bad),'usage':usage,'canonical_words':4747}
write('evidence/live-summary.json',summary)
report='''# UI retest 2026-10-18-ui-retest-01 — current checkpoint

**PARTIAL / BLOCKED tại S03. P1 chưa đạt; P2/P3 và bài dài NOT_RUN.**
Historical preflight report is preserved in `evidence/before-live-consolidation/REPORT.md`;
previous evidence was not deleted. This update supersedes its UI-not-started status.

## Environment and scope

Isolated stack ephurin-ui-retest: web localhost:18080, backend localhost:14000/api/v1,
AI localhost:18000. Migration 0009, pgvector 0.8.6 and source/runtime fingerprints:
`evidence/rollout-preflight.json`, `rollout-runtime.json`, `ui-resume-preflight.json`.
Source HEAD 390b09fd043ec29db84519a9d195b59b76eec003 plus existing dirty repairs;
fingerprints identify deployed files. Fixture PT-CV-001 v1.0.0 verified unchanged.
No product code/DB modification by testing agent. Old demo stack/data untouched.

Explicit user consent covers manuscript/blueprint/generated prose sent to Google Gemini;
budget unlimited subject to 15 RPM / 250K TPM / 500 RPD per independent key.
Actual observed model models/gemini-3.5-flash-lite, structured output limit 8192.
27 captured structured responses: 21,901 prompt + 7,572 candidate = 29,473 tokens.
All captured finish reasons STOP. Cost unavailable; four-key fallback NOT_VERIFIED.
No prose generation call; no claim of real prose smoke success. No observed 429 in retained evidence.
See `evidence/provider-usage-summary.json`; raw response text is not logged, so trace
hashes and parsed proposals do not establish a full independent raw-LLM-text quality review.

## Actual author journey

Novel `06a979c5-b089-4648-a04e-81383aa7b119`, title
“Thành phố giữ lại tiếng mưa — UI retest 2026-10-18-01”, account reader03.

| Step | Verdict | Evidence / actual result |
|---|---|---|
| S01 | PASS | UI-created project; ch1 editor, ch2–5 bulk paste; automatic import extraction disabled. Five readback bodies match fixture after title/outer-trim conversion. Five revisions/hash bindings, 4,747 words, all drafts. |
| S02 | PASS with issues | Explicit UI extraction, real Gemini. Natural event schema failures at ch2 then ch4 (`consequences` string instead of list). Two UI retries, same job/revisions, completed 5/5 awaiting review; no duplicated revisions. |
| S03 | BLOCKED | Raw 93 proposals preserved before correction. Rejected false “máy phát” item and scan event incorrectly located at trạm Bốn. Approved only 26 checked ch2 entities. Missing critical state/facts and no suitable repair UI; baseline remains importing, not activated. |
| S04 | BLOCKED, partial coverage | After UI relogin/reload, four memory tabs inspected and saved. v2 and 65 pending persist; three approved characters display Unknown/Unknown; events empty. Actual AI writing context NOT_RUN. |
| S05–S11 | NOT_RUN | Baseline prerequisite blocked. No plan, new writing, incremental save, injected contradiction or continuing-writing claim. |

Job `1f60955d-c43a-519c-83b6-2dd4be904491`; brain
`4e798e6e-ebd0-4d1a-87ca-e55e4a97eaee`, version 1 → 2.
Raw: 79 entity, 13 event, one relationship transition. Current decisions:
26 accepted, two rejected, 65 pending. Official: 26 entities, zero events/facts/transitions.
Before any approval official entities/events/facts/transitions were zero: ordinary
mode author gate observed for this bootstrap; this does not prove full-auto gating.

A browser approval-review quota failure interrupted prior tab inspection. Same supported
browser became available in this continuation; it is no longer the active blocker.
An expired product token was observed and captured, reload led to login, and UI login
restored the same project/queue. No API login or alternate control bypass was used.

## Gate failure and narrative audit

See `MEMORY_AUDIT.md`, frozen 35-item gold, raw snapshots, `memory_items.csv` and
`evidence/memory/P1-M0/provenance-span-review.json`. Key missing facts include:
Lâm dead in old flood; Duy left-ear deafness; CV-04 one scan; spectral degradation
and proposed three-scan conservation limit. Named entities alone do not represent them.
Four named-entity evidence spans end/start inside another word; source hashes match
but semantic provenance fails. State relationship UI renders `[object Object]`.
Inspected review UI permits name / event summary / participants edits and rejection;
no suitable critical fact/status/span repair control is available there. Setup offers
extraction from saved chapters or idea, not a fact editor. Using idea input to inject
canon would change the tested source and would not establish correct prose extraction.

Per AGENT_GUIDE section 3.6, missing critical facts must be repaired through an author
feature, or recorded as a gap if absent. No DB/API/code repair or forced approval used.
Baseline deliberately remains incomplete rather than recording a false acceptance.

## P1/P2/P3, literary quality and intervention

| Scope | Verdict |
|---|---|
| P1 UI workflow | BLOCKED at S03; raw memory audit FAIL for critical omissions/provenance |
| P2 rough idea | NOT_RUN, conditional on P1 PASS |
| P3 full auto with/without plan | NOT_RUN, conditional on short loops PASS |
| Stop/resume/extraction failure | Bootstrap UI retry/relogin observed; autonomous stop/resume NOT_RUN |
| Anti-duplicate writing / no auto-publication | Writing/full auto NOT_RUN; five imported chapters remain drafts; no publish action |
| Long novel 95,000–105,000 words | NOT_RUN; unchanged 100,000-word target |
| Generated literary quality | NOT_ASSESSED: zero new generated prose, zero finished novel |

All five seed chapters were read for source comparison and memory review: 1–4 complete
seed chapters, 5 partial. They contain restrained limited-POV investigation, concrete
sound/water imagery, family tension and deliberate uncertainty; these are fixture
observations, not evidence of model literary quality, completed payoff or 100k coherence.
Do not score the seed as a newly authored novel. Product-readback exports:
`final/chapters/`, `final/novel-partial.md`, 4,747 words total (4.747% of 100k).
No repetitive filler/summary added. No publication.

Interventions: fixture copy/import, two extraction UI retries, two proposal rejections,
one group approval of 26 entities, UI relogin. Zero newly handwritten or edited prose
words, zero AI prose accept/reject cycles. API GETs and read-only scoped SQL only
verify persistence; SQL diagnostics use transaction_read_only=on and are declared
separately, never counted as UI operations. `read_ui_diagnostics.py` and offline
`consolidate_checkpoint.py` are run artifacts, not product patches.

## Resume

Retain this project/queue and all pre-correction snapshots. A separate development
change must address critical fact/state extraction, evidence anchoring and inspectable
author repair controls. Retest the repaired UI against original gold; first read live
queue/revisions before deciding actions. Finish S03/P1-M0, then S04 and S05–S11.
Only after short loops pass proceed to P2/P3 then the long task. No new consent or
budget approval is needed for the already authorized test payload/destination.
M-FIRST and 10/20/30/40/final-long audits have NO COVERAGE. Milestone 50 is not reached;
it would not apply to a novel ending at the planned 40 chapters. No completed flag
is treated as proof of success.
'''
(p/'REPORT.md').write_text(report,encoding='utf-8')
audit=f'''# P1-M0 audit — partial review / baseline blocked

Cutoff: imported ch1–5, 4,747 words, four complete seed chapters plus partial ch5.
Novel {novel}. Captured at {now}; authoritative captured server observation {d['time']}.

## Independent lanes

1. **LLM execution:** real source-correlated Gemini traces for all five revisions;
27 structured responses, STOP, output limit8192. Two natural event-schema failures,
recovered with two manual UI retries. Raw text not captured by service logging;
full raw response-text semantic audit NOT_ASSESSED. See response hashes/model/usage
in `evidence/readonly-after-author-review-structured-traces.json` and sanitized logs.
2. **Parsed raw proposals:** snapshot BEFORE manual correction is
`evidence/memory/P1-M0/readonly-after-retry-02.json`: 93 =79 entity+13 event+1 transition.
35 frozen atomic expectations derive from the unchanged source fixture, not old model
output. Prior fixture-source gold was explicitly mapped to new chapter IDs and frozen
before extraction. Revision bindings added separately after UI bootstrap. Strict
assertion matches 6/35 (G11/G12/G16/G24/G28/G35); other assertions missing/incomplete.
This is recall against these 35 expectations, NOT overall record-level precision.
Atomic output precision has not been scored; no fabricated 95% quality claim.
3. **Approved memory:** before review zero entities/events/facts/transitions. After
two UI rejections and one 26-entity group approval: v2 importing, entities26,
events0/facts0/transitions0;65 pending. Partial memory is NOT a finalized baseline.
No post-correction assertion-quality PASS or baseline recall score is claimed.
4. **Actually used writing context:** NOT_RUN, no writing/generation request.
Persisted rows/tabs are not proof of retrieval or packed AI context. Semantic/vector
lane NOT_ASSESSED; no claim of embeddings success from pgvector installation.

## Source versus extraction findings

- Critical omissions: death of Mai Lâm and 23 old-flood deaths; Duy left hearing loss;
  CV-04 scan_count=1, spectral loss per scan, suggested scan limit3; storage/ownership
  and exact knock pattern. Entity-name detection cannot establish these facts.
- False noun “máy phát” extracted from “Chiếc máy phát ra tiếng lách cách” (verb phrase).
  Rejected through UI, with raw evidence retained.
- Ch2 scan event located at trạm Bốn in proposal; prose scan occurs in archive/kho.
  UI exposes summary/participants but not event location field; rejected through UI.
- Four entity anchors cross word boundaries (see exact spans/excerpts in
  `provenance-span-review.json`). Example An at73–75 in ch1 is inside “thanh”.
  Hash/revision validity alone does not make this correct semantic provenance.
- Certainty risk: ch5 consequence “xác định được công năng thực tế” overstates bà Sâm's
  reported explanation followed by Duy's “Có thể”. It remains pending, not accepted.
- Other ambiguous records remain pending: ch4 meeting location includes trạm Bốn
  though meeting at Đồi Bắc; bà Sâm in survey participants though source says she
  did not accompany them; Linh/Mai Linh and item aliases require resolution review.
- No observed future secret such as83 people inserted into the inspected raw history;
  absent full writing-context coverage, this is not a retrieval isolation PASS.
- UI state_transition object shown as [object Object]; no inspectable nested editor.
  Character cards show Unknown/Unknown; no tested control repairs required states.

## Coverage and decision

Raw memory quality FAIL; UI correction/baseline BLOCKED. Ordinary author approval
gate observed for bootstrap only. Baseline activation, M-FIRST, incremental extraction,
retrieval probes, future-plan isolation, current-state staleness and long-run milestones
NOT_RUN. 10/20/30/40/50/final-long not reached. P2/P3 audits NOT_RUN.
This document is an early-stop audit, not a completed M0 signoff or novel evaluation.
Frozen gold unchanged; `memory_items.csv` is the separate review worksheet.
'''
(p/'MEMORY_AUDIT.md').write_text(audit,encoding='utf-8')
existing_actions={r['action_id'] for r in rows('actions.csv')}
action_data=[('A-LIVE-01','S01','Create project; ch1 editor; ch2–5 UI bulk import; extraction disabled; read back five drafts','evidence/s01-import-success.png','PASS'),('A-LIVE-02','S02','Explicit UI extraction; schema failure ch2; UI retry; schema failure ch4; second UI retry','evidence/s02-schema-failure.png; evidence/s02-retry01-failed.png','RECOVERED'),('A-LIVE-03','S03','Capture 93 raw proposals before correction; reject false item and wrong-location event; approve 26 checked entities','evidence/memory/P1-M0/readonly-after-author-review.json','PARTIAL'),('A-LIVE-04','S04','Resume same browser after prior quota; capture token expiry; UI relogin; reopen project; inspect four tabs and review/setup controls','evidence/s04-auth-expired.png; evidence/s03-uneditable-state.png','BLOCKED_BASELINE'),('A-LIVE-05','AUDIT','Offline evidence consolidation, source hash verification, canonical partial exports and checkpoint; no network or product writes','evidence/live-summary.json','SAVED')]
table('actions.csv',[dict(action_id=i,time_iso=now,phase=phase,channel='LOCAL_OFFLINE' if phase=='AUDIT' else 'LIVE_UI (diagnostic evidence separately labeled)',novel_id=novel,action=a,response_evidence=ev,result=result,model_observed='models/gemini-3.5-flash-lite' if phase=='S02' else '',request_evidence='Time is consolidation observation; original action timestamps in retained raw evidence, not reconstructed') for i,phase,a,ev,result in action_data if i not in existing_actions],append=True)
existing_i={r['intervention_id'] for r in rows('interventions.csv')}
table('interventions.csv',[dict(intervention_id=i,time_iso=now,kind=kind,reason=reason,channel='LIVE_UI',estimated_words_changed=0,measurement_method='No prose modification; metadata/proposal decision only',evidence=ev) for i,kind,reason,ev in [('I-LIVE-01','EXTRACTION_RETRY_2','Natural schema validation failures; same job retried twice','evidence/s02-schema-failure.png; evidence/s02-retry01-failed.png'),('I-LIVE-02','PROPOSAL_REJECT_2','False item and wrong scan location','evidence/s03-reject-machine.txt; evidence/s03-reject-location-event.txt'),('I-LIVE-03','ENTITY_GROUP_APPROVE_26','Checked ch2 entity names; no events or states approved','evidence/memory/P1-M0/readonly-after-author-review.json'),('I-LIVE-04','AUTH_RELOGIN','Expired token; resume through normal UI','evidence/s04-auth-expired.png')] if i not in existing_i],append=True)
print(json.dumps(summary,ensure_ascii=False))
