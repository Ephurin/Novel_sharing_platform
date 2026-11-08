"""M0 real PG CAS/atomic activation; no fabricated chapters or history."""
import json,uuid
from dataclasses import replace
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import text
from api.setup_schemas import SetupActivationRequest
from application.setup_service import SetupService
from domain.errors import BootstrapConflictError
from tests.test_p2_bootstrap_postgres import engine,f,TENANT,ACTOR,snapshot
from tests.test_setup_v1_postgres import submit
from tests.test_setup_review_postgres import envelope,review,no_history
from tests.test_plan_edit_postgres import body as plan_body,command,life
from tests.test_setup_v1 import request_data

pytestmark=pytest.mark.postgres_integration


@pytest.fixture
def owned(f):
    with f.engine.begin() as c:
        c.execute(text("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES (:a,:email,:name,'offline','AUTHOR','ACTIVE') ON CONFLICT(user_id) DO NOTHING"),dict(a=ACTOR,email=ACTOR+'@example.test',name='m0-'+ACTOR))
        c.execute(text("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES (:n,:a,'M0 isolated',:slug,'offline')"),dict(n=f.src.novel_id,a=ACTOR,slug='m0-'+f.src.novel_id))
    return f


def ready(f):
    job=submit(f)
    decided=review(f,job,envelope(f,job))
    body=dict(contract_version='setup-m0-v1',idempotency_key=str(uuid.uuid4()),setup_hash=job.result['setup_hash'],expected_setup_version=decided['setup_version'],expected_review_version=decided['review_version'],expected_brain_version=decided['brain_version'])
    return job,body


def activate(f,job,body):
    return SetupService(f.service).activate(f.src.novel_id,job.job_id,SetupActivationRequest.model_validate(body),tenant_id=TENANT,actor_id=ACTOR)


def state(f,stage):
    data=snapshot(f,stage)
    with f.engine.connect() as c:
        for table in ('chapters','chapter_revisions','revision_outbox_events'):
            data[table]=[dict(r) for r in c.execute(text(f'SELECT * FROM {table} WHERE novel_id=:n ORDER BY 1'),dict(n=f.src.novel_id)).mappings()]
    return json.loads(json.dumps(data,default=str))


@pytest.mark.parametrize('chapters',[0,5,20])
def test_verified_m0_optional_plan_and_exact_replay(owned,chapters):
    f=owned;job,body=ready(f)
    if chapters:
        p=command(f,plan_body(chapters));command(f,life(p,'activate'))
    before=state(f,'m0-before-'+str(chapters))
    result=activate(f,job,body)
    assert result['baseline_revision_id'] is None and result['baseline_kind']=='M0'
    after=state(f,'m0-committed-'+str(chapters))
    assert after['story_brains'][0]['status']=='active' and after['story_brains'][0]['baseline_revision_id'] is None
    assert after['bootstrap_jobs'][0]['status']=='completed'
    no_history(after)
    assert not after['chapter_revisions'] and not after['revision_outbox_events'] and not after['chapters']
    for key in before:
        if key not in ('story_brains','bootstrap_jobs'):assert before[key]==after[key],key
    assert activate(f,job,body)==result
    assert state(f,'m0-replay-'+str(chapters))==after
    for change in ({'idempotency_key':str(uuid.uuid4())},{'expected_brain_version':999}):
        with pytest.raises(BootstrapConflictError):activate(f,job,{**body,**change})
    assert state(f,'m0-rejections-'+str(chapters))==after
    assert f.llm.calls==0


@pytest.mark.parametrize('kind',['unreviewed','all-rejected','stale-setup','stale-review','stale-brain','hash','artifact-deleted','decision-deleted','proposal-pending','wrong-snapshot','active-null','active-p1','failed-job','entity-type','rule-subject'])
def test_m0_denials_have_no_mutation(owned,kind):
    f=owned
    if kind in ('unreviewed','all-rejected'):
        job=submit(f);review_body=envelope(f,job)
        if kind=='all-rejected':
            # Build terminal rejection without identity/edit payloads.
            review_body=envelope(f,job)
            review_body['decisions']=[dict(proposal_id=d['proposal_id'],decision='reject') for d in review_body['decisions']]
            reviewed=review(f,job,review_body)
        else:reviewed=dict(setup_version=1,review_version=1,brain_version=1)
        body=dict(contract_version='setup-m0-v1',idempotency_key=str(uuid.uuid4()),setup_hash=job.result['setup_hash'],expected_setup_version=reviewed['setup_version'],expected_review_version=reviewed['review_version'],expected_brain_version=reviewed['brain_version'])
    else:job,body=ready(f)
    if kind.startswith('stale-'):body['expected_'+kind.split('-')[1]+'_version']+=1
    if kind=='hash':body['setup_hash']='0'*64
    with f.engine.begin() as c:
        if kind=='artifact-deleted':c.execute(text('DELETE FROM narrative.facts WHERE novel_id=:n'),dict(n=f.src.novel_id))
        if kind=='decision-deleted':c.execute(text('DELETE FROM narrative.proposal_decisions WHERE proposal_id IN (SELECT id FROM narrative.proposals WHERE novel_id=:n)'),dict(n=f.src.novel_id))
        if kind=='proposal-pending':c.execute(text("UPDATE narrative.proposals SET status='pending' WHERE novel_id=:n"),dict(n=f.src.novel_id))
        if kind=='failed-job':c.execute(text("UPDATE narrative.bootstrap_jobs SET status='failed' WHERE id=:id"),dict(id=job.job_id))
        if kind=='entity-type':c.execute(text("UPDATE narrative.entities SET entity_type='ORG' WHERE novel_id=:n"),dict(n=f.src.novel_id))
        if kind=='rule-subject':c.execute(text('UPDATE narrative.facts SET subject_entity_id=(SELECT id FROM narrative.entities WHERE novel_id=:n LIMIT 1) WHERE novel_id=:n'),dict(n=f.src.novel_id))
        if kind in ('active-null','active-p1'):c.execute(text("UPDATE narrative.story_brains SET status='active',baseline_revision_id=:r WHERE novel_id=:n"),dict(n=f.src.novel_id,r=str(uuid.uuid4()) if kind=='active-p1' else None))
    before=state(f,'m0-denied-before-'+kind)
    if kind=='wrong-snapshot':job=replace(job,job_id=str(uuid.uuid4()))
    with pytest.raises((BootstrapConflictError,KeyError)):activate(f,job,body)
    assert state(f,'m0-denied-after-'+kind)==before
    assert f.llm.calls==0


def test_m0_concurrent_activation_has_one_receipt(owned):
    f=owned;job,body=ready(f)
    def attempt(key):
        try:return activate(f,job,{**body,'idempotency_key':key})
        except BootstrapConflictError as error:return error.code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,['one','two']))
    assert sum(isinstance(x,dict) for x in results)==1
    assert 'M0_IDEMPOTENCY_CONFLICT' in results
    after=state(f,'m0-concurrent')
    assert after['story_brains'][0]['brain_version']==3
    no_history(after)


def test_m0_http_authority_readiness_and_privacy(owned):
    f=owned;job,body=ready(f)
    path=f'/v1/story-brains/{f.src.novel_id}/setup/{job.job_id}/activate'
    headers={**f.headers,'X-Author-Id':ACTOR}
    before=state(f,'m0-http-before')
    readiness=f.client.get(path,headers=headers)
    assert readiness.status_code==200 and readiness.json()['data']['eligible']
    assert state(f,'m0-readiness-readonly')==before
    for changed,status in [({'X-Service-Token':'forged'},403),({'X-Author-Id':str(uuid.uuid4()),'X-Role':'ADMIN'},404),({'X-Tenant-Id':str(uuid.uuid4())},403)]:
        response=f.client.post(path,json=body,headers={**headers,**changed})
        assert response.status_code==status,response.text
        assert 'PrivateOnly' not in response.text
    assert state(f,'m0-http-denials')==before
    response=f.client.post(path,json=body,headers=headers)
    assert response.status_code==200,response.text
    assert 'PrivateOnly' not in response.text and 'OutlineOnly' not in response.text


@pytest.mark.parametrize('kind',['empty','initial-only','supported-with-unresolved'])
def test_initial_conditions_never_stand_in_for_supported_setup(owned,kind):
    f=owned;data=request_data(f.src.novel_id)['setup']
    data['initial_conditions']=[dict(declaration_id='condition',subject_declaration_id='one',attribute_key='rank',value=3)]
    if kind in ('empty','initial-only'):
        data['declarations']=data['declarations'][:1] if kind=='initial-only' else []
        data['world_rules']=[]
        if kind=='empty':data['initial_conditions']=[]
    job=submit(f,setup=data)
    if kind=='initial-only':
        rejected=envelope(f,job)
        rejected['decisions']=[dict(proposal_id=d['proposal_id'],decision='reject') for d in rejected['decisions']]
        review(f,job,rejected)
    if kind=='supported-with-unresolved':
        result=review(f,job,envelope(f,job))
        assert result['status']=='reviewed_with_unresolved'
        body=dict(contract_version='setup-m0-v1',idempotency_key='activate',setup_hash=job.result['setup_hash'],expected_setup_version=1,expected_review_version=1,expected_brain_version=2)
        receipt=activate(f,job,body)
        assert len(receipt['unresolved_proposal_ids'])==1
        after=state(f,'m0-unresolved-nonblocking');no_history(after)
        assert len(after['facts'])==1 and after['facts'][0]['fact_type']=='world_rule'
    else:
        body=dict(contract_version='setup-m0-v1',idempotency_key='activate',setup_hash=job.result['setup_hash'],expected_setup_version=1,expected_review_version=1,expected_brain_version=2 if kind=='initial-only' else 1)
        before=state(f,'m0-unsupported-before-'+kind)
        with pytest.raises(BootstrapConflictError):activate(f,job,body)
        assert state(f,'m0-unsupported-after-'+kind)==before


def test_activation_failure_rolls_back_marker_brain_and_job(owned):
    f=owned;job,body=ready(f)
    with f.engine.begin() as c:
        c.execute(text("CREATE FUNCTION public.m0_activation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'isolated M0 activation failure'; END IF; RETURN NEW; END $$"))
        c.execute(text('CREATE TRIGGER m0_activation_fail BEFORE UPDATE ON narrative.story_brains FOR EACH ROW EXECUTE FUNCTION public.m0_activation_fail()'))
    before=state(f,'m0-rollback-before')
    try:
        with pytest.raises(Exception,match='isolated M0 activation failure'):activate(f,job,body)
        assert state(f,'m0-rollback-after')==before
    finally:
        with f.engine.begin() as c:
            c.execute(text('DROP TRIGGER m0_activation_fail ON narrative.story_brains'));c.execute(text('DROP FUNCTION public.m0_activation_fail()'))
    assert activate(f,job,body)['status']=='active'


def test_newer_source_competes_with_activation_under_shared_lock(owned):
    f=owned;job,body=ready(f)
    def attempt(action):
        try:
            return activate(f,job,body) if action=='activate' else submit(f,idempotency_key='new-source',expected_setup_version=1)
        except BootstrapConflictError as error:return error.code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,['activate','bootstrap']))
    after=state(f,'m0-bootstrap-race')
    if after['story_brains'][0]['status']=='active':
        assert isinstance(results[0],dict) and results[1]=='ALREADY_ACTIVE'
    else:
        assert results[0] in ('M0_STALE_SETUP','M0_BOOTSTRAP_IN_PROGRESS')
        assert not any(j['result'].get('setup_activation') for j in after['bootstrap_jobs'])
    no_history(after)


def test_current_owner_change_does_not_adopt_old_setup(owned):
    f=owned;job,body=ready(f);other=str(uuid.uuid4())
    with f.engine.begin() as c:
        c.execute(text("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES (:a,:email,:name,'offline','AUTHOR','ACTIVE')"),dict(a=other,email=other+'@example.test',name='m0-'+other))
        c.execute(text('UPDATE novels SET author_id=:a WHERE novel_id=:n'),dict(a=other,n=f.src.novel_id))
    before=state(f,'m0-transfer-before')
    with pytest.raises(KeyError):activate(f,job,body)
    path=f'/v1/story-brains/{f.src.novel_id}/setup/{job.job_id}/activate'
    for actor in (ACTOR,other):
        response=f.client.post(path,json=body,headers={**f.headers,'X-Author-Id':actor})
        assert response.status_code==404 and 'PrivateOnly' not in response.text
    assert state(f,'m0-transfer-after')==before
