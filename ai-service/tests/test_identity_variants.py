"""F-LIVE-18: honorific/label variants of one name become aliases of one identity, not new entities."""
import json

from services.entity_pipeline.verification import base_name, honorific_variant, verify_entities


class EchoLLM:
    """Simulates the live model: every candidate is an entity named exactly as written."""

    def __init__(self, names, types=None):
        self.names = set(names)
        self.types = types or {}

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        data = json.loads(user_prompt)
        return json.dumps({"decisions": [
            {"candidate_id": c["candidate_id"], "verdict": "entity",
             "entity_type": self.types.get(c["surface"], "PER"), "canonical_name": c["surface"], "reason": "tên riêng"}
            if c["surface"] in self.names else
            {"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "từ thường đầu câu"}
            for c in data["candidates"]]}, ensure_ascii=False)


def no_discovery(_text, _llm):
    return []


def run(text, names, known=(), types=None):
    audit = {}
    result = verify_entities(text, EchoLLM(set(names) | {k["name"] for k in known}, types), no_discovery, known_entities=list(known),
                             audit_sink=lambda a: audit.update(a), guidance=[{"name": n} for n in names])
    return result, audit


def test_base_name_strips_leading_honorific_or_label_only():
    assert base_name("ông Hòa", "PER") == "Hòa"
    assert base_name("Ông tên Hòa", "PER") == "Hòa"
    assert base_name("Chị Mai Linh", "PER") == "Mai Linh"
    assert base_name("mã CV-04", "ITEM") == "CV-04"
    assert base_name("ông già", "PER") == "ông già"      # no proper name left
    assert base_name("Hòa", "PER") == "Hòa"
    assert not honorific_variant("Mai", "Mai Linh", "PER")  # short-name fragments are ambiguous
    assert honorific_variant("bà Yên", "Yên", "PER")


def test_honorific_variants_merge_into_one_identity_with_aliases():
    text = "Ông Hòa mở cửa bến. Hòa nhìn ra sông. Chị Mai Linh gọi to. Mai Linh cười. Ông tên Hòa ấy đi."
    result, audit = run(text, ["Hòa", "Ông Hòa", "Ông tên Hòa", "Mai Linh", "Chị Mai Linh"])
    assert audit["status"] == "completed"
    assert sorted(e["phrase"] for e in result.entities) == ["Hòa", "Mai Linh"]
    aliases = {(a["alias"], a["entity_name"]) for a in result.aliases}
    assert ("Ông Hòa", "Hòa") in aliases and ("Ông tên Hòa", "Hòa") in aliases
    assert ("Chị Mai Linh", "Mai Linh") in aliases
    assert all(a["identity_quote"] and a["identity_quote"] in text for a in result.aliases)


def test_variant_links_to_known_entity_in_either_direction():
    known = [{"entity_id": "11111111-1111-1111-1111-111111111111", "name": "Bà Sâm", "entity_type": "PER"}]
    result, audit = run("Sâm ngồi xuống cạnh bếp.", ["Sâm"], known=known)
    assert audit["status"] == "completed"
    decisions = {d["canonical_name"]: d for d in audit["decisions"]}
    assert decisions["Bà Sâm"]["canonical_entity_id"] == known[0]["entity_id"]
    assert ("Sâm", "Bà Sâm") in {(a["alias"], a["entity_name"]) for a in result.aliases}


def test_label_prefix_variant_for_items():
    text = "Thiết bị mã CV-04 vẫn chạy. CV-04 phát tín hiệu."
    result, _ = run(text, ["CV-04", "mã CV-04"], types={"CV-04": "ITEM", "mã CV-04": "ITEM"})
    assert [e["phrase"] for e in result.entities] == ["CV-04"]
    assert ("mã CV-04", "CV-04") in {(a["alias"], a["entity_name"]) for a in result.aliases}


def test_variant_without_bare_name_stays_as_written():
    result, _ = run("Bà Yên kể chuyện cũ.", ["Bà Yên"])
    assert [e["phrase"] for e in result.entities] == ["Bà Yên"] and not result.aliases
