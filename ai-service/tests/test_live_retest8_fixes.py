"""Live retest 8: V1 (a repeated quote is located in the occurrence's own context), V2 ("làng Thạch
Khê" is the approved "Thạch Khê") and V3 (only invalid decisions go back to the model for repair)."""
import json
from types import SimpleNamespace

import pytest

from services.entity_pipeline.verification import (
    EntityDecision, KNOWN_NAME_REASON, _materializable, _validate, align_known_name, context_quote_span,
    known_name_decisions, status_quote_span, verify_entities)
from services.entity_pipeline.candidates import CandidateInventory

DRAGON = {"entity_id": "e-long", "name": "Thượng cổ Lôi Long", "entity_type": "PER"}
VILLAGE = {"entity_id": "e-tk", "name": "Thạch Khê", "entity_type": "LOC"}
KNOWN = {"e-long": DRAGON, "e-tk": VILLAGE}
FILLER = " Gió thổi qua thung lũng. " * 20
TEXT = ("Thượng cổ Lôi Long gầm lên." + FILLER +
        "Bóng Thượng cổ Lôi Long hiện ra; Lôi Long nhìn xuống." + FILLER + "Thượng cổ Lôi Long im lặng.")


def occurrence(surface, nth=0, margin=60):
    start = -1
    for _ in range(nth + 1):
        start = TEXT.find(surface, start + 1)
    return SimpleNamespace(candidate_id="c1", surface=surface, start=start, end=start + len(surface),
                           context_start=max(0, start - margin), context_end=min(len(TEXT), start + len(surface) + margin))


def alias(quote):
    return EntityDecision(candidate_id="c1", verdict="entity", entity_type="PER", canonical_name=DRAGON["name"],
                          canonical_entity_id="e-long", identity_quote=quote, reason="cùng con rồng")


def standalone_lol():
    # "Lôi Long" after the semicolon, not the one inside "Thượng cổ Lôi Long".
    start = TEXT.find("; Lôi Long") + 2
    return SimpleNamespace(candidate_id="c1", surface="Lôi Long", start=start, end=start + len("Lôi Long"),
                           context_start=start - 60, context_end=start + 60)


def test_v1_a_quote_repeated_in_the_chapter_is_found_in_this_occurrences_context():
    c = standalone_lol()
    assert TEXT.count(DRAGON["name"]) == 3
    start, end = context_quote_span(TEXT, DRAGON["name"], c)
    assert c.context_start <= start and end <= c.context_end
    _validate([alias(DRAGON["name"])], [c], TEXT, KNOWN, [DRAGON["name"], "Lôi Long"])


def test_v1_a_quote_only_outside_the_context_is_still_rejected():
    c = standalone_lol()
    with pytest.raises(ValueError, match="outside this occurrence"):
        _validate([alias("Thượng cổ Lôi Long im lặng")], [c], TEXT, KNOWN, [DRAGON["name"], "Lôi Long"])


def test_v1_a_status_quote_repeated_elsewhere_anchors_the_occurrence_it_contains():
    text = "Lão Hắc đã chết. Lão Hắc đã chết."
    c = SimpleNamespace(surface="Lão Hắc", start=17, end=24)
    assert status_quote_span(text, "Lão Hắc đã chết", c) == (17, 32)


def test_v1_the_alias_carries_the_located_quote_span():
    c = standalone_lol()
    decision = alias(DRAGON["name"]).model_dump()
    _, aliases = _materializable([c], [decision], KNOWN, TEXT)
    qs, qe = aliases[0]["quote_start"], aliases[0]["quote_end"]
    assert TEXT[qs:qe] == DRAGON["name"] and c.context_start <= qs


def test_v2_a_location_head_before_an_approved_name_is_decided_without_the_model():
    inv = CandidateInventory("Họ về làng Thạch Khê. Thạch Khê yên bình.").collect(["Thạch Khê", "làng Thạch Khê"])
    decided = known_name_decisions(inv.items, [VILLAGE], [])
    by_surface = {c.surface: decided.get(c.candidate_id) for c in inv.items}
    assert by_surface["làng Thạch Khê"].canonical_name == "Thạch Khê"
    assert by_surface["làng Thạch Khê"].canonical_entity_id == "e-tk"
    assert by_surface["làng Thạch Khê"].reason == KNOWN_NAME_REASON
    _validate([by_surface["làng Thạch Khê"]], [next(c for c in inv.items if c.surface == "làng Thạch Khê")],
              "Họ về làng Thạch Khê. Thạch Khê yên bình.", KNOWN, ["Thạch Khê", "làng Thạch Khê"])


def test_v2_a_model_link_by_id_with_the_surface_as_name_uses_the_known_name():
    c = SimpleNamespace(candidate_id="c1", surface="làng Thạch Khê")
    d = EntityDecision(candidate_id="c1", verdict="entity", entity_type="LOC", canonical_name="làng Thạch Khê",
                       canonical_entity_id="e-tk", reason="cùng làng")
    assert align_known_name(d, c, KNOWN).canonical_name == "Thạch Khê"
    other = d.model_copy(update={"canonical_name": "Bạch Vân"})
    assert align_known_name(other, c, KNOWN).canonical_name == "Bạch Vân"


class RepairLLM:
    """First answer: one decision invalid (unknown entity ID); the repair answer fixes it."""

    def __init__(self):
        self.batches = []

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        request = json.loads(user_prompt)
        candidates = request["candidates"]
        self.batches.append([c["surface"] for c in candidates])
        out = []
        for c in candidates:
            if c["surface"] == "Hồ Tâm":
                bad = len(self.batches) == 1
                out.append({"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": "PER",
                            "canonical_name": "Hồ Tâm", "canonical_entity_id": "e-missing" if bad else "",
                            "reason": "tên riêng"})
            else:
                out.append({"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "từ thường"})
        return json.dumps({"decisions": out}, ensure_ascii=False)


def test_v3_only_invalid_decisions_are_sent_back_for_repair():
    llm = RepairLLM()
    audit = {}
    verify_entities("Hồ Tâm nói. Đạo trưởng cười. Gã im.", llm, lambda *_: [], known_entities=[],
                    audit_sink=audit.update, guidance=[{"name": "Hồ Tâm"}, {"name": "Đạo"}, {"name": "Gã"}])
    assert len(llm.batches) == 2 and llm.batches[1] == ["Hồ Tâm"]
    assert len(llm.batches[0]) >= 3
    assert audit["partial_repairs"] == [{"batch_start": 0, "kept": len(llm.batches[0]) - 1, "repaired": 1}]
    verdicts = {d["candidate_id"]: d["verdict"] for d in audit["decisions"]}
    assert "unresolved" not in verdicts.values() and len(verdicts) == len(llm.batches[0])
