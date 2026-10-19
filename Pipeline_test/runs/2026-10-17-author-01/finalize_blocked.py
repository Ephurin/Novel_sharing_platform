"""Consolidate observed evidence only; never calls application/provider or edits DB."""
from pathlib import Path
import csv, json, hashlib, datetime, shutil

R=Path(__file__).resolve().parent
T=R.parents[1]/'templates'
NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat()
def read(name): return json.loads((R/name).read_text(encoding='utf-8-sig'))
def data(name): return read('evidence/'+name+'.json')['response']['data']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def table(name, rows):
    with (T/name).open(encoding='utf-8',newline='') as f: fields=next(csv.reader(f))
    with (R/name).open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for row in rows: w.writerow({k:row.get(k,'') for k in fields})

cfg=read('run_config.json'); main=cfg['main_novel_id']; p2=cfg['p2_probe_novel_id']; p3=cfg['p3_probe_novel_id']
revs=read('evidence/import-revisions.json')
manifest=[];chapters=[]
for n,rev in enumerate(revs,1):
    actual=data(f'final-ch{n:02}-readback')
    title=data(f'p1-ch{n:02}-load')['title']
    file=R/f'final/chapters/ch{n:02}.md'
    manifest.append(dict(chapter_number=n,chapter_id=rev['chapter_id'],title=title,revision_id=rev['revision_id'],api_content_hash=actual['contentHash'],export_file_sha256=sha(file),canonical_words=actual['wordCount'],export_path=f'final/chapters/ch{n:02}.md',readback_at=read(f'evidence/final-ch{n:02}-readback.json')['time'],source_generation_ids='',manual_edit_present=False))
    chapters.append(dict(chapter_number=n,title=title,revision_id=rev['revision_id'],canonical_words=actual['wordCount'],objective_met=n<5,continuity_ok='SEED_REVIEW_ONLY',point_of_view_ok=True,reviewer='SELF_REVIEW_ONLY',full_chapter_read=True,verdict='IMPORTED_COMPLETE_SEED' if n<5 else 'PARTIAL_SEED_NOT_COMPLETED',evidence=f'evidence/final-ch{n:02}-readback.json'))
table('revision_manifest.csv',manifest);table('chapter_reviews.csv',chapters)

items=[]
for pipe in ['P1','P3']:
    with (R/f'evidence/memory/{pipe}-M0/expected-items.csv').open(encoding='utf-8',newline='') as f: rows=list(csv.DictReader(f))
    for row in rows:
        row.update(raw_match='MISSING_NO_USABLE_PROPOSALS',extraction_method='LLM attempted; world-rule lane regex by contract',persisted_match='MISSING_FROM_CONTEXT; full memory export not exposed',provenance_correct='NOT_ASSESSED',manual_correction=False,post_correction_match='NOT_ASSESSED',issue_id='P1-001' if pipe=='P1' else 'P3-001')
    items.extend(rows)
q=data('memory/P2-M0/raw-queue')
constraint_texts=read('evidence/p2-idea-request.json')['author_constraints']
for i,text in enumerate(constraint_texts,1):
    matched=[p for p in q if p['payload'].get('fact_value')==text]
    items.append(dict(audit_id='P2-M0',item_id=f'P2-G{i}',pipeline='P2',memory_type='author_constraint',critical=True,source_revision_or_request_id='p2-idea-request.json',source_hash=sha(R/'evidence/p2-idea-request.json'),source_excerpt=text,expected_assertion=text,expected_certainty='author_constraint',origin_author_supplied_or_model_proposed='author_supplied; model echoed; author accepted',raw_proposal_ids=';'.join(p['proposal_id'] for p in matched),extraction_method='LLM blueprint generation + author-constraint derived proposals; NOT prose extraction',raw_match=True,persisted_match='CONTRADICTED_BY_ALIVE' if 'Mai Lâm' in text else True,manual_correction=False,post_correction_match='NOT_ASSESSED',issue_id='P2-001' if 'Mai Lâm' in text else '',evidence='evidence/memory/P2-M0/context-mai-lam.json'))
table('memory_items.csv',items)

probes=[];audits=[]
for pipe,novel,cutoff in [('P1',main,5),('P2',p2,1),('P3',p3,5)]:
    gold=read(f'evidence/memory/{pipe}-M0/probe-gold.json')['probes']
    for i,(question,anchor,expected) in enumerate(gold,1):
        ctx=data(f'memory/{pipe}-M0/probe-{i:02}')
        ids=ctx['context_summary']; negative=(i==5 and pipe!='P2') or (pipe=='P2' and i in [3,5])
        passed=(pipe=='P2' and i!=1) or (pipe!='P2' and i==5)
        probes.append(dict(audit_id=f'{pipe}-M0',probe_id=f'{pipe}-Q{i}',pipeline=pipe,probe_type='future_negative' if negative else 'source_or_state',chapter_cutoff=cutoff,query=question,expected_result=expected,forbidden_assertions='Mai Lâm Alive' if pipe=='P2' and i==1 else 'Future plan asserted as historical fact',request_evidence=f'evidence/memory/{pipe}-M0/probe-{i:02}.json',retrieved_ids='NOT_SEPARATELY_EXPOSED',packed_ids=json.dumps(ids.get('entity_ids',[])+ids.get('event_ids',[])+ids.get('fact_ids',[])),returned_source_revisions='NOT_EXPOSED',semantic_lane_status='DISABLED_NOT_ASSESSED',observed_result='No historical future event present; absence-only scope' if negative else ('Alive contradicts death rule' if pipe=='P2' and i==1 else ('Expected rule/entity retained' if passed else 'No historical memory retained')),context_evidence_sufficient=passed,verdict='PASS' if passed else 'FAIL',issue_id='P2-001' if pipe=='P2' and not passed else ('P1-001' if pipe=='P1' and not passed else ('P3-001' if pipe=='P3' and not passed else ''))))
    evidence=R/f'evidence/memory/{pipe}-M0'
    expected_hash=sha(evidence/('expected-items.csv' if pipe!='P2' else 'gold-before-blueprint.json'))
    job={'P1':'a3218759-98a6-57bd-9d97-944d266ebd6c','P2':'9edd2bef-027b-5cf2-8b90-11229ef1a3d6','P3':'89ec650f-4497-58d6-908f-0b5890611945'}[pipe]
    audits.append(dict(audit_id=f'{pipe}-M0',pipeline=pipe,novel_id=novel,checkpoint_labels='M0|M-FINAL_EARLY_STOP',completed_chapters=0 if pipe=='P2' else 4,chapter_cutoff=0 if pipe=='P2' else 5,source_manifest='evidence/p2-idea-request.json' if pipe=='P2' else ('evidence/import-revisions.json' if pipe=='P1' else 'evidence/p3-import-revisions.json'),expected_items_hash=expected_hash,analysis_job_ids=job,extraction_model_observed='gemini-3.5-flash-lite (runtime HTTP route; no provider response model/call id)',execution_evidence='evidence/ai-service-live-sanitized.log',raw_snapshot=f'evidence/memory/{pipe}-M0/raw-queue.json',accepted_snapshot='evidence/p2-accept-reviewed-group.json' if pipe=='P2' else 'NOT_ACTIVATED',brain_before=1,brain_after=2 if pipe=='P2' else 1,expected_n=3 if pipe=='P2' else 35,correct_expected_n=3 if pipe=='P2' else 0,reviewed_output_n=11 if pipe=='P2' else 0,supported_output_n=11 if pipe=='P2' else 0,critical_expected_n=3 if pipe=='P2' else 35,critical_correct_n=2 if pipe=='P2' else 0,provenance_checked_n='NOT_ASSESSED',provenance_correct_n='NOT_ASSESSED',future_leaks='0 in inspected context only',stale_current_states=1 if pipe=='P2' else 'NOT_ASSESSED_NO_MEMORY',manual_corrections=0,llm_execution='NOT_ASSESSED_CALL_SOURCE_TRACE_INCOMPLETE' if pipe=='P2' else 'FAIL_NO_SUCCESSFUL_USABLE_EXTRACTION',raw_extraction_quality='NOT_APPLICABLE_BLUEPRINT' if pipe=='P2' else 'FAIL_USABLE_PROPOSAL_RECALL_0_OF_35; RAW_TEXT_NOT_ASSESSED',memory_materialization='FAIL_CONTRADICTORY_CURRENT_STATE' if pipe=='P2' else 'BLOCKED',context_retrieval='FAIL',post_correction_quality='NOT_ASSESSED',overall_memory='FAIL',shared_evidence='M-FINAL aliases same cutoff/snapshot. P3 baseline is import preparation, not controller extraction.',issue_ids='P2-001;OBS-002' if pipe=='P2' else ('P1-001;OBS-002' if pipe=='P1' else 'P3-001;OBS-002'),report_path=f'evidence/memory/{pipe}-M0/MEMORY_AUDIT.md'))
    text=f'''# Narrative memory audit — {pipe}-M0 / M-FINAL early stop

Run {R.name}; project {novel}; recorded {NOW}. Code SHA {cfg['code_sha']}.
Overall: FAIL. Final aliases M0 at unchanged source cutoff. No correction, DB/code changes or subsequent prose accepted.

Gold was frozen before extraction: `{expected_hash}`. See source manifest and expected items; P1/P3 source contains four complete chapters and partial chapter 5. P2 is author idea, zero prose chapters; context probe cutoff 1 is prospective, not a completed chapter.

Provider: observed HTTP 200 requests to Gemini 3.5 Flash-Lite in runtime logs. Provider raw response, finish reason, usage and call IDs are not exposed; cannot certify a successful extraction just from configuration/HTTP. Logs correlate time with job execution but do not expose exact input per provider call. No semantic embeddings in this runtime. World rules in manuscript analysis use a regex lane; do not count them as LLM extraction.

'''
    if pipe=='P2':
        text+='''Blueprint raw queue: 11 outputs reviewed, 11 supported as premise/rules/entities; three duplicate constraints. Constraint sample coverage 3/3 before activation; this is blueprint generation, not prose-extraction recall. Origin: premise and constraints author-supplied; generic protagonist and other entity proposals model-proposed/author-accepted. Rejected the three duplicate author_constraint records; accepted eight individually reviewed outputs in one dependency group. Saved raw queue before decisions and accepted artifact IDs after. Baseline brain version 1 → 2.

Materialization/context failure: Mai Lâm has status Alive in both entities and current_states while a retained world_rule states he is dead and must not revive. Constraint correctness in operative context is 2/3, not 3/3; critical recall fails. Four of five preview probes retain the expected rule/entity or show the scoped absence of future events; death probe fails. No full-record/source provenance export through the inspected Node gateway, so provenance accuracy is NOT_ASSESSED. No text generation after the critical gate. Public character profile PATCH lacks a canonical status/state field; accepted proposals cannot be re-edited through pending-only proposal API. No supported correction established, no legacy profile write attempted to disguise a repair.
'''
    else:
        text+=('''P1 first attempt failed entity JSON parsing at chapter 1; one same-manifest retry failed event JSON parsing at chapter 1. Both job snapshots retained. No successful chapter checkpoint, proposal queue empty and historical context empty. Output ceiling 512 tokens may contribute, but raw response/finish reason absent, so truncation remains unproven.
''' if pipe=='P1' else '''Independent P3 seed baseline failed while persisting an entity proposal: confidence Decimal('10.0') overflows numeric(5,4). The job error identifies analysis run, chapter revision and proposal. No model/proposal confidence normalization or DB schema patch was performed. This baseline was produced by manuscript import, not controller; controller never started, so P3 generation, auto-accept and autonomy are NOT_RUN.
''')
        text+='''Usable-proposal coverage 0/35 expected source assertions; output precision 0/0 is NOT_ASSESSED, never 100%. Raw model-text quality cannot be scored without that response. No accepted historical state to validate provenance. Four positive context probes lack supporting memory; one negative probe shows no future historical event only (context coverage 1/5 with this limitation). Do not infer successful retention from an empty history. Baseline activation blocked, no manual gold injection.
'''
    text+='''
Evidence: raw-queue.json; probe-gold.json and probe-01..05.json; memory_probes.csv; memory_items.csv; job snapshots at run evidence root; sanitized runtime log. No separate raw retrieval IDs before packing are exposed. See REPORT.md and issues.csv for repro/resume.

M-FIRST NOT_RUN: no new accepted prose. Main M10/M20/M30/M40 NOT_RUN: cutoff never reached. Main M50 NOT_APPLICABLE: 40-chapter fixture. Short P2/P3 probe has no long-term coverage. Post-correction quality NOT_ASSESSED; no repair made. Resume requires a separately fixed/versioned product and complete M0 retest before generation. Preserve all pre-fix failures and freeze new expected items before any new analysis.
'''
    (evidence/'MEMORY_AUDIT.md').write_text(text,encoding='utf-8')
table('memory_checkpoints.csv',audits);table('memory_probes.csv',probes)

# Preserve historical issue records; add concrete product failures once.
with (R/'issues.csv').open(encoding='utf-8',newline='') as f: old=list(csv.DictReader(f))
for row in old:
    if row['issue_id']=='PRE-002': row['status']='RESOLVED';row['retest_evidence']='evidence/author-me.json; successful live requests'
    if row['issue_id']=='PRE-003': row['status']='RESOLVED_EXPLICIT_USER_APPROVAL';row['retest_evidence']='evidence/provider-smoke.json'
new=[('P1-001','S1','extraction_json','Structured extraction completes five seed revisions','First attempt entity invalid JSON; retry event invalid JSON; 0/5 completed','evidence/p1-bootstrap-poll01.json; evidence/p1-bootstrap-poll02.json','Do not keep retrying or inject gold; fix parse/output contract separately'),('P2-001','S1','current_state_projection','Mai Lâm remains dead in every operative memory/context lane','Blueprint death rule retained but canonical entity/current_states status Alive','evidence/memory/P2-M0/context-mai-lam.json','No canonical correction via inspected public gateway; hold generation'),('P3-001','S1','proposal_persistence','Model confidence is normalized/validated for persistence','confidence 10.0 overflows numeric(5,4), baseline transaction fails','evidence/p3-bootstrap-poll01.json','Separate product fix and new versioned retest; no DB patch'),('OBS-002','S2','observability','Provider raw response/usage/call-to-source trace and memory provenance observable','HTTP 200/model route observed; raw output/finish reason/usage/input-call IDs absent','evidence/ai-service-live-sanitized.log; evidence/provider-http-calls.json','Mark missing metrics NOT_ASSESSED; request observability in separate fix')]
existing={x['issue_id'] for x in old}
for ident,sev,cat,expected,actual,evidence,workaround in new:
    if ident not in existing: old.append(dict(issue_id=ident,severity=sev,category=cat,first_seen_iso=NOW,code_sha=cfg['code_sha'],expected=expected,actual=actual,repro_steps='Use recorded public request payload and project/job IDs; inspect immutable evidence before retry',evidence_paths=evidence,natural_or_injected='natural',workaround=workaround,impact_on_completion='Blocks affected gate; no claim of 100k success',status='OPEN'))
table('issues.csv',old)

# Index every public API evidence, including reads, in the action ledger.
with (R/'actions.csv').open(encoding='utf-8',newline='') as f: actions=list(csv.DictReader(f))
for i,p in enumerate(sorted((R/'evidence').rglob('*.json')),1):
    try: e=read(str(p.relative_to(R)))
    except Exception: continue
    if not isinstance(e,dict) or e.get('channel')!='PUBLIC_API':continue
    aid='API-'+p.relative_to(R/'evidence').as_posix().replace('/','-')
    if any(row['action_id']==aid for row in actions):continue
    req=e.get('request') or {}; path=e['path']; result='HTTP_'+str(e['status'])
    actions.append(dict(action_id=aid,time_iso=e['time'],phase='LIVE_TEST',channel='PUBLIC_API',novel_id=req.get('novel_id',req.get('novelId','')),action=e['method']+' '+path,request_evidence=str(p.relative_to(R)),response_evidence=str(p.relative_to(R)),latency_ms=e.get('latency_ms',''),result=result))
table('actions.csv',actions)

# Duplicate proposal review is an author decision, with zero prose words changed.
table('interventions.csv',[dict(intervention_id='I001',time_iso=NOW,kind='PROPOSAL_REVIEW_NOT_PROSE_EDIT',reason='Three duplicate constraint proposals; retain model world-rule records',requested_change='Reject duplicate author_constraint records, accept eight reviewed records',channel='PUBLIC_API',estimated_words_changed=0,measurement_method='No chapter prose write after seed import; only proposal decisions',issue_id='P2-001',evidence='evidence/p2-reject-duplicate-1.json; evidence/p2-accept-reviewed-group.json')])
continuity=[]
for i,row in enumerate(items[:35],1):
    continuity.append(dict(entry_id=f'C{i:02}',chapter_number=row['source_chapter'],revision_id=row['source_revision_or_request_id'],entity_or_object=row['memory_type'],event_or_state=row['expected_assertion'],certainty=row['expected_certainty'],known_by=row.get('expected_known_by',''),source_excerpt=row['source_excerpt'],review_status='SOURCE_GOLD_ONLY_NOT_INJECTED'))
table('continuity.csv',continuity)

cfg.update(status='BLOCKED',ended_at=NOW)
cfg['runtime']['observed_generation_model']='gemini-3.5-flash-lite selected; provider HTTP route observed; response model/usage not exposed'
cfg['budget']['consumed_provider_calls']=10
cfg['budget']['call_count_method']='9 AI-service generateContent HTTP 200 in run logs + 1 successful Node copilot smoke; excludes metadata health/model-list calls. Remaining account quota UNKNOWN.'
cfg['reviewer']={'identity':'SELF_REVIEW_ONLY','independent':False,'full_text_read':False,'scope':'Read all five seed source chapters; no full final novel exists'}
cfg['notes']='Explicit Gemini data transmission approval received. Live run stopped by product failures P1-001/P2-001/P3-001; no code/DB/global-config fix or gold injection. Existing demo stack used; isolated novel IDs. All API substitutions logged. Main canonical artifact 4747 seed words, zero new accepted prose; target unchanged.'
(R/'run_config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cp=read('checkpoint.json');cp.update(updated_at=NOW,status='BLOCKED',plan_id='3d04cbef-32dc-4a5e-89da-a1a31a49fa5e',plan_version=1,p2_probe_novel_id=p2,p3_probe_novel_id=p3,pending_jobs=[],unresolved_issue_ids=['P1-001','P2-001','P3-001','OBS-001','OBS-002','UI-001'],next_action='Do not generate against failed M0. Fix product separately: extraction output/parse handling, canonical dead-state correction/materialization, confidence normalization. Preserve this run; after fix create new versioned run or explicit pre/post boundary. Verify same server revisions and job terminal state; re-audit M0 before any writing. Do not re-import existing seed or repeat accepted P2 proposals.')
cp['budget'].update(provider_calls_made=10,cost_usd=None)
cp['memory_audit'].update(completed_audit_ids_by_pipeline={x:[f'{x}-M0_FAIL',f'{x}-M-FINAL_EARLY_STOP_ALIAS'] for x in ['P1','P2','P3']},next_due_by_pipeline={x:'M0_RETEST_AFTER_PRODUCT_FIX' for x in ['P1','P2','P3']},pending_audit_ids=[],unresolved_issue_ids=['P1-001','P2-001','P3-001','OBS-002'])
cp['bootstrap_job_ids']={'P1':'a3218759-98a6-57bd-9d97-944d266ebd6c','P2':'9edd2bef-027b-5cf2-8b90-11229ef1a3d6','P3':'89ec650f-4497-58d6-908f-0b5890611945'}
(R/'checkpoint.json').write_text(json.dumps(cp,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'BLOCKED','canonical_words':4747,'new_accepted_prose_words':0,'audits':3,'context_probes':15,'observed_generate_requests':10,'target_unchanged':100000}))
