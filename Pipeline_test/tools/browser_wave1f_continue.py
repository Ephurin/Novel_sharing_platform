"""Continue the NEW Wave1F novel after verified S03; writes remain browser-only."""
import json,re,time,hashlib
from urllib.parse import urlparse,parse_qs
from Pipeline_test.tools.browser_author_driver import now

BODY='Mai Linh đặt một thẻ giấy ghi “kiểm tra micro” cạnh máy thu. Cô chưa mở cửa thêm và chưa xác nhận ai ở phía dưới. Duy vẫn đứng cạnh cửa, giữ nguyên dây cảnh báo.'
CONTRADICTION='Giọng trong bản ghi đã được xác minh ngay từ lần quét đầu tiên, không cần mẫu đối chứng.'

def execute_remaining(session,project):
    page=session.page;out=session.evidence_dir;base='/api/v1/ai/story-brains/'+session.novel_id
    def save(name,value):
        (out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    def action(aid,kind,selector,fn):session.perform(aid,kind,selector,fn)
    def state(label):
        data={'captured_at':now(),'novel_id':session.novel_id,'after_action_id':session.actions[-1]['action_id'],
            'memory':session.read(base+'/memory'),'proposals':session.read(base+'/review-queue'),
            'reviews':session.read(base+'/entity-reviews'),'brain':session.read('/api/v1/ai/story-brains/by-novel/'+session.novel_id)}
        save(label,data);return data
    def open_memory():page.get_by_title('Bộ nhớ, trích xuất và định hướng tiểu thuyết',exact=True).click()
    action('ACT-S04-RELOAD','navigate','page.reload()',lambda:page.reload())
    action('ACT-S04-OPEN','click','Memory drawer',open_memory)
    before=state('S04-approved-after-reload')
    assert before['brain']['status']=='active' and not before['proposals']
    for tab,kind in [('Nhân vật','PER'),('Địa danh','LOC'),('Vật phẩm','ITEM'),('Sự kiện',None),('Dữ kiện',None)]:
        action('ACT-S04-TAB-'+str(len(session.actions)),'click','tab: '+tab,lambda tab=tab:page.get_by_role('tab',name=tab,exact=True).click())
        if kind:
            for entity in before['memory']['entities']:
                if entity['entity_type']==kind:assert page.get_by_text(entity['name'],exact=True).first.is_visible()
    save('S04-context-after-reload',session.read(base+'/context-preview?chapter_number=5'))
    action('ACT-S05-PLAN-TAB','click','Định hướng',lambda:page.get_by_role('tab',name='Định hướng',exact=True).click())
    action('ACT-S05-DIRECTION','fill','Định hướng mong muốn (tùy chọn)',lambda:page.get_by_label('Định hướng mong muốn (tùy chọn)').fill('Lập hai gợi ý tương lai; chưa coi kế hoạch là việc đã xảy ra.'))
    def suggest():
        with page.expect_response(lambda r:'/operations' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='Gợi ý event tiếp theo',exact=True).click()
        save('S05-suggestions-http',{'status':response.value.status,'body':response.value.json()})
        if not response.value.ok:raise RuntimeError('S05_SUGGESTION_ROUTE_FAILED')
    action('ACT-S05-SUGGEST','click','Gợi ý event tiếp theo',suggest)
    page.get_by_label('Sự kiện dự kiến',exact=True).first.wait_for()
    assert page.get_by_label('Sự kiện dự kiến',exact=True).count()==2
    action('ACT-S05-EDIT','fill','First Sự kiện dự kiến',lambda:page.get_by_label('Sự kiện dự kiến',exact=True).first.fill('Kiểm tra micro có đối chứng — tác giả chỉnh'))
    action('ACT-S05-REJECT','click','Second Bỏ gợi ý',lambda:page.get_by_role('button',name='Bỏ gợi ý',exact=True).nth(1).click())
    assert state('S05-after-edit-reject')['memory']==before['memory']
    def plan():
        with page.expect_response(lambda r:'/story-plans' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='Xác nhận và lưu định hướng',exact=True).click()
        save('S06-plan-http',{'status':response.value.status,'body':response.value.json()})
        if not response.value.ok:raise RuntimeError('S06_PLAN_SAVE_REJECTED')
    action('ACT-S06-SAVE','click','Xác nhận và lưu định hướng',plan)
    actual_plan=session.read('/api/v1/ai/story-plans/by-novel/'+session.novel_id+'/active');save('S06-active-plan',actual_plan)
    assert len(actual_plan['objectives'])==1
    assert state('S06-after-plan')['memory']==before['memory'],'Future plan leaked into official history'
    # Close drawer and add a short sixth chapter. No manual snapshot or extraction API.
    action('ACT-S07-CLOSE','press','Escape',lambda:page.keyboard.press('Escape'))
    def add():
        with page.expect_response(lambda r:'/novels/'+session.novel_id+'/chapters' in r.url and r.request.method=='POST') as response:
            page.get_by_role('button',name='Thêm chương mới').click()
        cid=response.value.json()['data']['chapterId'];page.wait_for_url(re.compile('.*chapterId='+cid+'.*'))
    action('ACT-S07-ADD','click','Thêm chương mới',add)
    cid=parse_qs(urlparse(page.url).query)['chapterId'][0]
    action('ACT-S07-TITLE','fill','chapter title',lambda:page.get_by_placeholder('Đặt tiêu đề chương tại đây...').fill('Chương 6 — Thẻ ghi kiểm tra'))
    action('ACT-S07-WRITE','fill','ordinary editor prose',lambda:page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(BODY))
    def wait_saved(expected):
        deadline=time.monotonic()+25
        while time.monotonic()<deadline:
            chapter=session.read('/api/v1/chapters/'+cid)
            revs=session.read('/api/v1/chapters/'+cid+'/revisions')
            if chapter.get('draft',{}).get('content')==expected and revs and revs[0]['content']==expected:return chapter,revs[0]
            page.wait_for_timeout(250)
        raise RuntimeError('NORMAL_EDITOR_SAVE_REVISION_NOT_OBSERVED')
    chapter,revision=wait_saved(BODY)
    assert revision['contentHash']==hashlib.sha256(BODY.encode()).hexdigest()
    save('S07-normal-save-source',{'captured_at':now(),'chapter':chapter,'revision':revision,
        'expected_body':BODY,'source_type':'AUTHOR_UI_NEW_PROSE','no_snapshot_api':True,
        'extraction_status':session.read(base+'/extraction-status')})
    action('ACT-S08-OPEN','click','Memory drawer',open_memory)
    deadline=time.monotonic()+40;review=None
    while time.monotonic()<deadline:
        reviews=session.read(base+'/entity-reviews')
        review=next((r for r in reviews if r['revision_id']==revision['revisionId'] and r['status']=='waiting_entity_review'),None)
        if review:break
        page.wait_for_timeout(300)
    if not review:
        state('S08-BLOCKED');raise RuntimeError('S08_FRESH_REVISION_HITL_NOT_OBSERVED')
    save('M-FIRST-raw',review)
    action('ACT-S08-REVIEW-TAB','click','Chờ duyệt',lambda:page.get_by_role('tab',name=re.compile('^Chờ duyệt')).click())
    title=page.get_by_text(re.compile('^Chương '+re.escape(cid)+r' · '));card=title.locator('xpath=ancestor::div[contains(@class,"mantine-Card-root")][1]')
    action('ACT-S08-BULK','click','Use checked machine decisions',lambda:card.get_by_role('button',name='Dùng các quyết định LLM đã kiểm tra (trừ chưa rõ)',exact=True).click())
    for i,surface in enumerate(sorted({c['surface'] for c in review['candidates'] if any(d['candidate_id']==c['candidate_id'] and d['verdict']=='unresolved' for d in review['decisions'])})):
        group=card.get_by_text(re.compile('^'+re.escape(surface)+r' · .*unresolved$')).locator('..')
        action('ACT-S08-REJECT-'+str(i),'click',surface+' / Loại',lambda group=group:group.get_by_role('button',name='Loại',exact=True).click())
    def click_review(name,suffix,aid):
        def click():
            with page.expect_response(lambda r:'/entity-reviews/'+review['analysis_run_id']+'/'+suffix in r.url and r.request.method=='POST') as response:
                card.get_by_role('button',name=name,exact=True).click()
            save(aid+'-http',{'status':response.value.status,'body':response.value.json()})
            if not response.value.ok:raise RuntimeError('S08_'+suffix.upper()+'_FAILED')
        action(aid,'click',name,click)
    click_review('Lưu quyết định entity','review','ACT-S08-FREEZE')
    frozen=state('M-FIRST-frozen-before-continue');assert frozen['memory']==before['memory']
    click_review('3. Tiếp tục trích xuất event/fact','continue','ACT-S08-CONTINUE')
    pending=state('M-FIRST-pending-canon');assert pending['memory']==before['memory'] and pending['proposals']
    for i in range(1,10):
        pending=state('S08-canon-'+str(i))
        if not pending['proposals']:break
        def accept():
            with page.expect_response(lambda r:'/proposal-groups/' in r.url and '/accept' in r.url and r.request.method=='POST') as response:
                page.get_by_role('button',name='Duyệt nhóm đã kiểm tra',exact=True).first.click()
            save('S08-accept-'+str(i)+'-http',{'status':response.value.status,'body':response.value.json()})
            if not response.value.ok:raise RuntimeError('S08_CANON_ACCEPT_REJECTED')
        action('ACT-S08-ACCEPT-'+str(i),'click','Duyệt nhóm đã kiểm tra',accept);page.wait_for_timeout(600)
    accepted=state('M-FIRST-approved')
    assert any(f['fact_key']=='micro_check_note' for f in accepted['memory']['facts'])
    save('M-FIRST-context',session.read(base+'/context-preview?chapter_number=6&chapter_id='+cid))
    # Two fast edits returning to the saved body must not leave the earlier debounce timer writing stale prose.
    action('ACT-S09-CLOSE','press','Escape',lambda:page.keyboard.press('Escape'))
    stale=BODY+'\nDÒNG NHÁP TẠM — KHÔNG ĐƯỢC LƯU SAU KHI HOÀN TÁC.'
    action('ACT-S09-EDIT-A','fill','temporary prose',lambda:page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(stale))
    action('ACT-S09-UNDO-B','fill','restore latest saved body before debounce',lambda:page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(BODY))
    page.wait_for_timeout(2400)
    observed=session.read('/api/v1/chapters/'+cid);revisions=session.read('/api/v1/chapters/'+cid+'/revisions')
    save('S09-debounce-readback',{'captured_at':now(),'expected_body':BODY,'temporary_body':stale,
        'editor_value':page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').input_value(),
        'chapter':observed,'revisions':revisions})
    if observed.get('draft',{}).get('content')!=BODY or revisions[0]['content']!=BODY:
        raise RuntimeError('PRODUCT_S09_STALE_DEBOUNCE_SAVE_AFTER_UNDO')
    # S10 tests scripted finding routing only, not a real model's semantic quality.
    action('ACT-S10-CONTRADICTION','fill','contradictory draft',lambda:page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(BODY+'\n'+CONTRADICTION))
    wait_saved(BODY+'\n'+CONTRADICTION)
    action('ACT-S10-OPEN','click','Memory drawer',open_memory)
    action('ACT-S10-HISTORY','click','Sự kiện',lambda:page.get_by_role('tab',name='Sự kiện',exact=True).click())
    action('ACT-S10-CHECK','click','Kiểm tra nhất quán chương đang mở',lambda:page.get_by_role('button',name='Kiểm tra nhất quán chương đang mở',exact=True).click())
    page.get_by_text(re.compile('FAKE_PROVIDER_OUTPUT: scripted conflict')).wait_for(timeout=15000)
    action('ACT-S10-CLOSE','press','Escape',lambda:page.keyboard.press('Escape'))
    action('ACT-S10-CORRECT','fill','corrected draft',lambda:page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(BODY))
    wait_saved(BODY)
    action('ACT-S10-REOPEN','click','Memory drawer',open_memory)
    action('ACT-S10-HISTORY-AGAIN','click','Sự kiện',lambda:page.get_by_role('tab',name='Sự kiện',exact=True).click())
    action('ACT-S10-RECHECK','click','Kiểm tra nhất quán chương đang mở',lambda:page.get_by_role('button',name='Kiểm tra nhất quán chương đang mở',exact=True).click())
    page.get_by_text('Không tìm thấy mâu thuẫn trong lần kiểm tra này.',exact=True).wait_for(timeout=15000)
    action('ACT-S11-RELOAD','navigate','page.reload()',lambda:page.reload())
    assert page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').input_value()==BODY
    assert session.read('/api/v1/chapters/'+cid)['status']=='DRAFT'
    save('S11-final',{'status':'OFFLINE_S04_S11_COMPLETED','captured_at':now(),'memory':session.read(base+'/memory'),'chapter':session.read('/api/v1/chapters/'+cid)})
