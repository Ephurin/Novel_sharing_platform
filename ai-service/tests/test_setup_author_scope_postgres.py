"""Real-PG author negatives. Raw private sources are compared, never printed."""
import json,uuid
from types import SimpleNamespace
import pytest
from api.setup_schemas import SetupRequest
from application.setup_service import SetupService, SetupFailure
from tests.test_p2_bootstrap_postgres import engine,f,TENANT,ACTOR
from tests.test_setup_v1_postgres import submit,state
from tests.test_setup_v1 import request_data

pytestmark=pytest.mark.postgres_integration
FOREIGN='00000000-0000-0000-0000-000000000099'


def pair(f):
    first=submit(f)
    second=submit(f,idempotency_key='historical-next',expected_setup_version=1)
    foreign_novel=str(uuid.uuid4())
    foreign=SetupService(f.service).start(SetupRequest.model_validate(request_data(foreign_novel)),tenant_id=TENANT,actor_id=FOREIGN)
    return first,second,foreign


def test_repository_and_service_same_tenant_historical_scope(f):
    first,second,foreign=pair(f);service=SetupService(f.service)
    before=state(f,'owner-service-before')
    for actor,novel,expected in [(ACTOR,f.src.novel_id,second),(FOREIGN,foreign.novel_id,foreign)]:
        assert service.readback(novel,tenant_id=TENANT,actor_id=actor)['snapshot_id']==expected.job_id
    for snapshot in [None,first.job_id,second.job_id,foreign.job_id]:
        with pytest.raises(KeyError):
            service.readback(f.src.novel_id,tenant_id=TENANT,actor_id=FOREIGN,snapshot_id=snapshot)
        with pytest.raises(KeyError):
            f.repo.get_setup_snapshot(f.src.novel_id,actor_id=FOREIGN,snapshot_id=snapshot)
    assert service.readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR,snapshot_id=first.job_id)['setup_version']==1
    with pytest.raises(KeyError):service.get_job(first.job_id,tenant_id=TENANT,actor_id=FOREIGN)
    with pytest.raises(SetupFailure,match='SETUP_IDENTITY_REQUIRED'):service.readback(f.src.novel_id,tenant_id=TENANT)
    with pytest.raises(SetupFailure,match='INVALID_SCOPE_HEADER'):service.readback(f.src.novel_id,tenant_id=TENANT,actor_id='malformed')
    with pytest.raises(PermissionError):service.readback(f.src.novel_id,tenant_id=str(uuid.uuid4()),actor_id=ACTOR)
    # Foreign actor cannot probe old keys or reserve a fresh version in this source chain.
    for key,version in [('operation',0),('forged-operation',2)]:
        with pytest.raises(KeyError):
            service.start(SetupRequest.model_validate(request_data(f.src.novel_id,idempotency_key=key,expected_setup_version=version)),tenant_id=TENANT,actor_id=FOREIGN)
    with pytest.raises(KeyError):
        service.start(SetupRequest.model_validate(request_data(f.src.novel_id,idempotency_key='foreign-blueprint',expected_setup_version=2,mode='blueprint')),tenant_id=TENANT,actor_id=FOREIGN)
    assert state(f,'owner-service-after')==before
    assert f.llm.calls==0


def test_internal_http_setup_and_job_identity_matrix(f,caplog):
    first,second,foreign=pair(f)
    # Writing dependency stays a harmless miss; all actual setup storage is PostgreSQL.
    def missing(_):raise KeyError('missing')
    f.client.app.state.writing_service=SimpleNamespace(_repository=SimpleNamespace(get_writing_job=missing))
    owner={**f.headers,'X-Author-Id':ACTOR,'X-User-Id':ACTOR,'X-Actor-Id':ACTOR}
    paths=[f'/v1/story-brains/{f.src.novel_id}/setup',
           f'/v1/story-brains/{f.src.novel_id}/setup?snapshot_id={first.job_id}',
           f'/v1/jobs/{first.job_id}',f'/v1/jobs/{first.job_id}/events',f'/v1/jobs/{first.job_id}/resume']
    cases=[('foreign',{**owner,'X-Author-Id':FOREIGN,'X-User-Id':FOREIGN,'X-Actor-Id':FOREIGN},404),
        ('missing-author',{k:v for k,v in owner.items() if k not in ('X-Author-Id','X-User-Id','X-Actor-Id')},401),
        ('contradictory-user',{**owner,'X-User-Id':FOREIGN},403),
        ('contradictory-actor',{**owner,'X-Actor-Id':FOREIGN},403),
        ('cross-tenant',{**owner,'X-Tenant-Id':str(uuid.uuid4())},403),
        ('malformed-author',{**owner,'X-Author-Id':'not-a-uuid'},422),
        ('forged-admin',{**owner,'X-Author-Id':FOREIGN,'X-User-Id':FOREIGN,'X-Actor-Id':FOREIGN,'X-Role':'ADMIN'},404),
        ('forged-service',{**owner,'X-Service-Token':'browser-token'},403),
        ('missing-service',{k:v for k,v in owner.items() if k!='X-Service-Token'},401)]
    before=state(f,'owner-http-before')
    for path in paths:
        for name,headers,status in cases:
            response=f.client.post(path,headers=headers) if path.endswith('/resume') else f.client.get(path,headers=headers)
            assert response.status_code==status,(path,name,response.status_code)
            assert all(marker not in response.text for marker in ['PrivateOnly','ConstraintOnly','ExplicitSourceSecret'])
            print('SETUP_SCOPE_HTTP '+json.dumps(dict(path=path,case=name,status=status)))
    # A wrong valid author gets the same body for an existing and missing snapshot/job.
    foreign_headers=cases[0][1]
    for prefix in [f'/v1/story-brains/{f.src.novel_id}/setup?snapshot_id=', '/v1/jobs/']:
        assert f.client.get(prefix+first.job_id,headers=foreign_headers).json()==f.client.get(prefix+str(uuid.uuid4()),headers=foreign_headers).json()
    for path in paths:
        response=f.client.post(path,headers=owner) if path.endswith('/resume') else f.client.get(path,headers=owner)
        assert response.status_code==(202 if path.endswith('/resume') else 200)
        assert 'PrivateOnly' not in response.text and 'ConstraintOnly' not in response.text
        assert 'reservation_token' not in response.text and 'original_model_output' not in response.text
    for path in [f'/v1/story-brains/not-a-uuid/setup',f'/v1/story-brains/{f.src.novel_id}/setup?snapshot_id=invalid']:
        assert f.client.get(path,headers=owner).status_code==422
    assert state(f,'owner-http-after')==before
    assert f.llm.calls==0
    assert 'PrivateOnly' not in caplog.text and 'ConstraintOnly' not in caplog.text


def test_setup_auth_cannot_use_development_service_auth_bypass(f):
    job=submit(f);f.client.app.state.settings.service_auth_disabled=True
    headers={'X-Tenant-Id':TENANT,'X-Author-Id':ACTOR,'X-Request-Id':'scope-test'}
    for path in [f'/v1/story-brains/{f.src.novel_id}/setup']:
        assert f.client.get(path,headers=headers).status_code==401
    before=state(f,'dev-auth-before')
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=headers,json=request_data(f.src.novel_id,idempotency_key='forged-dev',expected_setup_version=1))
    assert response.status_code==401
    assert state(f,'dev-auth-after')==before
    assert f.llm.calls==0


def test_setup_cards_have_no_legacy_read_side_channel(f):
    submit(f)
    headers={**f.headers,'X-Author-Id':FOREIGN}
    for path in [f'/v1/story-brains/{f.src.novel_id}/review-queue',f'/v1/story-brains/{f.src.novel_id}/proposals']:
        response=f.client.get(path,headers=headers)
        assert response.status_code==200 and response.json()['data']==[]
    assert f.llm.calls==0


def test_validation_errors_do_not_echo_private_input_or_protected_sources(f,caplog):
    headers={**f.headers,'X-Author-Id':ACTOR}
    before=state(f,'private-error-before')
    data=request_data(f.src.novel_id);data['idea']='ambiguous';data['status']='accepted'
    response=f.client.post('/v1/story-brains/bootstrap/from-idea',headers=headers,json=data)
    assert response.status_code==422
    assert response.json()=={'detail':{'code':'INVALID_SETUP_REQUEST'}}
    for private in ['PrivateOnly','ConstraintOnly','private_author_notes','author_constraints']:
        assert private not in response.text and private not in caplog.text
    assert state(f,'private-error-after')==before and f.llm.calls==0
