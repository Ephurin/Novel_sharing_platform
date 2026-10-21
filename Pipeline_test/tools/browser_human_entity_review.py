"""Real author UI HITL probe; GET/docker readback only, no author-write API helpers."""
import json,re,subprocess,time
from collections import Counter
from datetime import datetime,timezone

def now():return datetime.now(timezone.utc).isoformat()
def receipts(project):
    if not re.fullmatch(r'p1-wave1[ef]-[a-z0-9-]+',project or ''):raise RuntimeError('NEW_WAVE1E_PROJECT_REQUIRED')
    ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project,
        '--filter','label=com.docker.compose.service=fake-upstream'],text=True).splitlines()
    if len(ids)!=1:raise RuntimeError('OWNED_FAKE_UPSTREAM_REQUIRED')
    raw=subprocess.check_output(['docker','exec',ids[0],'python','-c',
        "from pathlib import Path;p=Path('/evidence/requests.jsonl');print(p.read_text() if p.exists() else '')"],text=True)
    return [json.loads(x) for x in raw.splitlines() if x]

def execute_human_review(session,project):
    page=session.page;base='/api/v1/ai/story-brains/'+session.novel_id
    def snapshot(label):
        state={'readback_started_at':now(),'after_action_id':session.actions[-1]['action_id'],
            'action_finished_at':session.actions[-1]['finished_at'],'run_id':session.run_id,'session_id':session.session_id,
            'novel_id':session.novel_id,'user_id':session.user_id,'readback_scope':'immediate_phase_readback',
            'reviews':session.read(base+'/entity-reviews'),'memory':session.read(base+'/memory'),
            'proposals':session.read(base+'/review-queue'),
            'receipt_offset':session.receipt_offset,'receipts_scope':'current_browser_attempt_only',
            'receipts':receipts(project)[session.receipt_offset:]}
        state['captured_at']=now()
        (session.evidence_dir/(label+'.json')).write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        return state
    before=snapshot('HITL-01-before-author-review')
    review=next(r for r in before['reviews'] if r['status']=='waiting_entity_review')
    verdicts=Counter(d['verdict'] for d in review['decisions'])
    assert all(verdicts[k]>0 for k in ('entity','not_entity','unresolved')),verdicts
    aliases=[d for d in review['decisions'] if d.get('identity_quote') and d.get('canonical_name')=='Mai Linh']
    assert aliases,'SOURCE_SUPPORTED_ALIAS_REQUIRED'
    assert not any(r.get('operation') in ('events','facts') for r in before['receipts'])
    assert not before['memory']['entities'],'Entity inventory silently became official canon'
    def action(aid,kind,selector,fn):session.perform(aid,kind,selector,fn)
    action('ACT-HITL-OPEN','click','tab: Chờ duyệt',lambda:page.get_by_role('tab',name=re.compile(r'^Chờ duyệt')).click())
    # Checkpoint card is in the review tab; never click proposal accept/canon controls.
    action('ACT-HITL-BULK','click','button: Dùng các quyết định LLM đã kiểm tra (trừ chưa rõ)',
        lambda:page.get_by_role('button',name='Dùng các quyết định LLM đã kiểm tra (trừ chưa rõ)',exact=True).click())
    def group(surface,verdict):
        return page.get_by_text(re.compile('^'+re.escape(surface)+r' · \d+ vị trí · LLM: '+verdict+'$')).locator('..')
    action('ACT-HITL-KEEP','click','Mai Linh / Giữ entity',lambda:group('Mai Linh','entity').get_by_role('button',name='Giữ entity',exact=True).click())
    action('ACT-HITL-REJECT','click','Chiếc / Loại',lambda:group('Chiếc','not_entity').get_by_role('button',name='Loại',exact=True).click())
    unresolved=sorted({c['surface'] for c in review['candidates'] if any(d['candidate_id']==c['candidate_id'] and d['verdict']=='unresolved' for d in review['decisions'])})
    for index,surface in enumerate(unresolved):
        action('ACT-HITL-RESOLVE-'+str(index),'click',surface+' unresolved / Loại',
            lambda surface=surface:group(surface,'unresolved').get_by_role('button',name='Loại',exact=True).click())
    def correct():
        group('CV-04','entity').get_by_label('Loại entity',exact=True).click()
        page.get_by_role('option',name='ITEM',exact=True).click()
    action('ACT-HITL-CORRECT','click','CV-04 / Loại entity / ITEM',correct)
    def save():
        with page.expect_response(lambda r:'/entity-reviews/'+review['analysis_run_id']+'/review' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='Lưu quyết định entity',exact=True).click()
        assert response.value.ok, 'ENTITY_REVIEW_UI_SAVE_REJECTED'
        page.get_by_text(re.compile('^Chương .* · entities_reviewed ·')).wait_for(timeout=15000)
    action('ACT-HITL-SAVE','click','button: Lưu quyết định entity',save)
    frozen=snapshot('HITL-02-entities-reviewed-before-continue')
    reviewed=next(r for r in frozen['reviews'] if r['analysis_run_id']==review['analysis_run_id'])
    assert reviewed['status']=='entities_reviewed'
    assert not any(d['verdict']=='unresolved' for d in reviewed['reviewed_decisions'])
    assert not any(r.get('operation') in ('events','facts') for r in frozen['receipts'])
    assert frozen['memory']==before['memory'],'Review mutated official memory'
    assert any(d.get('canonical_name')=='CV-04' and d.get('entity_type')=='ITEM' for d in reviewed['reviewed_decisions'])
    def proceed():
        with page.expect_response(lambda r:'/entity-reviews/'+review['analysis_run_id']+'/continue' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='3. Tiếp tục trích xuất event/fact',exact=True).click()
        assert response.value.ok,'ENTITY_CONTINUE_UI_REJECTED'
    action('ACT-HITL-CONTINUE','click','button: 3. Tiếp tục trích xuất event/fact',proceed)
    deadline=time.monotonic()+35
    while time.monotonic()<deadline:
        data=receipts(project)
        if any(x.get('operation')=='events' for x in data) and any(x.get('operation')=='facts' for x in data):break
        page.wait_for_timeout(300)
    else:raise RuntimeError('DOWNSTREAM_EVENT_FACT_NOT_OBSERVED')
    after=snapshot('HITL-03-after-continue')
    assert all(r['received_at'] > datetime.fromisoformat(frozen['captured_at']).timestamp()
               for r in after['receipts'] if r.get('operation') in ('events','facts'))
    assert after['memory']==before['memory'],'Downstream proposals auto-promoted to canon'
    assert after['proposals'],'EXPECTED_PENDING_ENTITY_PROPOSALS'
    # Confirm output proposals have source revision identity, without accepting canon.
    result={'status':'OFFLINE_HUMAN_ENTITY_REVIEW_PASS','captured_at':now(),
        'analysis_run_id':review['analysis_run_id'],'chapter_id':review['chapter_id'],'revision_id':review['revision_id'],
        'machine_verdict_counts':dict(verdicts),'source_supported_aliases':len(aliases),
        'unresolved_resolved_by_author_rejection':unresolved,'author_type_correction':'CV-04 ORG -> ITEM',
        'event_fact_before_review':0,'event_fact_only_after_checkpoint':True,'official_memory_unchanged':True,
        'pending_proposals':len(after['proposals']),'remaining_chapters':'Not reviewed in this bounded chapter-1 HITL probe',
        'real_model_entity_quality':'NOT_TESTED','external_provider_calls':0}
    (session.evidence_dir/'human-review-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result
