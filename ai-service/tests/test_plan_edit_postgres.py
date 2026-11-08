"""Real PostgreSQL P2-03 future-plan snapshots, scope, CAS and zero Canon writes."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import uuid,json,hashlib
import pytest
from sqlalchemy import text
from api.plan_schemas import PlanEditCommand
from tests.test_p2_bootstrap_postgres import engine,f,TENANT,ACTOR,snapshot
from domain.errors import BootstrapConflictError
pytestmark=pytest.mark.postgres_integration

def body(n=5,head=0,**changes):
    return dict(contract_version='plan-edit-v1',action='save',idempotency_key=str(uuid.uuid4()),expected_plan_version=head,
        source_outline='Dàn ý tương lai chương 8: phản bội',private_notes='PlanPrivateOnly',
        objectives=[dict(objective_id=str(uuid.uuid4()),expected_intent_version=0,target_chapter=i+1,title=f'Chương {i+1}',description='Future goal',events=[dict(event_id=str(uuid.uuid4()),text='Planned betrayal',participants=[dict(name_hint='Minh')])]) for i in range(n)],**changes)

def command(f,data):return f.repo.edit_plan(f.src.novel_id,ACTOR,PlanEditCommand.model_validate(data))
def changed(result,**kw):
    return dict(contract_version='plan-edit-v1',action='save',idempotency_key=str(uuid.uuid4()),expected_plan_version=result['plan_version'],source_plan_id=result['plan_id'],
        source_outline=result['source_outline'],objectives=[dict(**{k:v for k,v in o.items() if k!='intent_version'},expected_intent_version=o['intent_version']) for o in result['objectives']],**kw)
def life(result,action,**kw):return dict(contract_version='plan-edit-v1',action=action,idempotency_key=str(uuid.uuid4()),expected_plan_version=result['plan_version'],source_plan_id=result['plan_id'],**kw)
def canonical(state):return {k:v for k,v in state.items() if k not in ['story_plans','story_plan_objectives']}

def test_plan_sizes_versions_edit_reorder_fork_skip_and_history(f):
    before=snapshot(f,'plan-canon-before');head=0
    for n in [0,5,10,20,25]:
        result=command(f,body(n,head));head=result['plan_version'];assert len(result['objectives'])==n
    request=changed(result);request['objectives']=list(reversed(request['objectives']))
    request['objectives'][0]['title']='Đã sửa';removed=request['objectives'].pop(3)['objective_id']
    request['objectives'].append(body(1)['objectives'][0]);request['objectives'][-1]['target_chapter']=30
    edited=command(f,request)
    assert edited['objectives'][0]['objective_id']==result['objectives'][-1]['objective_id']
    assert edited['objectives'][0]['intent_version']==2
    assert removed not in {o['objective_id'] for o in edited['objectives']}
    original=f.repo.read_plans(f.src.novel_id,ACTOR,result['plan_id'])
    assert original['objectives']==result['objectives']
    active=command(f,life(edited,'activate'));assert active['status']=='active'
    fork=changed(result);fork.update(action='fork',expected_plan_version=active['plan_version'])
    restored=command(f,fork);assert restored['objectives']==result['objectives']
    active2=command(f,life(restored,'activate'))
    skipped=command(f,life(active2,'skip'))
    assert f.repo.read_plans(f.src.novel_id,ACTOR)['active_plan_id'] is None
    assert canonical(snapshot(f,'plan-canon-after'))==canonical(before)
    assert f.llm.calls==0

@pytest.mark.parametrize('kind',['stale','intent','foreign-source','participant','membership','changed-key'])
def test_plan_negative_atomic(f,kind):
    firstbody=body();first=command(f,firstbody);data=changed(first)
    if kind=='stale':data['expected_plan_version']=0
    elif kind=='intent':data['objectives'][0]['expected_intent_version']=0
    elif kind=='foreign-source':data['source_plan_id']=str(uuid.uuid4())
    elif kind=='participant':data['objectives'][0]['events'][0]['participants']=[dict(entity_id=str(uuid.uuid4()))]
    elif kind=='membership':data['objectives'][0]['objective_id']=data['objectives'][1]['objective_id']
    elif kind=='changed-key':data=deepcopy(firstbody);data['source_outline']='changed'
    before=snapshot(f,'plan-negative-before-'+kind)
    try:
        with pytest.raises((BootstrapConflictError,KeyError,ValueError)):command(f,data)
    finally:assert snapshot(f,'plan-negative-after-'+kind)==before


def test_plan_concurrent_edits_activation_and_exact_replay(f):
    data=body();first=command(f,data);before=snapshot(f,'plan-replay-before')
    assert command(f,data)==first and snapshot(f,'plan-replay-after')==before
    def attempt(data):
        try:return command(f,data)
        except BootstrapConflictError:return 'conflict'
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,[changed(first),changed(first)]))
    assert results.count('conflict')==1
    winner=next(x for x in results if x!='conflict')
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,[life(winner,'activate'),life(winner,'activate')]))
    assert results.count('conflict')==1
    winner=next(x for x in results if x!='conflict')
    plans=f.repo.read_plans(f.src.novel_id,ACTOR)['plans'];assert len([p for p in plans if p['status']=='active'])==1
    assert plans[-1]['plan_version']==winner['plan_version']
    snapshot(f,'plan-concurrent-final')


def test_plan_http_legacy_scope_private_validation_and_bypass(f):
    f.client.app.state.narrative_repository=f.repo
    owner={**f.headers,'X-Author-Id':ACTOR};path=f'/v1/story-plans/edit-v1/{f.src.novel_id}'
    assert f.client.get(path,headers=owner).json()['data']['head_version']==0
    data=body();r=f.client.post(path,json=data,headers=owner);assert r.status_code==200,r.text
    saved=r.json()['data'];assert 'PlanPrivateOnly' not in r.text
    before=snapshot(f,'plan-http-negative-before')
    for headers,code in [(f.headers,401),({**owner,'X-Author-Id':str(uuid.uuid4()),'X-Role':'ADMIN'},404),({**owner,'X-Tenant-Id':str(uuid.uuid4())},403),({**owner,'X-Service-Token':'forged'},403)]:
        for endpoint in [path,f"/v1/story-plans/{saved['plan_id']}",f"/v1/story-plans/by-novel/{f.src.novel_id}",f"/v1/story-plans/by-novel/{f.src.novel_id}/active"]:
            r=f.client.get(endpoint,headers=headers);assert r.status_code==code,(endpoint,r.status_code,r.text)
            assert 'PlanPrivateOnly' not in r.text
    invalid=deepcopy(data);invalid['objectives'][0]['canon_status']='PlanPrivateOnly'
    r=f.client.post(path,json=invalid,headers=owner);assert r.status_code==422 and 'PlanPrivateOnly' not in r.text
    for endpoint in [f"/v1/story-plans/{saved['plan_id']}/activate?novel_id={f.src.novel_id}"]:
        r=f.client.post(endpoint,headers=owner);assert r.status_code==409,r.text
    assert snapshot(f,'plan-http-negative-after')==before
    read=f.client.get(path,headers=owner);assert read.headers['cache-control']=='no-store'
    assert read.json()['data']['plans'][0]['private_notes']=='PlanPrivateOnly'
    legacy=f.client.get(f"/v1/story-plans/{saved['plan_id']}",headers=owner)
    assert legacy.status_code==200 and 'PlanPrivateOnly' not in legacy.text

def test_plan_context_chapter_scope_no_notes_or_history(f):
    data=body(10);first=command(f,data);active=command(f,life(first,'activate'))
    before=snapshot(f,'plan-context-before')
    context3=f.repo.get_structured_context(f.src.novel_id,chapter_number=3)
    context8=f.repo.get_structured_context(f.src.novel_id,chapter_number=8)
    assert context3.planning_context['authority_lane']=='FUTURE_PLAN'
    assert context3.current_objective['target_chapter']==3
    assert context8.current_objective['target_chapter']==8
    assert context8.current_objective['planned_events'][0]['text']=='Planned betrayal'
    assert 'PlanPrivateOnly' not in json.dumps(__import__('dataclasses').asdict(context8))
    assert not context8.recent_events
    command(f,life(active,'skip'))
    assert f.repo.get_structured_context(f.src.novel_id,chapter_number=8).planning_context is None
    assert canonical(snapshot(f,'plan-context-after'))==canonical(before)


def test_plan_index_rejects_second_active_and_keeps_source(f):
    from sqlalchemy.exc import IntegrityError
    first=command(f,body());active=command(f,life(first,'activate'))
    before=snapshot(f,'plan-index-before')
    with pytest.raises(IntegrityError):
        with f.engine.begin() as c:
            c.execute(text("INSERT INTO narrative.story_plans (id,tenant_id,novel_id,plan_version,status,source_outline_hash,input_hash) VALUES (:id,:t,:n,999,'active','','')"),dict(id=str(uuid.uuid4()),t=TENANT,n=f.src.novel_id))
    assert snapshot(f,'plan-index-after')==before


def test_plan_migration_up_down_isolated_database(engine,monkeypatch):
    import os
    from sqlalchemy import create_engine
    from alembic.config import Config
    from alembic import command as migrate
    name='p203_migration_'+uuid.uuid4().hex
    admin=create_engine(engine.url,isolation_level='AUTOCOMMIT')
    with admin.connect() as c:c.execute(text('CREATE DATABASE '+name))
    url=engine.url.set(database=name)
    cfg=Config('alembic.ini');cfg.set_main_option('sqlalchemy.url',url.render_as_string(hide_password=False))
    monkeypatch.setenv('DATABASE_URL',url.render_as_string(hide_password=False))
    proof=create_engine(url)
    try:
        migrate.upgrade(cfg,'0016_entity_profile_audit_timestamp')
        migrate.upgrade(cfg,'head')
        with proof.connect() as c:
            assert c.execute(text("SELECT indexdef FROM pg_indexes WHERE schemaname='narrative' AND indexname='uq_story_plan_active'")).scalar()
        migrate.downgrade(cfg,'0016_entity_profile_audit_timestamp')
        with proof.connect() as c:assert not c.execute(text("SELECT 1 FROM information_schema.columns WHERE table_schema='narrative' AND table_name='story_plans' AND column_name='edit_metadata'")).scalar()
        migrate.upgrade(cfg,'head')
        print('PLAN_MIGRATION_PROOF '+json.dumps(dict(database=name,upgrade=True,downgrade=True,reupgrade=True)))
    finally:
        proof.dispose()
        with admin.connect() as c:c.execute(text('DROP DATABASE '+name+' WITH (FORCE)'))
        admin.dispose()
