"""Live retest 7: option A (exact approved names skip model verification) and U1 (a verification
batch that fails at the provider is split once; the provider's error text is logged)."""
import json

import pytest

from core.llm_service import LLMServiceError, provider_error_excerpt
from services.entity_pipeline.candidates import CandidateInventory
from services.entity_pipeline.verification import KNOWN_NAME_REASON, known_name_decisions, verify_entities

TEXT = "Trần Vũ rút kiếm. Lam Yên gọi Vũ. Trần Vũ chạy tới Lôi Sơn. Mạc Độc cười."
KNOWN = [{"entity_id": "e-vu", "name": "Trần Vũ", "entity_type": "PER"},
         {"entity_id": "e-lam", "name": "Lam Yên", "entity_type": "PER"},
         {"entity_id": "e-ls", "name": "Lôi Sơn", "entity_type": "LOC"},
         {"entity_id": "e-vu2", "name": "Vũ", "entity_type": "PER"}]


class ScriptedLLM:
    def __init__(self, fail_above=None):
        self.batches, self.fail_above = [], fail_above

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        assert operation == "entity_candidate_verification"
        candidates = json.loads(user_prompt)["candidates"]
        self.batches.append([c["surface"] for c in candidates])
        if self.fail_above is not None and len(candidates) > self.fail_above:
            raise LLMServiceError("PROVIDER_UNAVAILABLE retry_after=60")
        return json.dumps({"decisions": [
            {"candidate_id": c["candidate_id"], "verdict": "entity", "entity_type": "PER", "canonical_name": c["surface"],
             "reason": "tên riêng"} if c["surface"] == "Mạc Độc" else
            {"candidate_id": c["candidate_id"], "verdict": "not_entity", "reason": "từ thường"} for c in candidates]},
            ensure_ascii=False)


def verify(llm, batch_size=24, text=TEXT):
    audit = {}
    verify_entities(text, llm, lambda *_: [], known_entities=KNOWN, audit_sink=audit.update,
                    guidance=[{"name": "Mạc Độc"}], batch_size=batch_size)
    return audit


def test_a_exact_multi_word_approved_names_are_decided_without_the_model():
    llm = ScriptedLLM()
    audit = verify(llm)
    sent = [s for b in llm.batches for s in b]
    assert "Trần Vũ" not in sent and "Lam Yên" not in sent and "Lôi Sơn" not in sent
    assert "Mạc Độc" in sent
    auto = [d for d in audit["decisions"] if d["reason"] == KNOWN_NAME_REASON]
    assert audit["known_name_decisions"] == len(auto) == 4
    assert {d["canonical_entity_id"] for d in auto} == {"e-vu", "e-lam", "e-ls"}


def test_a_short_aliased_or_differently_cased_names_still_go_to_the_model():
    inv = CandidateInventory("trần vũ đi. Lam Yên đến. Vũ cười. Lôi Sơn rung.").collect(["Trần Vũ", "Lam Yên", "Vũ", "Lôi Sơn"])
    decided = known_name_decisions(inv.items, KNOWN, [{"alias": "Lôi Sơn", "entity_id": "e-other"}])
    surfaces = {c.surface for c in inv.items if c.candidate_id in decided}
    assert surfaces == {"Lam Yên"}


def test_a_a_chapter_of_only_approved_names_makes_no_verification_call():
    llm = ScriptedLLM()
    verify(llm, text="Trần Vũ và Lam Yên tới Lôi Sơn.")
    assert llm.batches == []


def test_u1_a_batch_failing_at_the_provider_is_split_once():
    text = " ".join(f"Mạc Độc gặp Hồ Tâm{i}." for i in range(3))
    llm = ScriptedLLM(fail_above=3)
    audit = verify(llm, text=text)
    assert [len(b) for b in llm.batches][:3] == [6, 3, 3]
    assert audit["split_batches"] == [{"batch_start": 0, "size": 6}]
    with pytest.raises(LLMServiceError, match="PROVIDER_UNAVAILABLE"):
        verify(ScriptedLLM(fail_above=0), text=text)


def test_u1_provider_error_text_is_logged_without_credentials():
    text = provider_error_excerpt('503 {"message": "overloaded"}\n key=AIzaSyABCDEFGHIJKL Authorization: Bearer abcdefghijkl')
    assert "overloaded" in text and "AIzaSy" not in text and "abcdefghijkl" not in text
