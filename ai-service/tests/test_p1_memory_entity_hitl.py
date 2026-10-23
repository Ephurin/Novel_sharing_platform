"""Same HTTP/service acceptance contract runs in memory and on fresh PostgreSQL."""
import hashlib
import json
import os
import uuid
from dataclasses import replace
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.entity_hitl_routes import router
from api.narrative_routes import router as narrative_router
from application.revision_analysis_service import RevisionAnalysisService
from application.narrative_service import NarrativeApplicationService
from application.ports import RevisionContent
from core.fake_llm import FakeDeterministicLLMService
from domain.models import NarrativeProposal
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.entity_pipeline.pipeline import EntityPipeline

TENANT = '00000000-0000-0000-0000-000000000001'
ACTOR = '00000000-0000-0000-0000-000000000002'


@pytest.fixture(params=['memory', pytest.param('postgres', marks=pytest.mark.postgres_integration)])
def flow(request):
    novel, chapter, revision_id = (str(uuid.uuid4()) for _ in range(3))
    text = 'Tiêu Viêm gặp Hải Ba Đông.'
    revision = RevisionContent(revision_id, novel, chapter, text, hashlib.sha256(text.encode()).hexdigest(), 1)
    engine = None
    if request.param == 'postgres':
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from alembic import command
        from alembic.config import Config
        from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
        url = os.environ['TEST_DATABASE_URL']
        cfg = Config('alembic.ini')
        cfg.set_main_option('sqlalchemy.url', url)
        command.upgrade(cfg, 'head')
        engine = create_engine(url)
        repo = PostgresNarrativeRepository(sessionmaker(engine, expire_on_commit=False), tenant_id=TENANT, actor_id=ACTOR)
    else:
        repo = InMemoryNarrativeRepository()
    provider = InMemoryRevisionContentProvider([revision])
    llm = FakeDeterministicLLMService()
    service = RevisionAnalysisService(repo, provider, EntityPipeline(candidate_verification_enabled=True), llm)
    app = FastAPI()
    app.state.settings = SimpleNamespace(platform_service_token='isolated-hitl-test', service_auth_disabled=False, default_tenant_id=TENANT)
    app.state.revision_analysis_service = service
    app.state.narrative_service = NarrativeApplicationService(repo)
    app.include_router(router)
    app.include_router(narrative_router)
    client = TestClient(app)
    headers = {'X-Service-Token': 'isolated-hitl-test', 'X-Author-Id': ACTOR, 'X-Tenant-Id': TENANT,
        'X-Request-Id': str(uuid.uuid4()), 'Idempotency-Key': str(uuid.uuid4())}
    base = f'/v1/story-brains/{novel}'
    body = dict(novel_id=novel, chapter_id=chapter, content_hash=revision.content_hash,
        options={'extract_entities': True, 'extract_events': True, 'extract_world_rules': True})
    f = SimpleNamespace(repo=repo, service=service, client=client, headers=headers, base=base,
        body=body, revision=revision, provider=provider, llm=llm, engine=engine)
    yield f
    client.close()
    if engine:
        # Test owns this random novel only. Retain schema and all other fixture data.
        from sqlalchemy import text as sql
        with engine.begin() as conn:
            conn.execute(sql('DELETE FROM narrative.event_participants WHERE event_id IN (SELECT id FROM narrative.events WHERE tenant_id=:t AND novel_id=:n)'), {'t': TENANT, 'n': novel})
            conn.execute(sql('DELETE FROM narrative.state_transitions WHERE tenant_id=:t AND novel_id=:n'), {'t': TENANT, 'n': novel})
            conn.execute(sql('DELETE FROM narrative.current_entity_states WHERE tenant_id=:t AND novel_id=:n'), {'t': TENANT, 'n': novel})
            conn.execute(sql('DELETE FROM narrative.story_brains WHERE tenant_id=:t AND novel_id=:n'), {'t': TENANT, 'n': novel})
        engine.dispose()


def discover(f):
    response = f.client.post(f'/v1/revisions/{f.revision.revision_id}/analyses', json=f.body, headers=f.headers)
    assert response.status_code == 202, response.text
    assert response.json()['data']['status'] == 'waiting_entity_review'
    run = response.json()['data']['analysis_run_id']
    audit = f.client.get(f'{f.base}/entity-candidate-audits/{run}', headers=f.headers)
    assert audit.status_code == 200
    return run, audit.json()['data']


def freeze(f, run, audit):
    response = f.client.post(f'{f.base}/entity-reviews/{run}/review', headers=f.headers,
        json={'expected_version': audit['review_version'], 'decisions': audit['decisions']})
    assert response.status_code == 200, response.text
    assert response.json()['data']['status'] == 'entities_reviewed'
    return response


def test_full_separate_canon_flow_and_idempotency(flow):
    f = flow
    assert f.client.get(f'{f.base}/memory', headers=f.headers).status_code == 404
    f.repo.get_story_brain(f.revision.novel_id)
    empty = f.client.get(f'{f.base}/memory', headers=f.headers).json()
    assert empty['data']['entities'] == []
    hint = f.client.post(f'{f.base}/entity-guidance', headers=f.headers,
        json={'expected_version': 0, 'entries': [{'name': 'Absent Person', 'kind': 'hint'}]})
    assert hint.status_code == 200
    run, audit = discover(f)
    assert all(c['surface'] != 'Absent Person' for c in audit['candidates'])
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 409
    assert f.repo.list_proposals(f.revision.novel_id) == []
    frozen = freeze(f, run, audit)
    duplicate = freeze(f, run, audit)
    assert duplicate.json() == frozen.json()
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json() == empty
    f.service._entity_pipeline.run_verified = lambda *a, **kw: pytest.fail('Entity stage reran')
    result = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert result.status_code == 200, result.text
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert {'entity', 'event', 'fact'} <= {p.proposal_type for p in proposals}
    assert all(p.status.value == 'pending' for p in proposals)
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json() == empty
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['status'] == 'completed'
    again = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert again.status_code == 200 and again.json()['data']['deduplicated']
    assert f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run) == proposals
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    memory = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert memory['brain_version'] == 2 and memory['events'] and memory['facts'] and memory['entities']
    assert memory['events'][0]['metadata']['evidence'][0]['revision_id'] == f.revision.revision_id
    assert 'proposals' not in memory and 'Absent Person' not in json.dumps(memory)
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json()['data'] == memory


@pytest.mark.parametrize('failure', ['missing_decision', 'unresolved', 'version', 'guidance', 'hash', 'tenant', 'novel'])
def test_review_guards(flow, failure):
    f = flow
    run, audit = discover(f)
    decisions = audit['decisions']
    headers = dict(f.headers)
    version = 1
    base = f.base
    if failure == 'missing_decision': decisions = decisions[:-1]
    if failure == 'unresolved': decisions = [{'candidate_id': d['candidate_id'], 'verdict': 'unresolved', 'reason': 'uncertain'} for d in decisions]
    if failure == 'version': version = 99
    if failure == 'guidance': f.repo.save_entity_guidance(f.revision.novel_id, {'entries': []}, 0)
    if failure == 'hash': f.provider._revisions[(f.revision.novel_id, f.revision.chapter_id, f.revision.revision_id)] = replace(f.revision, content='tampered')
    if failure == 'tenant': headers['X-Tenant-Id'] = str(uuid.uuid4())
    if failure == 'novel': base = f'/v1/story-brains/{uuid.uuid4()}'
    response = f.client.post(f'{base}/entity-reviews/{run}/review', headers=headers,
        json={'expected_version': version, 'decisions': decisions})
    assert response.status_code == {'version':409, 'guidance':409, 'tenant':403, 'novel':404}.get(failure, 422), response.text
    assert f.repo.list_proposals(f.revision.novel_id) == []


def test_auth_missing_read_only_and_internal_brain_id(flow):
    f = flow
    assert f.client.get(f'{f.base}/memory').status_code == 401
    assert f.client.get(f'{f.base}/memory', headers={**f.headers, 'X-Service-Token':'bad'}).status_code == 403
    assert f.client.get(f'{f.base}/memory', headers={**f.headers, 'X-Tenant-Id':str(uuid.uuid4())}).status_code == 403
    assert f.client.get(f'{f.base}/memory', headers=f.headers).status_code == 404
    with pytest.raises(KeyError): f.repo.get_story_brain(f.revision.novel_id, read_only=True)
    brain = f.repo.get_story_brain(f.revision.novel_id)
    if brain.metadata.get('brain_id'):
        assert f.client.get(f"/v1/story-brains/{brain.metadata['brain_id']}/memory", headers=f.headers).status_code == 404


def test_retry_after_extraction_interruption(flow):
    f = flow
    run, audit = discover(f)
    freeze(f, run, audit)
    original = f.llm._call_structured
    def fail(**kw): raise ValueError('simulated interrupted downstream provider')
    f.llm._call_structured = fail
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 422
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['status'] == 'entities_reviewed'
    assert f.repo.list_proposals(f.revision.novel_id) == []
    f.llm._call_structured = original
    f.service._entity_pipeline.run_verified = lambda *a, **k: pytest.fail('Frozen entity stage reran')
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200


def test_author_declaration_and_evidence_are_pending(flow):
    f = flow
    response = f.client.post(f'{f.base}/author-entities', headers=f.headers, json={'name':'Absent Person', 'entity_type':'PER'})
    assert response.status_code == 201, response.text
    proposal = response.json()['data']
    assert proposal['evidence'] == [] and proposal['payload']['source_type'] == 'author_declaration'
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']['entities'] == []
    body = {'chapter_id': f.revision.chapter_id, 'revision_id': f.revision.revision_id,
        'quote': 'invented', 'proposal_type': 'fact', 'payload': {'fact_key':'test', 'fact_value':'x'}, 'expected_brain_version':1}
    assert f.client.post(f'{f.base}/author-proposals', headers=f.headers, json=body).status_code == 422
    body['quote'] = f.revision.content
    response = f.client.post(f'{f.base}/author-proposals', headers=f.headers, json=body)
    assert response.status_code == 201, response.text
    assert f.client.post(f'{f.base}/author-proposals', headers=f.headers, json=body).json() == response.json()
    f.repo.accept_proposal_group(f.revision.novel_id, [proposal['proposal_id']], 1)
    entity = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']['entities'][0]
    assert entity['mentions'] == 0 and entity['status'] == 'Unknown'


@pytest.mark.parametrize('change', ['hash', 'guidance', 'canon', 'tenant'])
def test_continue_rechecks_frozen_source_and_versions(flow, change):
    f = flow
    run, audit = discover(f)
    freeze(f, run, audit)
    headers = dict(f.headers)
    if change == 'hash':
        f.provider._revisions[(f.revision.novel_id, f.revision.chapter_id, f.revision.revision_id)] = replace(f.revision, content='changed')
    if change == 'guidance':
        f.repo.save_entity_guidance(f.revision.novel_id, {'entries': []}, 0)
    if change == 'canon':
        p = f.service.create_author_entity(f.revision.novel_id, 'Declared', 'PER')
        f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id], 1)
    if change == 'tenant': headers['X-Tenant-Id'] = str(uuid.uuid4())
    response = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=headers)
    assert response.status_code == {'hash':422, 'tenant':403}.get(change, 409), response.text
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['status'] == 'entities_reviewed'


def test_rejected_proposals_never_enter_memory(flow):
    f = flow
    p = f.service.create_author_entity(f.revision.novel_id, 'Never Canon', 'PER')
    f.repo.decide_proposal(f.revision.novel_id, p.proposal_id, False)
    data = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert data['entities'] == [] and data['brain_version'] == 1
    assert 'Never Canon' not in json.dumps(data)
    assert not {'plans', 'objectives', 'guidance', 'proposals', 'candidates'} & data.keys()


def test_empty_review_is_a_durable_completed_checkpoint(flow):
    f = flow
    run, audit = discover(f)
    audit['decisions'] = [{'candidate_id': c['candidate_id'], 'verdict':'not_entity', 'reason':'not an identity'} for c in audit['candidates']]
    freeze(f, run, audit)
    f.llm._call_structured = lambda **kw: json.dumps({'facts': []})
    result = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert result.status_code == 200 and result.json()['data']['proposal_count'] == 0, result.text
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['status'] == 'completed'
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).json()['data']['deduplicated']


def test_atomic_finalize_rejects_changed_checkpoint_without_proposals(flow):
    f = flow
    run, audit = discover(f)
    frozen = freeze(f, run, audit).json()['data']
    from domain.errors import OptimisticLockError
    with pytest.raises(OptimisticLockError):
        f.repo.complete_entity_review(f.revision.novel_id, run, {**frozen, 'review_version': 999}, [])
    assert f.repo.list_proposals(f.revision.novel_id) == []
    assert json.loads(json.dumps(f.repo.get_entity_candidate_audit(f.revision.novel_id, run))) == frozen


def test_memory_uses_active_facts_and_transition_provenance(flow):
    f = flow
    declared = f.service.create_author_entity(f.revision.novel_id, 'Person', 'PER')
    f.repo.accept_proposal_group(f.revision.novel_id, [declared.proposal_id], 1)
    entity = f.repo.get_story_brain(f.revision.novel_id).entities[0]
    proposal = NarrativeProposal(proposal_id=str(uuid.uuid4()), proposal_type='fact',
        payload={'fact_type':'author_fact', 'fact_key':'health', 'fact_value':40,
            'subject_entity_id':entity.entity_id, 'chapter_number':1}, expected_brain_version=2,
        evidence=({'revision_id':f.revision.revision_id, 'chapter_id':f.revision.chapter_id,
            'start':0, 'end':len(f.revision.content), 'text_hash':f.revision.content_hash},))
    f.repo.save_proposals(f.revision.novel_id, [proposal])
    f.repo.accept_proposal_group(f.revision.novel_id, [proposal.proposal_id], 2)
    active = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert active['current_state']['entities'][entity.entity_id]['health'] == 40
    assert active['current_state']['provenance'][entity.entity_id]['health']['fact_id'] == active['facts'][0]['fact_id']
    if f.engine:
        from sqlalchemy import text
        with f.engine.begin() as conn:
            conn.execute(text('UPDATE narrative.facts SET is_retired=true WHERE novel_id=:n'), {'n':f.revision.novel_id})
    else:
        brain = f.repo.get_story_brain(f.revision.novel_id)
        f.repo._brains[f.revision.novel_id] = replace(brain, facts=tuple({**v, 'is_retired':True} for v in brain.facts))
    retired = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert retired['facts'] == [] and retired['current_state']['entities'] == {}
    assert retired['brain_version'] == 3


def test_parallel_continue_commits_one_proposal_set(flow):
    if not flow.engine:
        pytest.skip('Row-lock concurrency requires PostgreSQL')
    f = flow
    run, audit = discover(f)
    freeze(f, run, audit)
    from concurrent.futures import ThreadPoolExecutor
    from application.entity_hitl import continue_review
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: continue_review(f.service, f.revision.novel_id, run, TENANT), range(2)))
    assert {p.proposal_id for p in results[0].proposals} == {p.proposal_id for p in results[1].proposals}
    saved = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert len(saved) == len(results[0].proposals)
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run)['status'] == 'completed'
