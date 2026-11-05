from __future__ import annotations

import hashlib
import unittest
import uuid
from dataclasses import replace

from sqlalchemy import create_engine, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.ports import RevisionContent
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from domain.models import WritingPatch
from infrastructure.orm_models import Base, SCHEMA, WritingGenerationRecord
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider


class WritingCursorPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            'sqlite+pysqlite:///:memory:',
            connect_args={'check_same_thread': False},
            poolclass=StaticPool,
            execution_options={'schema_translate_map': {SCHEMA: None}},
        )
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.tenant = str(uuid.uuid4())
        self.repository = PostgresNarrativeRepository(self.factory, tenant_id=self.tenant, actor_id=self.tenant)
        self.novel, self.chapter, self.revision = (str(uuid.uuid4()) for _ in range(3))
        self.source = 'Mở đầu 🌙.\n\nĐoạn giữa đang viết.\n\nPhần kết.'
        self.content_hash = hashlib.sha256(self.source.encode('utf-8')).hexdigest()
        provider = InMemoryRevisionContentProvider([RevisionContent(
            revision_id=self.revision, novel_id=self.novel, chapter_id=self.chapter,
            content=self.source, content_hash=self.content_hash,
        )])
        self.llm = FakeDeterministicLLMService()
        self.service = WritingService(repository=self.repository, llm_service=self.llm, revision_provider=provider)

    def tearDown(self):
        self.engine.dispose()

    def queued(self, selection, operation='continue'):
        return self.service.start_generation(
            tenant_id=self.tenant, novel_id=self.novel, chapter_id=self.chapter,
            revision_id=self.revision, content_hash=self.content_hash,
            operation=operation, selection=selection, instruction='Viết tiếp tại con trỏ.',
            idempotency_key=str(uuid.uuid4()),
            process_inline=False,
        )

    def test_generation_keeps_middle_end_and_zero_cursors_after_database_reload(self):
        for operation in ('continue', 'describe', 'dialogue'):
            for cursor in (self.source.index('Đoạn'), len(self.source), 0):
                with self.subTest(operation=operation, cursor=cursor):
                    queued = self.queued({'start': cursor, 'end': cursor, 'cursor': cursor}, operation)
                    job = self.service.process_generation(queued.job_id)
                    self.assertEqual((job.patch.start, job.patch.end), (cursor, cursor))
                    self.assertEqual(self.llm.last_call['cursor_offset'], cursor)
                    self.assertEqual(job.validation_status, 'passed')
                    applied = self.source[:job.patch.start] + job.patch.replacement + self.source[job.patch.end:]
                    self.assertEqual(applied, self.source[:cursor] + job.patch.replacement + self.source[cursor:])

    def test_cursor_is_independent_of_range_and_survives_each_saved_stage(self):
        for cursor in (0, self.source.index('Phần')):
            job = self.queued({'start': 2, 'end': 8, 'cursor': cursor})
            self.assertEqual(job.selection, {'start': 2, 'end': 8, 'cursor': cursor})
            job = self.repository.save_writing_job(replace(job, stage='preparing_context', context_summary={'entities': ['Minh']}))
            restored = self.repository.get_writing_job(job.job_id)
            self.assertEqual(restored.selection['cursor'], cursor)
            self.assertEqual(restored.context_summary['entities'], ['Minh'])
            self.assertNotIn('_selection_cursor', restored.context_summary)

    def test_cursor_only_requests_normalize_bounds_before_persistence(self):
        cursor = self.source.index('Đoạn')
        job = self.queued({'cursor': cursor})
        self.assertEqual(job.selection, {'start': cursor, 'end': cursor, 'cursor': cursor})
        completed = self.service.process_generation(job.job_id)
        self.assertEqual((completed.patch.start, completed.patch.end), (cursor, cursor))

    def test_legacy_queued_jobs_fall_back_to_saved_selection_end(self):
        cursor = self.source.index('Phần')
        job = self.queued({'start': cursor, 'end': cursor, 'cursor': cursor})
        with self.factory.begin() as session:
            session.execute(update(WritingGenerationRecord).values(context_summary={}))
        restored = self.repository.get_writing_job(job.job_id)
        self.assertEqual(restored.selection['cursor'], cursor)
        completed = self.service.process_generation(job.job_id)
        self.assertEqual((completed.patch.start, completed.patch.end), (cursor, cursor))

    def test_adapter_cannot_silently_move_a_middle_insertion_to_the_chapter_start(self):
        cursor = self.source.index('Đoạn')
        job = self.queued({'start': cursor, 'end': cursor, 'cursor': cursor})
        original = self.llm.generate_writing_draft

        def misplaced(**kwargs):
            result = original(**kwargs)
            result['patch']['start'] = result['patch']['end'] = 0
            return result

        self.llm.generate_writing_draft = misplaced
        completed = self.service.process_generation(job.job_id)
        self.assertEqual(completed.validation_status, 'failed')
        self.assertTrue(any(item.code == 'PATCH_SELECTION_MISMATCH' and not item.passed for item in completed.validations))

    def test_old_misplaced_suggestions_are_rejected_on_read_without_rewriting_history(self):
        cursor = self.source.index('Đoạn')
        job = self.queued({'start': cursor, 'end': cursor, 'cursor': cursor})
        self.repository.save_writing_job(replace(job, status='completed', validation_status='passed', patch=WritingPatch(start=0, end=0, replacement='AI draft')))
        checked = self.service.get_generation(job.job_id)
        self.assertEqual(checked.validation_status, 'failed')
        self.assertTrue(any(item.code == 'PATCH_SELECTION_MISMATCH' for item in checked.validations))
        self.assertEqual(self.repository.get_writing_job(job.job_id).validation_status, 'passed')

    def test_operation_semantics_survive_database_roundtrip(self):
        for operation in ('rewrite', 'continue', 'describe', 'dialogue'):
            for bounds in ((2, 8), (8, 8)):
                with self.subTest(operation=operation, bounds=bounds):
                    queued = self.queued({'start': 2, 'end': 8, 'cursor': 8}, operation)
                    original = FakeDeterministicLLMService().generate_writing_draft

                    def provider(**kwargs):
                        result = original(**kwargs)
                        result['patch']['start'], result['patch']['end'] = bounds
                        return result

                    self.llm.generate_writing_draft = provider
                    completed = self.service.process_generation(queued.job_id)
                    expected = bounds == ((2, 8) if operation == 'rewrite' else (8, 8))
                    self.assertEqual(completed.validation_status, 'passed' if expected else 'failed')
                    restored = self.service.get_generation(queued.job_id)
                    self.assertEqual(restored.validation_status, completed.validation_status)
                    self.assertEqual((restored.patch.start, restored.patch.end), bounds)

    def test_legacy_rewrite_insertion_is_rejected_without_mutating_stored_history(self):
        job = self.queued({'start': 2, 'end': 8, 'cursor': 8}, 'rewrite')
        self.repository.save_writing_job(replace(job, status='completed', validation_status='passed', patch=WritingPatch(start=8, end=8, replacement='Sai vị trí')))
        self.assertEqual(self.service.get_generation(job.job_id).validation_status, 'failed')
        self.assertEqual(self.repository.get_writing_job(job.job_id).validation_status, 'passed')


if __name__ == '__main__':
    unittest.main()
