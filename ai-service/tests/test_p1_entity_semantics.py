"""H-01/H-02 semantic regressions on the real pipeline with controlled fake outputs."""
import hashlib
import json
import uuid
from dataclasses import replace

import pytest

from tests.test_p1_memory_entity_hitl import flow, discover, freeze, TENANT, author_choices
from core.fake_llm import FakeDeterministicLLMService
from domain.models import NarrativeEntity


class SemanticFake(FakeDeterministicLLMService):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.ids = []
        self.ambiguous = ''
        self.changed_machine = False
        self.flip_identity = False
        self.bad_stage = ''

    def _call_llm(self, *, system_prompt, user_prompt):
        if 'named entities' in system_prompt:
            return json.dumps({'entities': [{'phrase':'Minh', 'entity':'PER', 'score':9}]})
        return super()._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.calls.append(operation)
        data = json.loads(user_prompt)
        if operation == 'entity_candidate_verification':
            decisions = []
            for c in data['candidates']:
                known = data['known_entities']
                positive = c['surface'] in {'Minh', 'lan', 'M', 'm'}
                if self.changed_machine and c['start'] == 0: positive = False
                target = known[0] if known else None
                if self.flip_identity and c['start']==0 and len(known)>1:
                    target=known[1]
                decisions.append({'candidate_id':c['candidate_id'], 'verdict':'entity' if positive else 'not_entity',
                    'canonical_name': target['name'] if positive and target else c['surface'] if positive else '',
                    'canonical_entity_id':target['entity_id'] if positive and target else '',
                    'entity_type':'PER' if positive else None,
                    'identity_quote':c['context'] if positive and c['surface'] in {'M','m'} else '',
                    'reason':'controlled semantic verification'})
            return json.dumps({'decisions':decisions})
        if operation == 'hitl_event_extraction':
            refs = self.ids or [e['entity_id'] if isinstance(e,dict) else e for e in data['known_entities']]
            return json.dumps({'events':[{'event_type':'meeting', 'summary':data['source_text'],
                'participants':[self.ambiguous] if self.ambiguous else refs,
                'locations':['Minh'] if self.bad_stage=='location' else [], 'consequences':[], 'quote':data['source_text']}]})
        if operation == 'prose_fact_extraction' and self.ids:
            return json.dumps({'facts':[{'subject':'Minh' if self.bad_stage=='fact' else self.ids[0], 'fact_key':'mood', 'fact_value':'calm',
                'certainty':'confirmed', 'quote':data['source_text'], 'confidence':1}]})
        if operation == 'hitl_state_extraction':
            return json.dumps({'transitions':[{'entity':'Minh' if self.bad_stage=='state' else self.ids[-1] if self.ids else data['participants'][0],
                'attribute_key':'active_relationships', 'new_value':{('M' if self.bad_stage=='relationship' else self.ids[0]): 'knows'} if self.ids else {}, 'confidence':1}]})
        return super()._call_structured(operation=operation, system_prompt=system_prompt, user_prompt=user_prompt)


def prepare(f, content='Minh gặp lan. Minh chào lan.'):
    f.revision = replace(f.revision, content=content, content_hash=hashlib.sha256(content.encode()).hexdigest())
    f.provider._revisions[(f.revision.novel_id, f.revision.chapter_id, f.revision.revision_id)] = f.revision
    f.body['content_hash'] = f.revision.content_hash
    f.llm = SemanticFake()
    f.service._llm_service = f.llm
    return f


def add_hint(f):
    result = f.client.post(f'{f.base}/entity-guidance', headers=f.headers,
        json={'expected_version':0, 'entries':[{'name':'lan', 'kind':'hint'}, {'name':'absent', 'kind':'hint'}]})
    assert result.status_code == 200, result.text


def refresh(f, run, version, expected=200):
    result = f.client.post(f'{f.base}/entity-reviews/{run}/refresh', headers=f.headers, json={'expected_version':version})
    assert result.status_code == expected, result.text
    return result.json().get('data')


def readback(f, run, stage):
    if not f.engine:
        return
    from sqlalchemy import text
    tables={'story_brains':'id,brain_version,entity_guidance', 'analysis_runs':'id,entity_candidate_audit',
        'entities':'id,canonical_name,confirmation_status', 'proposals':'id,proposal_type,payload,evidence,status',
        'events':'id,participants,event_metadata', 'facts':'id,subject_entity_id,fact_key,source_revision_id',
        'current_entity_states':'entity_id,state,provenance'}
    value={'stage':stage,'run_id':run}
    with f.engine.connect() as connection:
        for table,fields in tables.items():
            value[table]=[dict(r) for r in connection.execute(text(f'SELECT {fields} FROM narrative.{table} WHERE tenant_id=:t AND novel_id=:n'),
                {'t':TENANT,'n':f.revision.novel_id}).mappings()]
    print('SEMANTIC_PG_READBACK '+json.dumps(value,default=str,ensure_ascii=True))


def test_refresh_preserves_human_occurrences_and_only_reviews_new_candidates(flow):
    f = prepare(flow)
    run, audit = discover(f)
    # Human rejection must survive even though the unchanged machine says entity.
    for d in audit['decisions']:
        d.update(verdict='not_entity', entity_type=None, canonical_name='', canonical_entity_id='', reason='author rejects false positive')
    old = freeze(f, run, audit).json()['data']
    add_hint(f)
    fresh = refresh(f, run, old['review_version'])
    assert fresh['status'] == 'waiting_entity_review'
    assert fresh['preserved_decisions'] == old['reviewed_decisions']
    new = [c for c in fresh['candidates'] if c['candidate_id'] in fresh['pending_candidate_ids']]
    assert {c['surface'] for c in new} == {'lan'} and len(new) == 2
    assert all(c['surface'] != 'absent' for c in fresh['candidates'])
    assert f.repo.list_proposals(f.revision.novel_id) == []
    assert f.repo.get_story_brain(f.revision.novel_id).facts == ()
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version']) == 1
    readback(f,run,'H01-refreshed-author-decisions-preserved')
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 409
    calls = list(f.llm.calls)
    assert refresh(f, run, old['review_version']) == fresh and f.llm.calls == calls
    pending = [d for d in author_choices(fresh) if d['candidate_id'] in fresh['pending_candidate_ids']]
    reviewed = f.client.post(f'{f.base}/entity-reviews/{run}/review', headers=f.headers,
        json={'expected_version':fresh['review_version'], 'decisions':pending})
    assert reviewed.status_code == 200, reviewed.text
    assert len(reviewed.json()['data']['reviewed_decisions']) == len(fresh['candidates'])
    f.service._entity_pipeline.run_verified = lambda *a, **k: pytest.fail('Entity stage reran after freeze')
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    assert 'hitl_event_extraction' not in calls and 'prose_fact_extraction' not in calls


@pytest.mark.parametrize('change', ['machine', 'context'])
def test_refresh_changed_candidate_requires_review(flow, change):
    f = prepare(flow)
    run, audit = discover(f)
    old = freeze(f, run, audit).json()['data']
    add_hint(f)
    if change == 'machine': f.llm.changed_machine = True
    else:
        original = f.service._entity_pipeline.run_verified
        def changed_context(*args, **kwargs):
            value = original(*args, **kwargs)
            c = value.audit['candidates'][0]
            c['context_end'] -= 1
            c['context'] = f.revision.content[c['context_start']:c['context_end']]
            return value
        f.service._entity_pipeline.run_verified = changed_context
    fresh = refresh(f, run, old['review_version'])
    assert audit['candidates'][0]['candidate_id'] in fresh['pending_candidate_ids']
    assert audit['candidates'][0]['candidate_id'] not in {d['candidate_id'] for d in fresh['preserved_decisions']}
    assert len(fresh['preserved_decisions']) == len(old['reviewed_decisions']) - 1


@pytest.mark.parametrize('change', ['hash', 'identity', 'canon', 'tenant'])
def test_refresh_does_not_weaken_source_canon_or_scope_fences(flow, change):
    f = prepare(flow)
    run, audit = discover(f)
    old = freeze(f, run, audit).json()['data']
    add_hint(f)
    if change == 'hash':
        f.provider._revisions[(f.revision.novel_id,f.revision.chapter_id,f.revision.revision_id)] = replace(f.revision, content='changed')
    if change == 'identity':
        f.provider._revisions[(f.revision.novel_id,f.revision.chapter_id,f.revision.revision_id)] = replace(f.revision, novel_id=str(uuid.uuid4()))
    if change == 'canon':
        p = f.service.create_author_entity(f.revision.novel_id, 'Other', 'PER')
        f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id], 1)
    if change == 'tenant':
        f.headers = {**f.headers, 'X-Tenant-Id':str(uuid.uuid4())}
    refresh(f, run, old['review_version'], {'hash':422,'identity':422,'canon':409,'tenant':403}[change])
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['review_version'] == old['review_version']


def homonyms(f, aliases=False, content=None):
    prepare(f, content or 'Minh bên trái gặp Minh bên phải.' + (' Minh trái gọi M; Minh phải gọi M.' if aliases else ''))
    f.llm.ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    brain = f.repo.get_story_brain(f.revision.novel_id)
    if f.engine:
        from infrastructure.orm_models import EntityRecord
        with f.repo._session_factory.begin() as session:
            for entity_id in f.llm.ids:
                session.add(EntityRecord(id=uuid.UUID(entity_id), story_brain_id=uuid.UUID(brain.metadata['brain_id']),
                    tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.revision.novel_id), entity_type='PER',
                    canonical_name='Minh', normalized_name='minh', static_attributes={}, source_type='author', confirmation_status='confirmed'))
    else:
        f.repo._brains[f.revision.novel_id] = replace(brain, entities=tuple(NarrativeEntity('Minh', id, 'PER') for id in f.llm.ids))
    f.body['options']['extract_state_transitions']=True
    run, audit = discover(f)
    by_id = {c['candidate_id']:c for c in audit['candidates']}
    counts = {}
    for d in audit['decisions']:
        c = by_id[d['candidate_id']]
        if d['verdict']=='entity':
            n = counts.get(c['surface'], 0);counts[c['surface']]=n+1
            d['canonical_entity_id']=f.llm.ids[n % 2]
    reviewed = freeze(f, run, audit).json()['data']
    return run, reviewed


@pytest.mark.parametrize('alias', [False, True])
def test_exact_identity_ids_survive_events_facts_states_and_canon(flow, alias):
    f = flow
    run, reviewed = homonyms(f, alias)
    assert {e['canonical_entity_id'] for e in reviewed['entities']} == set(f.llm.ids)
    response=f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert response.status_code == 200, response.text
    proposals=f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    event=next(p for p in proposals if p.proposal_type=='event')
    fact=next(p for p in proposals if p.proposal_type=='fact')
    state=next(p for p in proposals if p.proposal_type=='state_transition')
    assert set(event.payload['participants']) == set(f.llm.ids)
    assert fact.payload['subject_entity_id'] == f.llm.ids[0]
    assert state.payload['entity_id'] == f.llm.ids[1] and set(state.payload['new_value']) == {f.llm.ids[0]}
    assert all(p.evidence[0]['text_hash']==f.revision.content_hash for p in proposals)
    assert f.repo.get_story_brain(f.revision.novel_id).events == ()
    readback(f,run,'H02-pending-exact-ids-alias-'+str(alias))
    f.repo.accept_proposal_group(f.revision.novel_id,[p.proposal_id for p in proposals],1)
    memory=f.client.get(f'{f.base}/memory',headers=f.headers).json()['data']
    assert memory['brain_version']==2 and {e['entity_id'] for e in memory['entities']}==set(f.llm.ids)
    assert set(memory['events'][0]['participants'])==set(f.llm.ids)
    assert memory['current_state']['relationships'][0]['object_entity_id']==f.llm.ids[0]
    readback(f,run,'H02-approved-exact-ids-alias-'+str(alias))


@pytest.mark.parametrize('ambiguous', ['Minh','M'])
def test_ambiguous_downstream_name_or_alias_fails_closed(flow, ambiguous):
    f=flow
    run,_=homonyms(f, aliases=True)
    f.llm.ambiguous=ambiguous
    result=f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers)
    assert result.status_code==409,result.text
    assert f.repo.list_proposals(f.revision.novel_id)==[]
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id,run)['status']=='entities_reviewed'


@pytest.mark.parametrize('stage', ['location','fact','state','relationship'])
def test_every_downstream_identity_consumer_fails_closed_on_ambiguity(flow, stage):
    f=flow
    run,_=homonyms(f, aliases=True)
    f.llm.bad_stage=stage
    result=f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers)
    assert result.status_code==409,result.text
    assert f.repo.list_proposals(f.revision.novel_id)==[]
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version'])==1


def test_new_identity_id_survives_inventory_growth_and_materialization(flow):
    f=prepare(flow)
    run,audit=discover(f)
    old=freeze(f,run,audit).json()['data']
    original_id=old['entities'][0]['entity_id']
    uuid.UUID(original_id)
    add_hint(f)
    new=refresh(f,run,old['review_version'])
    pending=[d for d in author_choices(new) if d['candidate_id'] in new['pending_candidate_ids']]
    response=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,
        json={'expected_version':new['review_version'],'decisions':pending})
    assert response.status_code==200,response.text
    frozen=response.json()['data']
    assert next(e['entity_id'] for e in frozen['entities'] if e['phrase']=='Minh')==original_id
    assert len({e['entity_id'] for e in frozen['entities']})==2
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).status_code==200
    proposals=f.repo.list_proposals(f.revision.novel_id,analysis_run_id=run)
    f.repo.accept_proposal_group(f.revision.novel_id,[p.proposal_id for p in proposals],1)
    assert {e.entity_id for e in f.repo.get_story_brain(f.revision.novel_id).entities}=={e['entity_id'] for e in frozen['entities']}


def test_new_ambiguous_alias_is_pending_without_losing_previous_identity_choices(flow):
    f=flow
    run,old=homonyms(f,content='Minh gọi m. Minh trả lời m.')
    f.repo.save_entity_guidance(f.revision.novel_id,{'entries':[{'name':'m','kind':'hint'}]},0)
    fresh=refresh(f,run,old['review_version'])
    assert fresh['preserved_decisions']==old['reviewed_decisions']
    candidates={c['candidate_id']:c for c in fresh['candidates']}
    assert all(candidates[cid]['surface']=='m' for cid in fresh['pending_candidate_ids'])
    assert len(fresh['pending_candidate_ids'])==2
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).status_code==409
    pending=[d for d in author_choices(fresh) if d['candidate_id'] in fresh['pending_candidate_ids']]
    for i,d in enumerate(pending):d['canonical_entity_id']=f.llm.ids[i]
    response=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,
        json={'expected_version':fresh['review_version'],'decisions':pending})
    assert response.status_code==200,response.text
    assert {a['entity_id'] for a in response.json()['data']['aliases']}==set(f.llm.ids)


def test_parallel_refresh_and_replayed_review_do_not_duplicate_transitions(flow):
    if not flow.engine:pytest.skip('Row-lock concurrency requires PostgreSQL')
    f=prepare(flow)
    run,audit=discover(f)
    old=freeze(f,run,audit).json()['data']
    add_hint(f)
    from threading import Barrier
    from concurrent.futures import ThreadPoolExecutor
    from application.entity_hitl import refresh as service_refresh
    barrier=Barrier(2)
    original=f.service._entity_pipeline.run_verified
    def overlapping(*args,**kwargs):
        barrier.wait(timeout=10)
        return original(*args,**kwargs)
    f.service._entity_pipeline.run_verified=overlapping
    with ThreadPoolExecutor(max_workers=2) as pool:
        values=list(pool.map(lambda _:service_refresh(f.service,f.revision.novel_id,run,TENANT,old['review_version']),range(2)))
    assert values[0]==values[1] and values[0]['review_version']==old['review_version']+1
    fresh=values[0]
    decisions=[d for d in author_choices(fresh) if d['candidate_id'] in fresh['pending_candidate_ids']]
    body={'expected_version':fresh['review_version'],'decisions':decisions}
    one=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body)
    two=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body)
    assert one.status_code==two.status_code==200 and one.json()==two.json()
    assert len({d['candidate_id'] for d in one.json()['data']['reviewed_decisions']})==len(fresh['candidates'])
    assert f.repo.list_proposals(f.revision.novel_id)==[]


def test_partial_saved_author_decisions_survive_refresh_without_implicit_freeze(flow):
    f=prepare(flow)
    run,audit=discover(f)
    body={'expected_version':1,'decisions':author_choices(audit)[:1],'finalize':False}
    one=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body)
    assert one.status_code==200,one.text
    partial=one.json()['data']
    assert partial['status']=='waiting_entity_review' and len(partial['reviewed_decisions'])==1
    assert f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body).json()==one.json()
    add_hint(f)
    fresh=refresh(f,run,partial['review_version'])
    assert fresh['preserved_decisions']==partial['reviewed_decisions']
    assert len(fresh['pending_candidate_ids'])==3
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).status_code==409
    pending=[d for d in author_choices(fresh) if d['candidate_id'] in fresh['pending_candidate_ids']]
    result=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,
        json={'expected_version':fresh['review_version'],'decisions':pending})
    assert result.status_code==200,result.text
    assert result.json()['data']['status']=='entities_reviewed'
    assert f.repo.list_proposals(f.revision.novel_id)==[]


def test_changed_machine_identity_cannot_reuse_a_previous_author_choice(flow):
    f=flow
    run,old=homonyms(f,content='Minh gọi m. Minh trả lời m.')
    f.repo.save_entity_guidance(f.revision.novel_id,{'entries':[{'name':'m','kind':'hint'}]},0)
    f.llm.flip_identity=True
    fresh=refresh(f,run,old['review_version'])
    changed=next(c['candidate_id'] for c in fresh['candidates'] if c['start']==0)
    assert changed in fresh['pending_candidate_ids']
    assert changed not in {d['candidate_id'] for d in fresh['preserved_decisions']}
    old_choice=next(d for d in old['reviewed_decisions'] if d['candidate_id']==changed)
    new_machine=next(d for d in fresh['decisions'] if d['candidate_id']==changed)
    assert old_choice['canonical_entity_id']!=new_machine['canonical_entity_id']
    assert fresh['status']=='waiting_entity_review' and f.repo.list_proposals(f.revision.novel_id)==[]


def test_old_frozen_inventory_upgrades_saved_human_choices_without_entity_llm(flow):
    f=prepare(flow)
    run,audit=discover(f)
    old=freeze(f,run,audit).json()['data']
    for key in ('identity_inventory_version','review_submitted_decisions','review_finalize','pending_candidate_ids'):
        old.pop(key,None)
    for e in old['entities']:
        e.pop('entity_id',None)
        e.pop('occurrences',None)
    f.repo.save_entity_candidate_audit(f.revision.novel_id,run,old,expected_version=old['review_version'])
    f.service._entity_pipeline.run_verified=lambda *a,**k:pytest.fail('Legacy upgrade called the entity LLM')
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).status_code==200
    upgraded=f.repo.get_entity_candidate_audit(f.revision.novel_id,run)
    assert upgraded['identity_inventory_version']==2 and upgraded['reviewed_decisions']==old['reviewed_decisions']
    assert upgraded['identity_inventory_upgraded_from_version']==old['review_version']
    assert upgraded['status']=='completed'
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version'])==1
    body={'expected_version':old['review_input_version'],'decisions':old['reviewed_decisions']}
    confirmed=f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body)
    assert confirmed.status_code==200,confirmed.text
    assert confirmed.json()['data']['identity_inventory_version']==2
    assert f.client.post(f'{f.base}/entity-reviews/{run}/review',headers=f.headers,json=body).json()==confirmed.json()
    assert f.repo.list_proposals(f.revision.novel_id)
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).json()['data']['deduplicated']


def test_canon_edit_preserves_reserved_identity_and_rejects_identity_replacement(flow):
    f=prepare(flow)
    run,audit=discover(f)
    frozen=freeze(f,run,audit).json()['data']
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue',headers=f.headers).status_code==200
    proposals=f.repo.list_proposals(f.revision.novel_id,analysis_run_id=run)
    entity=next(p for p in proposals if p.proposal_type=='entity')
    from domain.projection import ProjectionError
    with pytest.raises(ProjectionError):
        f.repo.accept_proposal_group(f.revision.novel_id,[p.proposal_id for p in proposals],1,
            edited_payloads={entity.proposal_id:{**entity.payload,'entity_id':str(uuid.uuid4())}})
    assert f.repo.get_story_brain(f.revision.novel_id).entities==()
    edited={k:v for k,v in entity.payload.items() if k!='entity_id'}
    edited.update(canonical_name='Renamed Minh',normalized_name='renamed minh')
    f.repo.accept_proposal_group(f.revision.novel_id,[p.proposal_id for p in proposals],1,edited_payloads={entity.proposal_id:edited})
    brain=f.repo.get_story_brain(f.revision.novel_id)
    assert brain.entities[0].entity_id==frozen['entities'][0]['entity_id'] and brain.entities[0].name=='Renamed Minh'
    assert set(brain.events[0].participants)=={brain.entities[0].entity_id}
