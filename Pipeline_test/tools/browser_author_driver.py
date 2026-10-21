"""Real Playwright S01/S02 driver. No synthetic screenshots or manifest-only PASS.
Install Playwright and its Chromium separately. A missing UI is BLOCKED, never bypassed
with author-write HTTP calls. Only GET API calls are used for independent readback.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import uuid
import zipfile
from Pipeline_test.tools.provenance import verify_manuscript_gold_hashes, validate_browser_evidence
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter, CONVERSION_RULE_VERSION

FIXTURE_DIR = Path(__file__).resolve().parents[1] / 'input/manuscript'
def now(): return datetime.now(timezone.utc).isoformat()
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def browser_outcome(failure, checks, *, human_review=False, human_result=None):
    if failure is not None or not checks or not all(c[0] for c in checks):
        return 'BLOCKED_UI_MISSING_OR_INVALID_EVIDENCE'
    if human_review and (human_result or {}).get('status') != 'OFFLINE_HUMAN_ENTITY_REVIEW_PASS':
        return 'BLOCKED_HUMAN_ENTITY_REVIEW'
    return 'OFFLINE_BROWSER_UI_SMOKE'

class BrowserActionSession:
    def __init__(self, run_id, evidence_dir, base_url='http://127.0.0.1:28080', *, page=None):
        if urlparse(base_url).scheme != 'http' or urlparse(base_url).hostname not in {'localhost','127.0.0.1'}:
            raise ValueError('Only isolated loopback application URLs are allowed')
        self.run_id=run_id; self.evidence_dir=Path(evidence_dir); self.base_url=base_url.rstrip('/')
        if self.evidence_dir.exists() and any(self.evidence_dir.iterdir()):
            raise RuntimeError('EXISTING_EVIDENCE_REPLAY_FORBIDDEN')
        self.evidence_dir.mkdir(parents=True,exist_ok=True)
        self.session_id=str(uuid.uuid4());self.page=page;self.actions=[];self.novel_id=None;self.user_id=None
        self.token=None
        self.source_manifest=[]

    def record_browser_step(self, *args, **kwargs):
        raise RuntimeError('SYNTHETIC_EVIDENCE_REMOVED: use perform() with an actual Playwright page')

    def perform(self, action_id, kind, selector, action):
        if self.page is None: raise RuntimeError('ACTUAL_BROWSER_REQUIRED')
        started=now()
        self.page.context.tracing.group(action_id)
        try:
            action()
            self.page.locator('body').wait_for()
            self.page.screenshot(path=str(self.evidence_dir/(action_id+'.png')),full_page=False)
            (self.evidence_dir/(action_id+'.dom.txt')).write_text(self.page.locator('body').inner_text(),encoding='utf-8')
            self.actions.append(dict(action_id=action_id,action_kind=kind,selector=selector,
                started_at=started,finished_at=now(),application_url=self.page.url))
            with (self.evidence_dir/'actions.jsonl').open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(self.actions[-1],ensure_ascii=False)+'\n')
        finally:self.page.context.tracing.group_end()

    def read(self, path):
        if not path.startswith('/api/v1/'):raise ValueError('Readback path outside application API')
        response=self.page.context.request.get(self.base_url+path,headers={'Authorization':'Bearer '+self.token})
        if not response.ok:raise RuntimeError('Read-only server readback failed: '+str(response.status))
        return response.json()['data']

    def canonical_readback(self):
        observed_from=now()
        novel=self.read('/api/v1/novels/'+self.novel_id)
        if novel.get('authorId') != self.user_id:raise RuntimeError('NOVEL_OWNER_MISMATCH')
        chapters=self.read('/api/v1/novels/'+self.novel_id+'/chapters')
        result=[]
        for chapter in chapters:
            cid=chapter['chapterId'];revisions=self.read('/api/v1/chapters/'+cid+'/revisions')
            if not revisions:raise RuntimeError('CANONICAL_REVISION_READBACK_MISSING')
            revision=self.read('/api/v1/chapters/'+cid+'/revisions/'+revisions[0]['revisionId'])
            result.append({**chapter,'novelId':self.novel_id,'ownerId':self.user_id,
                'latestRevisionId':revision['revisionId'],'contentHash':revision['contentHash'],
                'canonicalRevision':revision})
        ok,reason=verify_manuscript_gold_hashes(result,expected_novel_id=self.novel_id,expected_owner_id=self.user_id)
        if not ok:raise RuntimeError(reason)
        self.canonical_readback_time={'started_at':observed_from,'finished_at':now(),
            'observed_after_action_id':self.actions[-1]['action_id'] if self.actions else None}
        return result


def execute_browser_s01_import_path(session, novel_id=None, author_user=None):
    if novel_id:raise RuntimeError('Fresh owned novel required; replay writes forbidden')
    page=session.page
    if page is None:raise RuntimeError('ACTUAL_BROWSER_REQUIRED')
    def create():
        with page.context.expect_page() as popup:page.get_by_role('button',name='New Project',exact=True).click()
        session.page=popup.value
        session.page.wait_for_url(re.compile(r'.*/author/ide\?novelId=.*'))
    session.perform('ACT-S01-CREATE','click','button: New Project',create)
    page=session.page
    session.novel_id=parse_qs(urlparse(page.url).query)['novelId'][0]
    for index in range(1,6):
        if index>1:
            def add_and_wait():
                with page.expect_response(lambda r:'/novels/'+session.novel_id+'/chapters' in r.url and r.request.method=='POST') as created:
                    page.get_by_role('button',name='Thêm chương mới').click()
                cid=created.value.json()['data']['chapterId']
                page.wait_for_url(re.compile('.*chapterId='+re.escape(cid)+'.*'))
            session.perform(f'ACT-S01-ADD-{index}','click','button: Thêm chương mới',add_and_wait)
        fixture=parse_fixture_chapter(index, fixture_dir=FIXTURE_DIR)
        session.source_manifest.append({k:fixture[k] for k in ('chapter_number','title','source_file_sha256',
                                     'canonical_body_sha256','conversion_rule_version')})
        def fill_and_wait():
            page.get_by_placeholder('Đặt tiêu đề chương tại đây...').fill(fixture['title'])
            page.get_by_placeholder('Bắt đầu câu từ chương truyện của bạn tại đây...').fill(fixture['body'])
            cid=parse_qs(urlparse(page.url).query)['chapterId'][0]
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                saved=session.read('/api/v1/chapters/'+cid)
                content=(saved.get('draft') or {}).get('content',saved.get('content'))
                if content==fixture['body'] and saved.get('title')==fixture['title']:
                    (session.evidence_dir/f'ACT-S01-FILL-{index}.immediate-draft.json').write_text(
                        json.dumps({'captured_at':now(),'run_id':session.run_id,'session_id':session.session_id,
                                    'user_id':session.user_id,'novel_id':session.novel_id,
                                    'readback_scope':'observed_during_action_after_autosave',
                                    'chapter':saved},ensure_ascii=False,indent=2),encoding='utf-8')
                    return
                page.wait_for_timeout(200)
            raise RuntimeError('UI_TITLE_BODY_AUTOSAVE_READBACK_TIMEOUT')
        session.perform(f'ACT-S01-FILL-{index}','fill','textarea[placeholder="Bắt đầu câu từ chương truyện của bạn tại đây..."]',fill_and_wait)
    return {'status':'DRAFTS_SAVED_AWAITING_S02_CANONICAL_SNAPSHOT','novel_id':session.novel_id}


def execute_browser_s02_entity_review_path(session, novel_id):
    if novel_id!=session.novel_id:raise RuntimeError('NOVEL_SESSION_MISMATCH')
    page=session.page
    session.perform('ACT-S02-OPEN','click','button[title="Bộ nhớ, trích xuất và định hướng tiểu thuyết"]',
        lambda:page.get_by_title('Bộ nhớ, trích xuất và định hướng tiểu thuyết',exact=True).click())
    session.perform('ACT-S02-HINTS','fill','label: Tên cần chú ý khi trích xuất',
        lambda:page.get_by_label('Tên cần chú ý khi trích xuất').fill('An\nMai Linh\nCV-04'))
    session.perform('ACT-S02-SAVE-HINTS','click','button: Lưu danh sách tăng cường',
        lambda:page.get_by_role('button',name='Lưu danh sách tăng cường',exact=True).click())
    session.perform('ACT-S02-TAB','click','tab: Trích xuất',
        lambda:page.get_by_role('tab',name='Trích xuất',exact=True).click())
    session.perform('ACT-S02-TRIGGER','click','button: Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu',
        lambda:page.get_by_role('button',name='Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu',exact=True).click())
    # No review/accept writes beyond S02. Fake-provider smoke is not P1 acceptance.
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        reviews=session.read('/api/v1/ai/story-brains/'+novel_id+'/entity-reviews')
        if reviews and reviews[0]['status']=='waiting_entity_review':
            (session.evidence_dir/'s02-entity-checkpoint.readback.json').write_text(
                json.dumps({'run_id':session.run_id,'session_id':session.session_id,
                            'novel_id':novel_id,'user_id':session.user_id,
                            'captured_at':now(),'reviews':reviews},ensure_ascii=False,indent=2),encoding='utf-8')
            def observe_ui_checkpoint():
                page.get_by_role('tab',name='Trích xuất',exact=True).click()
                page.get_by_text('Trích xuất: waiting_entity_review',exact=False).wait_for(timeout=15000)
            session.perform('ACT-S02-CHECKPOINT','click','tab: Trích xuất',observe_ui_checkpoint)
            session.canonical_readback()
            return {'status':'S02_ENTITY_GATE_OBSERVED','novel_id':novel_id}
        page.wait_for_timeout(250)
    raise RuntimeError('S02_ENTITY_CHECKPOINT_NOT_OBSERVED')


def sanitize_trace(source,dest, secrets=()):
    """Keep genuine ZIP trace structure, redact credentials before handing off."""
    jwt=re.compile(r'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}')
    def scrub(value):
        if isinstance(value,dict):
            if str(value.get('name','')).lower() in {'authorization','cookie','set-cookie','x-service-token'}:
                return {**value,'value':'[REDACTED]'}
            return {k:('[REDACTED]' if k.lower() in {'accesstoken','refreshtoken','password'} else scrub(v)) for k,v in value.items()}
        if isinstance(value,list):return [scrub(v) for v in value]
        if isinstance(value,str):
            value=jwt.sub('[REDACTED_JWT]',value)
            for secret in secrets:
                if secret:value=value.replace(secret,'[REDACTED]')
        return value
    with zipfile.ZipFile(source) as archive,zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED) as output:
        for name in archive.namelist():
            data=archive.read(name)
            try:
                text=data.decode('utf-8')
                if name.endswith(('.trace','.network')):
                    data=('\n'.join(json.dumps(scrub(json.loads(line))) for line in text.splitlines() if line)+'\n').encode()
                else:
                    for secret in secrets:
                        if secret:text=text.replace(secret,'[REDACTED]')
                    data=jwt.sub('[REDACTED_JWT]',text).encode()
            except (UnicodeError,json.JSONDecodeError):pass
            output.writestr(name,data)


def run_browser(run_id,evidence_dir,base_url,email,password, *, human_review=False, project=None, wave1f=False):
    from playwright.sync_api import sync_playwright
    session=BrowserActionSession(run_id,evidence_dir,base_url)
    failure=None;chapters=[]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        context=browser.new_context(viewport={'width':1280,'height':900})
        # Block browser third-party subresources; application APIs stay same-origin.
        origin=urlparse(base_url).netloc
        context.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).netloc==origin else route.abort())
        page=context.new_page();session.page=page
        try:
            page.goto(base_url+'/login')
            page.get_by_label('Email or username').fill(email);page.get_by_label('Password',exact=True).fill(password)
            with page.expect_response(lambda r:'/auth/login' in r.url and r.request.method=='POST') as logged:
                page.get_by_role('button',name='Login',exact=True).click()
            login=logged.value.json()['data'];session.token=login['accessToken'];session.user_id=login['user']['userId']
            if login['user']['role'] not in {'AUTHOR','ADMIN'}:raise RuntimeError('ISOLATED_AUTHOR_ACCOUNT_REQUIRED')
            page.goto(base_url+'/author')
        except Exception as exc:
            page.screenshot(path=str(session.evidence_dir/'BLOCKED_LOGIN_UI.png'))
            result={'status':'BLOCKED_UI_MISSING_OR_LOGIN_FAILED','reason':str(exc),
                    'session_id':session.session_id,'real_provider_live_ui':'NOT_RUN'}
            (session.evidence_dir/'browser-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
            browser.close()
            return result
        # Login trace is deliberately excluded: it contains password/tokens.
        private=session.evidence_dir/'.eval-private';private.mkdir(exist_ok=True)
        context.tracing.start(screenshots=True,snapshots=True,sources=False)
        session_info={'session_id':session.session_id,'run_id':run_id,'browser_version':browser.version,
                      'started_at':now(),'login_observed':True,'user_id':session.user_id,'login_trace_excluded_for_credentials':True}
        try:
            if human_review or wave1f:
                from Pipeline_test.tools.browser_human_entity_review import receipts
                session.receipt_offset=len(receipts(project))
            execute_browser_s01_import_path(session,author_user=email)
            execute_browser_s02_entity_review_path(session,session.novel_id)
            chapters=session.canonical_readback()
            if wave1f:
                from Pipeline_test.tools.browser_wave1f import execute_wave1f
                execute_wave1f(session,project)
            if human_review:
                from Pipeline_test.tools.browser_human_entity_review import execute_human_review
                execute_human_review(session,project)
                chapters=session.canonical_readback()
        except Exception as exc:
            failure=f'{type(exc).__name__}: {exc}'
            session.page.screenshot(path=str(session.evidence_dir/'BLOCKED_UI.png'))
        finally:
            context.tracing.stop(path=str(private/'browser.trace.raw.zip'))
            sanitize_trace(private/'browser.trace.raw.zip',session.evidence_dir/'browser.trace.zip',(password,session.token))
            session_info['finished_at']=now()
            (session.evidence_dir/'browser-session.json').write_text(json.dumps(session_info,indent=2),encoding='utf-8')
            browser.close()
    if len(chapters)==5:
        mapping={'run_id':run_id,'session_id':session.session_id,'novel_id':session.novel_id,
                 'user_id':session.user_id,'conversion_rule_version':CONVERSION_RULE_VERSION,
                 'canonical_readback_observation':session.canonical_readback_time,
                 'source_to_canonical':[{**source,'chapter_id':chapter['chapterId'],
                     'revision_id':chapter['latestRevisionId'],'readback_body_sha256':chapter['contentHash']}
                     for source,chapter in zip(session.source_manifest,chapters)],'readback_scope':'final_post_run_readback',
                 'captured_at':now()}
        (session.evidence_dir/'source-to-canonical-manifest.json').write_text(
            json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf-8')
    manifests=[]
    for action in session.actions:
        aid=action['action_id']
        readback=dict(run_id=run_id,session_id=session.session_id,action_id=aid,user_id=session.user_id,
                      novel_id=session.novel_id,chapters=chapters,
                      captured_at=getattr(session,'canonical_readback_time',{}).get('finished_at'),
                      observation=getattr(session,'canonical_readback_time',{}),packaged_at=now(),
                      readback_scope='final_post_run_readback' if failure is None else 'last_successful_canonical_readback_before_failure',
                      action_finished_at=action['finished_at'])
        rb=session.evidence_dir/(aid+'.readback.json');rb.write_text(json.dumps(readback,ensure_ascii=False),encoding='utf-8')
        files={'screenshot':aid+'.png','dom':aid+'.dom.txt','trace':'browser.trace.zip','session':'browser-session.json','readback':rb.name}
        manifest={**action,'run_id':run_id,'session_id':session.session_id,'user_id':session.user_id,
            'novel_id':session.novel_id,'channel':'OFFLINE_BROWSER_UI_SMOKE',
            'artifacts':{k:{'path':v,'sha256':sha(session.evidence_dir/v)} for k,v in files.items()}}
        dest=session.evidence_dir/(aid+'.json');dest.write_text(json.dumps(manifest,indent=2),encoding='utf-8');manifests.append(dest)
    checks=[validate_browser_evidence(str(m.resolve()),m.stem,session.novel_id,session.evidence_dir,
        expected_run_id=run_id,expected_user_id=session.user_id,expected_session_id=session.session_id) for m in manifests]
    human_path=session.evidence_dir/'human-review-result.json'
    human_result=json.loads(human_path.read_text(encoding='utf-8')) if human_path.exists() else None
    result={'status':browser_outcome(failure,checks,human_review=human_review,human_result=human_result),
        'reason':failure,'evidence_checks':checks,'session_id':session.session_id,'novel_id':session.novel_id,
        'user_id':session.user_id,'actions':len(session.actions),'real_provider_live_ui':'NOT_RUN',
       'readback_scope':'final_post_run_readback','source_conversion_rule':CONVERSION_RULE_VERSION,
       's01_status':'OFFLINE_BROWSER_UI_SMOKE_PASS' if len(chapters)==5 else 'BLOCKED',
       's02_status':'CHECKPOINT_OBSERVED' if (session.evidence_dir/'s02-entity-checkpoint.readback.json').exists() else 'BLOCKED',
       'human_review_requested':human_review}
    (session.evidence_dir/'browser-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--run-id',required=True)
    parser.add_argument('--evidence-dir',required=True);parser.add_argument('--base-url',required=True)
    parser.add_argument('--human-review',action='store_true');parser.add_argument('--project');parser.add_argument('--wave1f',action='store_true')
    args=parser.parse_args()
    if Path(args.evidence_dir).exists() and any(Path(args.evidence_dir).iterdir()):
        raise SystemExit('EXISTING_EVIDENCE_REPLAY_FORBIDDEN: use a new attempt directory; no author writes performed')
    try:
        result=run_browser(args.run_id,args.evidence_dir,args.base_url,os.environ['WAVE1D_AUTHOR_EMAIL'],os.environ['WAVE1D_AUTHOR_PASSWORD'],human_review=args.human_review,project=args.project,wave1f=args.wave1f)
    except Exception as exc:
        result={'status':'BLOCKED_BROWSER_RUNTIME','reason':str(exc),'real_provider_live_ui':'NOT_RUN'}
        Path(args.evidence_dir).mkdir(parents=True,exist_ok=True)
        (Path(args.evidence_dir)/'browser-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result));raise SystemExit(0 if result['status']=='OFFLINE_BROWSER_UI_SMOKE' else 1)
