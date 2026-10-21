"""Wave1F UI workflow. Author writes exclusively through real browser controls."""
import json,re,time
from collections import Counter
from Pipeline_test.tools.browser_author_driver import now
from Pipeline_test.tools.browser_human_entity_review import receipts

def execute_wave1f(session,project):
    page=session.page;base='/api/v1/ai/story-brains/'+session.novel_id
    output=session.evidence_dir;matrix=[]
    def save(name,value):
        (output/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    def snapshot(label):
        started=now()
        data={'readback_started_at':started,'run_id':session.run_id,'novel_id':session.novel_id,
            'user_id':session.user_id,'after_action_id':session.actions[-1]['action_id'],
            'reviews':session.read(base+'/entity-reviews'),'memory':session.read(base+'/memory'),
            'proposals':session.read(base+'/review-queue'),'receipts':receipts(project)[session.receipt_offset:]}
        data['captured_at']=now();save(label,data);return data
    def action(aid,kind,selector,fn):session.perform(aid,kind,selector,fn)
    def card(review):
        title=page.get_by_text(re.compile('^Chương '+re.escape(review['chapter_id'])+r' · '))
        return title.locator('xpath=ancestor::div[contains(@class,"mantine-Card-root")][1]')
    action('ACT-S03-OPEN','click','tab: Chờ duyệt',lambda:page.get_by_role('tab',name=re.compile('^Chờ duyệt')).click())
    initial=snapshot('M0-00-before-human');assert not initial['memory']['entities']
    handled=set()
    for index in range(1,6):
        deadline=time.monotonic()+40;review=None
        while time.monotonic()<deadline:
            pending=session.read(base+'/entity-reviews')
            review=next((r for r in pending if r['status']=='waiting_entity_review' and r['analysis_run_id'] not in handled),None)
            if review:break
            page.wait_for_timeout(300)
        if not review:
            snapshot(f'S03-CH{index}-BLOCKED');raise RuntimeError(f'S03_CHAPTER_{index}_ENTITY_GATE_NOT_REACHED')
        raw=snapshot(f'S03-CH{index}-01-raw');save(f'S03-CH{index}-machine',review)
        ids={c['candidate_id'] for c in review['candidates']}
        counts=Counter(d['verdict'] for d in review['decisions'])
        crd=card(review)
        action(f'ACT-S03-CH{index}-BULK','click','Use checked machine verdicts except unresolved',lambda:crd.get_by_role('button',name='Dùng các quyết định LLM đã kiểm tra (trừ chưa rõ)',exact=True).click())
        surfaces=sorted({c['surface'] for c in review['candidates'] if any(d['candidate_id']==c['candidate_id'] and d['verdict']=='unresolved' for d in review['decisions'])})
        for j,surface in enumerate(surfaces):
            group=crd.get_by_text(re.compile('^'+re.escape(surface)+r' · \d+ vị trí · LLM: unresolved$')).locator('..')
            action(f'ACT-S03-CH{index}-REJECT-{j}','click',surface+' unresolved / Loại',lambda group=group:group.get_by_role('button',name='Loại',exact=True).click())
        def freeze():
            with page.expect_response(lambda r:'/entity-reviews/'+review['analysis_run_id']+'/review' in r.url and r.request.method=='POST') as response:
                crd.get_by_role('button',name='Lưu quyết định entity',exact=True).click()
            save(f'S03-CH{index}-review-http',{'status':response.value.status,'body':response.value.json()})
            if not response.value.ok:raise RuntimeError(f'PRODUCT_ENTITY_REVIEW_SAVE_REJECTED_CH{index}')
            page.get_by_text(re.compile('^Chương '+re.escape(review['chapter_id'])+r' · entities_reviewed ·')).wait_for(timeout=15000)
        action(f'ACT-S03-CH{index}-FREEZE','click','Lưu quyết định entity',freeze)
        frozen=snapshot(f'S03-CH{index}-02-frozen')
        reviewed=next(r for r in frozen['reviews'] if r['analysis_run_id']==review['analysis_run_id'])
        assert reviewed['status']=='entities_reviewed' and len(reviewed['reviewed_decisions'])==len(ids)
        assert frozen['memory']==initial['memory'],'Official memory changed before canon accept'
        # Only this chapter can advance downstream; previous completed chapters may already have receipts.
        assert sum(r.get('operation') in ('events','facts') for r in frozen['receipts'])==sum(r.get('operation') in ('events','facts') for r in raw['receipts'])
        def proceed():
            with page.expect_response(lambda r:'/entity-reviews/'+review['analysis_run_id']+'/continue' in r.url and r.request.method=='POST') as response:
                card(review).get_by_role('button',name='3. Tiếp tục trích xuất event/fact',exact=True).click()
            save(f'S03-CH{index}-continue-http',{'status':response.value.status,'body':response.value.json()})
            if not response.value.ok:raise RuntimeError(f'PRODUCT_ENTITY_CONTINUE_REJECTED_CH{index}')
        action(f'ACT-S03-CH{index}-CONTINUE','click','3. Tiếp tục trích xuất event/fact',proceed)
        handled.add(review['analysis_run_id'])
        matrix.append({'chapter_number':index,'chapter_id':review['chapter_id'],'revision_id':review['revision_id'],
            'analysis_run_id':review['analysis_run_id'],'raw_counts':dict(counts),'freeze_status':'entities_reviewed','continue':'UI_HTTP_ACCEPTED'})
        save('five-chapter-checkpoint-matrix',matrix)
    # Wait for the actual bootstrap job to reach canon review; never mark all imported chapters processed by assumption.
    job_id=page.evaluate('(novelId)=>localStorage.getItem("ephurin-bootstrap-"+novelId)',session.novel_id)
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        job=session.read('/api/v1/ai/jobs/'+job_id)
        save('S03-bootstrap-job',job)
        if job['status']=='waiting_review':break
        if job['status']=='failed':raise RuntimeError('PRODUCT_BOOTSTRAP_FAILED_AFTER_ENTITY_REVIEW')
        page.wait_for_timeout(300)
    else:raise RuntimeError('S03_BOOTSTRAP_NOT_READY_FOR_CANON')
    before=snapshot('M0-01-pending-canon')
    assert before['memory']==initial['memory']
    assert any(p['proposal_type']=='event' for p in before['proposals'])
    assert any(p['proposal_type']=='fact' for p in before['proposals'])
    # Author rejects one redundant scene-fact proposal, retaining event and reported uncertainty.
    target=page.get_by_text(re.compile('observed_scene.*confirmed')).first.locator('..')
    def reject():
        with page.expect_response(lambda r:'/proposals/' in r.url and '/reject' in r.url and r.request.method=='POST') as response:
            target.get_by_role('button',name='Loại đề xuất',exact=True).click()
        save('S03-canon-reject-http',{'status':response.value.status,'body':response.value.json() if response.value.status!=204 else None})
        assert response.value.ok
    action('ACT-S03-CANON-REJECT','click','observed_scene fact / Loại đề xuất',reject)
    page.wait_for_timeout(600)
    for index in range(1,35):
        current=snapshot(f'S03-CANON-{index}-before')
        if not current['proposals']:break
        button=page.get_by_role('button',name='Duyệt nhóm đã kiểm tra',exact=True).first
        def accept():
            with page.expect_response(lambda r:'/proposal-groups/' in r.url and '/accept' in r.url and r.request.method=='POST') as response:
                button.click()
            save(f'S03-canon-accept-{index}-http',{'status':response.value.status,'body':response.value.json()})
            if not response.value.ok:raise RuntimeError('PRODUCT_CANON_GROUP_ACCEPT_REJECTED')
        action(f'ACT-S03-CANON-ACCEPT-{index}','click','Duyệt nhóm đã kiểm tra',accept)
        page.wait_for_timeout(700)
    else:raise RuntimeError('S03_CANON_QUEUE_NOT_DRAINED')
    def activate():
        with page.expect_response(lambda r:'/baseline/activate' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='Kích hoạt bộ nhớ sau duyệt',exact=True).click()
        save('S03-baseline-activate-http',{'status':response.value.status,'body':response.value.json()})
        if not response.value.ok:raise RuntimeError('PRODUCT_BASELINE_ACTIVATION_REJECTED')
    action('ACT-S03-ACTIVATE','click','Kích hoạt bộ nhớ sau duyệt',activate)
    approved=snapshot('M0-02-approved-baseline')
    brain=session.read('/api/v1/ai/story-brains/by-novel/'+session.novel_id);save('M0-brain',brain)
    assert brain['status']=='active' and brain['baseline_revision_id']
    context=session.read(base+'/context-preview?chapter_number=5');save('M0-03-context',context)
    for tab in ('Nhân vật','Địa danh','Vật phẩm','Sự kiện','Dữ kiện'):
        action('ACT-S04-'+str(len(session.actions)),'click','tab: '+tab,lambda tab=tab:page.get_by_role('tab',name=tab,exact=True).click())
    save('wave1f-workflow-result',{'status':'S03_S04_OFFLINE_PASS','checkpoint_matrix':matrix,'brain':brain,
        'real_llm_quality':'NOT_ASSESSED','later_steps':'NOT_RUN_PENDING_NEXT_CONTRACT_ACTION'})
    # Subsequent ordered steps are exercised in the same browser session below when available.
