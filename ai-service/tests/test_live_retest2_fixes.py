"""Findings from the second P2 live retest on main (2026-11-15): R1 too-short drafts, R2 events lost
to ungrounded quotes, R4 consistency against approved story facts."""
import hashlib
import json
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.ports import RevisionContent
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.rule_consistency import canon_facts_from_brain, check_canon
from tests.test_p1_memory_entity_hitl import flow, discover, freeze, author_choices  # noqa: F401
from tests.test_p1_entity_semantics import SemanticFake, prepare


# ---- R1 ---------------------------------------------------------------------------------------
@pytest.fixture
def writer():
    engine = create_engine('sqlite+pysqlite:///:memory:', connect_args={'check_same_thread': False},
                           poolclass=StaticPool, execution_options={'schema_translate_map': {SCHEMA: None}})
    Base.metadata.create_all(engine)
    tenant = str(uuid.uuid4())
    repository = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False), tenant_id=tenant, actor_id=tenant)
    repository.writing_authority_snapshot = lambda job: ()
    repository.writing_rule_authority_snapshot = lambda job: ()
    novel, chapter, revision = (str(uuid.uuid4()) for _ in range(3))
    source = 'Mở đầu chương.'
    digest = hashlib.sha256(source.encode('utf-8')).hexdigest()
    provider = InMemoryRevisionContentProvider([RevisionContent(revision_id=revision, novel_id=novel,
        chapter_id=chapter, content=source, content_hash=digest)])
    llm = FakeDeterministicLLMService()
    svc = WritingService(repository=repository, llm_service=llm, revision_provider=provider)

    def run(draft, instruction):
        llm.generate_writing_draft = lambda **k: {'draft_text': draft, 'patch': {'start': len(source), 'end': len(source),
                                                  'replacement': draft}, 'model_info': {'provider': 'test'}}
        queued = svc.start_generation(tenant_id=tenant, novel_id=novel, chapter_id=chapter, revision_id=revision,
            content_hash=digest, operation='continue', selection={'start': len(source), 'end': len(source), 'cursor': len(source)},
            instruction=instruction, idempotency_key=str(uuid.uuid4()), process_inline=False)
        return svc.process_generation(queued.job_id)

    yield run
    engine.dispose()


def failed_codes(job):
    return {v.code for v in job.validations if not v.passed}


def test_r1_a_draft_far_shorter_than_asked_fails_validation(writer):
    job = writer('- Nghiệt chướng, dám cản đường bản tọa! Chết đi!', 'Viết tiếp khoảng 500 chữ.')
    assert job.validation_status == 'failed' and 'DRAFT_TOO_SHORT' in failed_codes(job)
    message = next(v.message for v in job.validations if v.code == 'DRAFT_TOO_SHORT')
    assert '500' in message and 'tạo lại' in message


def test_r1_a_draft_near_the_request_or_without_a_count_passes(writer):
    assert writer(' '.join(['chữ'] * 300), 'Viết tiếp khoảng 500 chữ.').validation_status == 'passed'
    assert writer('Một câu ngắn.', 'Viết tiếp đoạn này.').validation_status == 'passed'


# ---- R2 ---------------------------------------------------------------------------------------
class QuoteFake(SemanticFake):
    def __init__(self, quote):
        super().__init__()
        self.quote = quote

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        if operation == 'hitl_event_extraction':
            data = json.loads(user_prompt)
            refs = [e['entity_id'] if isinstance(e, dict) else e for e in data['known_entities']]
            return json.dumps({'events': [{'event_type': 'meeting', 'summary': 'Minh gặp lan', 'participants': refs,
                'locations': [], 'consequences': [], 'quote': self.quote}]})
        if operation == 'quote_repair':
            return json.dumps({'exact_quote': 'not in the text at all'})
        return super()._call_structured(operation=operation, system_prompt=system_prompt, user_prompt=user_prompt)


def continue_with_quote(f, quote):
    f = prepare(f)
    f.llm = QuoteFake(quote)
    f.service._llm_service = f.llm
    run, audit = discover(f)
    freeze(f, run, audit)
    result = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert result.status_code == 200, result.text
    events = [p for p in f.repo.list_proposals(f.revision.novel_id) if p.proposal_type == 'event']
    return result.json()['data'], events


def test_r2_a_quote_with_changed_spacing_is_regrounded_not_dropped(flow):
    data, events = continue_with_quote(flow, 'Minh  gặp\nlan.')
    assert data['dropped_events'] == 0
    assert len(events) == 1 and events[0].evidence[0]['quote'] == 'Minh gặp lan.'


def test_r2_an_ungroundable_event_is_reported(flow):
    data, events = continue_with_quote(flow, 'Một câu không có trong chương.')
    assert data['dropped_events'] == 1 and events == []


# ---- R4 ---------------------------------------------------------------------------------------
def test_r4_canon_facts_include_places_profiles_facts_and_recent_events():
    brain = SimpleNamespace(
        entities=[SimpleNamespace(entity_id='e1', name='Trần Vũ', location='làng Thạch Khê',
                                  approved_profile={'background': 'Thợ rèn dưới chân núi Lôi Sơn', 'effective_from_chapter': 1}),
                  SimpleNamespace(entity_id='e2', name='Lam Yên', location='Unknown', approved_profile={})],
        events=[SimpleNamespace(event_id=f'v{i}', chapter=i, summary=f'Sự kiện {i}') for i in range(1, 60)])
    facts = [{'fact_id': 'f1', 'fact_type': 'narrative_fact', 'fact_key': 'hometown', 'fact_value': 'Thạch Khê', 'subject_entity_id': 'e1'},
             {'fact_id': 'r1', 'fact_type': 'world_rule', 'fact_value': 'Quy tắc'}]
    items = canon_facts_from_brain(brain, facts)
    texts = [i['text'] for i in items]
    assert 'Trần Vũ ở làng Thạch Khê' in texts
    assert any('Thợ rèn dưới chân núi Lôi Sơn' in t for t in texts)
    assert 'Trần Vũ: hometown = Thạch Khê' in texts
    assert not any('Lam Yên ở' in t for t in texts) and not any('Quy tắc' == t for t in texts)
    assert len(items) == 40 and texts[-1] == 'Chương 59: Sự kiện 59'


def test_r4_one_call_reports_rule_and_fact_contradictions_with_grounded_quotes():
    text = 'Sau trận ấy, Vũ quay về quê nhà ở làng Tây Giang. Vũ vung kiếm mà không mất ký ức nào.'
    seen = {}

    class LLM:
        def _call_structured(self, *, operation, system_prompt, user_prompt):
            seen.update(json.loads(user_prompt))
            return json.dumps({'findings': [
                {'rule_id': 'entity:e1:location', 'verdict': 'violates', 'quote': 'Vũ quay về quê nhà ở làng Tây Giang', 'explanation': 'Quê ở Thạch Khê'},
                {'rule_id': 'r1', 'verdict': 'violates', 'quote': 'Vũ vung kiếm mà không mất ký ức nào', 'explanation': 'Trái quy tắc'},
                {'rule_id': 'event:x', 'verdict': 'violates', 'quote': 'không có trong chương', 'explanation': 'bịa'},
                {'rule_id': 'unknown', 'verdict': 'violates', 'quote': 'Vũ quay về', 'explanation': 'không có ID'}]})

    findings = check_canon(text, [{'rule_id': 'r1', 'text': 'Dùng kiếm mất một ký ức'}],
                           [{'rule_id': 'entity:e1:location', 'text': 'Trần Vũ ở làng Thạch Khê'},
                            {'rule_id': 'event:x', 'text': 'Chương 1: …'}], LLM())
    assert {(f['kind'], f['rule_id']) for f in findings} == {('fact', 'entity:e1:location'), ('rule', 'r1')}
    assert seen['story_facts'][0]['text'] == 'Trần Vũ ở làng Thạch Khê'
