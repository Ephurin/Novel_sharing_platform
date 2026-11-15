"""Long-run live test (2026-11-15), issue 13: an accepted draft was glued to the previous sentence
("nhịp đồng hồ.Linh") because the model's text is inserted verbatim at the cursor."""
from __future__ import annotations

import hashlib
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.ports import RevisionContent
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from core.writing_output import fit_spacing
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider


@pytest.mark.parametrize('before, replacement, after, expected', [
    ('nhịp đồng hồ.', 'Linh bước ra.', '', ' Linh bước ra.'),
    ('nhịp đồng hồ. ', 'Linh bước ra.', '', 'Linh bước ra.'),
    ('nhịp đồng hồ.\n\n', 'Linh bước ra.', '', 'Linh bước ra.'),
    ('', 'Linh bước ra.', 'Rồi im.', 'Linh bước ra. '),
    ('Cô nói:', '"Đi thôi."', ' Rồi im.', ' "Đi thôi."'),
    ('Linh', ', rồi cô cười', 'Sau đó', ', rồi cô cười '),
    ('Cô nhìn (', 'chú thích', ').', 'chú thích'),
    ('Câu một.', ' Đã có khoảng trắng.', ' Câu ba.', ' Đã có khoảng trắng.'),
    ('Câu một.', '', 'Câu ba.', ''),
])
def test_fit_spacing(before, replacement, after, expected):
    assert fit_spacing(before, replacement, after) == expected


@pytest.fixture
def service():
    engine = create_engine('sqlite+pysqlite:///:memory:', connect_args={'check_same_thread': False},
                           poolclass=StaticPool, execution_options={'schema_translate_map': {SCHEMA: None}})
    Base.metadata.create_all(engine)
    tenant = str(uuid.uuid4())
    repository = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
                                             tenant_id=tenant, actor_id=tenant)
    repository.writing_authority_snapshot = lambda job: ()
    repository.writing_rule_authority_snapshot = lambda job: ()
    novel, chapter, revision = (str(uuid.uuid4()) for _ in range(3))
    source = 'Cô nghe nhịp đồng hồ.Phần sau.'
    content_hash = hashlib.sha256(source.encode('utf-8')).hexdigest()
    provider = InMemoryRevisionContentProvider([RevisionContent(
        revision_id=revision, novel_id=novel, chapter_id=chapter, content=source, content_hash=content_hash)])
    llm = FakeDeterministicLLMService()

    def draft(**kwargs):
        cursor = kwargs.get('cursor_offset')
        return {'draft_text': 'Linh bước ra.', 'patch': {'start': cursor, 'end': cursor, 'replacement': 'Linh bước ra.'},
                'model_info': {'provider': 'test'}}

    llm.generate_writing_draft = draft
    svc = WritingService(repository=repository, llm_service=llm, revision_provider=provider)
    yield svc, dict(tenant=tenant, novel=novel, chapter=chapter, revision=revision, hash=content_hash, source=source)
    engine.dispose()


def test_continue_patch_reads_as_separate_sentences(service):
    svc, ids = service
    cursor = ids['source'].index('Phần')
    queued = svc.start_generation(
        tenant_id=ids['tenant'], novel_id=ids['novel'], chapter_id=ids['chapter'], revision_id=ids['revision'],
        content_hash=ids['hash'], operation='continue', selection={'start': cursor, 'end': cursor, 'cursor': cursor},
        instruction='Viết tiếp.', idempotency_key=str(uuid.uuid4()), process_inline=False)
    job = svc.process_generation(queued.job_id)
    assert job.validation_status == 'passed'
    assert (job.patch.start, job.patch.end) == (cursor, cursor)
    applied = ids['source'][:cursor] + job.patch.replacement + ids['source'][cursor:]
    assert applied == 'Cô nghe nhịp đồng hồ. Linh bước ra. Phần sau.'
