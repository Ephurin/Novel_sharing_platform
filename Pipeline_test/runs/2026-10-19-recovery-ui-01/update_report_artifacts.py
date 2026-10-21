"""Summarize recorded observations. No application or provider writes."""
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NOW = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat()
NOVEL = '7d03320e-94c3-4913-a31f-a6eeef8af0dc'

def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8-sig'))

def save(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def table(name, rows):
    with (ROOT / name).open(encoding='utf-8-sig', newline='') as f:
        fields = next(csv.reader(f))
    with (ROOT / name).open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)

issues = [
    ('ENV-DOCKER-STOPPED-001','HIGH','environment','Engine stopped; Windows socket listener prevented restart','User manually opened Docker Desktop; isolated stack restored','RESOLVED','evidence/environment-recovery.json'),
    ('MEM-CRITICAL-001','HIGH','extraction_quality','All 35 frozen critical assertions should be extracted with correct certainty','Raw 15 PASS / 16 FAIL / 4 PARTIAL; after author review 13 PASS / 19 FAIL / 2 PARTIAL / 1 author wording','OPEN','evidence/m0-gold-manual.json'),
    ('EXTRACT-SUBJECT-UNRESOLVED-001','HIGH','projection','Proposal subjects should resolve to approved or proposed entities','Group approval INVALID_PROJECTION Unknown or ambiguous entity: Unknown; 28 fact edits and 3 numeric rejections required','OPEN','evidence/s03-applied-repairs-ui.json'),
    ('REVIEW-EDITS-RESET-001','MEDIUM','ui','Approving one group should preserve edits staged in another group','Successful group approval calls global setEdits({}); edits in other groups had to be reapplied','OPEN','evidence/s03-current-group-93.json'),
    ('WRITE-INVALID-JSON-001','HIGH','generation','AI writing output should be complete readable prose before acceptance','Completed generation contains incomplete JSON; UI claims validated and offers accept; author rejected it','OPEN','evidence/s07-generated-before-accept/writing-generations.json'),
    ('EXTRACT-ROLE-CONFUSION-001','HIGH','extraction_quality','Actor action should not become location lifecycle status','trạm Bốn status=Rời đi proposed from characters leaving station; author rejected','OPEN','evidence/s08-author-edits.json'),
    ('PROVIDER-503-001','HIGH','provider','Provider should complete extraction and consistency calls','Gemini 503 high demand; outbox retry and consistency error observed','OPEN','evidence/s10-provider-error-ui.txt'),
]
table('issues.csv', [dict(issue_id=i,severity=s,category=c,first_seen_iso='',
    code_sha='94d5072 + recovery working tree',chapter_number='',expected=e,actual=a,
    repro_steps='See REPORT.md and linked immutable evidence',evidence_paths=p,
    natural_or_injected='natural',workaround='See report; manual repair never counts as raw LLM success',
    impact_on_completion='P1 gate remains FAIL; P2/P3/100k NOT_RUN',status=v)
    for i,s,c,e,a,v,p in issues])

with (ROOT/'memory_gold_probes.csv').open(encoding='utf-8-sig',newline='') as f:
    probes=list(csv.DictReader(f))
table('memory_probes.csv', [dict(audit_id='P1-M0',probe_id=f"{p['item_id']}-{p['budget']}",
    pipeline='P1',probe_type='FIXED_CHARACTER_CONTEXT_GOLD_PRESENCE',chapter_cutoff=5,
    query=p['query'],expected_item_ids=p['item_id'],expected_result=p['expected'],
    forbidden_assertions='Do not turn uncertain narration into confirmed fact',
    request_evidence=p['context_file'],retrieved_ids='NOT_OBSERVED',packed_ids=p['packed_ids'],
    returned_source_revisions='See context JSON selected records',semantic_lane_status='NOT_OBSERVED',
    observed_result=p['verdict']+'; '+p['json_paths'],context_evidence_sufficient='ID_AND_STATE_LINKAGE_ONLY',
    verdict=p['verdict'],issue_id='MEM-CRITICAL-001') for p in probes])

baseline=read('evidence/m0-after-review/summary.json')
mfirst=read('evidence/s08-after-review/summary.json')
common=dict(pipeline='P1',novel_id=NOVEL,completed_chapters='0 newly completed; 5 imported fixture chapters',
    source_manifest='revision_manifest.csv; frozen M0 revisions in evidence/s02-raw/revisions.json',
    expected_items_hash=hashlib.sha256((ROOT/'evidence/expected-items-before-extraction.csv').read_bytes()).hexdigest(),
    extraction_model_observed='models/gemini-3.5-flash-lite',execution_evidence='evidence/provider-traces-progress.json',
    raw_snapshot='evidence/s02-raw/proposals-pending.json',expected_n=35,correct_expected_n=15,
    reviewed_output_n=174,supported_output_n='NOT_AGGREGATED',critical_expected_n=35,critical_correct_n=15,
    provenance_checked_n=187,provenance_correct_n='187 structural only; semantic accuracy NOT_AGGREGATED',
    future_leaks='No selected S05 future event observed as canon at S06',stale_current_states='NOT_EXHAUSTIVELY_ASSESSED',
    manual_corrections='28 unique M0 fact edits + 13 rejections; reapplied edits separately',llm_execution='PASS_OBSERVED',
    raw_extraction_quality='FAIL',memory_materialization='PASS_AFTER_AUTHOR_REPAIRS',context_retrieval='PARTIAL',
    post_correction_quality='FAIL_GOLD',overall_memory='FAIL',shared_evidence='memory_items.csv; memory_probes.csv',
    issue_ids='MEM-CRITICAL-001;EXTRACT-SUBJECT-UNRESOLVED-001',report_path='MEMORY_AUDIT.md')
table('memory_checkpoints.csv',[
    {**common,'audit_id':'P1-M0','checkpoint_labels':'M0','chapter_cutoff':5,
     'accepted_snapshot':'evidence/m0-after-review/official-memory.json','brain_before':1,'brain_after':6},
    {**common,'audit_id':'P1-M-FIRST','checkpoint_labels':'M-FIRST','chapter_cutoff':6,
     'expected_n':'NEW_SCENE_4 checks; original 35 not re-scored at this checkpoint','correct_expected_n':4,
     'critical_expected_n':'NOT_REDEFINED','critical_correct_n':'NOT_AGGREGATED',
     'reviewed_output_n':39,'provenance_checked_n':'NOT_AGGREGATED','provenance_correct_n':'NOT_AGGREGATED',
     'raw_snapshot':'evidence/s08-author-save-before-review/proposals-pending.json',
     'accepted_snapshot':'evidence/s08-after-review/official-memory.json','brain_before':6,'brain_after':7,
     'manual_corrections':'5 edits + 1 rejection; 15 older proposals rejected after stale guard',
     'raw_extraction_quality':'PARTIAL_SCENE_RECALL; ROLE_CONFUSION_PRESENT',
     'post_correction_quality':'SCENE_PRESENT; ORIGINAL_GOLD_GAP_REMAINS',
     'context_retrieval':'NOT_ASSESSED_AT_CUTOFF_6; helper defaults cutoff 5'}])

(ROOT/'MEMORY_AUDIT.md').write_text('''# Narrative memory audit — 2026-10-19-recovery-ui-01

**P1-M0: FAIL.** Reviewer is the repairing developer/retester, not independent.
Frozen 35 gold assertions were bound before extraction. Every assertion was manually judged for meaning and certainty; no overlap threshold was used as a semantic PASS.

| Layer | Observation |
|---|---|
| Provider execution | Actual Gemini structured traces; model `models/gemini-3.5-flash-lite` |
| Raw 187 proposals / 35 gold | 15 PASS, 16 FAIL, 4 PARTIAL (strict supported recall 15/35) |
| Structural quote/hash | 187/187 valid spans/hash; this does not prove semantic attribution |
| After author review | 13 PASS, 19 FAIL, 2 PARTIAL, 1 PASS_AFTER_AUTHOR_WORDING |
| Review | 174 accepted, 13 rejected; 28 unique fact edits, several reapplied after UI reset |
| Approved M0 | 33 entities, 98 facts, 19 events, 70 transitions; brain v6 active |
| 4k fixed Linh query, cutoff 5 | 3 present, 11 dropped, 21 upstream gaps; 3997 token estimate |
| 8192 fixed Linh query, cutoff 5 | 6 present, 8 dropped, 21 upstream gaps; 8150 token estimate |

All 70 rows in memory_probes.csv reuse **two fixed context requests**, not 70 free-text retrieval calls. Selected IDs and materialized state are observable; retrieval candidates and semantic-lane internals are NOT_OBSERVED. A bounded context is not required to pack every gold assertion simultaneously. Upstream omissions and loss of certainty remain material failures regardless of packing.

Missing/incorrect assertions include CV-04 characteristics and scan count, storage and permissions, right-ear compensation and uncertainty around Vũ, the notebook and bell history. Some numerical assertions were raw-correct but rejected because unresolved subjects could not be safely repaired with the current fields. Aliases were not linked (aliases=0); separate Linh/Mai Linh and Vũ/Nguyễn Vũ identities remain a risk.

**P1-M-FIRST: partial functional success after author repair.** The AI-generated draft was rejected because it was incomplete JSON. An author-written 216-word chapter was saved through the UI. Its latest revision produced 40 proposals; the prior 45-word revision produced 15. The stale group was blocked with STALE_PROPOSAL_EVIDENCE, then rejected through the UI. Five new fact edits and one station-status rejection were required before accepting 39 proposals. Brain v7 has 42 entities, 120 facts, 21 events and 85 transitions. The shell pickup event, ash-purple color, spiral shape and ownership were observed. This does not close the original 35-gold failures or establish autonomous success.

M10/M20/M50: NOT_RUN (six draft chapters only). P2/P3: NOT_RUN. No publication or 100k run. See REPORT.md for final checkpoint and outstanding proposals.

Primary evidence: memory_items.csv; memory_probes.csv; evidence/m0-gold-manual.json; evidence/m0-after-review/; evidence/s08-author-save-before-review/; evidence/s08-after-review/.
''',encoding='utf-8')
print('Updated issues, M0/M-FIRST audit and 70 evidence-linked context probe rows.')
