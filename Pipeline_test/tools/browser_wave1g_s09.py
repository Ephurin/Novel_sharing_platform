"""Independent S09 RED diagnostic. All writes are real editor actions."""
import hashlib
import json
import time
from urllib.parse import parse_qs, urlparse
from Pipeline_test.tools.browser_author_driver import now


def execute_s09_red(session):
    if 'wave1g' not in session.run_id.lower():
        raise RuntimeError('FRESH_WAVE1G_RUN_REQUIRED')
    page=session.page; out=session.evidence_dir
    cid=parse_qs(urlparse(page.url).query)['chapterId'][0]
    chapter_path='/api/v1/chapters/'+cid
    # Close the drawer left by S02, through the actual keyboard.
    session.perform('ACT-S09-CLOSE-DRAWER','press','Escape',lambda:page.keyboard.press('Escape'))
    editor=page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...')
    before={'captured_at':now(),'chapter':session.read(chapter_path),'revisions':session.read(chapter_path+'/revisions')}
    expected=editor.input_value()
    assert expected and before['chapter']['draft']['content']==expected
    temporary=expected+'\nWAVE1G TEMPORARY A — MUST NEVER PERSIST AFTER UNDO.'
    traffic=[]
    def response(res):
        if res.request.method=='PATCH' and urlparse(res.url).path==chapter_path:
            traffic.append({'observed_at':now(),'method':'PATCH','path':chapter_path,
                            'payload':res.request.post_data_json,'status':res.status})
    page.on('response',response)
    def undo():
        started=time.monotonic()
        editor.fill(temporary)
        page.wait_for_timeout(264)
        editor.fill(expected)
        elapsed=time.monotonic()-started
        page.wait_for_timeout(2200)
        after={'captured_at':now(),'chapter':session.read(chapter_path),'revisions':session.read(chapter_path+'/revisions')}
        latest=after['revisions'][0]
        if 'content' not in latest:
            latest=session.read(chapter_path+'/revisions/'+latest['revisionId'])
        existing={r['revisionId'] for r in before['revisions']}
        new=[r for r in after['revisions'] if r['revisionId'] not in existing]
        result={'issue_id':'WF1F-S09-001','scope':'INDEPENDENT_RED_REPRO_NOT_ORDERED_S03_S08_ACCEPTANCE',
                'run_id':session.run_id,'user_id':session.user_id,'novel_id':session.novel_id,'chapter_id':cid,
                'expected_body':expected,'temporary_body':temporary,'editor_value':editor.input_value(),
                'edit_window_seconds':elapsed,'debounce_seconds':1.2,'before':before,'after':after,
                'latest_revision':latest,'new_revision_ids':[r['revisionId'] for r in new],
                'patch_receipts':traffic,'expected_hash':hashlib.sha256(expected.encode()).hexdigest(),
                'actual_hash':hashlib.sha256(latest['content'].encode()).hexdigest()}
        result['zero_stale_A_requests']=not any(x['payload'].get('content')==temporary for x in traffic)
        result['editor_matches_B']=result['editor_value']==expected
        result['draft_matches_B']=after['chapter']['draft']['content']==expected
        result['latest_revision_matches_B']=latest['content']==expected
        result['verdict']='PASS' if all(result[k] for k in ['zero_stale_A_requests','editor_matches_B','draft_matches_B','latest_revision_matches_B']) and not new else 'FAIL'
        (out/'S09-independent-red.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    session.perform('ACT-S09-FAST-UNDO','fill','chapter editor: B → A → B in <1200ms',undo)
    page.remove_listener('response',response)
    result=json.loads((out/'S09-independent-red.json').read_text(encoding='utf-8'))
    if result['verdict']!='PASS':
        raise RuntimeError('PRODUCT_S09_STALE_DEBOUNCE_SAVE_AFTER_UNDO')
