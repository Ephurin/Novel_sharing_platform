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
