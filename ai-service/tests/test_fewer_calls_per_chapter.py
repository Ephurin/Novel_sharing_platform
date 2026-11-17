"""Live retest 9 cost: state changes for all events come from one call, and facts plus world rules
come from one call (was one call per event, plus two)."""
import json

import pytest

from domain.models import NarrativeProposal
from services.chapter_facts import extract_chapter_facts
from services.state_transition_proposals import generate_chapter_state_transitions

TEXT = "Trần Vũ bị thương ở vai. Lôi Kiếm chỉ nhận chủ mang huyết mạch Lôi tộc. Lam Yên cứu Trần Vũ."


class Recorder:
    def __init__(self, answer):
        self.answer, self.calls = answer, []

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.calls.append((operation, json.loads(user_prompt)))
        return json.dumps(self.answer, ensure_ascii=False)


def event(pid, participants):
    return NarrativeProposal(proposal_id=pid, proposal_type="event",
                             payload={"summary": pid, "participants": participants}, analysis_run_id="r",
                             dependency_group_id="g", materialization_order=0, evidence={}, confidence=1,
                             expected_brain_version=1)


def test_state_changes_of_all_events_come_from_one_call():
    llm = Recorder({"transitions": [
        {"event_index": 0, "entity": "e-vu", "attribute_key": "health", "new_value": 60, "confidence": 0.9},
        {"event_index": 1, "entity": "e-lam", "attribute_key": "location", "new_value": "Táng Lôi", "confidence": 0.8},
        {"event_index": 1, "entity": "e-vu", "attribute_key": "health", "new_value": 80, "confidence": 0.9},
        {"event_index": 7, "entity": "e-vu", "attribute_key": "health", "new_value": 1, "confidence": 0.9},
        {"event_index": 0, "entity": "e-lam", "attribute_key": "health", "new_value": 1, "confidence": 0.9}]})
    events = [event("ev1", ["e-vu"]), event("ev2", ["e-lam", "e-vu"]), event("ev3", [])]
    out = generate_chapter_state_transitions(events, llm, identity_inventory=[], identity_resolver=lambda x: x)
    assert [op for op, _ in llm.calls] == ["hitl_state_extraction_batch"]
    assert [e["event_index"] for e in llm.calls[0][1]["events"]] == [0, 1]  # no participants: not asked
    assert [p.payload["entity_id"] for p in out["ev1"]] == ["e-vu"]  # e-lam is not in ev1: dropped
    assert sorted(p.payload["entity_id"] for p in out["ev2"]) == ["e-lam", "e-vu"]
    assert "ev3" not in out


def test_a_chapter_without_participants_makes_no_state_call():
    llm = Recorder({"transitions": []})
    assert generate_chapter_state_transitions([event("ev", [])], llm, identity_inventory=[],
                                              identity_resolver=lambda x: x) == {}
    assert llm.calls == []


def test_facts_and_world_rules_come_from_one_call():
    llm = Recorder({
        "facts": [{"subject": "", "fact_key": "injury", "fact_value": "vai", "certainty": "confirmed",
                   "quote": "Trần Vũ bị thương ở vai", "confidence": 0.9}],
        "world_rules": [{"rule": "Lôi Kiếm chỉ nhận chủ mang huyết mạch Lôi tộc.",
                         "quote": "Lôi Kiếm chỉ nhận chủ mang huyết mạch Lôi tộc", "confidence": 0.9}]})
    facts, rules = extract_chapter_facts(TEXT, llm, [], ["Một luật cũ"])
    assert [op for op, _ in llm.calls] == ["chapter_fact_extraction"]
    assert llm.calls[0][1]["known_rules"] == ["Một luật cũ"]
    assert [f.fact_key for f in facts] == ["injury"]
    assert rules[0]["start"] == TEXT.index("Lôi Kiếm") and rules[0]["confidence"] == 0.9


def test_bad_world_rules_are_skipped_but_bad_facts_still_fail():
    good_fact = {"subject": "", "fact_key": "injury", "fact_value": "vai", "certainty": "confirmed",
                 "quote": "Trần Vũ bị thương ở vai", "confidence": 0.9}
    facts, rules = extract_chapter_facts(TEXT, Recorder({"facts": [good_fact], "world_rules": [{"rule": ""}]}))
    assert len(facts) == 1 and rules == []
    with pytest.raises(ValueError):
        extract_chapter_facts(TEXT, Recorder({"facts": [{"fact_key": "x"}], "world_rules": []}))
