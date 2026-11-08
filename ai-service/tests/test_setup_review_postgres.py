"""P2-02B real PostgreSQL transaction/CAS and durable readback acceptance."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json, uuid
import pytest
from sqlalchemy import text
from api.setup_schemas import SetupReviewRequest
from application.setup_service import SetupService
from domain.errors import BootstrapConflictError
from tests.test_p2_bootstrap_postgres import engine, f, TENANT, ACTOR, snapshot
from tests.test_setup_v1_postgres import submit

pytestmark = pytest.mark.postgres_integration


def envelope(f, job, **changes):
    data = SetupService(f.service).readback(f.src.novel_id, tenant_id=TENANT, actor_id=ACTOR, snapshot_id=job.job_id)
    decisions = [dict(proposal_id=c['proposal_id'], decision='accept',
        **({'identity':{'kind':'new'}} if c['card_type']=='entity' else {}))
        for c in data['proposals'] if c['card_type'] != 'initial_condition']
    return dict(idempotency_key='review-1', dependency_group_id=decisions and data['proposals'][0]['dependency_group_id'],
        setup_hash=data['setup_hash'], expected_setup_version=data['setup_version'],
        expected_review_version=data['review_version'], expected_brain_version=data['brain_version'], decisions=decisions, **changes)


def review(f, job, body, actor=ACTOR):
    return SetupService(f.service).review(f.src.novel_id, job.job_id, SetupReviewRequest.model_validate(body),
                                        tenant_id=TENANT, actor_id=actor)


def no_history(state):
    for table in ['events','state_transitions','entity_mentions','revision_provenances','current_entity_states']:
        assert not state[table], table


def test_review_homonyms_edits_rules_replay_and_audit(f):
    job=submit(f); body=envelope(f,job)
    raw=snapshot(f,'review-raw-before')
    body['decisions'][0]['edited_entity']={'canonical_name':'Minh edited','aliases':['Alias']}
    rule=body['decisions'][-1]
    rule['edited_rule']={'fact_key':'gravity','fact_value':'Gravity is bounded'}
    result=review(f,job,body)
    assert result['status']=='review_complete' and not result['activation_available']
    after=snapshot(f,'review-committed')
    no_history(after)
    assert len(after['entities'])==2 and len(after['facts'])==1 and len(after['decisions'])==3
    assert len({e['id'] for e in after['entities']})==2
    assert {e['source_type'] for e in after['entities']}=={'author_setup'}
    assert all(e['static_attributes']['mentions']==0 for e in after['entities'])
    assert after['facts'][0]['chapter_number'] is None and after['facts'][0]['source_revision_id'] is None
    assert after['facts'][0]['source_type']=='author_setup' and after['facts'][0]['fact_key']=='gravity'
    for field in ['setup_source','original_model_output','setup_cards','setup_hash','provisional_scope']:
        assert after['bootstrap_jobs'][0]['result'][field]==raw['bootstrap_jobs'][0]['result'][field]
    assert [p['payload'] for p in after['proposals']]==[p['payload'] for p in raw['proposals']]
    assert all(d['actor_id']==ACTOR and d['edited_payload']['provenance']['setup_hash']==job.result['setup_hash'] for d in after['decisions'])
    assert review(f,job,body)==result
    assert snapshot(f,'review-exact-replay')==after
    changed=deepcopy(body);changed['decisions'][0]['reason']='different'
    with pytest.raises(BootstrapConflictError):review(f,job,changed)
    assert snapshot(f,'review-conflict-unchanged')==after
    data=SetupService(f.service).readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR)
    assert all(c['status']=='accepted' for c in data['proposals'])
    assert data['proposals'][0]['reviewed_payload']['canonical_name']=='Minh edited'
    assert 'PrivateOnly' not in json.dumps(result) and 'ConstraintOnly' not in json.dumps(data)


@pytest.mark.parametrize('kind',['missing','wrong-group','wrong-hash','stale-setup','stale-review','stale-brain','foreign-proposal','forged-id','unapproved','invalid-edit','rule-collision','rule-subject','normalized-overflow'])
def test_atomic_negative_matrix(f,kind):
    job=submit(f);body=envelope(f,job)
    if kind=='missing':body['decisions'].pop()
    elif kind=='wrong-group':body['dependency_group_id']=str(uuid.uuid4())
    elif kind=='wrong-hash':body['setup_hash']='0'*64
    elif kind=='stale-setup':body['expected_setup_version']+=1
    elif kind=='stale-review':body['expected_review_version']+=1
    elif kind=='stale-brain':body['expected_brain_version']+=1
    elif kind=='foreign-proposal':body['decisions'][0]['proposal_id']=str(uuid.uuid4())
    elif kind=='forged-id':body['decisions'][0]['identity']={'kind':'existing','approved_entity_id':str(uuid.uuid4())}
    elif kind=='unapproved':
        with f.engine.begin() as c:
            c.execute(text("INSERT INTO narrative.entities (id,story_brain_id,tenant_id,novel_id,entity_type,canonical_name,normalized_name,source_type,confirmation_status,is_locked) SELECT :id,id,tenant_id,novel_id,'character','Unapproved','unapproved','AI','proposed',false FROM narrative.story_brains WHERE novel_id=:novel"),{'id':str(uuid.uuid4()),'novel':f.src.novel_id})
            identity=c.execute(text('SELECT id FROM narrative.entities WHERE novel_id=:novel'),{'novel':f.src.novel_id}).scalar()
        body['decisions'][0]['identity']={'kind':'existing','approved_entity_id':str(identity)}
    elif kind=='invalid-edit':body['decisions'][0]['edited_rule']={'fact_key':'illegal','fact_value':'type mismatch'}
    elif kind=='normalized-overflow':body['decisions'][0]['edited_entity']={'canonical_name':'ß'*255,'aliases':[]}
    elif kind=='rule-subject':body['decisions'][-1]['edited_rule']={'fact_key':'rule','fact_value':'value','subject_entity_id':str(uuid.uuid4())}
    elif kind=='rule-collision':
        key=job.result['setup_cards'][-1]['payload']['fact_key']
        with f.engine.begin() as c:c.execute(text("INSERT INTO narrative.facts (id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,confirmation_status,is_locked,priority) SELECT :id,id,tenant_id,novel_id,'world_rule',:key,'\"locked\"'::jsonb,'author','confirmed',true,0 FROM narrative.story_brains WHERE novel_id=:novel"),{'id':str(uuid.uuid4()),'key':key,'novel':f.src.novel_id})
    before=snapshot(f,'review-negative-before-'+kind)
    with pytest.raises(BootstrapConflictError):review(f,job,body)
    assert snapshot(f,'review-negative-after-'+kind)==before
    assert f.llm.calls==0


def test_review_concurrency_one_winner(f):
    job=submit(f);body=envelope(f,job)
    def attempt(key):
        data=deepcopy(body);data['idempotency_key']=key
        try:return review(f,job,data)['status']
        except BootstrapConflictError:return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,['one','two']))
    assert sorted(results)==['conflict','review_complete']
    data=snapshot(f,'review-concurrent-final')
    assert len(data['decisions'])==3 and len(data['entities'])==2 and len(data['facts'])==1
    assert {e['canonical_name'] for e in data['entities']}=={'Minh'}
    no_history(data)


def test_mixed_reject_and_pending_initial_conditions(f):
    source=__import__('tests.test_setup_v1',fromlist=['request_data']).request_data(f.src.novel_id)['setup']
    source['initial_conditions']=[dict(declaration_id='health',subject_declaration_id=source['declarations'][0]['declaration_id'],attribute_key='health',value=90)]
    job=submit(f,setup=source);body=envelope(f,job)
    body['decisions'][1]={'proposal_id':body['decisions'][1]['proposal_id'],'decision':'reject','reason':'Not this character'}
    result=review(f,job,body)
    assert result['status']=='reviewed_with_unresolved' and len(result['unresolved_proposal_ids'])==1
    data=snapshot(f,'review-mixed-final');no_history(data)
    assert len(data['entities'])==1 and len(data['facts'])==1
    read=SetupService(f.service).readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR)
    assert read['proposals'][-1]['status']=='pending' and read['proposals'][-1]['unresolved']
    with pytest.raises(BootstrapConflictError,match='SETUP_ACTIVATION_NOT_AVAILABLE'):f.service.activate_baseline(f.src.novel_id,job.job_id)


def test_all_rejected_and_empty_never_activate(f):
    job=submit(f);body=envelope(f,job)
    body['decisions']=[dict(proposal_id=d['proposal_id'],decision='reject') for d in body['decisions']]
    assert review(f,job,body)['status']=='review_complete'
    data=snapshot(f,'review-all-rejected');no_history(data)
    assert not data['entities'] and not data['facts']
    with pytest.raises(BootstrapConflictError,match='SETUP_ACTIVATION_NOT_AVAILABLE'):f.service.activate_baseline(f.src.novel_id,job.job_id)


def test_http_scope_redaction_and_legacy_bypass(f):
    job=submit(f);body=envelope(f,job);path=f'/v1/story-brains/{f.src.novel_id}/setup/{job.job_id}/review'
    owner={**f.headers,'X-Author-Id':ACTOR}
    before=snapshot(f,'review-http-negative-before')
    for headers,status in [({**owner,'X-Author-Id':str(uuid.uuid4())},404),({**owner,'X-Tenant-Id':str(uuid.uuid4())},403),({**owner,'X-Actor-Id':str(uuid.uuid4())},403),({**owner,'X-Service-Token':'forged'},403),(f.headers,401)]:
        r=f.client.post(path,json=body,headers=headers);assert r.status_code==status,r.text
        assert 'PrivateOnly' not in r.text
    invalid=deepcopy(body);invalid['decisions'][0]['edited_entity']={'private_author_notes':'PrivateOnly'}
    r=f.client.post(path,json=invalid,headers=owner)
    assert r.status_code==422 and 'PrivateOnly' not in r.text
    assert snapshot(f,'review-http-negative-after')==before
    r=f.client.post(path,json=body,headers=owner)
    assert r.status_code==200,r.text
    assert r.headers['cache-control']=='no-store'

def test_existing_identity_explicit_only_and_foreign_rejected(f):
    first=submit(f);review(f,first,envelope(f,first))
    approved=SetupService(f.service).readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR)['approved_identities']
    second=submit(f,idempotency_key='v2',expected_setup_version=1)
    body=envelope(f,second)
    target=next(e for e in approved if e['entity_type']=='character')
    body['decisions'][0]['identity']={'kind':'existing','approved_entity_id':target['entity_id']}
    body['decisions'][1:]=[dict(proposal_id=d['proposal_id'],decision='reject') for d in body['decisions'][1:]]
    result=review(f,second,body)
    assert result['canonical_artifact_ids']==[target['entity_id']]
    durable=snapshot(f,'review-existing-reuse')
    assert len(durable['entities'])==2 and len(durable['facts'])==1
    no_history(durable)
    third=submit(f,idempotency_key='v3',expected_setup_version=2)
    body=envelope(f,third)
    foreign=str(uuid.uuid4())
    with f.engine.begin() as c:
        c.execute(text("INSERT INTO narrative.entities (id,story_brain_id,tenant_id,novel_id,entity_type,canonical_name,normalized_name,source_type,confirmation_status,is_locked) SELECT :id,id,tenant_id,:foreign_novel,'character','Minh','minh','author_setup','confirmed',false FROM narrative.story_brains WHERE novel_id=:novel"),{'id':foreign,'foreign_novel':str(uuid.uuid4()),'novel':f.src.novel_id})
    body['decisions'][0]['identity']={'kind':'existing','approved_entity_id':foreign}
    before=snapshot(f,'review-foreign-id-before')
    with pytest.raises(BootstrapConflictError):review(f,third,body)
    assert snapshot(f,'review-foreign-id-after')==before


def test_newer_snapshot_invalidates_old_review(f):
    old=submit(f);body=envelope(f,old)
    submit(f,idempotency_key='newer',expected_setup_version=1)
    before=snapshot(f,'review-superseded-before')
    with pytest.raises(BootstrapConflictError):review(f,old,body)
    assert snapshot(f,'review-superseded-after')==before

def test_character_location_blueprint_sources_and_subject_rules(f):
    from tests.test_setup_v1 import request_data
    source=request_data(f.src.novel_id)['setup']
    source['declarations'][1]['entity_type']='location'
    job=submit(f,setup=source)
    body=envelope(f,job)
    reserved=job.result['setup_cards'][0]['payload']['entity_id']
    body['decisions'][-1]['edited_rule']={'fact_key':'flight_rule','fact_value':'Cannot fly','subject_entity_id':reserved}
    review(f,job,body)
    durable=snapshot(f,'review-location-subject')
    assert {e['entity_type'] for e in durable['entities']}=={'character','location'}
    assert durable['facts'][0]['subject_entity_id']==reserved
    no_history(durable)


def test_blueprint_acceptance_preserves_model_origin(f):
    from types import SimpleNamespace
    f.service._llm_service=SimpleNamespace(suggest_setup_blueprint=lambda **kw:dict(entities=[dict(entity_type='location',display_name='Suggested City')],world_rules=['Suggested Rule']))
    source=dict(text='',declarations=[],world_rules=[],initial_conditions=[])
    job=submit(f,mode='blueprint',setup=source)
    body=envelope(f,job);review(f,job,body)
    durable=snapshot(f,'review-blueprint-origin')
    assert durable['entities'][0]['source_type']=='model_suggestion'
    assert durable['entities'][0]['static_attributes']['mentions']==0
    assert durable['facts'][0]['source_type']=='model_suggestion'
    assert durable['bootstrap_jobs'][0]['result']['original_model_output']==job.result['original_model_output']
    no_history(durable)


def test_empty_source_no_review_or_activation_consent(f):
    job=submit(f,setup=dict(text='',declarations=[],world_rules=[],initial_conditions=[]))
    before=snapshot(f,'review-empty-before')
    headers={**f.headers,'X-Author-Id':ACTOR}
    r=f.client.post(f'/v1/story-brains/{f.src.novel_id}/setup/{job.job_id}/review',json={
        'idempotency_key':'empty','dependency_group_id':str(uuid.uuid4()),'setup_hash':job.result['setup_hash'],
        'expected_setup_version':1,'expected_review_version':0,'expected_brain_version':1,'decisions':[]},headers=headers)
    assert r.status_code==422
    with pytest.raises(BootstrapConflictError,match='SETUP_ACTIVATION_NOT_AVAILABLE'):f.service.activate_baseline(f.src.novel_id,job.job_id)
    assert snapshot(f,'review-empty-after')==before

def test_reused_identity_and_edit_type_collisions_rollback(f):
    first=submit(f);review(f,first,envelope(f,first))
    target=SetupService(f.service).readback(f.src.novel_id,tenant_id=TENANT,actor_id=ACTOR)['approved_identities'][0]['entity_id']
    with f.engine.begin() as c:c.execute(text('UPDATE narrative.entities SET is_locked=true WHERE id=:id'),{'id':target})
    second=submit(f,idempotency_key='reuse-conflicts',expected_setup_version=1)
    body=envelope(f,second)
    body['decisions'][-1]={'proposal_id':body['decisions'][-1]['proposal_id'],'decision':'reject'}
    for d in body['decisions'][:2]:d['identity']={'kind':'existing','approved_entity_id':target}
    before=snapshot(f,'review-reused-id-before')
    with pytest.raises(BootstrapConflictError,match='SETUP_IDENTITY_REUSED'):review(f,second,body)
    assert snapshot(f,'review-reused-id-after')==before
    body['decisions'][1]={'proposal_id':body['decisions'][1]['proposal_id'],'decision':'reject'}
    body['decisions'][0]['edited_entity']={'canonical_name':'Overwrite approved identity','aliases':[]}
    with pytest.raises(BootstrapConflictError,match='SETUP_EXISTING_ID_EDIT_CONFLICT'):review(f,second,body)
    assert snapshot(f,'review-locked-edit-after')==before


def test_review_http_duplicate_forged_fields_and_wrong_novel(f):
    job=submit(f);body=envelope(f,job);owner={**f.headers,'X-Author-Id':ACTOR}
    path=f'/v1/story-brains/{f.src.novel_id}/setup/{job.job_id}/review'
    before=snapshot(f,'review-shape-before')
    invalid=deepcopy(body);invalid['decisions'].append(invalid['decisions'][0])
    assert f.client.post(path,json=invalid,headers=owner).status_code==422
    invalid=deepcopy(body);invalid['decisions'][0]['edited_entity']={'canonical_name':'Name','aliases':[],'entity_id':str(uuid.uuid4())}
    assert f.client.post(path,json=invalid,headers=owner).status_code==422
    invalid=deepcopy(body);invalid['decisions'][0]['source_refs']=[{'kind':'future_outline'}]
    assert f.client.post(path,json=invalid,headers=owner).status_code==422
    assert f.client.post(path.replace(f.src.novel_id,str(uuid.uuid4())),json=body,headers=owner).status_code==404
    assert f.client.post(path.replace(job.job_id,str(uuid.uuid4())),json=body,headers=owner).status_code==404
    admin={**owner,'X-Author-Id':str(uuid.uuid4()),'X-Role':'ADMIN'}
    assert f.client.post(path,json=body,headers=admin).status_code==404
    assert snapshot(f,'review-shape-after')==before


def test_concurrent_exact_review_replay_commits_once(f):
    job=submit(f);body=envelope(f,job)
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:review(f,job,body),range(2)))
    assert results[0]==results[1]
    data=snapshot(f,'review-concurrent-exact-replay')
    assert len(data['decisions'])==3 and len(data['entities'])==2 and len(data['facts'])==1
    assert data['bootstrap_jobs'][0]['result']['review_version']==1
    no_history(data)
