"""Real disposable PostgreSQL acceptance; source/snapshot comparisons are durable DB reads."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, replace
import hashlib,json,uuid
from types import SimpleNamespace
import pytest
from sqlalchemy import text
from api.setup_schemas import SetupRequest
from application.setup_service import SetupService, SetupFailure, digest
from domain.errors import BootstrapConflictError, IdempotencyConflictError
from tests.test_p2_bootstrap_postgres import engine, f, TENANT, ACTOR
from tests.test_setup_v1 import request_data

pytestmark=pytest.mark.postgres_integration


def submit(f, **changes):
    return SetupService(f.service).start(SetupRequest.model_validate(request_data(f.src.novel_id,**changes)),tenant_id=TENANT,actor_id=ACTOR)


def state(f, stage):
    value={}
    with f.engine.connect() as connection:
        names=connection.execute(text("SELECT table_name FROM information_schema.columns WHERE table_schema='narrative' AND column_name IN ('tenant_id','novel_id') GROUP BY table_name HAVING count(*)=2")).scalars().all()
        for name in names:
            value[name]=[dict(r) for r in connection.execute(text(f'SELECT * FROM narrative.{name} WHERE tenant_id=:t AND novel_id=:n ORDER BY 1'),{'t':TENANT,'n':f.src.novel_id}).mappings()]
    payload=json.dumps(value,default=str,sort_keys=True)
    print('SETUP_DB_READBACK '+json.dumps(dict(stage=stage,novel_id=f.src.novel_id,sha256=hashlib.sha256(payload.encode()).hexdigest(),counts={k:len(v) for k,v in value.items()}, snapshots=[dict(snapshot_id=str(j['id']),setup_version=j['result'].get('setup_version'),setup_hash=j['result'].get('setup_hash'),text_hash=j['result'].get('text_hash'),status=j['status']) for j in value['bootstrap_jobs']])))
    return value


def test_snapshot_replay_versions_homonyms_and_no_history(f):
    job=submit(f)
    svc=SetupService(f.service)
    readback=svc.readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR)
    assert readback['setup_version']==1 and readback['snapshot_id']==job.job_id
    assert readback['snapshot']==request_data(f.src.novel_id)['setup']
    assert readback['setup_hash']==digest(readback['snapshot'])
    assert readback['text_hash']==hashlib.sha256(readback['snapshot']['text'].encode()).hexdigest()
    assert len({c['payload']['entity_id'] for c in readback['proposals'] if c['card_type']=='entity'})==2
    assert len({c['proposal_id'] for c in readback['proposals']})==3
    assert 'private_author_notes' not in readback and 'author_constraints' not in readback
    before=state(f,'replay-before')
    assert submit(f).job_id==job.job_id
    assert state(f,'replay-after')==before
    with pytest.raises(IdempotencyConflictError):submit(f,mode='blueprint')
    with pytest.raises(BootstrapConflictError,match='SETUP_VERSION_CONFLICT'):
        submit(f,idempotency_key='stale',expected_setup_version=0)
    second=submit(f,idempotency_key='next',expected_setup_version=1)
    assert second.result['setup_version']==2
    assert svc.readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR,snapshot_id=job.job_id)==readback
    durable=state(f,'two-versions')
    for table in ['events','entities','facts','state_transitions','entity_mentions','revision_provenances']:
        assert not durable[table]
    assert len(durable['bootstrap_jobs'])==2
    assert durable['bootstrap_jobs'][0]['result']['setup_source']['private_author_notes']==['PrivateOnly']


def test_concurrent_version_allocation_has_one_winner(f):
    def attempt(key):
        try:return submit(f,idempotency_key=key).result['setup_version']
        except BootstrapConflictError as error:return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(attempt,['first','second']))
    assert results.count(1)==1
    assert len(state(f,'concurrent-final')['bootstrap_jobs'])==1


def test_scope_readback_and_provider_failure_are_fail_closed(f):
    f.service._llm_service=None
    data=request_data(f.src.novel_id);data['setup']['text']='Unsupported prose'
    with pytest.raises(SetupFailure,match='SETUP_EXTRACT_PROVIDER_UNAVAILABLE'):
        SetupService(f.service).start(SetupRequest.model_validate(data),tenant_id=TENANT,actor_id=ACTOR)
    before=state(f,'failure-before-rejections')
    assert before['bootstrap_jobs'][0]['status']=='failed'
    assert not before['proposals'] and not before['analysis_runs']
    headers={**f.headers,'X-Author-Id':ACTOR}
    for other in [str(uuid.uuid4())]:
        response=f.client.get(f'/v1/story-brains/{other}/setup',headers=headers)
        assert response.status_code==404
    response=f.client.get(f'/v1/story-brains/{f.src.novel_id}/setup',headers={**headers,'X-Tenant-Id':str(uuid.uuid4())})
    assert response.status_code==403
    assert state(f,'failure-after-rejections')==before


def test_http_dispatch_redacts_job_and_blocks_legacy_authority(f):
    headers={**f.headers,'X-Author-Id':ACTOR}
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',json=request_data(f.src.novel_id),headers=headers)
    assert response.status_code==202
    job_id=response.json()['data']['job_id']
    response=f.client.get(f'/v1/story-brains/{f.src.novel_id}/setup',headers=headers)
    assert response.status_code==200
    data=response.json()['data'];group=data['proposals'][0]['dependency_group_id']
    ids=[c['proposal_id'] for c in data['proposals']]
    before=state(f,'legacy-authority-before')
    for action in ['accept','reject']:
        payload={'expected_brain_version':1,'proposal_ids':ids} if action=='accept' else {'expected_brain_version':1}
        res=f.client.post(f'/v1/proposal-groups/{group}/{action}',headers=headers,json=payload)
        assert res.status_code==409,res.text
        assert res.json()['detail']['code']=='SETUP_REVIEW_NOT_AVAILABLE'
    res=f.client.post(f'/v1/story-brains/{f.src.novel_id}/baseline/activate',headers=headers,json={'job_id':job_id})
    assert res.status_code==409 and res.json()['detail']['code']=='SETUP_ACTIVATION_NOT_AVAILABLE'
    assert state(f,'legacy-authority-after')==before
    # Generic job DTO does not expose immutable private fields either.
    from application.setup_service import public_job
    assert 'PrivateOnly' not in json.dumps(asdict(public_job(f.service.get_job(job_id))))


def test_empty_and_initial_conditions_remain_unmaterialized(f):
    data=request_data(f.src.novel_id);data['setup']['initial_conditions']=[dict(declaration_id='hp',subject_declaration_id='one',attribute_key='health',value=100)]
    job=SetupService(f.service).start(SetupRequest.model_validate(data),tenant_id=TENANT,actor_id=ACTOR)
    assert job.result['setup_cards'][-1]['card_type']=='initial_condition'
    assert job.result['setup_cards'][-1]['status']=='pending'
    value=state(f,'initial-pending')
    assert not value['entities'] and not value['state_transitions']
    empty=dict(text='',declarations=[],world_rules=[],initial_conditions=[])
    job=submit(f,setup=empty,idempotency_key='empty',expected_setup_version=1)
    assert job.result['setup_cards']==[]
    with pytest.raises(BootstrapConflictError,match='SETUP_ACTIVATION_NOT_AVAILABLE'):
        f.repo.activate_baseline(f.src.novel_id,job.job_id,None)


def test_immutable_source_and_active_guard(f):
    job=submit(f)
    before=state(f,'immutable-before')
    with pytest.raises(BootstrapConflictError,match='SETUP_SOURCE_IMMUTABLE'):
        f.repo.save_bootstrap_job(replace(job,result={**job.result,'setup_hash':'0'*64}))
    assert state(f,'immutable-after')==before
    with f.engine.begin() as connection:
        connection.execute(text("UPDATE narrative.story_brains SET status='active' WHERE tenant_id=:t AND novel_id=:n"),{'t':TENANT,'n':f.src.novel_id})
    before=state(f,'active-before')
    with pytest.raises(BootstrapConflictError,match='ALREADY_ACTIVE'):
        submit(f,idempotency_key='active',expected_setup_version=1)
    assert state(f,'active-after')==before


def test_real_extract_provider_replay_and_invalid_output_rollback(f):
    calls=[]
    def extract(**kw):
        calls.append(kw)
        assert kw==dict(text='😀 Minh ở An Thành.',locale='vi-VN')
        return dict(entities=[dict(entity_type='character',display_name='Minh',source_ref=dict(
            kind='setup_span',field_path='/setup/text',offset_kind='unicode_codepoints',start=2,end=6,quote='Minh'))],world_rules=[])
    f.service._llm_service=SimpleNamespace(extract_setup_text=extract)
    source=request_data(f.src.novel_id)['setup'];source['text']='😀 Minh ở An Thành.'
    job=submit(f,setup=source)
    assert submit(f,setup=source).job_id==job.job_id and len(calls)==1
    assert job.result['setup_cards'][-1]['origin']=='extracted_explicit'
    with pytest.raises(IdempotencyConflictError):submit(f,setup=source,outline='Changed future outline')
    assert len(calls)==1
    before=state(f,'provider-before-stale')
    with pytest.raises(BootstrapConflictError):submit(f,setup=source,idempotency_key='stale-provider')
    assert len(calls)==1 and state(f,'provider-after-stale')==before
    f.service._llm_service=SimpleNamespace(extract_setup_text=lambda **kw:dict(entities=[dict(entity_type='character',
        display_name='Fabricated',source_ref=dict(kind='setup_span',field_path='/setup/text',
            offset_kind='unicode_codepoints',start=2,end=6,quote='Minh'))],world_rules=[]))
    with pytest.raises(SetupFailure,match='SETUP_ENTITY_NAME_NOT_GROUNDED'):
        submit(f,setup=source,idempotency_key='invalid-provider',expected_setup_version=1)
    after=state(f,'provider-invalid-after')
    assert len(after['proposals'])==len(before['proposals'])
    assert len(after['analysis_runs'])==len(before['analysis_runs'])
    assert len(after['bootstrap_jobs'])==2


def test_production_fake_blueprint_preserves_raw_pending_suggestions(f):
    from core.fake_llm import FakeDeterministicLLMService
    provider=FakeDeterministicLLMService()
    f.service._llm_service=provider
    job=submit(f,mode='blueprint')
    cards=job.result['setup_cards']
    suggestions=[c for c in cards if c['origin']=='model_proposed']
    assert suggestions and all(c['status']=='pending' for c in suggestions)
    assert job.result['original_model_output']['entities']
    assert not any(secret in json.dumps(provider.last_call) for secret in ['PrivateOnly','ConstraintOnly','HintOnly'])
    assert submit(f,mode='blueprint').job_id==job.job_id
    assert [c['proposal_id'] for c in submit(f,mode='blueprint').result['setup_cards']]==[c['proposal_id'] for c in cards]
    data=state(f,'blueprint-pending')
    assert not data['entities'] and not data['facts'] and not data['events']


def test_running_setup_same_key_replay_calls_provider_once_without_db_locks(f):
    import threading
    entered,release=threading.Event(),threading.Event()
    calls=[]
    def extract(**kw):
        calls.append(kw);entered.set();assert release.wait(15)
        return dict(entities=[dict(entity_type='character',display_name='Minh',source_ref=dict(kind='setup_span',
            field_path='/setup/text',offset_kind='unicode_codepoints',start=0,end=4,quote='Minh'))],world_rules=[])
    f.service._llm_service=SimpleNamespace(extract_setup_text=extract)
    source=request_data(f.src.novel_id)['setup'];source['text']='Minh'
    with ThreadPoolExecutor(max_workers=1) as pool:
        worker=pool.submit(submit,f,setup=source)
        assert entered.wait(10)
        try:
            replay=submit(f,setup=source)
            assert replay.status=='running'
            with f.engine.begin() as connection:
                # The provider is blocked in another thread; its reservation
                # transaction must already have released the Brain lock.
                connection.execute(text('SELECT id FROM narrative.story_brains WHERE novel_id=:n FOR UPDATE NOWAIT'),{'n':f.src.novel_id}).all()
            before=state(f,'running-before-conflict')
            with pytest.raises(BootstrapConflictError):submit(f,setup=source,idempotency_key='competitor')
            assert state(f,'running-after-conflict')==before
        finally:release.set()
        finished=worker.result(timeout=15)
    assert finished.job_id==replay.job_id and len(calls)==1
    assert len(state(f,'running-final')['bootstrap_jobs'])==1
