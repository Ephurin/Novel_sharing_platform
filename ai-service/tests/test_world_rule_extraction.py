"""F-LIVE-17: world rules from manuscript prose, grounded and deduplicated."""
import json

from core.llm_service import response_schema_for
from services.world_rule_extraction import MAX_RULES_PER_CHAPTER, extract_world_rules, known_world_rules

TEXT = ("Ở thành phố này, mưa không bao giờ tạnh trước nửa đêm. Ai chạm vào nước hồ Bích Thủy trong mùa lũ "
        "sẽ mất một ký ức. Duy mở cửa bước ra.")


class LLM:
    def __init__(self, rules=None, raw=None):
        self.rules, self.raw, self.calls = rules or [], raw, []

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.calls.append((operation, json.loads(user_prompt)))
        return self.raw if self.raw is not None else json.dumps({"rules": self.rules}, ensure_ascii=False)


def test_rules_are_grounded_filtered_and_deduplicated():
    llm = LLM([
        {"rule": "Mưa ở thành phố không bao giờ tạnh trước nửa đêm.", "quote": "mưa không bao giờ tạnh trước nửa đêm", "confidence": 0.9},
        {"rule": "Chạm nước hồ Bích Thủy mùa lũ thì mất một ký ức.", "quote": "Ai chạm vào nước hồ Bích Thủy trong mùa lũ sẽ mất một ký ức", "confidence": 0.95},
        {"rule": "Duy hay mở cửa.", "quote": "Duy mở cửa bước ra", "confidence": 0.3},           # low confidence
        {"rule": "Có rồng trên núi.", "quote": "rồng bay trên núi", "confidence": 0.9},            # not in text
        {"rule": "Chạm nước hồ Bích Thủy mùa lũ thì mất một ký ức!", "quote": "sẽ mất một ký ức", "confidence": 0.8},  # duplicate
    ])
    out = extract_world_rules(TEXT, llm)
    assert [r["rule"] for r in out] == ["Chạm nước hồ Bích Thủy mùa lũ thì mất một ký ức.",
                                       "Mưa ở thành phố không bao giờ tạnh trước nửa đêm."]
    for r in out:
        assert TEXT[r["start"]:r["end"]] == r["quote"]
    assert llm.calls[0][0] == "world_rule_extraction"


def test_approved_rules_are_passed_and_not_proposed_again():
    approved = ["Ai chạm vào nước hồ Bích Thủy trong mùa lũ sẽ mất một ký ức."]
    llm = LLM([{"rule": "Ai chạm vào nước hồ Bích Thủy trong mùa lũ sẽ mất một ký ức",
                "quote": "Ai chạm vào nước hồ Bích Thủy trong mùa lũ sẽ mất một ký ức", "confidence": 0.9}])
    assert extract_world_rules(TEXT, llm, approved) == []
    assert llm.calls[0][1]["known_rules"] == approved


def test_bad_output_and_empty_text_never_fail_the_chapter():
    assert extract_world_rules(TEXT, LLM(raw="not json")) == []
    assert extract_world_rules("   ", LLM()) == []


def test_at_most_five_rules_per_chapter():
    words = TEXT.split()
    rules = [{"rule": f"Quy tắc số {i} về {w}", "quote": w, "confidence": 0.9} for i, w in enumerate(words[:8])]
    assert len(extract_world_rules(TEXT, LLM(rules))) == MAX_RULES_PER_CHAPTER


def test_known_world_rules_reads_effective_values_and_skips_retired():
    facts = [{"fact_type": "world_rule", "fact_value": "A"}, {"fact_type": "world_rule", "fact_value": {"content": "B"}},
             {"fact_type": "world_rule", "fact_value": "C", "is_retired": True}, {"fact_type": "narrative_fact", "fact_value": "D"}]
    assert known_world_rules(facts) == ["A", "B"]


def test_live_schema_is_constrained():
    assert response_schema_for("world_rule_extraction")["properties"]["rules"]["type"] == "array"
