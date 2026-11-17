"""Live retest 9: W1 (one surface, one identity per chapter; a short name inside one known full name
is grounded by that full name in context) and W2 (an approved alias of the same entity is decided
without the model)."""
import json

from services.entity_pipeline.candidates import CandidateInventory
from services.entity_pipeline.verification import KNOWN_NAME_REASON, known_name_decisions, verify_entities

DRAGON = {"entity_id": "e-long", "name": "Thượng cổ Lôi Long", "entity_type": "PER"}
VILLAGE = {"entity_id": "e-tk", "name": "Thạch Khê", "entity_type": "LOC"}
FILLER = " Gió lạnh thổi qua thung lũng đá suốt một đêm dài." * 8
TEXT = ("Thượng cổ Lôi Long mở mắt; uy áp Lôi Long đè xuống." + FILLER +
        " Hư ảnh Lôi Long tan biến." + FILLER + " Thượng cổ Lôi Long gầm vang.")


class LinkingLLM:
    """Links every "Lôi Long" to the known dragon with a quote that lacks the full name; on repair
    it makes a new entity "Lôi Long" instead, as Gemini did in retest 9."""

    def __init__(self, repair_as_new=True):
        self.batches, self.repair_as_new = [], repair_as_new

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        request = json.loads(user_prompt)
        self.batches.append([c["surface"] for c in request["candidates"]])
        first = len(self.batches) == 1
        out = []
        for c in request["candidates"]:
            if c["surface"] == "Lôi Long":
                if first or not self.repair_as_new:
                    out.append({"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": "PER",
                                "canonical_name": DRAGON["name"], "canonical_entity_id": "e-long",
                                "identity_quote": "Lôi Long", "reason": "con rồng"})
                else:
                    out.append({"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": "PER",
                                "canonical_name": "Lôi Long", "reason": "tên riêng"})
            else:
                out.append({"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "từ thường"})
        return json.dumps({"decisions": out}, ensure_ascii=False)


def run(llm, text=TEXT, known=(DRAGON,), aliases=()):
    audit = {}
    verify_entities(text, llm, lambda *_: [], known_entities=list(known), known_aliases=list(aliases),
                    audit_sink=audit.update, guidance=[{"name": "Lôi Long"}], defer_materialization=True)
    surfaces = {c["candidate_id"]: c["surface"] for c in audit["candidates"]}
    return audit, [d for d in audit["decisions"] if surfaces[d["candidate_id"]] == "Lôi Long"]


def test_w1_a_short_name_with_the_full_name_in_context_links_without_a_repair():
    llm = LinkingLLM()
    audit, lol = run(llm)
    # Only the far occurrence, with no full name nearby, goes back for repair.
    assert len(llm.batches) == 2 and llm.batches[1] == ["Lôi Long"]
    linked = [d for d in lol if d["canonical_entity_id"] == "e-long"]
    assert linked and all(d["identity_quote"] == DRAGON["name"] for d in linked)
    assert len(linked) == 1  # "uy áp Lôi Long", next to the full name
    assert not [d for d in lol if d["verdict"] == "entity" and not d["canonical_entity_id"]]


def test_w1_one_surface_never_gets_a_new_identity_next_to_a_known_link():
    llm = LinkingLLM()
    audit, lol = run(llm)
    # The far "Hư ảnh Lôi Long" has no full name nearby: it is left to the author, not made a new entity.
    assert {d["verdict"] for d in lol} <= {"entity", "unresolved"}
    assert all(d["canonical_entity_id"] == "e-long" for d in lol if d["verdict"] == "entity")
    assert any(d["verdict"] == "unresolved" for d in lol)
    assert any(f["outcome"] == "unresolved" for f in audit["surface_identity_fixes"])


def test_w1_a_short_name_shared_by_two_known_names_is_not_grounded_automatically():
    other = {"entity_id": "e-long2", "name": "Hắc Lôi Long", "entity_type": "PER"}
    llm = LinkingLLM(repair_as_new=False)
    audit, lol = run(llm, known=(DRAGON, other))
    assert len(llm.batches) == 2  # the quote still needs the model's repair
    assert not [d for d in lol if d["verdict"] == "entity" and d["identity_quote"] == DRAGON["name"]]


def test_w2_an_approved_alias_of_the_same_entity_is_decided_without_the_model():
    inv = CandidateInventory("Họ về làng Thạch Khê.").collect(["Thạch Khê", "làng Thạch Khê"])
    mine = [{"alias": "làng Thạch Khê", "entity_id": "e-tk"}]
    village = next(c.candidate_id for c in inv.items if c.surface == "làng Thạch Khê")
    decided = known_name_decisions(inv.items, [VILLAGE], mine)
    assert decided[village].reason == KNOWN_NAME_REASON and decided[village].canonical_entity_id == "e-tk"
    theirs = [{"alias": "làng Thạch Khê", "entity_id": "e-other"}]
    assert village not in known_name_decisions(inv.items, [VILLAGE], theirs)
