"""Long-run live test (2026-11-15), issues 5-9: Vietnamese extraction noise.

Per chapter there were 155-234 review items for about 8-10 real entities: sentence-initial common
words, syllables of multi-syllable names, known names matched as lowercase words, title prefixes
swallowing a clause, and common objects suggested as new entities."""
import json

from services.entity_pipeline.candidates import CandidateInventory, occurrences
from services.entity_pipeline.verification import verify_entities


def surfaces(inv):
    return [c.surface for c in inv.items]


def collected(text, known=()):
    inv = CandidateInventory(text).collect(known)
    removed = inv.prune(protected=known)
    return inv, removed


def test_known_names_keep_their_capitals():
    text = "Linh nghe tiếng linh hồn. Sông Hoài chảy. Cô ở bên sông Hoài lắm."
    assert [text[s:e] for s, e in occurrences(text, "Linh")] == ["Linh"]
    assert [text[s:e] for s, e in occurrences(text, "Lắm")] == []
    assert [text[s:e] for s, e in occurrences(text, "sông Hoài")] == ["Sông Hoài", "sông Hoài"]


def test_sentence_initial_common_words_are_dropped_but_names_kept():
    text = ("Tiếng gió rít. Chiếc đèn tắt. Dưới gầm bàn có tiếng động. Nếu Linh đến thì sao?\n"
            "Linh đứng dậy. Bọn trẻ cười, còn Linh thì không.")
    inv, removed = collected(text)
    left = surfaces(inv)
    assert not {"Tiếng", "Chiếc", "Dưới", "Bọn"} & set(left)
    assert left.count("Linh") == 3
    assert removed["sentence_initial_common_word"] >= 4


def test_a_word_capitalised_mid_sentence_is_not_common():
    # "Mây" opens a sentence and is also lowercase, but it is capitalised mid-sentence: a name.
    inv, _ = collected("Mây nhìn trời đầy mây. Hôm ấy Mây không nói.")
    assert surfaces(inv).count("Mây") == 2


def test_fragments_inside_a_longer_name_are_not_candidates():
    text = "Thu Hà gật đầu với Ba Lắm. Chị Thu Hà đi về phía Chùa Cầu. Hà cười."
    inv, removed = collected(text)
    left = surfaces(inv)
    for fragment in ("Thu", "Lắm", "Cầu", "Chị Thu"):
        assert fragment not in left
    assert left.count("Thu Hà") == 2          # bare name inside the honorific form is kept
    assert left.count("Hà") == 1              # only the standalone mention
    assert {"Ba Lắm", "Chị Thu Hà", "Chùa Cầu"} <= set(left)
    assert removed["nested_in_longer_name"] >= 5


def test_polluted_known_fragments_inside_known_names_are_dropped():
    known = ["Thu Hà", "Thu", "Hà", "Hội An", "Hội", "An", "sông Hoài", "Hoài"]
    inv, _ = collected("Thu Hà về Hội An, thuyền trôi trên sông Hoài.", known)
    assert set(surfaces(inv)) == {"Thu Hà", "Hội An", "sông Hoài"}


def test_known_name_beside_another_capitalised_word_is_kept():
    # "Linh Ba" is only a run of capitalised words, not a known or discovered name.
    inv, _ = collected("Hôm đó Linh Ba gặp nhau.", ["Linh"])
    assert "Linh" in surfaces(inv)


def test_phrase_led_by_a_common_word_is_dropped():
    inv, removed = collected("Giọng Ba Lắm trầm xuống. Ba Lắm và giọng nói ấy.")
    left = surfaces(inv)
    assert "Giọng Ba Lắm" not in left and left.count("Ba Lắm") == 2
    assert removed["leading_common_word"] >= 1


def test_title_prefix_does_not_swallow_a_clause():
    text = "Ông khẽ vỗ vai Linh. Ông tên Hòa đến. Họ dừng ở bến nước Hội An."
    inv = CandidateInventory(text).collect()
    titled = {c.surface for c in inv.items if "title_or_location" in c.origins}
    assert titled == {"Ông tên Hòa", "bến nước Hội An"}


class Verifier:
    """Machine suggestions as seen live: every fragment and object called a new entity."""

    def __init__(self, items):
        self.items = items

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        out = []
        for c in json.loads(user_prompt)["candidates"]:
            kind = self.items.get(c["surface"])
            if kind:
                out.append({"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": kind,
                            "canonical_name": c["surface"], "reason": "máy"})
            else:
                out.append({"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "khác"})
        return json.dumps({"decisions": out}, ensure_ascii=False)


def decisions_by_surface(audit):
    surface = {c["candidate_id"]: c["surface"] for c in audit["candidates"]}
    return {surface[d["candidate_id"]]: d for d in audit["decisions"]}


def discover(phrases):
    return lambda chunk, llm: [{"phrase": p} for p in phrases if p in chunk]


def test_weak_new_identities_are_held_for_the_author():
    text = "Thu Hà cầm gậy tre đi trước. Hà quay lại nhìn chiếc chìa khóa Bạc Long."
    audit = {}
    result = verify_entities(text, Verifier({"Thu Hà": "PER", "Hà": "PER", "gậy tre": "ITEM",
                                             "Bạc Long": "ITEM"}),
                             discover(["gậy tre", "Bạc Long"]), audit_sink=lambda a: audit.update(a))
    by = decisions_by_surface(audit)
    assert by["Thu Hà"]["verdict"] == "entity"
    assert by["Bạc Long"]["verdict"] == "entity"          # a named item stays
    assert by["Hà"]["verdict"] == "unresolved" and "Thu Hà" in by["Hà"]["reason"]
    assert by["gậy tre"]["verdict"] == "unresolved"
    assert {e["phrase"] for e in result.entities} == {"Thu Hà", "Bạc Long"}
    assert len(audit["held_new_identities"]) == 2


def test_declared_and_known_names_are_not_held():
    text = "Thu Hà đứng đó. Hà quay lại. Linh cầm gậy tre."
    audit = {}
    known = [{"entity_id": "e-linh", "name": "Linh", "entity_type": "PER"}]

    class LinkingVerifier(Verifier):
        def _call_structured(self, **kw):
            data = json.loads(super()._call_structured(**kw))
            for d in data["decisions"]:
                if d["verdict"] == "entity" and d["canonical_name"] == "Linh":
                    d["canonical_entity_id"] = "e-linh"
            return json.dumps(data, ensure_ascii=False)

    verify_entities(text, LinkingVerifier({"Thu Hà": "PER", "Hà": "PER", "Linh": "PER"}), discover([]),
                    known_entities=known, guidance=[{"name": "Hà"}], audit_sink=lambda a: audit.update(a))
    by = decisions_by_surface(audit)
    assert by["Hà"]["verdict"] == "entity"                 # the author declared "Hà"
    assert by["Linh"]["verdict"] == "entity" and by["Linh"]["canonical_entity_id"] == "e-linh"
    assert not audit.get("held_new_identities")
