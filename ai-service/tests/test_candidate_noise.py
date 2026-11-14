"""Q-1: pronoun/title words, function-word phrases and lone surnames never reach verification."""
from services.entity_pipeline.candidates import CandidateInventory, noise_reason

TEXT = ("Anh quay cả người. Chị Mai Linh gọi. Khi Linh bước vào, Nguyễn Vũ đứng dậy. "
        "Nguyễn nói nhỏ. Ông Hòa gật đầu. Vũ cười. Bà Sâm múc cháo.")


def surfaces(inv):
    return {c.surface for c in inv.items}


def test_noise_is_pruned_and_real_names_kept():
    inv = CandidateInventory(TEXT).collect()
    assert {"Anh", "Khi Linh", "Nguyễn"} <= surfaces(inv)
    removed = inv.prune()
    left = surfaces(inv)
    assert not {"Anh", "Khi Linh", "Nguyễn"} & left
    assert {"Linh", "Mai Linh", "Chị Mai Linh", "Nguyễn Vũ", "Vũ", "Ông Hòa", "Hòa", "Bà Sâm", "Sâm"} <= left
    assert removed["pronoun_or_title"] >= 1 and removed["leading_function_word"] >= 1 and removed["lone_surname"] >= 1


def test_protected_names_survive():
    inv = CandidateInventory(TEXT).collect()
    inv.prune(protected=["Anh", "Nguyễn"])
    assert {"Anh", "Nguyễn"} <= surfaces(inv)


def test_reasons():
    assert noise_reason("Chị", set()) == "pronoun_or_title"
    assert noise_reason("Chị Mai Linh", set()) is None
    assert noise_reason("Nếu Duy", set()) == "leading_function_word"
    assert noise_reason("Nguyễn", set()) is None          # no fuller name in the chapter
    assert noise_reason("Nguyễn", {"nguyễn"}) == "lone_surname"
    assert noise_reason("Vũ", {"vũ"}) is None             # also a given name: kept


def test_machine_decisions_that_fail_author_validation_become_unresolved(monkeypatch):
    """Final acceptance: one invalid machine alias ("Chị Mai" -> "Mai Linh" with a quote lacking the
    canonical name) made the author's save of the whole chapter fail with 422."""
    import json
    from services.entity_pipeline import verification as v

    text = "Chị Mai Linh về bến. Chị Mai cười."

    class LLM:
        def _call_structured(self, *, operation, system_prompt, user_prompt):
            data = json.loads(user_prompt)
            return json.dumps({"decisions": [
                {"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": "PER",
                 "canonical_name": "Mai Linh", "reason": "tên"} if c["surface"] in ("Mai Linh", "Chị Mai Linh") else
                {"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "khác"}
                for c in data["candidates"]]}, ensure_ascii=False)

    real = v._canonicalize
    injected = {}

    def inject(decisions, candidates, known):
        out = real(decisions, candidates, known)
        bad = next(c for c in candidates if c.surface == "Chị Mai")
        injected["id"] = bad.candidate_id
        return [dict(d, verdict="entity", entity_type="PER", canonical_name="Mai Linh", identity_quote="Chị Mai")
                if d["candidate_id"] == bad.candidate_id else d for d in out]

    monkeypatch.setattr(v, "_canonicalize", inject)
    audit = {}
    v.verify_entities(text, LLM(), lambda *_: [], audit_sink=lambda a: audit.update(a),
                      guidance=[{"name": "Mai Linh"}, {"name": "Chị Mai Linh"}, {"name": "Chị Mai"}])
    verdicts = {d["candidate_id"]: d["verdict"] for d in audit["decisions"]}
    assert verdicts[injected["id"]] == "unresolved"
    assert any(x["candidate_id"] == injected["id"] for x in audit["degraded_candidates"])
