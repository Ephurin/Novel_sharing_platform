import hashlib
import json
import pytest
from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.entity_pipeline.pipeline import EntityPipeline
from services.source_grounding import find_mention, quote_span
from services.prose_facts import extract_prose_facts
from tests.test_state_projection import repo


class Responses:
    def __init__(self, *responses):
        self.responses = iter(responses)
    def _call_llm(self, **kwargs):
        return json.dumps(next(self.responses), ensure_ascii=False)


def make_service(text, llm):
    revision = RevisionContent('rev', 'novel', 'chapter', text, hashlib.sha256(text.encode()).hexdigest(), 1)
    repo = InMemoryNarrativeRepository()
    service = RevisionAnalysisService(repo, InMemoryRevisionContentProvider([revision]), EntityPipeline(), llm)
    return repo, service, revision


def test_name_anchors_use_word_boundaries_and_original_unicode_offsets():
    text = 'Âm thanh. Straße. An tới.'
    start, end = find_mention(text, 'An')
    assert text[start:end] == 'An'
    assert start == text.index('An tới')
    assert find_mention('thanh', 'An') is None


def test_quote_requires_unique_verbatim_source():
    with pytest.raises(ValueError):
        quote_span('An nói. An nói.', 'An nói.')
    with pytest.raises(ValueError):
        quote_span('An nói.', 'An đã chết.')


def test_prose_death_and_disability_are_pending_then_project_after_review():
    text = 'Lâm đã chết. Duy điếc tai trái.'
    llm = Responses({'entities': [{'phrase': 'Lâm', 'entity': 'PER', 'score': 9, 'initial_status': 'Dead', 'status_quote': 'Lâm đã chết.'},
                                  {'phrase': 'Duy', 'entity': 'PER', 'score': 9}]},
                    {'facts': [{'subject': 'Duy', 'fact_key': 'hearing', 'fact_value': 'left-ear deafness',
                                'certainty': 'confirmed', 'quote': 'Duy điếc tai trái.'}]})
    repo, service, revision = make_service(text, llm)
    result = service.analyze(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev',
        content_hash=revision.content_hash, operation='test', idempotency_key='one',
        options={'extract_events': False, 'extract_prose_facts': True})
    assert not repo.get_story_brain('novel').entities
    assert result.proposals[0].payload['initial_status'] == 'Dead'
    repo.accept_proposal_group('novel', [p.proposal_id for p in result.proposals], 1)
    brain = repo.get_story_brain('novel')
    duy = next(e for e in brain.entities if e.name == 'Duy')
    assert brain.current_state['entities'][duy.entity_id]['hearing'] == 'left-ear deafness'


def test_proposed_rule_is_not_a_confirmed_state():
    repo, service, revision = make_service('An đề nghị chỉ quét ba lần.', Responses({'facts': [
        {'subject': 'An', 'fact_key': 'scan_limit', 'fact_value': 3, 'certainty': 'proposed',
         'quote': 'An đề nghị chỉ quét ba lần.'}]}))
    result = service.analyze(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev',
        content_hash=revision.content_hash, operation='test', idempotency_key='one',
        options={'extract_entities': False, 'extract_events': False, 'extract_prose_facts': True})
    fact = result.proposals[0].payload
    assert 'subject_entity_name' not in fact
    assert fact['fact_value']['certainty'] == 'proposed'


def test_author_repair_is_idempotent_evidenced_and_pending():
    repo, service, _ = make_service('Duy điếc tai trái.', None)
    args = dict(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev',
                quote='Duy điếc tai trái.', proposal_type='fact',
                payload={'fact_key': 'hearing', 'fact_value': 'Duy điếc tai trái'}, expected_brain_version=1)
    proposal = service.create_author_proposal(**args)
    assert service.create_author_proposal(**args).proposal_id == proposal.proposal_id
    assert not repo.get_story_brain('novel').facts
    assert proposal.evidence[0]['start'] == 0
    with pytest.raises(ValueError):
        service.create_author_proposal(**{**args, 'quote': 'Duy nghe rõ.'})


def test_author_fact_projects_on_review_across_repositories(repo):
    text = 'Minh đã chết.'
    revision = RevisionContent('rev-repair', 'story', 'chapter', text, hashlib.sha256(text.encode()).hexdigest(), 1)
    service = RevisionAnalysisService(repo, InMemoryRevisionContentProvider([revision]), EntityPipeline(), None)
    subject = next(e for e in repo.list_entities('story') if e.name == 'Minh')
    proposal = service.create_author_proposal(tenant_id=getattr(repo, '_tenant_id', 't'), novel_id='story', chapter_id='chapter',
        revision_id='rev-repair', quote=text, proposal_type='fact',
        payload={'fact_key': 'status', 'fact_value': 'Dead', 'subject_entity_id': subject.entity_id}, expected_brain_version=1)
    assert not repo.get_current_state('story').get('entities')
    repo.accept_proposal_group('story', [proposal.proposal_id], 1)
    assert repo.get_current_state('story')['entities'][subject.entity_id]['status'] == 'Dead'
    context = repo.get_structured_context('story', chapter_number=1)
    assert any(f['fact_key'] == 'status' and f['fact_value'] == 'Dead' for f in context.world_rules)


def test_extracted_fact_resolves_subject_name_across_repositories(repo):
    from domain.models import NarrativeProposal
    proposal = NarrativeProposal('fact-by-name', 'fact', {'fact_key': 'hearing', 'fact_value': 'left-ear deafness',
        'subject_entity_name': 'Minh', 'chapter_number': 1}, dependency_group_id='fact-group')
    repo.save_proposals('story', [proposal])
    repo.accept_proposal_group('story', [proposal.proposal_id], 1)
    subject = next(e for e in repo.list_entities('story') if e.name == 'Minh')
    assert repo.get_current_state('story')['entities'][subject.entity_id]['hearing'] == 'left-ear deafness'


def test_author_proposal_rejects_forged_source_or_event_identity():
    repo, service, _ = make_service('Duy tới kho.', None)
    args = dict(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev', quote='Duy tới kho.',
                proposal_type='event', payload={'event_type': 'arrival', 'summary': 'Duy tới kho.', 'supersedes_id': 'other'},
                expected_brain_version=1)
    with pytest.raises(ValueError, match='Unsupported fields'):
        service.create_author_proposal(**args)
    assert not repo.list_proposals('novel')


def test_event_cannot_use_invented_evidence_quote():
    from services.event_summarizer import extract_narrative_events
    with pytest.raises(ValueError, match='not present'):
        extract_narrative_events('Duy tới kho.', [{'name': 'Duy'}], Responses({'events': [
            {'event_type': 'arrival', 'summary': 'Duy tới trạm.', 'evidence_quote': 'Duy tới trạm.'}]}))


@pytest.mark.parametrize('operation,field', [('event_extraction', 'events'), ('prose_fact_extraction', 'facts')])
def test_gemini_receives_schema_for_event_and_fact_batches(operation, field):
    from types import SimpleNamespace
    from unittest.mock import patch
    from core.llm_service import LLMService
    from tests.test_m0_repairs import fake_google
    captured = []
    response = SimpleNamespace(text=json.dumps({field: []}), candidates=[SimpleNamespace(finish_reason='STOP')])
    module = fake_google(response, captured)
    service = LLMService(provider='gemini', api_key='test-key', model='test-model')
    with patch.dict('sys.modules', {'google': SimpleNamespace(genai=module), 'google.genai': module}):
        service._call_structured(operation=operation, system_prompt='schema', user_prompt='synthetic source')
    assert captured[0]['config']['response_json_schema']['properties'][field]['type'] == 'array'


def test_resolve_grounded_quote_with_llm_repair():
    from services.source_grounding import resolve_grounded_quote
    text = "Ở giây thứ bốn mươi mốt có giọng đàn ông. Không phải một câu đầy đủ. Mở cửa Bốn."
    bad_quote = "Ở giây thứ bốn mươi mốt có giọng đàn ông. [...] Mở cửa Bốn."
    llm = Responses({'exact_quote': 'Ở giây thứ bốn mươi mốt có giọng đàn ông. Không phải một câu đầy đủ. Mở cửa Bốn.'})
    start, end, repaired = resolve_grounded_quote(text, bad_quote, context_hint="audio", llm_service=llm, max_retries=2)
    assert text[start:end] == repaired
    assert repaired == text


def test_resolve_grounded_quote_with_heuristic_segment_fallback():
    from services.source_grounding import resolve_grounded_quote
    text = "Đoạn đầu câu chuyện ở trạm Bốn rất dài và đầy đủ chi tiết. Đoạn kết thúc ở đây."
    bad_quote = "Đoạn đầu câu chuyện ở trạm Bốn rất dài và đầy đủ chi tiết. [...] Đoạn kết thúc ở đây."
    # With no LLM, it should fall back to longest unique contiguous subsegment >= 20 chars
    start, end, repaired = resolve_grounded_quote(text, bad_quote, llm_service=None)
    assert text[start:end] == repaired
    assert repaired == "Đoạn đầu câu chuyện ở trạm Bốn rất dài và đầy đủ chi tiết"


def test_resolve_grounded_quote_with_collapsed_newlines():
    from services.source_grounding import resolve_grounded_quote
    text = "Từ dưới sàn vang lên ba tiếng gõ ngắn.\n\nLinh bất động. Một giây sau có tiếng thứ tư."
    collapsed_quote = "Từ dưới sàn vang lên ba tiếng gõ ngắn. Linh bất động. Một giây sau có tiếng thứ tư."
    start, end, repaired = resolve_grounded_quote(text, collapsed_quote, llm_service=None)
    assert text[start:end] == repaired
    assert repaired == text

