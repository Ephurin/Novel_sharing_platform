"""H-01..H-04: real SQL, semantic resolver, generation and LLM prompt serializer.

Only embedding transport and the final provider call are deterministic fakes.
No mocked repository, context DTO, retriever result or preview prerequisite.
"""
import hashlib
import json
import os
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from application.context_budget import ContextBudgetPacker
from application.hybrid_ranker import HybridRanker
from application.semantic_retriever import SemanticRetrieverService
from application.writing_service import WritingService
from application.ports import RevisionContent
from core.llm_service import LLMService
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider
from infrastructure.postgres_semantic_memory_repository import PostgresSemanticMemoryRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from infrastructure.orm_models import EntityRecord, EntityAliasRecord, EventRecord, FactRecord
from tests.test_entity_profiles import profile, save, payload, TENANT, ACTOR


class CaptureTransport(LLMService):
    def __init__(self):
        super().__init__(provider='openai', model='offline-capture', api_key='offline-only')
        self.prompts = []

    def _call_llm(self, *, system_prompt, user_prompt):
        self.prompts.append({'system': system_prompt, 'user': user_prompt})
        return json.dumps({'draft_text': 'Minh tiếp tục quan sát căn phòng.'})


def add_entity(f, name='Minh', locked=False):
    eid = str(uuid.uuid4())
    with f.factory.begin() as session:
        original = session.get(EntityRecord, uuid.UUID(f.eid))
        session.add(EntityRecord(id=uuid.UUID(eid), tenant_id=original.tenant_id,
            novel_id=original.novel_id, story_brain_id=original.story_brain_id,
            canonical_name=name, normalized_name=name.casefold(), entity_type='PER',
            is_locked=locked, confirmation_status='confirmed', static_attributes={}))
    return eid


def edit(f, eid=None, **changes):
    from domain.entity_profile import EntityProfilePatch
    eid = eid or f.eid
    current = f.repo.get_entity_profile(f.novel, eid)
    body = {'expected_version': current['version'], 'expected_brain_version': current['brain_version'], **changes}
    return f.repo.update_entity_profile(f.novel, eid, EntityProfilePatch(**body), actor_id=ACTOR, request_key=str(uuid.uuid4()))


def setup_service(f, policy='balanced-scope-v1', budget=None, semantic_enabled=True):
    semantic = PostgresSemanticMemoryRepository(f.factory, tenant_id=TENANT)
    retriever = SemanticRetrieverService(semantic, DeterministicFakeEmbeddingProvider(),
        hybrid_ranker=HybridRanker(), tenant_id=TENANT)
    text = 'Minh nhìn căn phòng.'
    revision = RevisionContent(str(uuid.uuid4()), f.novel, str(uuid.uuid4()), text,
        hashlib.sha256(text.encode()).hexdigest(), 3)
    transport = CaptureTransport()
    service = WritingService(f.repo, transport, InMemoryRevisionContentProvider([revision]),
        semantic_retriever=retriever if semantic_enabled else None, context_routing_policy=policy,
        context_packer=ContextBudgetPacker(default_budget=budget or 12000))
    return service, transport, revision


def generate(f, service, revision, instruction, chapter=3):
    return service.start_generation(tenant_id=TENANT, novel_id=f.novel,
        chapter_id=revision.chapter_id, revision_id=revision.revision_id, content_hash=revision.content_hash,
        operation='continue', selection={'start': 0, 'end': len(revision.content), 'cursor': len(revision.content)},
        instruction=instruction, expected_brain_version=f.repo.get_entity_profile(f.novel, f.eid)['brain_version'],
        chapter_number=chapter, actor_id=ACTOR, idempotency_key=str(uuid.uuid4()), process_inline=True)


def context(transport):
    return json.loads(transport.prompts[-1]['user'].split('Bối cảnh tiểu thuyết (Story Brain): ', 1)[1].splitlines()[0])


def record(label, transport, job):
    output = os.getenv('AX01_REMEDIATION_EVIDENCE_DIR')
    if not output:
        return
    path = Path(output); path.mkdir(parents=True, exist_ok=True)
    value = {'label': label, 'job_id': job.job_id, 'status': job.status, 'error': job.error,
        'brain_version_used': job.brain_version_used, 'context_hash': job.context_hash,
        'context_summary': job.context_summary, 'provider_call_count': len(transport.prompts),
        'transport_prompts': transport.prompts[-1:]}
    if transport.prompts:
        prompt_context = context(transport)
        serialized = json.dumps(prompt_context, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
        value['prompt_context_hash'] = hashlib.sha256(serialized).hexdigest()
        value['prompt_context_estimated_tokens'] = (len(serialized) + 2) // 3
        assert value['prompt_context_hash'] == job.context_hash
    # Only fictional fixtures; private notes must never appear even in evidence.
    assert 'PRIVATE_SENTINEL' not in json.dumps(value)
    (path / (label + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


@pytest.mark.postgres_integration
@pytest.mark.parametrize('profile', ['postgres'], indirect=True)
class TestProfileRemediation:
    @pytest.mark.parametrize('policy,semantic_enabled', [('legacy-v1', False), ('legacy-v1', True), ('balanced-scope-v1', True)])
    def test_h01_generation_without_character_or_events(self, profile, policy, semantic_enabled):
        f = profile
        assert save(f, payload(appearance='H01 blue eyes', author_notes='PRIVATE_SENTINEL')).status_code == 200
        other = add_entity(f, 'Lan')
        edit(f, other, appearance='UNRELATED red hair', effective_from_chapter=3)
        service, transport, revision = setup_service(f, policy, semantic_enabled=semantic_enabled)
        with f.factory() as session:
            assert not session.scalars(select(EventRecord).where(EventRecord.novel_id == uuid.UUID(f.novel))).all()
            assert not session.scalars(select(FactRecord).where(FactRecord.novel_id == uuid.UUID(f.novel))).all()
        # First call is start_generation, never a separate preview. Name resolution
        # runs in the production semantic repository despite no event embeddings.
        job = generate(f, service, revision, 'Write a scene about Minh.')
        assert job.status == 'completed', job.error
        assert len(transport.prompts) == 1
        prompt = context(transport)
        entity = next(e for e in prompt['entities'] if e['entity_id'] == f.eid)
        assert entity['approved_profile']['appearance'] == 'H01 blue eyes'
        assert 'UNRELATED' not in transport.prompts[0]['user']
        assert 'PRIVATE_SENTINEL' not in transport.prompts[0]['user']
        digest = hashlib.sha256(json.dumps(prompt, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        assert job.context_hash == digest
        assert f.repo.get_writing_job(job.job_id).context_hash == digest
        record('H01-' + policy + ('-semantic' if semantic_enabled else '-no-embedding'), transport, job)

    @pytest.mark.parametrize('semantic_enabled', [True, False])
    def test_h02_homonym_uuid_and_ambiguous_name(self, profile, semantic_enabled):
        f = profile
        edit(f, appearance='FIRST blue eyes', personality='FIRST patient', effective_from_chapter=1)
        other = add_entity(f, locked=True)
        with f.factory.begin() as session:
            for eid in (f.eid, other):
                session.add(EntityAliasRecord(entity_id=uuid.UUID(eid), alias='Watcher',
                    normalized_alias='watcher', source_type='author', confirmation_status='confirmed'))
        edit(f, other, appearance='SECOND red hair', personality='SECOND angry', effective_from_chapter=1)
        service, transport, revision = setup_service(f, semantic_enabled=semantic_enabled)
        semantic = PostgresSemanticMemoryRepository(f.factory, tenant_id=TENANT)
        assert semantic.get_hybrid_ranking_signals(f.novel, query_text='Minh', chapter_number=3).query_entity_ids == ()
        assert semantic.get_hybrid_ranking_signals(f.novel, query_text='Watcher', chapter_number=3).query_entity_ids == ()
        for target, selected, excluded in [(f.eid, 'FIRST', 'SECOND'), (other, 'SECOND', 'FIRST')]:
            job = generate(f, service, revision, 'Write about Minh, canonical UUID ' + target)
            assert job.status == 'completed', job.error
            prompt = context(transport)
            assert [e['entity_id'] for e in prompt['entities'] if e.get('approved_profile')] == [target]
            assert selected in transport.prompts[-1]['user'] and excluded not in transport.prompts[-1]['user']
            record('H02-uuid-' + selected.lower() + ('-semantic' if semantic_enabled else '-no-embedding'), transport, job)
        job = generate(f, service, revision, 'Write about Minh.')
        assert job.status == 'completed', job.error
        assert all(not e.get('approved_profile') for e in context(transport)['entities'])
        raw = f.repo.get_structured_context(f.novel, chapter_number=3, character_name='Minh', enforce_token_budget=False)
        assert all(not e.get('approved_profile') for e in raw.entities)
        record('H02-ambiguous' + ('-semantic' if semantic_enabled else '-no-embedding'), transport, job)
        with f.factory() as session:
            assert session.get(EntityRecord, uuid.UUID(other)).is_locked

    def test_h03_locked_long_profiles_and_fail_closed(self, profile):
        f = profile
        ids = [f.eid] + [add_entity(f, 'Person' + str(i), locked=True) for i in range(7)]
        with f.factory.begin() as session:
            session.get(EntityRecord, uuid.UUID(f.eid)).is_locked = True
        for eid in ids:
            edit(f, eid, description='d'*4000, appearance='a'*4000,
                personality='p'*4000, background='b'*4000, effective_from_chapter=1)
        instruction = 'Write about canonical entities ' + ' '.join(ids)
        service, transport, revision = setup_service(f, 'legacy-v1')
        job = generate(f, service, revision, instruction)
        assert job.status == 'completed', job.error
        prompt = context(transport)
        assert {e['entity_id'] for e in prompt['entities']} == set(ids)
        assert {e['entity_id'] for e in prompt['current_states']} == set(ids)
        assert len([e for e in prompt['entities'] if e.get('approved_profile')]) < len(ids)
        assert job.context_summary['dropped_profile_entity_ids']
        raw = f.repo.get_structured_context(f.novel, chapter_number=3, profile_entity_ids=tuple(ids), enforce_token_budget=False)
        packed = ContextBudgetPacker().pack(raw)
        assert packed.token_budget['used'] <= 12000 and not packed.token_budget['protected_overflow']
        record('H03-legacy-optional-profiles', transport, job)
        # Existing balanced full-fit routing still rejects above its maximum tier.
        service, transport, revision = setup_service(f)
        job = generate(f, service, revision, instruction)
        assert job.status == 'failed' and job.error['code'] == 'CONTEXT_SCOPE_EXCEEDS_MAX_TIER'
        assert not transport.prompts
        record('H03-balanced-fail-closed', transport, job)
        # Profiles cannot conceal an actual protected-identity overflow either.
        service, transport, revision = setup_service(f, 'legacy-v1', budget=200)
        job = generate(f, service, revision, instruction)
        assert job.status == 'failed' and not transport.prompts
        record('H03-identity-overflow', transport, job)

    def test_h04_whole_snapshot_cutoff_retains_old_fields_without_leakage(self, profile):
        f = profile
        edit(f, appearance='OLD blue eyes', description='OLD baseline', effective_from_chapter=1)
        service, transport, revision = setup_service(f)
        job = generate(f, service, revision, 'Write about Minh.', chapter=3)
        assert 'OLD blue eyes' in transport.prompts[-1]['user']
        edit(f, description='NEW baseline clarification', effective_from_chapter=10)
        durable = f.repo.get_entity_profile(f.novel, f.eid)
        assert durable['profile']['appearance'] == 'OLD blue eyes'
        assert durable['effective_from_chapter'] == 10
        for chapter in (3, 9):
            job = generate(f, service, revision, 'Write about Minh.', chapter=chapter)
            assert job.status == 'completed', job.error
            assert 'NEW baseline' not in transport.prompts[-1]['user']
            assert 'OLD blue eyes' not in transport.prompts[-1]['user']
            record('H04-before-cutoff-' + str(chapter), transport, job)
        job = generate(f, service, revision, 'Write about Minh.', chapter=10)
        assert job.status == 'completed', job.error
        assert 'NEW baseline clarification' in transport.prompts[-1]['user']
        assert 'OLD blue eyes' in transport.prompts[-1]['user']
        assert not f.repo.get_story_brain(f.novel).events and not f.repo.get_story_brain(f.novel).facts
        record('H04-at-cutoff', transport, job)
