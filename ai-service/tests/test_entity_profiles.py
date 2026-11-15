"""AX-01: HTTP + durable repository checks; no provider calls.

Set AX01_TEST_DATABASE_URL to a task-owned PostgreSQL database to run real locks.
SQLite coverage is persistence/serialization only, not a concurrency claim.
"""
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.entity_hitl_routes import router
from application.context_budget import ContextBudgetPacker
from domain.entity_profile import EntityProfilePatch
from domain.errors import OptimisticLockError
from domain.models import NarrativeProposal
from infrastructure.orm_models import Base, SCHEMA, EntityRecord, EntityProfileAuditRecord, StoryBrainRecord
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository

TENANT = '00000000-0000-0000-0000-000000000001'
ACTOR = '00000000-0000-0000-0000-000000000002'


@pytest.fixture(params=['sqlite', 'postgres'])
def profile(request):
    url = os.getenv('AX01_TEST_DATABASE_URL') if request.param == 'postgres' else None
    if request.param == 'postgres' and not url:
        pytest.skip('AX01_TEST_DATABASE_URL required for real PostgreSQL')
    if url:
        engine = create_engine(url)
    else:
        engine = create_engine('sqlite+pysqlite:///:memory:', connect_args={'check_same_thread': False},
            poolclass=StaticPool, execution_options={'schema_translate_map': {SCHEMA: None}})
        Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    repo = PostgresNarrativeRepository(factory, tenant_id=TENANT, actor_id=ACTOR)
    novel, eid = str(uuid.uuid4()), str(uuid.uuid4())
    repo.get_story_brain(novel)
    with factory.begin() as session:
        brain = session.scalar(select(StoryBrainRecord).where(StoryBrainRecord.novel_id == uuid.UUID(novel)))
        session.add(EntityRecord(id=uuid.UUID(eid), story_brain_id=brain.id, tenant_id=uuid.UUID(TENANT),
            novel_id=uuid.UUID(novel), canonical_name='Minh', normalized_name='minh', entity_type='PER',
            confirmation_status='confirmed', static_attributes={}))
    app = FastAPI()
    app.state.settings = SimpleNamespace(platform_service_token='ax01-fake-service', service_auth_disabled=False, default_tenant_id=TENANT)
    app.state.revision_analysis_service = SimpleNamespace(_repository=repo)
    app.include_router(router)
    headers = {'X-Service-Token': 'ax01-fake-service', 'X-Tenant-Id': TENANT, 'X-Author-Id': ACTOR, 'Idempotency-Key': 'edit-one'}
    client = TestClient(app)
    f = SimpleNamespace(repo=repo, factory=factory, engine=engine, client=client, novel=novel, eid=eid,
        path=f'/v1/story-brains/{novel}/entities/{eid}/profile', headers=headers, postgres=bool(url))
    yield f
    client.close()
    engine.dispose()


def payload(**kwargs):
    return {'expected_version': 0, 'expected_brain_version': 1, 'description': 'Author baseline',
        'appearance': 'Blue eyes', 'personality': 'Patient', 'background': 'A teacher',
        'effective_from_chapter': 3, **kwargs}


def save(f, body=None, key='edit-one'):
    return f.client.patch(f.path, json=body or payload(), headers={**f.headers, 'Idempotency-Key': key})


def audits(f):
    with f.factory() as session:
        return session.scalars(select(EntityProfileAuditRecord).where(EntityProfileAuditRecord.novel_id == uuid.UUID(f.novel))).all()


def test_save_reload_audit_identity_and_private_serialization(profile):
    f = profile
    response = save(f, payload(author_notes='PRIVATE future plan: Minh will die'))
    assert response.status_code == 200, response.text
    data = response.json()['data']
    fresh = PostgresNarrativeRepository(f.factory, tenant_id=TENANT, actor_id=ACTOR)
    assert fresh.get_entity_profile(f.novel, f.eid) == data
    assert f.client.get(f.path, headers=f.headers).json()['data'] == data
    assert data['version'] == 1 and data['brain_version'] == 2
    rows = audits(f)
    assert len(rows) == 1 and str(rows[0].actor_id) == ACTOR and rows[0].created_at
    assert rows[0].before['profile']['description'] == ''
    assert rows[0].after['profile']['description'] == 'Author baseline'
    memory = f.client.get(f'/v1/story-brains/{f.novel}/memory', headers=f.headers)
    assert memory.status_code == 200, memory.text
    assert 'PRIVATE' not in memory.text and 'will die' not in memory.text
    assert not memory.json()['data']['events'] and not memory.json()['data']['facts']
    assert memory.json()['data']['entities'][0]['approved_profile']['description'] == 'Author baseline'
    assert 'PRIVATE' not in json.dumps(f.repo.export_snapshot(f.novel))
    assert f.repo.get_entity_profile(f.novel, f.eid)['entity_id'] == f.eid


def test_context_cutoff_relevance_budget_and_no_private_notes(profile):
    f = profile
    assert save(f, payload(author_notes='PRIVATE PLAN')).status_code == 200
    def context(chapter, character=None):
        return f.repo.get_structured_context(f.novel, chapter_number=chapter, character_name=character, enforce_token_budget=False)
    assert 'Author baseline' not in json.dumps(asdict(context(2, 'Minh')))
    assert 'Author baseline' not in json.dumps(asdict(context(None, 'Minh')))
    assert 'Author baseline' not in json.dumps(asdict(context(3)))
    from application.writing_service import WritingService
    preview = WritingService(f.repo, llm_service=None).preview_context(
        tenant_id=TENANT, story_id=f.novel, chapter_number=3, character_name='Minh', token_budget=4000)
    assert 'Author baseline' in json.dumps(ContextBudgetPacker.prompt_context(preview))
    assert 'PRIVATE' not in json.dumps(ContextBudgetPacker.prompt_context(preview))
    raw = context(3, 'Minh')
    packed = ContextBudgetPacker().pack(raw, maximum=4000)
    prompt = ContextBudgetPacker.prompt_context(packed)
    assert 'Author baseline' in json.dumps(prompt)
    assert 'PRIVATE' not in json.dumps(prompt)
    assert ContextBudgetPacker.estimate_prompt_tokens(packed) <= 4000
    # Large profile still goes through the existing whole-artifact budget packer.
    assert save(f, payload(expected_version=1, expected_brain_version=2, background='x'*4000), key='large').status_code == 200
    packed = ContextBudgetPacker().pack(context(3, 'Minh'), maximum=600)
    assert ContextBudgetPacker.estimate_prompt_tokens(packed) <= 600


def test_note_only_never_changes_canon_or_creates_history(profile):
    f = profile
    before = asdict(f.repo.get_story_brain(f.novel))
    result = save(f, {'expected_version': 0, 'expected_brain_version': 1, 'author_notes': 'Future: marry Lan'})
    assert result.status_code == 200, result.text
    assert result.json()['data']['brain_version'] == 1
    assert before == asdict(f.repo.get_story_brain(f.novel))
    assert len(audits(f)) == 1


@pytest.mark.parametrize('change', [ {'expected_version': None}, {'expected_version': True}, {'extra': 'x'},
    {'description': 'x'*4001}, {'author_notes': 'x'*8001}, {'future_plan': 'death'}, {'entity_id': 'other'},
    {'description': 123}, {'effective_from_chapter': None}])
def test_invalid_payload_fails_without_mutation(profile, change):
    f = profile
    assert save(f, payload(**change)).status_code == 422
    assert f.repo.get_entity_profile(f.novel, f.eid)['version'] == 0 and not audits(f)


@pytest.mark.parametrize('field', ['expected_version', 'expected_brain_version', 'effective_from_chapter'])
def test_missing_preconditions_fail_closed(profile, field):
    f = profile
    body = payload(); del body[field]
    assert save(f, body).status_code == 422
    assert not audits(f)


def test_missing_key_and_wrong_service_tenant_novel_entity(profile):
    f = profile
    h = dict(f.headers); del h['Idempotency-Key']
    assert f.client.patch(f.path, json=payload(), headers=h).status_code == 422
    assert f.client.get(f.path, headers={**f.headers, 'X-Service-Token': 'wrong'}).status_code == 403
    assert f.client.get(f.path, headers={**f.headers, 'X-Tenant-Id': str(uuid.uuid4())}).status_code == 403
    assert f.client.patch(f.path, json=payload(), headers={**f.headers, 'X-Tenant-Id': str(uuid.uuid4())}).status_code == 403
    missing_actor = dict(f.headers); del missing_actor['X-Author-Id']
    assert f.client.patch(f.path, json=payload(), headers=missing_actor).status_code == 422
    for path in [f.path.replace(f.novel, str(uuid.uuid4())), f.path.replace(f.eid, str(uuid.uuid4()))]:
        assert f.client.patch(path, json=payload(), headers=f.headers).status_code == 404
    assert not audits(f)


def test_stale_retry_and_changed_request_key(profile):
    f = profile
    first = save(f)
    assert first.status_code == 200
    assert save(f).json() == first.json()
    assert len(audits(f)) == 1
    assert save(f, key='new-request').status_code == 409
    assert save(f, payload(description='different')).status_code == 409
    assert len(audits(f)) == 1 and f.repo.get_entity_profile(f.novel, f.eid)['version'] == 1


def test_same_name_uuid_and_extraction_do_not_overwrite_profile(profile):
    f = profile
    assert save(f).status_code == 200
    second = str(uuid.uuid4())
    with f.factory.begin() as s:
        original = s.get(EntityRecord, uuid.UUID(f.eid))
        s.add(EntityRecord(id=uuid.UUID(second), story_brain_id=original.story_brain_id, tenant_id=original.tenant_id,
            novel_id=original.novel_id, canonical_name='Minh', normalized_name='minh', entity_type='PER', static_attributes={}))
    assert f.repo.get_entity_profile(f.novel, second)['version'] == 0
    # Legacy extraction's existing entity upsert touches mentions, never profile columns.
    f.repo.upsert_entity(f.novel, {'word': 'Minh', 'entity': 'PER'})
    p = NarrativeProposal(proposal_id=str(uuid.uuid4()), proposal_type='entity',
        payload={'canonical_name': 'Minh', 'normalized_name': 'minh', 'entity_type': 'PER'}, expected_brain_version=1)
    f.repo.save_proposals(f.novel, [p])
    with pytest.raises(OptimisticLockError):
        f.repo.accept_proposal_group(f.novel, [p.proposal_id], expected_brain_version=1)
    refreshed = NarrativeProposal(proposal_id=str(uuid.uuid4()), proposal_type='entity',
        payload=p.payload, expected_brain_version=2)
    f.repo.save_proposals(f.novel, [refreshed])
    f.repo.accept_proposal_group(f.novel, [refreshed.proposal_id], expected_brain_version=2)
    assert f.repo.get_entity_profile(f.novel, f.eid)['profile']['description'] == 'Author baseline'
    assert f.repo.get_entity_profile(f.novel, second)['profile']['description'] == ''


def test_postgres_concurrent_edit_and_retry(profile):
    f = profile
    if not f.postgres:
        pytest.skip('Real row locks require PostgreSQL')
    def edit(key):
        return save(f, key=key).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(edit, ['concurrent-a', 'concurrent-b']))
    assert sorted(outcomes) == [200, 409]
    assert len(audits(f)) == 1
    f2 = f.repo.get_entity_profile(f.novel, f.eid)
    body = payload(expected_version=f2['version'], expected_brain_version=f2['brain_version'])
    def retry(_): return save(f, body, key='same-concurrent').json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(retry, range(2)))
    assert responses[0] == responses[1] and len(audits(f)) == 2


def test_audit_failure_rolls_back_profile_and_version(profile):
    from sqlalchemy import event
    f = profile
    def reject_audit(*args):
        raise RuntimeError('injected audit storage failure')
    event.listen(EntityProfileAuditRecord, 'before_insert', reject_audit)
    try:
        with pytest.raises(RuntimeError, match='audit storage failure'):
            f.repo.update_entity_profile(f.novel, f.eid, EntityProfilePatch(**payload()), actor_id=ACTOR, request_key='failed-audit')
    finally:
        event.remove(EntityProfileAuditRecord, 'before_insert', reject_audit)
    data = f.repo.get_entity_profile(f.novel, f.eid)
    assert data['version'] == 0 and data['brain_version'] == 1
    assert data['profile']['description'] == '' and not audits(f)


def test_storage_error_is_sanitized(profile, monkeypatch):
    from sqlalchemy.exc import StatementError
    f = profile
    def fail(*args, **kwargs):
        raise StatementError('storage failed', 'INSERT private', {'author_notes': 'SECRET'}, ValueError('db'))
    monkeypatch.setattr(f.repo, 'update_entity_profile', fail)
    response = save(f)
    assert response.status_code == 503
    assert 'SECRET' not in response.text and response.json()['detail']['code'] == 'PROFILE_STORAGE_UNAVAILABLE'


@pytest.mark.postgres_integration
def test_additive_upgrade_and_rollback_preserve_existing_identity(monkeypatch):
    """Use a SEPARATE disposable database: this test intentionally downgrades 0014."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text
    url = os.environ.get('AX01_MIGRATION_DATABASE_URL')
    if not url:
        pytest.skip('AX01_MIGRATION_DATABASE_URL required: separate disposable DB')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    cfg = Config('alembic.ini'); cfg.set_main_option('sqlalchemy.url', url)
    command.upgrade(cfg, 'head')
    command.downgrade(cfg, '0013_objective_intent')
    engine = create_engine(url)
    assert 'author_profile' not in {c['name'] for c in inspect(engine).get_columns('entities', schema='narrative')}
    brain, novel, entity = (str(uuid.uuid4()) for _ in range(3))
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO narrative.story_brains (id,tenant_id,novel_id,status,brain_version,schema_version) VALUES (:b,:t,:n,'active',1,1)"), {'b': brain, 't': TENANT, 'n': novel})
        conn.execute(text("INSERT INTO narrative.entities (id,story_brain_id,tenant_id,novel_id,entity_type,canonical_name,normalized_name,description,source_type,confirmation_status,is_locked) VALUES (:e,:b,:t,:n,'PER','Existing','existing','legacy description','author','confirmed',true)"), {'e': entity, 'b': brain, 't': TENANT, 'n': novel})
    command.upgrade(cfg, 'head')
    repo = PostgresNarrativeRepository(sessionmaker(engine, expire_on_commit=False), tenant_id=TENANT, actor_id=ACTOR)
    loaded = repo.get_entity_profile(novel, entity)
    assert loaded['version'] == 0 and loaded['author_notes'] == '' and loaded['profile']['description'] == 'legacy description'
    repo.update_entity_profile(novel, entity, EntityProfilePatch(**payload()), actor_id=ACTOR, request_key='migration-edit')
    command.downgrade(cfg, '0013_objective_intent')
    with engine.connect() as conn:
        row = conn.execute(text('SELECT id,description,is_locked FROM narrative.entities WHERE id=:e'), {'e': entity}).one()
        assert str(row.id) == entity and row.description == 'Author baseline' and row.is_locked
    command.upgrade(cfg, 'head')
    assert repo.get_entity_profile(novel, entity)['version'] == 0
    engine.dispose()
