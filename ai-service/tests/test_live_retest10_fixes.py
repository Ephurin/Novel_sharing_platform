"""Live retest 10: X2 (a paraphrased repeat of a recent event is flagged), X3 (events, aliases and
facts can be rejected one by one; an event takes its state changes) and X4 (an approved alias is not
proposed again)."""
from types import SimpleNamespace

from application.entity_hitl import approved_alias_keys
from domain.event_duplicates import possible_repeat
from domain.models import NarrativeProposal
from domain.proposal_dependencies import can_reject_individually, rejection_set

CH9 = SimpleNamespace(event_id="e9", chapter=9, summary="Thượng cổ Lôi Long truyền tải những ký ức vỡ vụn về "
                      "thời đại hồng hoang vào thức hải của Trần Vũ, đồng thời mảnh Lôi Kiếm cộng hưởng.")
CH8 = SimpleNamespace(event_id="e8", chapter=8, summary="Một đạo hư ảnh của Thượng cổ Lôi Long xuất hiện trên "
                      "đỉnh cột sáng, khiến ký ức của Trần Vũ rục rịch chuyển động.")
REPEAT = {"summary": "Thượng cổ Lôi Long truyền tải các đoạn ký ức đứt đoạn từ thời thượng cổ vào thức hải "
                     "của Trần Vũ thông qua một luồng thần niệm uy nghiêm.", "chapter_number": 10}
NEW = {"summary": "Trần Vũ áp sát và đưa tay chạm vào chiếc sừng của Thượng cổ Lôi Long, khiến ý thức bị "
                  "cuốn vào dòng xoáy thời gian hồng hoang.", "chapter_number": 10}


def test_x2_a_paraphrased_repeat_of_a_recent_event_is_flagged():
    event, overlap = possible_repeat(REPEAT, [], [CH8, CH9])
    assert event is CH9 and overlap >= 0.35


def test_x2_a_different_event_or_an_old_chapter_is_not_flagged():
    assert possible_repeat(NEW, [], [CH8, CH9]) is None
    old = SimpleNamespace(event_id="e3", chapter=3, summary=CH9.summary)
    assert possible_repeat(REPEAT, [], [old]) is None
    assert possible_repeat({**REPEAT, "supersedes_id": "e9"}, [], [CH9]) is None


def proposal(pid, kind, payload):
    return NarrativeProposal(proposal_id=pid, proposal_type=kind, payload=payload, analysis_run_id="r",
                             dependency_group_id="g", materialization_order=0, evidence=(), confidence=1,
                             expected_brain_version=1)


GROUP = [
    proposal("ent", "entity", {"entity_id": "id-new", "canonical_name": "Lôi Long", "normalized_name": "lôi long",
                               "entity_type": "PER"}),
    proposal("ali", "alias", {"alias": "làng Thạch Khê", "entity_id": "id-tk"}),
    proposal("fac", "fact", {"fact_key": "injury", "fact_value": "vai", "subject_entity_id": "id-vu"}),
    proposal("ev1", "event", {"summary": "lặp", "participants": ["id-vu", "id-new"]}),
    proposal("st1", "state_transition", {"event_id": "ev1", "entity_id": "id-vu", "attribute_key": "health",
                                         "new_value": 60}),
    proposal("ev2", "event", {"summary": "mới", "participants": ["id-vu"]}),
]


def test_x3_an_event_is_rejected_with_its_state_changes_only():
    assert [p.proposal_id for p in rejection_set(GROUP[3], GROUP)] == ["ev1", "st1"]
    assert [p.proposal_id for p in rejection_set(GROUP[5], GROUP)] == ["ev2"]


def test_x3_aliases_facts_and_states_can_be_rejected_alone():
    assert all(can_reject_individually(GROUP[i], GROUP) for i in (1, 2, 4))


def test_x3_a_reviewed_entity_used_by_others_still_needs_the_whole_group():
    assert rejection_set(GROUP[0], GROUP) is None
    referenced = proposal("ev3", "event", {"summary": "x", "participants": []})
    user = proposal("fx", "fact", {"fact_key": "about", "fact_value": "ev3"})
    assert rejection_set(referenced, [referenced, user]) is None


def test_x4_approved_alias_pairs_are_read_from_the_registry():
    repo = SimpleNamespace(get_entity_registry=lambda novel: {"aliases": [{"alias": "Làng Thạch Khê", "entity_id": "tk"}]})
    assert approved_alias_keys(repo, "n") == {("làng thạch khê", "tk")}
    assert approved_alias_keys(SimpleNamespace(), "n") == set()
