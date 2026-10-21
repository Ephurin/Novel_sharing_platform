"""Build an honest, resumable closeout from frozen evidence. No app writes."""
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path

R=Path(__file__).resolve().parent
now=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat()
novel='7d03320e-94c3-4913-a31f-a6eeef8af0dc'
def read(p): return json.loads((R/p).read_text(encoding='utf-8-sig'))
def save(p,v): (R/p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def rows(p):
    with (R/p).open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))
def write(p,data,fields=None):
    if fields is None:
        with (R/p).open(encoding='utf-8-sig',newline='') as f: fields=next(csv.reader(f))
    with (R/p).open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fields,extrasaction='ignore');w.writeheader();w.writerows(data)

snap=read('evidence/final/summary.json')
brain=read('evidence/final/brain.json')[0]
revisions=read('evidence/final/revisions.json')
stopped=read('evidence/stopped-checkpoint.json')
pending=[o for o in stopped['outbox'] if o['status'] not in ('COMPLETED','FAILED')]
plan=read('evidence/final/active-plan.json')
head=next(c for c in revisions if c['chapter_number']==6)
http=read('evidence/provider-http-attempts.json')
traces=read('evidence/provider-traces-progress.json')

# Preserve the five-revision baseline manifest before exporting the final head.
if not (R/'evidence/import-revision-manifest.csv').exists():
    (R/'evidence/import-revision-manifest.csv').write_bytes((R/'revision_manifest.csv').read_bytes())
manifest=[]
for c in revisions:
    path=f"final/chapters/ch{c['chapter_number']:02}.txt"
    body=c['content'].encode('utf-8')
    (R/path).parent.mkdir(parents=True,exist_ok=True)
    (R/path).write_bytes(body)
    digest=hashlib.sha256(body).hexdigest()
    assert digest==c['content_hash'], (c['chapter_number'], 'export/source hash mismatch')
    manifest.append(dict(chapter_number=c['chapter_number'],chapter_id=c['chapter_id'],title=c['title'],
        revision_id=c['revision_id'],api_content_hash=c['content_hash'],export_file_sha256=digest,
        canonical_words=c['word_count'],export_path=path,readback_at=snap['checked_at'],
        source_generation_ids='',manual_edit_present=str(c['chapter_number']==6).upper()))
write('revision_manifest.csv',manifest)

config=read('run_config.json')
config.update(status='PARTIAL_GATE_FAILED',closed_at=now,
    mode='UI_ONLY_AUTHOR_WRITES_WITH_READ_ONLY_VERIFICATION',
    service_state='Isolated backend/AI intentionally stopped after failed-gate evidence capture')
config['runtime'].update(extraction_provider='gemini',bootstrap_provider='gemini',
    observed_extraction_model='models/gemini-3.5-flash-lite',
    observed_generation_model=None,output_token_limit='Structured trace: 8192; writing not established')
config['budget'].update(consumed_provider_calls=len(http),consumed_wall_clock_hours=None,
    notes='104 observed HTTP response attempts at closeout, not billed call total; a killed in-flight request may be unobserved. Structured response records tracked separately. Workers intentionally stopped; cost UNKNOWN. Active duration not measured reliably; no wall-clock PASS claim.')
save('run_config.json',config)

checkpoint=read('checkpoint.json')
checkpoint.update(updated_at=now,status='PARTIAL_GATE_FAILED',current_step='S11_CLOSEOUT',
    current_chapter_number=6,current_chapter_id=head['chapter_id'],
    latest_canonical_revision_id=head['revision_id'],latest_content_hash=head['content_hash'],
    brain_version=brain['brain_version'],plan_id=plan.get('plan_id',plan.get('id')),
    plan_version=plan.get('plan_version',plan.get('version')),
    last_generation_id='e0816aaf-ad19-4d44-984b-d8c0ceba155f',
    pending_jobs=pending,pending_proposal_count=len(stopped['pending_proposals']),
    canonical_word_count=sum(c['word_count'] for c in revisions),completed_chapters_by_content_review=[],
    provider_calls_observed_this_run=len(http),
    unresolved_issue_ids=[i['issue_id'] for i in rows('issues.csv') if i['status']=='OPEN']+['REANALYSIS-LIVE-UNRESOLVED-001'],
    s02_verdict='PASS_FUNCTIONAL_FAIL_QUALITY',s09_verdict='PARTIAL_UNFINISHED_EXTRACTION',
    s10_verdict='PASS_AFTER_PROVIDER_RETRY',s11_verdict='PASS_SAVE_RELOAD_FAIL_MEMORY_FRESHNESS',
    services_intentionally_stopped=stopped['services_intentionally_stopped'],
    next_action='Fix writing output validation, unresolved extraction subjects/review edit loss and reconciliation quality. Read PostgreSQL current state before restarting isolated workers; never approve the injected age-40 revision. P2/P3/100k remain NOT_RUN.',
    resume_rule='Read evidence/stopped-checkpoint.json. PROCESSING is persisted state at stop. Restart only isolated ai-service/backend if resuming this run, then inspect lease recovery/latest revision and review groups by source revision; no direct DB rescue.')
checkpoint['memory_audit'].update(completed_audit_ids_by_pipeline={'P1':['P1-M0','P1-M-FIRST','P1-FINAL'],'P2':[],'P3':[]},
    next_due_by_pipeline={'P1':'RETEST_FAILED_GATES_BEFORE_M10','P2':'M0_NOT_RUN','P3':'M0_NOT_RUN'},
    pending_audit_ids=[],unresolved_issue_ids=['MEM-CRITICAL-001','REANALYSIS-LIVE-UNRESOLVED-001'])
checkpoint['last_action_log_row']='UI-014'
save('checkpoint.json',checkpoint)

issues=rows('issues.csv')
issues.append(dict(issue_id='REANALYSIS-LIVE-UNRESOLVED-001',severity='HIGH',category='reconciliation',
    code_sha='94d5072 + recovery working tree',chapter_number=6,
    expected='Valid bounded comparison should produce reviewable proposals for saved prose',
    actual='Manual UI reanalysis and outbox returned CANON_RECONCILIATION_UNRESOLVED after 3 attempts; no partial proposal group persisted',
    repro_steps='Open chapter6 saved revision 9f0c799d; click UI reanalysis; inspect guarded error and outbox',
    evidence_paths='evidence/reanalysis-result-ui.txt;evidence/final/outbox.json;evidence/stopped-checkpoint.json',
    natural_or_injected='natural',workaround='None used; do not convert comparisons into new canon',
    impact_on_completion='S09 latest-memory/dedup completion not established',status='OPEN'))
write('issues.csv',issues)

actions=rows('actions.csv')[:3]
observations=[
 ('S02','Extraction completed; 187 raw proposals before any approval','evidence/s02-raw/summary.json','PASS_FUNCTIONAL_FAIL_GOLD'),
 ('S03','Reviewed baseline with 28 unique edits and 13 rejections; brain6 active','evidence/m0-after-review/summary.json','PASS_AFTER_AUTHOR_REPAIRS'),
 ('S04','Read memory tabs and reload','evidence/s04-memory-tabs.json','PASS_PERSISTENCE'),
 ('S05','Requested 3 events, edited first, dropped ending event','evidence/s05-edited-suggestions.json','PASS_FUNCTIONAL'),
 ('S06','Saved 2 future objectives and verified isolation','evidence/s06-plan-saved/summary.json','PASS_ISOLATION'),
 ('S07','Rejected incomplete JSON; manually wrote 216-word chapter and saved through editor','evidence/s07-invalid-ai-draft-ui.txt','FAIL_AI_OUTPUT_PASS_MANUAL_SAVE'),
 ('S08','Stale revision blocked; latest40 reviewed: 5 edits, 1 rejection, 39 accepted','evidence/s08-after-review/summary.json','PASS_AFTER_AUTHOR_REPAIRS'),
 ('S09','Saved V2 while V1 PROCESSING; retry blocked by 503 and unresolved reconciliation','evidence/s09-overlap-ui.json','PARTIAL'),
 ('S10','Injected age40, checked, corrected19, checked again','evidence/s10-corrected-result-ui.txt','PASS_AFTER_PROVIDER_RETRY'),
 ('REANALYSIS','Clicked UI once; actionable unresolved comparison after bounded repairs','evidence/reanalysis-result-ui.txt','FAIL_FUNCTIONAL_GUARD_WORKED'),
 ('S11','Reload matched correction; continued14words and saved245-word chapter; workers later stopped','evidence/stopped-checkpoint.json','PARTIAL_MEMORY_LAG'),
]
for n,(phase,action,evidence,result) in enumerate(observations,4):
    actions.append(dict(action_id=f'UI-{n:03}',time_iso='',phase=phase,
        channel='UI; READ_ONLY_VERIFICATION',novel_id=novel,
        action=action+' [Summary entry; exact click time not reconstructed]',response_evidence=evidence,result=result))
write('actions.csv',actions)

write('interventions.csv',[
 dict(intervention_id='INT-M0',kind='AUTHOR_REVIEW',reason='Unsupported facts and unresolved subjects',
      requested_change='28 unique fact edits; 13 rejections; reapply edits reset by another group approval',channel='UI',
      estimated_words_changed='NOT_MEASURED',measurement_method='Proposal IDs and decision log, not prose word attribution',
      issue_id='MEM-CRITICAL-001;EXTRACT-SUBJECT-UNRESOLVED-001;REVIEW-EDITS-RESET-001',evidence='evidence/m0-after-review/decisions.json'),
 dict(intervention_id='INT-WRITE',chapter_number=6,kind='REJECT_AI_AND_WRITE_MANUALLY',
      reason='Incomplete JSON marked completed',requested_change='Rejected UI draft; wrote216 words; later final245 words',channel='UI',
      revision_after='836ef59f-5e9b-4b08-856d-7e9754331335',estimated_words_changed=216,
      measurement_method='Whitespace words in first manually written scene; later revisions separately exported',
      issue_id='WRITE-INVALID-JSON-001',evidence='evidence/s07-author-chapter.txt'),
 dict(intervention_id='INT-MFIRST',chapter_number=6,kind='AUTHOR_REVIEW',reason='Generic subjects and station-role confusion',
      requested_change='5 edits and1 rejection; reject15 stale seed proposals',channel='UI',
      estimated_words_changed='NOT_MEASURED',issue_id='EXTRACT-ROLE-CONFUSION-001',evidence='evidence/s08-author-edits.json'),
 dict(intervention_id='INT-FAULT',chapter_number=6,kind='CONTROLLED_CONTRADICTION',reason='S10 positive and negative checks',
      requested_change='Injected An age40 then corrected19 through editor; never approved wrong age',channel='UI',
      revision_after='9f0c799d-288a-4bc9-82bb-3c659bd75bf8',estimated_words_changed='NOT_MEASURED',evidence='evidence/s10-corrected-result-ui.txt')])

write('chapter_reviews.csv',[dict(chapter_number=c['chapter_number'],title=c['title'],revision_id=c['revision_id'],
    canonical_words=c['word_count'],objective_met='NOT_ASSESSED_COMPLETION',continuity_ok='NOT_EXHAUSTIVELY_ASSESSED',
    point_of_view_ok='NOT_SCORED',prose_score_0_4='NOT_SCORED',pacing_score_0_4='NOT_SCORED',
    issues='Fixture seed' if c['chapter_number']<6 else 'Author-written fragment; AI draft rejected; memory lag',
    reviewer='Codex developer/retester; not independent',full_chapter_read='TRUE',
    verdict='IMPORTED_FIXTURE' if c['chapter_number']<6 else 'DRAFT_FRAGMENT_NOT_COMPLETED',evidence='revision_manifest.csv') for c in revisions])
write('continuity.csv',[
 dict(entry_id='CONT-SHELL',chapter_number=6,revision_id='836ef59f-5e9b-4b08-856d-7e9754331335',entity_or_object='Mai Linh / shell',
      event_or_state='Ash-purple spiral shell picked up and stored in black cloth bag',certainty='explicit_in_prose',
      source_excerpt='Mai Linh đi dọc mép đá và nhặt được một chiếc vỏ ốc xoắn màu tím tro.',review_status='PRESENT_AFTER_AUTHOR_REVIEW'),
 dict(entry_id='CONT-AGE',chapter_number=6,revision_id=head['revision_id'],entity_or_object='An',event_or_state='age19 corrected from injected40',
      certainty='explicit_in_prose',source_excerpt='An mới mười chín tuổi.',review_status='CONSISTENCY_PASS; LATEST_EXTRACTION_UNFINISHED')])

mrows=rows('memory_checkpoints.csv')
mrows.append(dict(audit_id='P1-FINAL',pipeline='P1',novel_id=novel,checkpoint_labels='FINAL',
    completed_chapters='0 new completed; 6 draft chapters',chapter_cutoff=6,source_manifest='revision_manifest.csv',
    extraction_model_observed='models/gemini-3.5-flash-lite',execution_evidence='evidence/provider-traces-progress.json',
    raw_snapshot='evidence/stopped-checkpoint.json',accepted_snapshot='evidence/final/official-memory.json',
    brain_before=7,brain_after=7,expected_n='35 M0 gold; not independently rescored at FINAL',
    correct_expected_n='NOT_RECOUNTED',llm_execution='PASS_OBSERVED',raw_extraction_quality='FAIL_UNRESOLVED',
    memory_materialization='FAIL_FRESHNESS_5_UNFINISHED_JOBS',context_retrieval='PARTIAL_2_FIXED_REQUESTS_CUTOFF6',
    post_correction_quality='FAIL_MEMORY_BEHIND_LATEST_PROSE',overall_memory='FAIL',
    shared_evidence='evidence/final/;evidence/stopped-checkpoint.json',issue_ids='MEM-CRITICAL-001;REANALYSIS-LIVE-UNRESOLVED-001',report_path='MEMORY_AUDIT.md'))
write('memory_checkpoints.csv',mrows)
with (R/'MEMORY_AUDIT.md').open('a',encoding='utf-8') as f:
    f.write('\n## P1-FINAL\n\nFinal head '+head['revision_id']+' contains245 words; all6 chapters4992 words. Brain remains v7 with the S08 approved counts. Latest prose extraction is unfinished (5 durable outbox records;0 pending proposal records at stopped snapshot). M0 gold is not claimed rescored independently at FINAL. Context cutoff6 snapshots are in evidence/final, with7/14 entities,6/14 events and7/15 facts at4k/8192 respectively. Memory freshness FAIL. No later proposal was approved, including the injected age40 revision. Backend/AI deliberately stopped after evidence collection; PROCESSING labels are persisted labels, not live execution.\n')

steps=[(f'S{i:02}',v) for i,v in enumerate([
    'PASS','PASS_FUNCTIONAL_FAIL_QUALITY','PASS_AFTER_AUTHOR_REPAIRS_FAIL_GOLD','PASS_PERSISTENCE',
    'PASS_FUNCTIONAL','PASS_ISOLATION','FAIL_AI_OUTPUT_PASS_MANUAL_SAVE','PASS_AFTER_AUTHOR_REPAIRS',
    'PARTIAL_EXTRACTION_UNFINISHED','PASS_AFTER_PROVIDER_RETRY','PASS_SAVE_RELOAD_FAIL_MEMORY_FRESHNESS'],1)]
write('short_loop_results.csv',[dict(step=s,verdict=v,evidence='REPORT.md; evidence/') for s,v in steps],['step','verdict','evidence'])
report=(R/'REPORT.md').read_text(encoding='utf-8-sig')
report=report.replace('IN_PROGRESS / PROVIDER_DEGRADED','PARTIAL / EXTRACTION_UNFINISHED')
report=report.replace('| S11 | PENDING_CLOSEOUT | Xem checkpoint và phần chốt cuối; không suy ra PASS từ S04. |',
    '| S11 | PASS_SAVE_RELOAD / FAIL_MEMORY_FRESHNESS | Reload giữ đúng tuổi19, tiếp tục14 từ, head245 từ. Memory vẫn v7, 5 extraction chưa xong. `evidence/final/`, `evidence/stopped-checkpoint.json`. |')
report+='''\n## Chốt lượt chạy\n\n**Overall PARTIAL; acceptance gate FAIL.** Đã thử S01–S11, audit35 gold và các nhánh lỗi; S09 chưa hoàn tất dedup/materialization. S11 save/reload hoạt động nhưng memory chưa bắt kịp prose.\n\nFinal6 draft chapters **4.992 từ** =4.747 fixture +245 tác giả viết; chưa có chương mới hoàn chỉnh về nội dung. Export byte/hash khớp PostgreSQL trong revision_manifest.csv; source_generation_ids trống vì AI draft đã bị bỏ qua. Narrative quality/100k completeness/autonomy NOT_ASSESSED.\n\nReanalysis UI đã qua gateway (không còn lỗi thiếu header422); chức năng vẫn FAIL với CANON_RECONCILIATION_UNRESOLVED. Outbox ghi actionable422 attempts=3; không tạo partial group. Không đóng cả ba lỗi mục tiêu chỉ dựa vào unit tests. Guard đã hoạt động, chất lượng quyết định canon chưa đạt.\n\nTại stopped checkpoint:0 proposals pending,5 outbox unfinished; canonical brain vẫn7. Đã dừng có chủ đích hai container backend/AI của stack riêng sau thu thập, không xóa/reset volume. Web/PostgreSQL/Mongo còn chạy. HTTP provider logs ghi104 response attempts;93 structured records (90responses/3failures), không phải total billed calls; request đang bay khi dừng có thể chưa có response log. Chi phí UNKNOWN.\n\nMuốn tiếp tục run cũ: đọc checkpoint và SQL current state trước; `docker start ephurin-ui-retest-ai-service-1 ephurin-ui-retest-backend-1`, kiểm tra worker lease/retry recovery. Không duyệt nhóm từ age40 hoặc các revision đã stale; không tạo lại project hoặc chạy lại mọi bước một cách mù quáng. Ưu tiên sửa các blocker mới rồi retest run mới.\n\nCác time_iso trống trong action summaries là click time chưa ghi chính xác, không bịa lại từ thời điểm tạo báo cáo. Các bản snapshot là lần đọc nối tiếp, không phải transaction snapshot nguyên tử; trạng thái chốt worker đã dừng nằm riêng trong stopped-checkpoint.json.\n'''
(R/'REPORT.md').write_text(report,encoding='utf-8')
print(json.dumps({'status':'PARTIAL_GATE_FAILED','words':sum(c['word_count'] for c in revisions),
    'head_revision':head['revision_id'],'unfinished_outbox':len(pending),'observed_http_responses':len(http)}))
