import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from core.llm_service import LLMService, LLMServiceError
from core.writing_output import parse_writing_output
from application.writing_service import WritingService
from domain.models import WritingContextPackage, WritingPatch


def test_valid_dialogue_decodes_quotes_and_newlines_without_changing_prose():
    prose = '\n\n"Mahiru..." Amane thì thầm.\n\nCô quay lại.'
    raw = json.dumps({'draft_text': prose, 'explanation': 'Tiếp nối hội thoại'}, ensure_ascii=False)
    assert parse_writing_output(raw) == prose
    assert parse_writing_output('```json\n' + raw + '\n```') == prose


@pytest.mark.parametrize('response', [
    '{"draft_text":"\\n\\n"Mahiru..." Amane thì thầm.","explanation":"x"}',
    '{"draft_text":"unfinished', '{"explanation":"No draft"}',
    '{"draft_text":{"text":"not prose"}}', '{"draft_text":""}',
    '[]', 'unstructured prose', json.dumps({'draft_text': '{"draft_text":"nested"}'})
])
def test_bad_protocol_never_becomes_manuscript_even_with_local_fallback_enabled(response):
    service = LLMService(provider='gemini', api_key='test-key')
    with patch.object(service, '_call_llm', return_value=response), patch.dict('os.environ', {'LLM_LOCAL_FALLBACK': 'true'}):
        with pytest.raises(LLMServiceError):
            service.generate_writing_draft(operation='continue')


def test_writing_uses_json_schema_and_separate_budget_without_leaking_options_to_extraction():
    prose = '\n"Mahiru..." Amane nói.\nCô quay lại.'
    generate = Mock(return_value=SimpleNamespace(text=json.dumps({'draft_text': prose}), candidates=[]))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    service = LLMService(provider='gemini', api_key='test-key', max_tokens=512)
    with patch('google.genai.Client', return_value=client):
        result = service.generate_writing_draft(operation='continue', start_offset=7, end_offset=7)
        assert result['draft_text'] == prose and result['patch'] == {'start': 7, 'end': 7, 'replacement': prose}
        config = generate.call_args.kwargs['config']
        assert config['response_mime_type'] == 'application/json'
        assert config['max_output_tokens'] >= 4096
        service._call_gemini('Extract entities', 'Amane meets Mahiru')
        assert generate.call_args.kwargs['config']['max_output_tokens'] == 512
        assert 'response_mime_type' not in generate.call_args.kwargs['config']


def test_truncated_provider_response_is_rejected():
    response = SimpleNamespace(text='{"draft_text":"cut off', candidates=[SimpleNamespace(finish_reason='MAX_TOKENS')])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=Mock(return_value=response)))
    service = LLMService(provider='gemini', api_key='test-key')
    with patch('google.genai.Client', return_value=client), patch.dict('os.environ', {'LLM_LOCAL_FALLBACK': 'false'}):
        with pytest.raises(LLMServiceError, match='giới hạn'):
            service.generate_writing_draft(operation='continue')


def test_validation_blocks_wrapped_json_from_alternative_adapters():
    raw = '{"draft_text":"prose"}'
    checks = WritingService(None, None)._validate_draft(draft_text=raw,
        patch=WritingPatch(start=0, end=0, replacement=raw), context_package=WritingContextPackage(brain_version=1),
        constraints=(), instruction='', base_content_length=0)
    assert any(c.code == 'INVALID_WRITING_OUTPUT' and not c.passed for c in checks)
