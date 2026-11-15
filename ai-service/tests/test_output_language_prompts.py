"""Long-run live test (2026-11-15), issue 10: brainstorm and setup suggestions came back sometimes in
English. Every author-facing generation prompt now names the output language, and Vietnamese
context reaches the model as text, not \\uXXXX escapes."""
import json

from core.llm_service import LLMService
from core.output_language import VIETNAMESE_TEXT_OUTPUT, output_language_rule


class Capture:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def __call__(self, *, operation, system_prompt, user_prompt, **_):
        self.calls.append({'operation': operation, 'system': system_prompt, 'user': user_prompt})
        return self.reply


def service(reply):
    svc = LLMService.__new__(LLMService)
    svc._call_structured = Capture(reply)
    return svc


def test_rule_defaults_to_vietnamese_and_follows_other_locales():
    assert output_language_rule() == VIETNAMESE_TEXT_OUTPUT
    assert output_language_rule('vi') == VIETNAMESE_TEXT_OUTPUT
    assert output_language_rule(None) == VIETNAMESE_TEXT_OUTPUT
    assert 'en-US' in output_language_rule('en-US')


def test_brainstorm_prompt_names_vietnamese_and_keeps_context_readable():
    svc = service(json.dumps({'world_rules': [], 'characters': [], 'future_events': []}))
    try:
        svc.suggest_brainstorm(instruction='Gợi ý nhân vật', known_entities=[{'name': 'Thu Hà'}],
                               world_rules=['Nước sông Hoài không bao giờ đóng băng'])
    except Exception:
        pass  # only the prompt matters here
    call = svc._call_structured.calls[0]
    assert call['system'].startswith(VIETNAMESE_TEXT_OUTPUT)
    assert 'Thu Hà' in call['user'] and 'sông Hoài' in call['user']
    assert '\\u' not in call['user']


def test_setup_blueprint_prompt_names_the_locale_language():
    svc = service(json.dumps({'entities': [], 'world_rules': []}))
    try:
        svc.suggest_setup_blueprint(setup={'text': 'Một cô gái sửa đồng hồ ở Hội An'}, locale='vi-VN')
    except Exception:
        pass
    assert svc._call_structured.calls[0]['system'].startswith(VIETNAMESE_TEXT_OUTPUT)


def test_idea_bootstrap_fallback_prompt_names_the_language():
    from application.bootstrap_service import ManuscriptBootstrapService as BootstrapService

    seen = {}

    class LLM:
        def _call_llm(self, *, system_prompt, user_prompt):
            seen.update(system=system_prompt, user=user_prompt)
            return json.dumps({'premise': 'Tiền đề', 'world_rules': [], 'entities': [], 'author_constraints': []})

    svc = BootstrapService.__new__(BootstrapService)
    svc._llm_service = LLM()
    svc._generate_blueprint(idea='Thợ sửa đồng hồ', preferences={'tone': 'u buồn'}, locale='vi-VN')
    assert seen['system'].startswith(VIETNAMESE_TEXT_OUTPUT)
    assert 'u buồn' in seen['user']
