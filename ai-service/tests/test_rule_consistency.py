"""#146 / F-LIVE-05: rule-aware consistency check returns only grounded violations."""
import json

from core.llm_service import response_schema_for
from services.rule_consistency import RuleCheckBatch, check_world_rules, world_rules_from_facts

TEXT = 'Hắn không đeo ngọc. Hắn lội xuống dòng nước lũ. Khi lên bờ, Lâm Phong vẫn nhớ rõ mọi chuyện.'
RULES = [{'rule_id': 'r1', 'text': 'Mỗi mùa lũ, nước hồ xóa một ký ức của người chạm vào nó.'}]


class LLM:
    def __init__(self, payload):
        self.payload, self.calls = payload, []

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.calls.append((operation, json.loads(user_prompt)))
        return json.dumps(self.payload)


def test_grounded_violation_is_reported_with_rule_text():
    llm = LLM({'findings': [{'rule_id': 'r1', 'verdict': 'violates', 'quote': 'Lâm Phong vẫn nhớ rõ mọi chuyện',
                             'explanation': 'Chạm nước lũ mà không mất ký ức.'}]})
    out = check_world_rules(TEXT, RULES, llm)
    assert out == [{'rule_id': 'r1', 'rule_text': RULES[0]['text'], 'quote': 'Lâm Phong vẫn nhớ rõ mọi chuyện',
                    'explanation': 'Chạm nước lũ mà không mất ký ức.'}]
    assert llm.calls[0][0] == 'rule_consistency' and llm.calls[0][1]['world_rules'] == RULES


def test_ungrounded_unknown_and_non_violation_items_are_dropped():
    llm = LLM({'findings': [
        {'rule_id': 'r1', 'verdict': 'violates', 'quote': 'câu không có trong chương'},
        {'rule_id': 'r9', 'verdict': 'violates', 'quote': 'Hắn không đeo ngọc'},
        {'rule_id': 'r1', 'verdict': 'consistent', 'quote': 'Hắn không đeo ngọc'},
        {'rule_id': 'r1', 'verdict': 'violates', 'quote': ''}]})
    assert check_world_rules(TEXT, RULES, llm) == []


def test_no_rules_or_no_text_makes_no_call():
    llm = LLM({'findings': []})
    assert check_world_rules(TEXT, [], llm) == [] and check_world_rules('  ', RULES, llm) == []
    assert llm.calls == []


def test_world_rules_from_effective_facts():
    facts = [{'fact_id': 'a', 'fact_type': 'world_rule', 'fact_value': 'Quy tắc A'},
             {'fact_id': 'b', 'fact_type': 'world_rule', 'fact_value': {'text': 'Quy tắc B'}},
             {'fact_id': 'c', 'fact_type': 'world_rule', 'fact_value': 'cũ', 'is_retired': True},
             {'fact_id': 'd', 'fact_type': 'status', 'fact_value': 'Alive'}]
    assert world_rules_from_facts(facts) == [{'rule_id': 'a', 'text': 'Quy tắc A'}, {'rule_id': 'b', 'text': 'Quy tắc B'}]


def test_gemini_is_constrained_to_the_rule_schema():
    assert response_schema_for('rule_consistency') == RuleCheckBatch.model_json_schema()
