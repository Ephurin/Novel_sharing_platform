"""PR98 F-01/F-02/F-03: real SQL identities, tombstones and legacy coexistence."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import uuid
import pytest
from sqlalchemy import text
from domain.errors import BootstrapConflictError
from tests.test_p2_bootstrap_postgres import engine,f,TENANT,ACTOR,snapshot
from tests.test_plan_edit_postgres import cleanup_plan_fixtures,body,changed,life,command,canonical

pytestmark=pytest.mark.postgres_integration
FOREIGN='00000000-0000-0000-0000-000000000099'


def read(f,plan=None,actor=ACTOR):return f.repo.read_plans(f.src.novel_id,actor,plan)


@pytest.mark.parametrize('kind',['draft','active','historical'])
def test_archival_effective_readback_restore_and_replay(f,kind):
    source=command(f,body(3));head=source
    if kind=='active':source=head=command(f,life(source,'activate'))
    if kind=='historical':
        head=command(f,changed(source));head=command(f,life(head,'activate'))
    delete=life(source,'delete');delete['expected_plan_version']=head['plan_version']
    before=snapshot(f,'fix-archive-source-before-'+kind)
    deleted=command(f,delete)
    projection=read(f,source['plan_id'])
    assert projection['effective_status']=='archived' and projection['snapshot_status']==source['status']
    assert not projection['can_save'] and not projection['can_activate'] and not projection['can_archive'] and projection['can_fork']
    assert read(f,deleted['plan_id'])['effective_status']=='tombstone'
    assert projection['objectives']==source['objectives'] and projection['source_outline']==source['source_outline']
    active=read(f)['active_plan_id']
    assert active==(head['plan_id'] if kind=='historical' else None)
    after=snapshot(f,'fix-archive-committed-'+kind)
    original=next(p for p in before['story_plans'] if p['id']==source['plan_id'])
    archived=next(p for p in after['story_plans'] if p['id']==source['plan_id'])
    for field in ['source_outline','source_outline_hash','input_hash','idempotency_key','created_by','edit_metadata']:
        assert archived[field]==original[field]
    assert canonical(after)==canonical(before)
    assert command(f,delete)==deleted
    with pytest.raises(BootstrapConflictError,match='PLAN_IDEMPOTENCY_CONFLICT'):
        command(f,{**delete,'expected_plan_version':deleted['plan_version']})
    for action in ['save','activate','delete']:
        invalid=changed(source) if action=='save' else life(source,action)
        invalid['expected_plan_version']=deleted['plan_version']
        with pytest.raises(BootstrapConflictError,match='PLAN_SOURCE_ARCHIVED'):command(f,invalid)
    assert snapshot(f,'fix-archive-rejections-'+kind)==after
    restore=changed(source);restore.update(action='fork',expected_plan_version=deleted['plan_version'])
    restored=command(f,restore)
    assert restored['plan_id']!=source['plan_id'] and restored['objectives']==source['objectives']
    assert read(f,restored['plan_id'])['can_save']
    assert read(f,source['plan_id'])['effective_status']=='archived'
    # Exact decided retry remains a receipt, never unarchives the original source.
    before_replay=snapshot(f,'fix-archive-restored-'+kind)
    assert command(f,delete)==deleted
    assert snapshot(f,'fix-archive-late-replay-'+kind)==before_replay
    assert f.llm.calls==0


def test_concurrent_activate_archive_has_one_winner(f):
    source=command(f,body(3))
    def attempt(action):
        try:return command(f,life(source,action))
        except BootstrapConflictError as error:return error.code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,['activate','delete']))
    assert sum(isinstance(r,dict) for r in results)==1
    assert 'PLAN_VERSION_CONFLICT' in results
    projected=read(f)
    assert len(projected['plans'])==2
    assert len([p for p in projected['plans'] if p['status']=='active'])<=1
    before=snapshot(f,'fix-archive-race-before-stale')
    with pytest.raises(BootstrapConflictError):command(f,life(source,'activate'))
    assert snapshot(f,'fix-archive-race-after-stale')==before


def test_future_events_keep_ids_participants_and_removed_ids_cannot_be_reused(f):
    initial=body(2)
    events=[dict(event_id=str(uuid.uuid4()),text='Event '+str(i),participants=[dict(name_hint='Minh '+str(i))]) for i in range(3)]
    initial['objectives'][0]['events']=events
    source=command(f,initial)
    events=deepcopy(source['objectives'][0]['events'])  # Pydantic canonical optional-null shape.
    request=changed(source)
    request['objectives'][0]['events']=[{**events[2],'text':'Edited third'},events[1]]
    request['objectives'].reverse()
    saved=command(f,request)
    assert saved['objectives'][1]['events']==request['objectives'][1]['events']
    assert read(f,saved['plan_id'])['objectives']==saved['objectives']
    before=snapshot(f,'fix-events-before-reuse')
    reuse=changed(saved);reuse['objectives'][1]['events'].append(events[0])
    with pytest.raises(BootstrapConflictError,match='FUTURE_EVENT_ID_REUSED'):command(f,reuse)
    assert snapshot(f,'fix-events-after-reuse')==before
    assert read(f,source['plan_id'])['objectives'][0]['events']==events
    assert canonical(before)==canonical(snapshot(f,'fix-events-canon-after'))


def seed_legacy(f,creator,status='draft'):
    plan=str(uuid.uuid4())
    with f.engine.begin() as c:
        c.execute(text("INSERT INTO narrative.story_plans (id,tenant_id,novel_id,plan_version,status,source_outline,source_outline_hash,input_hash,created_by,edit_metadata) VALUES (:id,:t,:n,1,:s,'LegacyOutlinePrivate','','',:actor,CAST(:metadata AS jsonb))"),dict(id=plan,t=TENANT,n=f.src.novel_id,s=status,actor=creator,metadata='{"private_notes":"LegacyPrivateOnly"}'))
        c.execute(text("INSERT INTO narrative.story_plan_objectives (id,plan_id,tenant_id,novel_id,order_index,target_chapter,objective_type,title,description,status,objective_metadata) VALUES (:id,:plan,:t,:n,1,1,'chapter_goal','LegacyTitlePrivate','LegacyDescriptionPrivate','pending',CAST(:metadata AS jsonb))"),dict(id=str(uuid.uuid4()),plan=plan,t=TENANT,n=f.src.novel_id,metadata='{"events":"LegacyPrivateOnly"}'))
    return plan


@pytest.mark.parametrize('creator',[None,FOREIGN,ACTOR])
def test_legacy_coexists_without_disclosing_or_adopting_rows(f,creator):
    legacy=seed_legacy(f,creator)
    before=snapshot(f,'fix-legacy-before-'+str(creator))
    empty=read(f)
    assert empty==dict(head_version=1,active_plan_id=None,active_plan_unavailable=False,plans=[])
    data=body(3,head=1);saved=command(f,data)
    assert saved['plan_version']==2 and read(f,saved['plan_id'])['plan_version']==2
    assert all(p['plan_id']!=legacy for p in read(f)['plans'])
    with pytest.raises(KeyError):read(f,legacy)
    invalid=life(saved,'activate');invalid['source_plan_id']=legacy
    with pytest.raises((KeyError,BootstrapConflictError)):command(f,invalid)
    after=snapshot(f,'fix-legacy-after-'+str(creator))
    assert next(p for p in after['story_plans'] if p['id']==legacy)==before['story_plans'][0]
    assert [o for o in after['story_plan_objectives'] if o['plan_id']==legacy]==before['story_plan_objectives']
    assert canonical(after)==canonical(before)
    assert all('LegacyPrivateOnly' not in str(p) and 'LegacyOutlinePrivate' not in str(p) for p in read(f)['plans'])
    with pytest.raises(KeyError):read(f,actor=FOREIGN if creator!=FOREIGN else str(uuid.uuid4()))


def test_hidden_legacy_active_requires_handoff_without_blocking_new_draft(f):
    legacy=seed_legacy(f,None,status='active')
    source=command(f,body(3,head=1))
    assert read(f)['active_plan_id'] is None and read(f)['active_plan_unavailable']
    before=snapshot(f,'fix-legacy-active-before')
    for action in ['activate','skip']:
        with pytest.raises(BootstrapConflictError,match='LEGACY_ACTIVE_PLAN_HANDOFF_REQUIRED'):command(f,life(source,action))
    assert snapshot(f,'fix-legacy-active-after')==before
    assert next(p for p in before['story_plans'] if p['id']==legacy)['status']=='active'


def test_foreign_p2_history_still_requires_explicit_author_handoff(f):
    source=command(f,body(3))
    # Trusted source-author assertion cannot acquire an already-owned P2 chain.
    before=snapshot(f,'fix-p2-transfer-before')
    with pytest.raises(KeyError):f.repo.read_plans(f.src.novel_id,FOREIGN)
    from api.plan_schemas import PlanEditCommand
    with pytest.raises(KeyError):f.repo.edit_plan(f.src.novel_id,FOREIGN,PlanEditCommand.model_validate(body(3,head=1)))
    assert snapshot(f,'fix-p2-transfer-after')==before


def test_legacy_coexistence_http_scope_and_archive_enforcement(f):
    legacy=seed_legacy(f,None)
    f.client.app.state.narrative_repository=f.repo
    path=f'/v1/story-plans/edit-v1/{f.src.novel_id}'
    owner={**f.headers,'X-Author-Id':ACTOR}
    response=f.client.get(path,headers=owner)
    assert response.status_code==200 and response.json()['data']['plans']==[]
    source=command(f,body(3,head=1))
    archived=command(f,life(source,'delete'))
    before=snapshot(f,'fix-http-before')
    for headers,status in [({**owner,'X-Author-Id':FOREIGN,'X-Role':'ADMIN'},404),({**owner,'X-Service-Token':'forged'},403),({**owner,'X-Tenant-Id':str(uuid.uuid4())},403)]:
        response=f.client.get(path,headers=headers)
        assert response.status_code==status
        assert 'LegacyPrivateOnly' not in response.text and 'LegacyOutlinePrivate' not in response.text
    denied=life(source,'activate');denied['expected_plan_version']=archived['plan_version']
    response=f.client.post(path,json=denied,headers=owner)
    assert response.status_code==409 and response.json()['detail']['code']=='PLAN_SOURCE_ARCHIVED'
    response=f.client.get(path+'/'+source['plan_id'],headers=owner)
    assert response.json()['data']['effective_status']=='archived'
    response=f.client.get(path+'/'+legacy,headers=owner)
    assert response.status_code==404
    assert snapshot(f,'fix-http-after')==before
