"""BB1: one contradiction about one character is reported once, even when it conflicts with two facts."""
import json
from types import SimpleNamespace

from services.rule_consistency import canon_facts_from_brain, check_canon

TEXT = ('Lam Yên vẫn đang ngồi bên bếp lửa ở làng Thạch Khê, chưa từng một lần rời khỏi làng. '
        'Trần Vũ vung kiếm chín lần mà không mất ký ức nào.')
SENTENCE = 'Lam Yên vẫn đang ngồi bên bếp lửa ở làng Thạch Khê'
RULES = [{'rule_id': 'r1', 'text': 'Mỗi lần dùng kiếm ấn, người cầm kiếm mất một ký ức.'}]
FACTS = [
    {'rule_id': 'entity:e2:last_seen', 'text': 'Lam Yên xuất hiện gần nhất ở Thiên Lôi Uyên (chương 17)', 'subject': 'e2'},
    {'rule_id': 'fact:f9', 'text': 'Lam Yên: location = Thiên Lôi Uyên', 'subject': 'e2'},
    {'rule_id': 'entity:e1:location', 'text': 'Trần Vũ ở Thiên Lôi Uyên', 'subject': 'e1'},
]


class LLM:
    def __init__(self, findings):
        self.findings, self.prompt = findings, None

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.prompt = json.loads(user_prompt)
        return json.dumps({'findings': self.findings})


def finding(rule_id, quote, explanation='Mâu thuẫn'):
    return {'rule_id': rule_id, 'verdict': 'violates', 'quote': quote, 'explanation': explanation}


def test_same_character_same_sentence_is_one_finding_listing_both_facts():
    llm = LLM([finding('entity:e2:last_seen', SENTENCE), finding('fact:f9', SENTENCE)])
    out = check_canon(TEXT, RULES, FACTS, llm)
    assert len(out) == 1
    assert out[0]['rule_id'] == 'entity:e2:last_seen' and out[0]['quote'] == SENTENCE
    assert out[0]['also'] == [{'rule_id': 'fact:f9', 'rule_text': 'Lam Yên: location = Thiên Lôi Uyên'}]


def test_overlapping_quotes_merge_and_keep_the_longer_quote():
    longer = SENTENCE + ', chưa từng một lần rời khỏi làng'
    out = check_canon(TEXT, RULES, FACTS, LLM([finding('entity:e2:last_seen', SENTENCE), finding('fact:f9', longer)]))
    assert len(out) == 1 and out[0]['quote'] == longer


def test_different_characters_rules_and_sentences_stay_separate():
    other = 'Trần Vũ vung kiếm chín lần mà không mất ký ức nào'
    out = check_canon(TEXT, RULES, FACTS, LLM([
        finding('entity:e2:last_seen', SENTENCE),
        finding('entity:e1:location', SENTENCE),   # another character, same sentence
        finding('r1', SENTENCE),                   # a world rule is a different problem
        finding('fact:f9', other),                 # same character, unrelated sentence
    ]))
    assert [(f['rule_id'], 'also' in f) for f in out] == [
        ('entity:e2:last_seen', False), ('entity:e1:location', False), ('r1', False), ('fact:f9', False)]


def test_subject_is_kept_out_of_the_prompt():
    llm = LLM([])
    check_canon(TEXT, RULES, FACTS, llm)
    assert all(set(item) == {'rule_id', 'text'} for item in llm.prompt['story_facts'])


def test_canon_facts_carry_the_character_they_describe():
    brain = SimpleNamespace(
        entities=[SimpleNamespace(entity_id='e1', name='Trần Vũ', location='làng Thạch Khê', approved_profile={'background': 'Thợ rèn'}),
                  SimpleNamespace(entity_id='e2', name='Lam Yên', location='Unknown', approved_profile={})],
        events=[])
    facts = [{'fact_id': 'f9', 'fact_type': 'narrative_fact', 'fact_key': 'location', 'fact_value': 'Thiên Lôi Uyên', 'subject_entity_id': 'e2'},
             {'fact_id': 'f10', 'fact_type': 'narrative_fact', 'fact_key': 'season', 'fact_value': 'Mùa đông'}]
    subjects = {item['rule_id']: item.get('subject') for item in canon_facts_from_brain(brain, facts)}
    assert subjects == {'entity:e1:location': 'e1', 'entity:e1:background': 'e1', 'fact:f9': 'e2', 'fact:f10': None}
