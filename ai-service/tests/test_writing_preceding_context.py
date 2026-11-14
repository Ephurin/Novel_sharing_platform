"""Phase 2 live finding F-LIVE-09: 'continue' at a cursor must give the model the text before it."""
from types import SimpleNamespace

from application.writing_service import PRECEDING_CONTEXT_CHARS, WritingService


class Provider:
    def __init__(self, content):
        self.content = content

    def get_revision(self, **_):
        return SimpleNamespace(content=self.content)


def resolve(content, selection):
    service = WritingService.__new__(WritingService)
    service._revision_provider = Provider(content)
    job = SimpleNamespace(selection=selection, tenant_id='t', novel_id='n', chapter_id='c', revision_id='r')
    return service._resolve_selected_text(job)


def test_cursor_only_selection_returns_preceding_text():
    text = 'Đêm thứ tư, Lâm Phong cập đò. Ánh trăng sóng sánh.'
    assert resolve(text, {'start': len(text), 'end': len(text), 'cursor': len(text)}) == text
    assert resolve(text, {'start': 11, 'end': 11, 'cursor': 11}) == text[:11]
    assert resolve(text, {'start': 0, 'end': 0, 'cursor': 0}) == ''


def test_preceding_text_is_bounded_and_ranges_unchanged():
    text = 'x' * (PRECEDING_CONTEXT_CHARS + 500) + 'END'
    got = resolve(text, {'start': len(text), 'end': len(text)})
    assert len(got) == PRECEDING_CONTEXT_CHARS and got.endswith('END')
    assert resolve('abcdef', {'start': 1, 'end': 4}) == 'bcd'


def test_cursor_only_request_with_null_offsets_is_accepted():
    """F-LIVE-07: the API sends start/end as null when only a cursor is given; that used to fail
    with "'<' not supported between 'NoneType' and 'int'"."""
    import hashlib
    from application.ports import RevisionContent
    from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
    from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
    from tests.harness.fake_llm import FakeDeterministicLLMService

    text = 'Tiêu Viêm đi vào rừng rậm, bắt đầu thu thập dược liệu quý giá.'
    ids = dict(novel_id='11111111-1111-1111-1111-111111111111', chapter_id='22222222-2222-2222-2222-222222222222',
               revision_id='33333333-3333-3333-3333-333333333333')
    content_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()
    repo = InMemoryNarrativeRepository()
    repo.get_story_brain(ids['novel_id'])
    service = WritingService(repository=repo, llm_service=FakeDeterministicLLMService(),
                             revision_provider=InMemoryRevisionContentProvider([RevisionContent(content=text, content_hash=content_hash, **ids)]))
    job = service.start_generation(tenant_id='00000000-0000-0000-0000-000000000001', content_hash=content_hash,
                                   operation='continue', selection={'start': None, 'end': None, 'cursor': len(text)},
                                   instruction='Viết tiếp', **ids)
    assert job.selection['start'] == job.selection['end'] == len(text)
    assert job.status != 'failed', job.error
