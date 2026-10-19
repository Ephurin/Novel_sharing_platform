"""Public application API driver. Tokens stay in process memory; evidence redacted."""
import json, re, sys, time, datetime, urllib.request, urllib.error
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

RUN = Path(__file__).resolve().parent
ROOT = RUN.parents[2]
BASE = 'http://localhost:4000/api/v1'
TOKEN = None

def now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat()

def clean(x):
    if isinstance(x, dict):
        return {k: ('[REDACTED]' if any(s in k.lower() for s in ['token', 'password', 'api_key', 'apikey', 'cookie', 'authorization']) and k.lower() not in ['token_budget', 'tokens_in', 'tokens_out'] else clean(v)) for k,v in x.items()}
    if isinstance(x, list): return [clean(v) for v in x]
    if isinstance(x,str): return re.sub(r'AIza[\w-]+', '[REDACTED]', x)
    return x

def api(method, path, body=None, label=None):
    if label and (RUN/'evidence'/f'{label}.json').exists():
        raise RuntimeError('Evidence already exists; inspect server state and choose an explicit new attempt label before any request.')
    headers={'Content-Type':'application/json'}
    if TOKEN: headers['Authorization']='Bearer '+TOKEN
    req=urllib.request.Request(BASE+path, data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers=headers,method=method)
    start=time.monotonic()
    try:
        with urllib.request.urlopen(req,timeout=180) as resp: status=resp.status; data=json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        status=exc.code
        try:data=json.loads(exc.read())
        except Exception:data={'error':'non-JSON response'}
    if label:
        out={'time':now(),'channel':'PUBLIC_API','method':method,'path':path,'request':clean(body),'status':status,'latency_ms':round((time.monotonic()-start)*1000),'response':clean(data)}
        p=RUN/'evidence'/f'{label}.json'
        p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if status>=400: raise RuntimeError(json.dumps({'status':status,'response':clean(data)},ensure_ascii=False))
    return data.get('data',data)

def login():
    global TOKEN
    doc=(ROOT/'docs/Deployment/defense-demo-runbook.md').read_text(encoding='utf-8')
    user=re.search(r'Username: `([^`]+)`',doc).group(1)
    password=re.search(r'Password: `([^`]+)`',doc).group(1)
    data=api('POST','/auth/login',{'identifier':user,'password':password})
    TOKEN=data['accessToken']

if __name__=='__main__':
    login()
    if sys.argv[1]=='preflight':
        print(json.dumps(api('GET','/auth/me',label='author-me'),ensure_ascii=False))
        print(json.dumps(api('GET','/ai/health',label='provider-health'),ensure_ascii=False))
    elif sys.argv[1]=='request':
        body=json.loads(Path(sys.argv[4]).read_text(encoding='utf-8-sig')) if sys.argv[4]!='-' else None
        print(json.dumps(api(sys.argv[2],sys.argv[3],body,sys.argv[5]),ensure_ascii=False))
    elif sys.argv[1]=='import':
        novel='8bfd205f-c055-45e4-beda-e81a24b7854b'
        chapters=api('GET',f'/novels/{novel}/chapters')
        print(json.dumps(chapters,ensure_ascii=False))
        records=[]
        for n in range(1,6):
            text=(ROOT/f'Pipeline_test/input/manuscript/ch{n:02}.md').read_text(encoding='utf-8-sig')
            title,body=text.split('\n',1); title=title.lstrip('# ').strip();body=body.strip()
            saved=RUN/'evidence'/f'p1-ch{n:02}-snapshot.json'
            if saved.exists():
                rev=json.loads(saved.read_text(encoding='utf-8'))['response']['data']
                cid=rev.get('chapterId',rev.get('chapter_id'))
            elif n==1:
                cid='2991c50d-2dc1-46d0-b996-93e6c8caecd2'
                chapter=api('PATCH',f'/chapters/{cid}',{'title':title,'content':body},f'p1-ch{n:02}-load')
            else:
                chapter=api('POST',f'/novels/{novel}/chapters',{'title':title,'content':body,'isVip':False,'priceCoins':0},f'p1-ch{n:02}-load')
                cid=chapter.get('id',chapter.get('chapterId'))
            if not saved.exists():
                rev=api('POST',f'/chapters/{cid}/revisions/snapshot',{'content':body,'purpose':'MANUSCRIPT_BOOTSTRAP'},f'p1-ch{n:02}-snapshot')
            print(json.dumps({'chapter':n,'snapshot':rev},ensure_ascii=False))
            rid=rev.get('id',rev.get('revision_id',rev.get('revisionId')))
            read=api('GET',f'/chapters/{cid}/revisions/{rid}',label=f'p1-ch{n:02}-readback')
            assert read['content']==body, 'Readback drift'
            records.append({'chapter_number':n,'chapter_id':cid,'revision_id':rid,'content_hash':rev.get('contentHash',rev.get('content_hash'))})
            (RUN/'evidence/import-revisions.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    elif sys.argv[1]=='p2-review':
        novel='38efd972-da60-4c19-a967-5ef8c62e230a'
        queue=json.loads((RUN/'evidence/memory/P2-M0/raw-queue.json').read_text(encoding='utf-8'))['response']['data']
        duplicates=[p for p in queue if p['payload'].get('fact_key','').startswith('author_constraint_')]
        for i,p in enumerate(duplicates,1):
            api('POST',f"/ai/proposals/{p['proposal_id']}/reject",{'reason':'Duplicate of model-proposed matching world rule; original author constraint retained in run evidence.'},f'p2-reject-duplicate-{i}')
        selected=[p for p in queue if p not in duplicates]
        result=api('POST',f"/ai/proposal-groups/{selected[0]['dependency_group_id']}/accept",{'proposal_ids':[p['proposal_id'] for p in selected],'expected_brain_version':1,'reason':'Individually reviewed: premise is a story intention, constraints valid; four blueprint entities are author accepted, no future events asserted.'},'p2-accept-reviewed-group')
        print(json.dumps(result,ensure_ascii=False))
        print(json.dumps(api('POST',f'/ai/story-brains/{novel}/baseline/activate',{'job_id':'9edd2bef-027b-5cf2-8b90-11229ef1a3d6'},'p2-baseline-activate'),ensure_ascii=False))
    elif sys.argv[1]=='p3-init':
        created=api('POST','/novels',{'title':'P3 probe — 2026-10-17-author-01','synopsis':'Dự án probe controller riêng, cùng năm chương seed và không trộn vào bản chính.','tags':['pipeline-test','P3']},'p3-create')
        novel=created['novelId']
        p=RUN/'run_config.json'; cfg=json.loads(p.read_text(encoding='utf-8'));cfg['p3_probe_novel_id']=novel;p.write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
        records=[]
        for n in range(1,6):
            text=(ROOT/f'Pipeline_test/input/manuscript/ch{n:02}.md').read_text(encoding='utf-8-sig')
            title,body=text.split('\n',1);body=body.strip()
            ch=api('POST',f'/novels/{novel}/chapters',{'title':title.lstrip('# ').strip(),'content':body},f'p3-ch{n:02}-load');cid=ch['chapterId']
            rev=api('POST',f'/chapters/{cid}/revisions/snapshot',{'content':body,'purpose':'MANUSCRIPT_BOOTSTRAP'},f'p3-ch{n:02}-snapshot')
            read=api('GET',f"/chapters/{cid}/revisions/{rev['revisionId']}",label=f'p3-ch{n:02}-readback');assert read['content']==body
            records.append({'chapter_number':n,'chapter_id':cid,'revision_id':rev['revisionId'],'content_hash':rev['contentHash']})
            (RUN/'evidence/p3-import-revisions.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'novel_id':novel,'revisions':records},ensure_ascii=False))
    elif sys.argv[1]=='audit-probes':
        from urllib.parse import urlencode
        specs={
            'P1':('8bfd205f-c055-45e4-beda-e81a24b7854b',5,[('CV-04 đã quét bao nhiêu lần?','CV-04','Exactly one original scan'),('Ai giữ vòng chuẩn?','Trần Duy','Duy toolbox'),('Giọng Lâm đã xác minh chưa?','Mai Linh','Unverified attribution'),('Duy nghe bằng tai nào?','Trần Duy','Right; left deaf'),('83 người đã được xác nhận cứu chưa?','Mai Lâm','No historical assertion')]),
            'P2':('38efd972-da60-4c19-a967-5ef8c62e230a',1,[('Mai Lâm còn sống không?','Mai Lâm','Dead; no Alive current state'),('Gốm thanh có đọc tương lai không?','Gốm thanh','Only past sounds'),('Outline đã xảy ra chưa?','Cồn Vân','Future plan is not historical canon'),('Nhân vật chính có nghề gì?','Nhân vật phục chế âm thanh','Sound restorer; model generic identity accepted'),('Đã cứu Bãi Dưới chưa?','Bãi Dưới','No completed rescue in history')]),
            'P3':('2bb31f80-4a5c-4eba-a5b9-6d936fd76986',5,[('CV-04 đã quét bao nhiêu lần?','CV-04','Exactly one original scan'),('Ai giữ vòng chuẩn?','Trần Duy','Duy toolbox'),('Giọng Lâm đã xác minh chưa?','Mai Linh','Unverified attribution'),('Duy nghe bằng tai nào?','Trần Duy','Right; left deaf'),('83 người đã được xác nhận cứu chưa?','Mai Lâm','No historical assertion')])}
        for pipe,(novel,cutoff,probes) in specs.items():
            ev=RUN/f'evidence/memory/{pipe}-M0'
            frozen=ev/'probe-gold.json'
            if not frozen.exists(): frozen.write_text(json.dumps({'time':now(),'based_on':'Gold source/author inputs frozen before extraction; context preview only, no QA API','probes':probes},ensure_ascii=False,indent=2),encoding='utf-8')
            for i,(question,anchor,gold) in enumerate(probes,1):
                params=urlencode({'chapter_number':cutoff,'character_name':anchor,'token_budget':6000})
                api('GET',f'/ai/story-brains/{novel}/context-preview?{params}',label=f'memory/{pipe}-M0/probe-{i:02}')
        api('GET','/ai/story-brains/8bfd205f-c055-45e4-beda-e81a24b7854b/context-preview?chapter_number=6&token_budget=6000',label='main-plan-context-ch06')
        print('Saved 15 context-preview probes and main chapter 6 planning context.')
    elif sys.argv[1]=='final-readback':
        records=json.loads((RUN/'evidence/import-revisions.json').read_text(encoding='utf-8'))
        for n,rev in enumerate(records,1):
            read=api('GET',f"/chapters/{rev['chapter_id']}/revisions/{rev['revision_id']}",label=f'final-ch{n:02}-readback')
            old=json.loads((RUN/f'evidence/p1-ch{n:02}-readback.json').read_text(encoding='utf-8'))['response']['data']
            assert read['content']==old['content'] and read['contentHash']==old['contentHash']
        api('GET','/novels/8bfd205f-c055-45e4-beda-e81a24b7854b/chapters',label='final-main-chapters')
        print('Five canonical immutable revisions match after fresh login/readback.')
    elif sys.argv[1]=='final-heads':
        for n,rev in enumerate(json.loads((RUN/'evidence/import-revisions.json').read_text(encoding='utf-8')),1):
            latest=api('GET',f"/chapters/{rev['chapter_id']}/revisions?limit=1",label=f'final-ch{n:02}-head')
            records=latest if isinstance(latest,list) else latest.get('items',latest.get('revisions',[]))
            assert records and records[0]['revisionId']==rev['revision_id'], 'Latest revision differs; inspect before exporting'
        for pipe,novel in [('P1','8bfd205f-c055-45e4-beda-e81a24b7854b'),('P2','38efd972-da60-4c19-a967-5ef8c62e230a')]:
            api('GET',f'/ai/story-brains/{novel}/review-queue',label=f'memory/{pipe}-M0/final-queue')
        print('All latest revision IDs match exported seed; final queues saved.')
