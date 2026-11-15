"""Findings from the P2 live retest on main (2026-11-15): N1 name style, N6 location variants and
issue 11 draft length."""
import json

import pytest

from core.llm_service import LLMService
from core.output_language import VIETNAMESE_TEXT_OUTPUT
from core.writing_output import length_requirement, requested_words
from services.entity_pipeline.verification import base_name, honorific_variant, verify_entities


def test_n1_new_names_follow_vietnamese_style():
    assert 'Hán-Việt' in VIETNAMESE_TEXT_OUTPUT and 'Tên riêng mới' in VIETNAMESE_TEXT_OUTPUT


@pytest.mark.parametrize('instruction, words', [
    ('Viết tiếp khoảng 500 chữ, giữ giọng văn', 500),
    ('viết 400 từ cho cảnh này', 400),
    ('Write about 300 words', 300),
    ('Chương 3 có hai cảnh', None),
    ('khoảng 5 chữ', None),
    ('', None),
])
def test_requested_words(instruction, words):
    assert requested_words(instruction) == words


def test_writing_prompt_states_the_requested_length():
    seen = {}
    svc = LLMService.__new__(LLMService)

    def call(*, system_prompt, user_prompt, **_):
        seen.update(system=system_prompt, user=user_prompt)
        return json.dumps({'draft_text': 'Một đoạn văn.', 'explanation': 'x'})

    svc._call_llm = call
    svc.model, svc.provider = 'test-model', 'test'
    svc.generate_writing_draft(operation='continue', instruction='Viết tiếp khoảng 500 chữ', cursor_offset=0)
    assert length_requirement('Viết tiếp khoảng 500 chữ') in seen['user']
    assert 'không ít hơn 450 chữ' in seen['user']
    svc.generate_writing_draft(operation='continue', instruction='Viết tiếp', cursor_offset=0)
    assert 'Độ dài bắt buộc' not in seen['user']


def test_n6_location_head_is_a_variant_only_for_locations():
    assert base_name('Làng Thạch Khê', 'LOC') == 'Thạch Khê'
    assert honorific_variant('Làng Thạch Khê', 'Thạch Khê', 'LOC')
    assert base_name('Làng Thạch Khê', 'PER') == 'Làng Thạch Khê'
    assert base_name('Chùa Cầu', 'LOC') == 'Chùa Cầu'      # "chùa" is part of this name, not a head


def test_n6_village_and_bare_name_become_one_location():
    class LLM:
        def _call_structured(self, *, operation, system_prompt, user_prompt):
            out = []
            for c in json.loads(user_prompt)['candidates']:
                if c['surface'] in ('Thạch Khê', 'Làng Thạch Khê'):
                    out.append({'candidate_id': c['candidate_id'], 'verdict': 'entity', 'entity_type': 'LOC',
                                'canonical_name': c['surface'], 'reason': 'địa danh'})
                else:
                    out.append({'candidate_id': c['candidate_id'], 'verdict': 'not_entity', 'reason': 'khác'})
            return json.dumps({'decisions': out}, ensure_ascii=False)

    audit = {}
    result = verify_entities('Hôm ấy ở Làng Thạch Khê có mưa. Cả Thạch Khê đều nghe tiếng sấm.', LLM(),
                             lambda *_: [], audit_sink=lambda a: audit.update(a))
    assert [e['phrase'] for e in result.entities] == ['Thạch Khê']
    assert [(a['alias'], a['entity_name']) for a in result.aliases] == [('Làng Thạch Khê', 'Thạch Khê')]
