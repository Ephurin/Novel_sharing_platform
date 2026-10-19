from application.context_budget import ContextBudgetPacker
from domain.models import WritingContextPackage
from services.prose_facts import extract_prose_facts
import json
import pytest


@pytest.mark.parametrize('budget', [4000, 8192])
def test_entities_do_not_starve_relevant_history_and_facts(budget):
    package = WritingContextPackage(brain_version=1,
        entities=tuple({'entity_id': f'e{i}', 'name': f'Person {i}', 'description': 'Long unrelated card ' * 30} for i in range(54)),
        current_states=(), recent_events=tuple({'event_id': f'event{i}', 'summary': f'Minh inspected archive {i}',
            'narrative_order': i, 'participants': ['Minh']} for i in range(20)),
        world_rules=tuple({'id': f'fact{i}', 'fact_key': 'status' if i == 0 else f'attribute{i}',
            'fact_value': 'Dead' if i == 0 else f'value{i}', 'subject_name': 'Minh'} for i in range(31)),
        context_summary={'requested_character': 'Minh'}, author_constraints=(), token_budget={})
    packed = ContextBudgetPacker().pack(package, maximum=budget)
    assert packed.token_budget['used'] <= budget
    assert packed.recent_events and packed.world_rules
    assert any(f['id'] == 'fact0' for f in packed.world_rules)
    assert packed.context_summary['drop_reasons']


def test_query_relevance_selects_source_reliability_before_unrelated_attributes():
    package = WritingContextPackage(brain_version=1, world_rules=(
        {'id': 'irrelevant', 'fact_key': 'color', 'fact_value': 'blue'},
        {'id': 'epistemic', 'fact_key': 'bell_location', 'fact_value': {'value': 'bell does not prove location', 'certainty': 'hypothesis'}},
    ), context_summary={'query_text': 'bell location'})
    packer = ContextBudgetPacker()
    budget = packer.estimate_prompt_tokens(WritingContextPackage(brain_version=1, world_rules=(package.world_rules[1],)))
    result = packer.pack(package, maximum=budget)
    assert [f['id'] for f in result.world_rules] == ['epistemic']


def test_coverage_pass_adds_physical_identity_and_uncertainty_with_source_evidence():
    text = 'Mảnh A có cạnh sơn đỏ và vết rạn thẳng. Tiếng còi chưa chứng minh nơi thu.'
    calls = []
    class LLM:
        def _call_llm(self, **kwargs):
            calls.append(kwargs)
            return json.dumps({'facts': []} if len(calls) == 1 else {'facts': [
                {'subject': 'Mảnh A', 'fact_key': 'edge_color', 'fact_value': 'red', 'certainty': 'confirmed',
                 'quote': 'Mảnh A có cạnh sơn đỏ và vết rạn thẳng.'},
                {'subject': '', 'fact_key': 'signal_location_evidence', 'fact_value': 'Not proven by whistle', 'certainty': 'hypothesis',
                 'quote': 'Tiếng còi chưa chứng minh nơi thu.'}]}, ensure_ascii=False)
    facts = extract_prose_facts(text, LLM(), ['Mảnh A'], review_coverage=True)
    assert len(calls) == 2
    assert facts[0].fact_key == 'edge_color' and facts[1].certainty == 'hypothesis'
    assert all(f.quote in text for f in facts)
