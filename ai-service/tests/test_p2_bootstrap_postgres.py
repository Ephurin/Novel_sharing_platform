"""A16 PostgreSQL transactions/readbacks; fake provider only, unique novels."""
import os, json, uuid, threading
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
from fastapi.testclient import TestClient
from alembic import command
from alembic.config import Config
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from application.bootstrap_service import ManuscriptBootstrapService
from application.narrative_service import NarrativeApplicationService
from api.narrative_routes import router
from domain.errors import BootstrapConflictError
from tests.test_p2_bootstrap_guard import fixture, TENANT

pytestmark = pytest.mark.postgres_integration
ACTOR='00000000-0000-0000-0000-000000000002'

@pytest.fixture(scope='module')
def engine():
    url=os.environ['TEST_DATABASE_URL']
    cfg=Config('alembic.ini');cfg.set_main_option('sqlalchemy.url',url)
    command.upgrade(cfg,'head')
    e=create_engine(url)
    yield e
    e.dispose()

@pytest.fixture
def f(engine):
    _, service, llm, src=fixture()
    repo=PostgresNarrativeRepository(sessionmaker(engine,expire_on_commit=False),tenant_id=TENANT,actor_id=ACTOR)
    service._repository=repo
    app=FastAPI();app.state.bootstrap_service=service;app.state.narrative_service=NarrativeApplicationService(repo)
    app.state.settings=SimpleNamespace(platform_service_token='p2a-isolated', service_auth_disabled=False)
    app.include_router(router)
    client=TestClient(app)
    value=SimpleNamespace(engine=engine,repo=repo,service=service,llm=llm,src=src,client=client,
        headers={'X-Service-Token':'p2a-isolated','X-Tenant-Id':TENANT,'X-Request-Id':str(uuid.uuid4())})
    yield value
    client.close()

def snapshot(f,stage):
    out={}
    with f.engine.connect() as c:
        names=c.execute(text("SELECT table_name FROM information_schema.columns WHERE table_schema='narrative' AND column_name IN ('tenant_id','novel_id') GROUP BY table_name HAVING count(*)=2")).scalars().all()
        for name in names:
            out[name]=[dict(r) for r in c.execute(text(f'SELECT * FROM narrative.{name} WHERE tenant_id=:t AND novel_id=:n ORDER BY 1'),{'t':TENANT,'n':f.src.novel_id}).mappings()]
        out['decisions']=[dict(r) for r in c.execute(text('SELECT d.* FROM narrative.proposal_decisions d JOIN narrative.proposals p ON d.proposal_id=p.id WHERE p.tenant_id=:t AND p.novel_id=:n ORDER BY d.id'),{'t':TENANT,'n':f.src.novel_id}).mappings()]
    result=json.loads(json.dumps(out,default=str))
    print('P2A_PG_READBACK '+json.dumps({'stage':stage,'novel_id':f.src.novel_id,'data':result},sort_keys=True))
    return result

def idea(f,**kw):
    return f.service.start_from_idea(tenant_id=TENANT,novel_id=f.src.novel_id,idea='Explicit setup',**kw)

def active(f,baseline=None):
    f.repo.get_story_brain(f.src.novel_id)
    with f.engine.begin() as c:
        c.execute(text("UPDATE narrative.story_brains SET status='active', baseline_revision_id=:r WHERE tenant_id=:t AND novel_id=:n"),{'r':baseline,'t':TENANT,'n':f.src.novel_id})

@pytest.mark.parametrize('entry',['idea','manuscript'])
@pytest.mark.parametrize('baseline',[None,str(uuid.uuid4())])
def test_a16_active_http_no_durable_changes(f,entry,baseline):
    active(f,baseline)
    before=snapshot(f,'active-before-'+entry)
    body={'novel_id':f.src.novel_id,'idea':'Distinct setup'} if entry=='idea' else {'novel_id':f.src.novel_id,'revisions':[{'chapter_id':f.src.chapter_id,'revision_id':f.src.revision_id,'content_hash':f.src.content_hash}]}
    path='/v1/story-brains/bootstrap/from-'+entry
    response=f.client.post(path,json=body,headers=f.headers)
    print('P2A_HTTP '+json.dumps({'entry':entry,'status':response.status_code,'body':response.json()}))
    assert response.status_code==409 and response.json()['detail']['code']=='ALREADY_ACTIVE'
    assert snapshot(f,'active-after-'+entry)==before
    assert f.llm.calls==0

def test_a16_exact_key_replay_after_activation_and_conflict(f):
    job=idea(f,idempotency_key='operation')
    proposals=f.repo.list_proposals(f.src.novel_id)
    f.repo.reject_proposal_group(f.src.novel_id,proposals[0].dependency_group_id,1)
    f.service.activate_baseline(f.src.novel_id,job.job_id)
    before=snapshot(f,'replay-before')
    assert idea(f,idempotency_key='operation').job_id==job.job_id
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=f.headers,
        json={'novel_id':f.src.novel_id,'idea':'changed','idempotency_key':'operation'})
    assert response.status_code==409 and response.json()['detail']['code']=='IDEMPOTENCY_CONFLICT'
    assert snapshot(f,'replay-after')==before
    assert f.llm.calls==1

def test_a16_concurrent_replay_and_activation_admission(f):
    entered,release=threading.Event(),threading.Event()
    original=f.llm.generate_story_blueprint
    def slow(**kw):
        entered.set();assert release.wait(10)
        return original(**kw)
    f.llm.generate_story_blueprint=slow
    with ThreadPoolExecutor() as pool:
        worker=pool.submit(idea,f,idempotency_key='same')
        assert entered.wait(10)
        reservation=idea(f,idempotency_key='same')
        assert reservation.status=='running'
        before=snapshot(f,'racing-before')
        with pytest.raises(BootstrapConflictError,match='BOOTSTRAP_IN_PROGRESS'):
            idea(f,idempotency_key='other')
        response=f.client.post(f'/v1/story-brains/{f.src.novel_id}/baseline/activate',headers=f.headers,json={'job_id':reservation.job_id})
        assert response.status_code==409
        assert snapshot(f,'racing-after-rejections')==before
        release.set();job=worker.result(timeout=10)
    assert job.job_id==reservation.job_id and job.status=='waiting_review'
    state=snapshot(f,'racing-finalized')
    assert len(state['bootstrap_jobs'])==1 and len(state['analysis_runs'])==1 and len(state['proposals'])==1
    assert f.llm.calls==1

def test_a16_late_provider_cannot_write_after_active_transition(f):
    def late(**kw):
        active(f)
        return {'premise':'late','world_rules':[],'entities':[]}
    f.llm.generate_story_blueprint=late
    with pytest.raises(BootstrapConflictError,match='ALREADY_ACTIVE'):
        idea(f)
    data=snapshot(f,'forced-late-active')
    assert data['story_brains'][0]['status']=='active'
    assert not data['analysis_runs'] and not data['proposals']
    assert data['bootstrap_jobs'][0]['status']=='failed'

def test_a16_foreign_tenant_and_bad_source_no_mutation(f):
    before=snapshot(f,'scope-before')
    headers={**f.headers,'X-Tenant-Id':str(uuid.uuid4())}
    res=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=headers,json={'novel_id':f.src.novel_id,'idea':'foreign'})
    assert res.status_code==403
    res=f.client.post('/v1/story-brains/bootstrap/from-manuscript',headers=f.headers,json={'novel_id':f.src.novel_id,'revisions':[{'chapter_id':f.src.chapter_id,'revision_id':f.src.revision_id,'content_hash':'0'*64}]})
    assert res.status_code==422
    assert snapshot(f,'scope-after')==before
    assert f.llm.calls==0

def test_a16_finalization_transaction_rollback(f,monkeypatch):
    original=f.repo.save_proposals
    def fail(*a,**kw):
        original(*a,**kw)
        kw['_session'].flush()
        raise RuntimeError('injected proposal persistence failure')
    monkeypatch.setattr(f.repo,'save_proposals',fail)
    with pytest.raises(RuntimeError,match='injected'):
        idea(f)
    data=snapshot(f,'rollback-finalization')
    assert not data['analysis_runs'] and not data['proposals']
    assert data['bootstrap_jobs'][0]['status']=='failed'


def test_a16_unsupported_extract_key_and_foreign_activation_preserve_state(f):
    job=idea(f,idempotency_key='original')
    before=snapshot(f,'unsupported-and-foreign-before')
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=f.headers,
        json={'novel_id':f.src.novel_id,'idea':'Explicit setup','mode':'extract','idempotency_key':'original'})
    assert response.status_code==422 and response.json()['detail']['code']=='EXTRACT_NOT_IMPLEMENTED'
    response=f.client.post(f'/v1/story-brains/{uuid.uuid4()}/baseline/activate',headers=f.headers,json={'job_id':job.job_id})
    assert response.status_code==404
    assert snapshot(f,'unsupported-and-foreign-after')==before
    assert f.llm.calls==1

def test_a16_activation_of_older_review_waits_for_running_worker(f):
    old=idea(f,idempotency_key='old')
    proposals=f.repo.list_proposals(f.src.novel_id)
    f.repo.reject_proposal_group(f.src.novel_id,proposals[0].dependency_group_id,1)
    entered,release=threading.Event(),threading.Event()
    original=f.llm.generate_story_blueprint
    def slow(**kw):
        entered.set();assert release.wait(10)
        return original(**kw)
    f.llm.generate_story_blueprint=slow
    with ThreadPoolExecutor() as pool:
        worker=pool.submit(idea,f,idempotency_key='new')
        assert entered.wait(10)
        before=snapshot(f,'older-activation-before')
        response=f.client.post(f'/v1/story-brains/{f.src.novel_id}/baseline/activate',headers=f.headers,json={'job_id':old.job_id})
        assert response.status_code==409 and response.json()['detail']['code']=='BOOTSTRAP_IN_PROGRESS'
        assert snapshot(f,'older-activation-after')==before
        release.set();worker.result(timeout=10)
    f.service.activate_baseline(f.src.novel_id,old.job_id)
    assert f.repo.get_story_brain(f.src.novel_id).metadata['status']=='active'

def test_a16_late_stale_version_rejects_without_orphan_group(f):
    def change_version(**kw):
        with f.engine.begin() as c:
            c.execute(text('UPDATE narrative.story_brains SET brain_version=brain_version+1 WHERE novel_id=:n'),{'n':f.src.novel_id})
        return {'premise':'stale','world_rules':[],'entities':[]}
    f.llm.generate_story_blueprint=change_version
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=f.headers,json={'novel_id':f.src.novel_id,'idea':'setup'})
    assert response.status_code==409 and response.json()['detail']['code']=='BRAIN_VERSION_CONFLICT'
    data=snapshot(f,'stale-finalization')
    assert not data['analysis_runs'] and not data['proposals']
    assert data['bootstrap_jobs'][0]['status']=='failed'


def test_a16_manuscript_hash_survives_processing_and_active_replay(f):
    from domain.errors import IdempotencyConflictError
    f.service._analysis_service=SimpleNamespace(analyze=lambda **kw: SimpleNamespace(proposals=(), analysis_run=SimpleNamespace(run_id=str(uuid.uuid4()))))
    source={'chapter_id':f.src.chapter_id,'revision_id':f.src.revision_id,'content_hash':f.src.content_hash}
    args=dict(tenant_id=TENANT,novel_id=f.src.novel_id,revisions=[source],locale='vi-VN',options={},idempotency_key='manuscript-op')
    job=f.service.start(**args)
    f.service.process(job.job_id)
    f.service.activate_baseline(f.src.novel_id,job.job_id)
    before=snapshot(f,'manuscript-replay-before')
    assert f.service.start(**args).job_id==job.job_id
    with pytest.raises(IdempotencyConflictError):
        f.service.start(**{**args,'locale':'en-US'})
    with pytest.raises(IdempotencyConflictError):
        f.service.start(**{**args,'revisions':[{**source,'content_hash':'0'*64}]})
    assert snapshot(f,'manuscript-replay-after')==before


@pytest.mark.parametrize('review_state', ['pending', 'missing'])
def test_activation_review_gate_preserves_all_durable_state(f, review_state):
    job = idea(f)
    if review_state == 'missing':
        proposals = f.repo.list_proposals(f.src.novel_id)
        f.repo.reject_proposal_group(f.src.novel_id, proposals[0].dependency_group_id, 1)
        f.repo.save_bootstrap_job(replace(job, result={
            **job.result, 'required_proposal_ids': [str(uuid.uuid4())],
        }))
    before = snapshot(f, 'review-gate-before-' + review_state)
    response = f.client.post(f'/v1/story-brains/{f.src.novel_id}/baseline/activate',
                             headers=f.headers, json={'job_id': job.job_id})
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'BASELINE_REVIEW_REQUIRED'
    assert snapshot(f, 'review-gate-after-' + review_state) == before
