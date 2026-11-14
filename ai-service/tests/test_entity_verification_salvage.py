"""#148: entity candidate verification keeps valid decisions instead of failing the whole chapter."""
import json
import logging

import pytest

from domain.errors import AnalysisOutputError
from services.entity_pipeline.verification import _redact, verify_entities

TEXT = "Lâm Phong bước vào Thanh Thành. Lâm Phong nhìn quanh."


class ScriptedLLM:
    """Returns decisions built by `decide(candidates, attempt)` for each verification call."""

    def __init__(self, decide):
        self.decide = decide
        self.calls = 0

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        assert operation == "entity_candidate_verification"
        self.calls += 1
        candidates = json.loads(user_prompt)["candidates"]
        out = self.decide(candidates, self.calls)
        return out if isinstance(out, str) else json.dumps({"decisions": out}, ensure_ascii=False)


def no_discovery(_text, _llm):
    return []


def good(c):
    if c["surface"] in ("Lâm Phong", "Thanh Thành"):
        return {"candidate_id": c["candidate_id"], "verdict": "entity",
                "entity_type": "PER" if c["surface"] == "Lâm Phong" else "LOC",
                "canonical_name": c["surface"], "reason": "tên riêng"}
    return {"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "từ thường"}


def run(decide, audit_store):
    llm = ScriptedLLM(decide)
    result = verify_entities(TEXT, llm, no_discovery, audit_sink=lambda a: audit_store.update(a),
                             guidance=[{"name": "Lâm Phong"}, {"name": "Thanh Thành"}])
    return llm, result


def test_one_invalid_decision_is_left_unresolved_not_fatal(caplog):
    def decide(candidates, _attempt):
        out = [good(c) for c in candidates]
        # Persistently invalid: a not_entity verdict that keeps a canonical name.
        bad = next(d for d in out if d["verdict"] == "entity" and d["canonical_name"] == "Thanh Thành")
        bad.update(verdict="not_entity", entity_type=None)
        return out

    audit = {}
    with caplog.at_level(logging.WARNING):
        llm, result = run(decide, audit)
    assert llm.calls == 2
    assert [e["phrase"] for e in result.entities] == ["Lâm Phong"]
    assert len(audit["repair_errors"]) == 2
    degraded = audit["degraded_candidates"]
    assert len(degraded) == 1 and "carries resolved identity" in degraded[0]["error"]
    verdicts = {d["candidate_id"]: d["verdict"] for d in audit["decisions"]}
    assert verdicts[degraded[0]["candidate_id"]] == "unresolved"
    assert audit["status"] == "completed"
    # Logs carry the reason but no manuscript names.
    assert "carries resolved identity" in caplog.text
    assert "Thanh Thành" not in caplog.text


def test_missing_decision_is_filled_as_unresolved():
    audit = {}
    _, result = run(lambda cands, _a: [good(c) for c in cands][1:], audit)
    assert len(audit["degraded_candidates"]) == 1
    assert audit["degraded_candidates"][0]["error"] == "missing decision"
    assert audit["status"] == "completed"


def test_repair_still_succeeds_without_degradation():
    def decide(candidates, attempt):
        return [good(c) for c in candidates][1:] if attempt == 1 else [good(c) for c in candidates]

    audit = {}
    llm, result = run(decide, audit)
    assert llm.calls == 2
    assert "degraded_candidates" not in audit
    assert {e["phrase"] for e in result.entities} == {"Lâm Phong", "Thanh Thành"}


def test_unparseable_output_still_fails_with_reason():
    audit = {}
    with pytest.raises(AnalysisOutputError) as exc:
        run(lambda _c, _a: "not json", audit)
    assert exc.value.code == "ENTITY_VERIFICATION_UNRESOLVED"
    assert "bounded repair:" in str(exc.value)
    assert audit["status"] == "failed" and len(audit["repair_errors"]) == 2


def test_redact_removes_quoted_values():
    assert _redact('Candidate c1 (surface="Lâm") has canonical_name="Lâm"') == \
        'Candidate c1 (surface="…") has canonical_name="…"'
