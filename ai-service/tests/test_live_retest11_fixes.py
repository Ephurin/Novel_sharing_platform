"""Live retest 11: Y1 (main characters missing from the last two chapters are named in the writing
context, and events list companions present in a scene) and Y2 (status is kept for life status)."""
from application.cast_reminder import absent_main_characters
from application.context_budget import ContextBudgetPacker
from application.entity_hitl import HITL_EVENT_INSTRUCTIONS
from domain.models import WritingContextPackage
from services.prose_facts import ProseFact, life_status_key

ENTITIES = [
    {"entity_id": "vu", "name": "Trần Vũ", "entity_type": "character", "location": "Táng Lôi"},
    {"entity_id": "yen", "name": "Lam Yên", "entity_type": "character",
     "location": "Táng Lôi (xuất hiện gần nhất, chương 8)"},
    {"entity_id": "co", "name": "Cổ Thiết", "entity_type": "character", "location": "Lôi Sơn"},
    {"entity_id": "ts", "name": "Táng Lôi", "entity_type": "LOC", "location": ""},
]


def event(chapter, order, *who, summary="..."):
    return {"event_id": f"e{chapter}{order}", "chapter_number": chapter, "narrative_order": order,
            "summary": summary, "participants": list(who)}


EVENTS = [event(7, 1, "vu", "yen"), event(8, 1, "vu", "yen", "ts", summary="Trần Vũ kéo Lam Yên vào thung lũng."),
          event(9, 1, "vu"), event(10, 1, "vu"), event(5, 1, "co")]


def test_y1_a_recurring_character_absent_from_the_last_two_chapters_is_reminded():
    absent = absent_main_characters(ENTITIES, EVENTS)
    assert [a["name"] for a in absent] == ["Lam Yên"]  # Cổ Thiết has one event only; Trần Vũ is present
    assert absent[0]["last_event_chapter"] == 8 and "Lam Yên" in absent[0]["last_event"]
    assert "chương 8" in absent[0]["location"]


def test_y1_the_reminder_reaches_the_writing_prompt_context():
    package = WritingContextPackage(brain_version=1, entities=tuple(ENTITIES), recent_events=tuple(EVENTS))
    assert ContextBudgetPacker.prompt_context(package)["absent_main_characters"][0]["entity_id"] == "yen"
    present = WritingContextPackage(brain_version=1, entities=tuple(ENTITIES),
                                    recent_events=tuple([*EVENTS, event(10, 2, "yen")]))
    assert "absent_main_characters" not in ContextBudgetPacker.prompt_context(present)


def test_y1_events_list_companions_present_in_the_scene():
    assert "present in that scene" in HITL_EVENT_INSTRUCTIONS


def fact(key, value):
    return ProseFact(subject="md", fact_key=key, fact_value=value, certainty="confirmed", quote="q")


def test_y2_status_is_kept_for_life_status_only():
    assert life_status_key(fact("status", "Unconscious")).fact_key == "condition"
    assert life_status_key(fact("status", "Dead")).fact_key == "status"
    assert life_status_key(fact("Status", "alive")).fact_key == "Status"
    assert life_status_key(fact("injury", "vai")).fact_key == "injury"
