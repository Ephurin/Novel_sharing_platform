import json

import pytest

from application.author_workflow import run_author_operation
from application.bootstrap_service import ManuscriptBootstrapService
from application.narrative_service import NarrativeApplicationService
from domain.models import NarrativeProposal
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


class StubLLM:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def _call_llm(self, **kwargs):
        self.calls.append(kwargs)
        return json.dumps(self.result)


def test_raw_setup_only_grounded_entities_and_pending_until_review():
    repo = InMemoryNarrativeRepository()
    llm = StubLLM({"entities": [
        {"name": "Linh", "entity_type": "character", "initial_status": "Unknown"},
        {"name": "Cồn Vân", "entity_type": "location"},
        {"name": "Invented", "entity_type": "character"},
        {"name": "Linh", "entity_type": "item"}],
        "world_rules": ["invented rule"], "premise": "invented premise"})
    service = ManuscriptBootstrapService(repo, None, None, llm_service=llm)
    job = service.start_from_idea(tenant_id="t", novel_id="n", idea="Linh sống ở Cồn Vân.",
                                  outline="Future rescue", mode="extract")
    proposals = repo.list_proposals("n")
    assert len(proposals) == 2 and {p.proposal_type for p in proposals} == {"entity"}
    assert repo.get_story_brain("n").entities == ()
    assert repo.get_story_brain("n").facts == ()
    assert job.options["source_outline"] == "Future rescue"
    repo.accept_proposal_group("n", [p.proposal_id for p in proposals], expected_brain_version=1)
    service.activate_baseline(novel_id="n", job_id=job.job_id)
    assert {e.name for e in repo.get_story_brain("n").entities} == {"Linh", "Cồn Vân"}


def test_event_suggestions_exclude_pending_memory_and_do_not_write_history():
    repo = InMemoryNarrativeRepository()
    repo.save_proposals("n", [NarrativeProposal(proposal_id="p", proposal_type="entity",
        payload={"canonical_name": "SECRET_PENDING_ENTITY"})])
    llm = StubLLM({"events": [{"title": "Meeting", "description": "Meet at the harbor", "target_chapter": 2}]})
    result = run_author_operation(repo, llm, "n", "suggest_events", "continue")
    assert result["events"][0]["target_chapter"] == 2
    assert "SECRET_PENDING_ENTITY" not in llm.calls[0]["user_prompt"]
    assert repo.get_story_brain("n").events == ()
    assert repo.get_active_story_plan("n") is None


@pytest.mark.parametrize("quote,revision", [("not in draft", "rev"), ("actual", "wrong")])
def test_consistency_finding_requires_exact_source_evidence(quote, revision):
    llm = StubLLM({"findings": [{"description": "Conflict", "evidence": quote, "revision_id": revision}]})
    with pytest.raises(ValueError, match="ungrounded evidence"):
        run_author_operation(InMemoryNarrativeRepository(), llm, "n", "check_consistency", "",
                             content="actual draft", revision_id="rev")


def test_completion_requires_explicit_evaluation_fields():
    with pytest.raises(ValueError):
        run_author_operation(InMemoryNarrativeRepository(), StubLLM({"reason": "looks fine"}),
                             "n", "evaluate_objective", "", content="a short outline")


def test_missing_llm_fails_instead_of_pretending_check_passed():
    with pytest.raises(ValueError, match="LLM is required"):
        run_author_operation(InMemoryNarrativeRepository(), None, "n", "check_consistency", "")


def test_group_review_applies_author_edits_atomically():
    repo = InMemoryNarrativeRepository()
    repo.save_proposals("n", [NarrativeProposal(proposal_id="p", proposal_type="entity", dependency_group_id="g",
        payload={"canonical_name": "Linh", "normalized_name": "linh", "entity_type": "PER"})])
    service = NarrativeApplicationService(repo)
    assert repo.get_story_brain("n").entities == ()
    service.accept_proposal_group_by_ids("g", ["p"], 1, edited_payloads={"p": {
        "canonical_name": "Mai Linh", "normalized_name": "mai linh", "entity_type": "PER", "initial_status": "Unknown"}})
    assert repo.get_story_brain("n").entities[0].name == "Mai Linh"
    assert repo.get_story_brain("n").metadata["brain_version"] == "2"


def test_review_cannot_edit_proposals_outside_selected_group():
    repo = InMemoryNarrativeRepository()
    service = NarrativeApplicationService(repo)
    with pytest.raises(ValueError, match="selected proposals"):
        service.accept_proposal_group_by_ids("g", ["p"], 1, edited_payloads={"other": {}})
