"""F04: actual async HTTP worker, real immutable SQL revision, offline recorder.

Pre-fix probe and exposure retained at 53cd695e and its archived CI artifact.
"""
import hashlib
import json
import uuid
import os
import subprocess
from pathlib import Path
from dataclasses import asdict, replace
from copy import deepcopy

import pytest
from sqlalchemy import text
from application.ports import RevisionContent
from application.writing_service import WritingService
from tests.test_p2_bootstrap_postgres import engine, f, TENANT, ACTOR, snapshot
from tests.test_plan_review_fixes_postgres import seed_legacy, FOREIGN

pytestmark = pytest.mark.postgres_integration


class SqlRevisionProvider:
    """Reads a real immutable Platform revision, without fabricated source_text."""
    def __init__(self, engine):
        self.engine = engine

    def get_revision(self, *, tenant_id, novel_id, chapter_id, revision_id):
        assert tenant_id == TENANT
        with self.engine.connect() as c:
            row = c.execute(text('SELECT r.*, c.chapter_number FROM chapter_revisions r JOIN chapters c USING (chapter_id) WHERE r.revision_id=:r AND r.novel_id=:n AND r.chapter_id=:c'),dict(r=revision_id,n=novel_id,c=chapter_id)).mappings().one()
        return RevisionContent(revision_id=str(row['revision_id']),novel_id=str(row['novel_id']),chapter_id=str(row['chapter_id']),content=row['content'],content_hash=row['content_hash'],chapter_number=row['chapter_number'])


class RecordingProvider:
    def __init__(self):
        self.payloads = []

    def generate_writing_draft(self, **kwargs):
        self.payloads.append(deepcopy(kwargs))
        return dict(draft_text='An authorized draft.',patch=dict(start=0,end=0,text='An authorized draft.'),model_info=dict(provider='recording-fake'))


@pytest.fixture
def worker(f):
    n,c,r = f.src.novel_id,f.src.chapter_id,f.src.revision_id
    content='A real immutable manuscript revision.'
    h=hashlib.sha256(content.encode()).hexdigest()
    with f.engine.begin() as db:
        for actor in (ACTOR,FOREIGN):
            db.execute(text("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES (:a,:email,:name,'offline-only','AUTHOR','ACTIVE') ON CONFLICT(user_id) DO NOTHING"),dict(a=actor,email=actor+'@example.test',name='f04-'+actor))
        db.execute(text("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES (:n,:a,'F04 isolated',:slug,'offline')"),dict(n=n,a=ACTOR,slug='f04-'+n))
        db.execute(text("INSERT INTO chapters(chapter_id,novel_id,chapter_number,title,content,word_count) VALUES (:c,:n,1,'Source',:content,6)"),dict(c=c,n=n,content=content))
        db.execute(text("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES (:r,:n,:c,:h,:content,6,'AUTHOR_MANUAL',:a)"),dict(r=r,n=n,c=c,h=h,content=content,a=ACTOR))
        db.execute(text('UPDATE chapters SET latest_revision_id=:r WHERE chapter_id=:c'),dict(r=r,c=c))
    f.repo.get_story_brain(n)
    with f.engine.begin() as db:
        db.execute(text("UPDATE narrative.story_brains SET status='active',baseline_revision_id=:r WHERE novel_id=:n AND tenant_id=:t"),dict(r=r,n=n,t=TENANT))
    provider=RecordingProvider()
    service=WritingService(f.repo,provider,SqlRevisionProvider(f.engine))
    f.client.app.state.writing_service=service
    from api.narrative_routes import internal_router
    f.client.app.include_router(internal_router)
    if os.environ.get('F04_MONGO_EVIDENCE')=='1':
        mongo(f,'seed')
    return f,service,provider,h


def mongo(f,action):
    # The feature workflow supplies an isolated Mongo7 p2a service. Other PG-only
    # suites report NOT_RUN rather than imply that Mongo was exercised there.
    if os.environ.get('F04_MONGO_EVIDENCE')!='1':
        return dict(status='NOT_RUN_ENVIRONMENT',reason='PG-only job; Mongo exercised in P2 feature workflow')
    script='''
import {MongoClient} from 'mongodb';
const [novel,actor,action]=process.argv.slice(1);
const client=new MongoClient(process.env.MONGODB_URI);
try {
 await client.connect();const db=client.db();
 if(db.databaseName!=='p2a')throw new Error('F04 requires disposable p2a Mongo');
 const collection=db.collection('draft_chapters');
 if(action==='seed')await collection.insertOne({novelId:novel,authorId:actor,content:'F04 durable manuscript',version:1});
 const rows=await collection.find({novelId:novel}).sort({_id:1}).toArray();
 console.log(JSON.stringify({database:db.databaseName,rows}));
}finally{await client.close();}
'''
    run=subprocess.run(['node','--input-type=module','-e',script,f.src.novel_id,ACTOR,action],cwd=Path(__file__).resolve().parents[2]/'backend',capture_output=True,text=True,check=True,timeout=20)
    return json.loads(run.stdout)


def request_body(worker,**changes):
    f,_,_,h=worker
    return dict(dict(novel_id=f.src.novel_id,chapter_id=f.src.chapter_id,revision_id=f.src.revision_id,content_hash=h,operation='continue',selection=dict(start=0,end=0,cursor=0),instruction='Continue safely',expected_brain_version=1,chapter_number=1,actor_id=ACTOR,idempotency_key=str(uuid.uuid4())),**changes)


def seed_plan(f,creator):
    if creator!='no-plan':
        source_actor=ACTOR if creator=='owned-manual' else FOREIGN if creator=='foreign-manual' else creator
        plan=seed_legacy(f,source_actor,status='active')
        if creator in ('owned-manual','foreign-manual'):
            with f.engine.begin() as db:
                db.execute(text("UPDATE narrative.story_plans SET edit_metadata='{"+'"contract_version":"plan-edit-v1","private_notes":"F04RootPrivateOnly"'+"}'::jsonb WHERE id=:p"),dict(p=plan))
        return plan


def durable(f,stage):
    data=snapshot(f,stage)
    with f.engine.connect() as db:
        for table in ('chapter_revisions','revision_outbox_events','chapters'):
            data[table]=[dict(r) for r in db.execute(text(f'SELECT * FROM {table} WHERE novel_id=:n ORDER BY 1'),dict(n=f.src.novel_id)).mappings()]
    data['mongo']=mongo(f,'read')
    return json.loads(json.dumps(data,default=str))


def evidence(f,provider,job,before,case):
    after=durable(f,'f04-after-'+case)
    canon_before={k:v for k,v in before.items() if k!='writing_generations'}
    canon_after={k:v for k,v in after.items() if k!='writing_generations'}
    assert canon_before==canon_after
    digest=lambda data:hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
    print('F04_WORKER '+json.dumps(dict(case=case,job=asdict(job),provider_calls=len(provider.payloads),payloads=provider.payloads,canonical_before_sha256=digest(canon_before),canonical_after_sha256=digest(canon_after),platform_before={k:before[k] for k in ('chapter_revisions','revision_outbox_events','chapters','mongo')},platform_after={k:after[k] for k in ('chapter_revisions','revision_outbox_events','chapters','mongo')}),default=str))


def assert_blocked(job,provider,caplog):
    assert job.status=='failed' and job.stage=='security_blocked'
    assert job.error==dict(code='WRITING_CONTEXT_AUTHORITY_DENIED',message='Writing context authorization failed')
    assert provider.payloads==[] and not job.context_hash
    for marker in ('LegacyTitlePrivate','LegacyDescriptionPrivate','LegacyPrivateOnly','LegacyOutlinePrivate'):
        assert marker not in json.dumps(asdict(job),default=str)
        assert marker not in caplog.text


@pytest.mark.parametrize('creator',[None,FOREIGN,ACTOR,'no-plan','owned-manual','foreign-manual'])
def test_async_provider_payload_authority(worker,creator,caplog):
    f,service,provider,h=worker
    seed_plan(f,creator)
    before=durable(f,'f04-before-'+str(creator))
    response=f.client.post('/v1/writing/generations',headers={**f.headers,'X-Author-Id':ACTOR},json=request_body(worker))
    assert response.status_code==202,response.text
    job=f.repo.get_writing_job(response.json()['data']['job_id'])
    if creator in (None,FOREIGN,'foreign-manual'):
        assert_blocked(job,provider,caplog)
        assert service.process_generation(job.job_id)==job
        assert provider.payloads==[]
        for path in (f'/v1/jobs/{job.job_id}',f'/v1/jobs/{job.job_id}/events',f'/internal/v1/writing/generations/{job.job_id}'):
            result=f.client.get(path,headers={**f.headers,'X-Author-Id':ACTOR})
            assert result.status_code==200,result.text
            for marker in ('LegacyTitlePrivate','LegacyDescriptionPrivate','LegacyPrivateOnly','LegacyOutlinePrivate','F04RootPrivateOnly'):
                assert marker not in result.text
    else:
        assert job.status=='completed' and len(provider.payloads)==1
        context=provider.payloads[0]['context_package']
        if creator=='no-plan':assert not context.get('current_objective')
        else:
            assert context['current_objective']['title']=='LegacyTitlePrivate'
            assert context['current_objective']['authority_lane']=='FUTURE_PLAN'
        assert 'LegacyOutlinePrivate' not in json.dumps(context)
        assert 'F04RootPrivateOnly' not in json.dumps(context)
    evidence(f,provider,job,before,str(creator))


def queue(worker):
    _,service,_,_=worker
    return service.start_generation(tenant_id=TENANT,process_inline=False,**request_body(worker))


@pytest.mark.parametrize('change',['owner','foreign-plan','null-plan','missing-actor','forged-actor','chapter-number','novel','revision','foreign-tenant'])
def test_queued_job_revalidates_current_authority(worker,change,caplog):
    f,service,provider,_=worker
    plan=seed_plan(f,ACTOR)
    job=queue(worker)
    with f.engine.begin() as db:
        if change=='owner':db.execute(text('UPDATE novels SET author_id=:a WHERE novel_id=:n'),dict(a=FOREIGN,n=f.src.novel_id))
        elif change in ('foreign-plan','null-plan'):
            db.execute(text('UPDATE narrative.story_plans SET created_by=:a WHERE id=:p'),dict(a=FOREIGN if change=='foreign-plan' else None,p=plan))
        elif change in ('missing-actor','forged-actor'):
            db.execute(text('UPDATE narrative.writing_generations SET actor_id=:a WHERE job_id=:j'),dict(a=None if change=='missing-actor' else FOREIGN,j=job.job_id))
        elif change=='chapter-number':
            db.execute(text("UPDATE narrative.writing_generations SET context_summary=jsonb_set(context_summary,'{chapter_number}','2') WHERE job_id=:j"),dict(j=job.job_id))
        elif change in ('novel','revision','foreign-tenant'):
            column={'novel':'novel_id','revision':'revision_id','foreign-tenant':'tenant_id'}[change]
            db.execute(text(f'UPDATE narrative.writing_generations SET {column}=:v WHERE job_id=:j'),dict(v=str(uuid.uuid4()),j=job.job_id))
    before=durable(f,'f04-queue-before-'+change)
    if change=='foreign-tenant':
        with pytest.raises(KeyError):service.process_generation(job.job_id)
        assert provider.payloads==[]
        return
    result=service.process_generation(job.job_id)
    assert_blocked(result,provider,caplog)
    evidence(f,provider,result,before,'queued-'+change)


@pytest.mark.parametrize('change',['owner','active-plan','objective-content','no-plan-to-foreign','same-owner-version','persisted-actor'])
def test_context_to_dispatch_fence(worker,change,caplog):
    f,service,provider,_=worker
    plan=seed_plan(f,ACTOR) if change!='no-plan-to-foreign' else None
    job=queue(worker)
    original=service.preview_context
    unchanged={}
    def switch(**kwargs):
        package=original(**kwargs)
        if change=='no-plan-to-foreign':seed_plan(f,FOREIGN)
        else:
            with f.engine.begin() as db:
                if change=='owner':db.execute(text('UPDATE novels SET author_id=:a WHERE novel_id=:n'),dict(a=FOREIGN,n=f.src.novel_id))
                elif change=='active-plan':db.execute(text('UPDATE narrative.story_plans SET created_by=:a WHERE id=:p'),dict(a=FOREIGN,p=plan))
                elif change=='objective-content':db.execute(text("UPDATE narrative.story_plan_objectives SET title='Changed during packing' WHERE plan_id=:p"),dict(p=plan))
                elif change=='persisted-actor':db.execute(text('UPDATE narrative.writing_generations SET actor_id=:a WHERE job_id=:j'),dict(a=FOREIGN,j=job.job_id))
                else:db.execute(text('UPDATE narrative.story_plans SET plan_version=plan_version+1 WHERE id=:p'),dict(p=plan))
        unchanged.update(durable(f,'f04-dispatch-before-'+change))
        return package
    service.preview_context=switch
    # Changes above are deliberate fixture changes, not worker side effects.
    result=service.process_generation(job.job_id)
    assert_blocked(result,provider,caplog)
    evidence(f,provider,result,unchanged,'dispatch-'+change)


@pytest.mark.parametrize('case',['anonymous','service','missing-actor','forged-body','header-conflict','cross-tenant','admin'])
def test_http_identity_boundary(worker,case,caplog):
    f,_,provider,_=worker
    headers={**f.headers,'X-Author-Id':ACTOR};body=request_body(worker)
    expected=403
    if case=='anonymous':headers.pop('X-Service-Token');expected=401
    elif case=='service':headers['X-Service-Token']='forged'
    elif case=='missing-actor':headers.pop('X-Author-Id');expected=401
    elif case=='forged-body':body['actor_id']=FOREIGN
    elif case=='header-conflict':headers['X-Actor-Id']=FOREIGN
    elif case=='cross-tenant':headers['X-Tenant-Id']=str(uuid.uuid4())
    elif case=='admin':
        seed_plan(f,FOREIGN);headers['X-Role']='ADMIN';headers['X-Gateway-Legacy-Plan-Read']='admin';expected=202
    response=f.client.post('/v1/writing/generations',headers=headers,json=body)
    assert response.status_code==expected,response.text
    assert provider.payloads==[]
    if expected==202:assert_blocked(f.repo.get_writing_job(response.json()['data']['job_id']),provider,caplog)


def test_internal_job_read_requires_service_token_even_when_dev_auth_disabled(worker):
    f,_,provider,_=worker
    job=queue(worker)
    f.client.app.state.settings.service_auth_disabled=True
    path=f'/internal/v1/writing/generations/{job.job_id}'
    for headers,expected in [({'X-Tenant-Id':TENANT},401),({'X-Tenant-Id':TENANT,'X-Service-Token':'forged'},403),(f.headers,200)]:
        result=f.client.get(path,headers=headers)
        assert result.status_code==expected,result.text
    assert provider.payloads==[]
