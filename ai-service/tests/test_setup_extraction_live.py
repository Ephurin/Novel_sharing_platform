"""#144 / F-LIVE-01: real-model setup extraction and blueprint (provider stubbed)."""
import json

from api.setup_schemas import BlueprintOutput, ExtractOutput
from core.llm_service import LLMService, response_schema_for
from core.setup_extraction import BlueprintSuggestion, SetupTextExtraction, clean_blueprint, ground_extraction

TEXT = 'Thành Bích Thủy nằm trên một hồ lớn. Lâm Phong là người lái đò. Mỗi mùa lũ, nước hồ xóa một ký ức.'


def test_grounding_computes_spans_and_drops_non_verbatim_items():
    raw = {'entities': [{'entity_type': 'location', 'display_name': 'Bích Thủy'},
                        {'entity_type': 'character', 'display_name': 'Lâm Phong'},
                        {'entity_type': 'character', 'display_name': 'Lam Phong'},      # not verbatim
                        {'entity_type': 'character', 'display_name': 'Lâm Phong'}],     # duplicate
           'world_rules': [{'text': 'Mỗi mùa lũ, nước hồ xóa một ký ức.'},
                           {'text': 'Nước hồ luôn xóa ký ức.'}]}                       # paraphrase
    out = ground_extraction(TEXT, json.dumps(raw))
    parsed = ExtractOutput.model_validate(out)  # the SetupService contract
    assert [e.display_name for e in parsed.entities] == ['Bích Thủy', 'Lâm Phong']
    assert [r.text for r in parsed.world_rules] == ['Mỗi mùa lũ, nước hồ xóa một ký ức.']
    for item in [*parsed.entities, *parsed.world_rules]:
        ref = item.source_ref
        assert TEXT[ref.start:ref.end] == ref.quote


def test_blueprint_is_trimmed_and_valid():
    raw = {'entities': [{'entity_type': 'character', 'display_name': f'N{i}'} for i in range(8)],
           'world_rules': ['  Quy tắc 1 ', '', 'Quy tắc 2', 'Quy tắc 3', 'Quy tắc 4', 'Quy tắc 5']}
    out = BlueprintOutput.model_validate(clean_blueprint(json.dumps(raw)))
    assert len(out.entities) == 5 and out.world_rules == ['Quy tắc 1', 'Quy tắc 2', 'Quy tắc 3']


def test_llm_service_methods_send_only_allowed_fields():
    calls = []
    service = LLMService.__new__(LLMService)
    def fake(*, operation, system_prompt, user_prompt):
        calls.append((operation, json.loads(user_prompt)))
        return json.dumps({'entities': [], 'world_rules': []})
    service._call_structured = fake
    service.extract_setup_text(text=TEXT, locale='vi-VN')
    service.suggest_setup_blueprint(setup={'text': 'Ý tưởng', 'declarations': [{'secret': 1}]}, outline='Dàn ý',
                                    preferences={'private_notes': 'không gửi'}, locale='vi-VN')
    assert calls[0] == ('setup_text_extraction', {'text': TEXT, 'locale': 'vi-VN'})
    assert calls[1] == ('setup_blueprint', {'idea': 'Ý tưởng', 'outline': 'Dàn ý', 'locale': 'vi-VN'})


def test_gemini_is_constrained_to_setup_schemas():
    assert response_schema_for('setup_text_extraction') == SetupTextExtraction.model_json_schema()
    assert response_schema_for('setup_blueprint') == BlueprintSuggestion.model_json_schema()


def test_html_entities_from_the_model_are_decoded():
    raw = {'entities': [{'entity_type': 'location', 'display_name': 'B&#xED;ch Th&#x1ee7;y'}], 'world_rules': []}
    assert ground_extraction(TEXT, json.dumps(raw))['entities'][0]['display_name'] == 'Bích Thủy'
    bp = clean_blueprint(json.dumps({'entities': [{'entity_type': 'character', 'display_name': 'L&#xE2;m Phong'}],
                                     'world_rules': ['Ng&#x1b0;&#x1edd;i']}))
    assert bp == {'entities': [{'entity_type': 'character', 'display_name': 'Lâm Phong'}], 'world_rules': ['Người']}
