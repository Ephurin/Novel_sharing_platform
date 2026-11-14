import hashlib
import json

import pytest

from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from core.exceptions import StateExtractionError
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.entity_pipeline.pipeline import EntityPipeline
from services.state_transition_proposals import generate_state_transition_proposals
from tests.test_state_projection import event_group


class FakeLLM:
    model = "fake"

    def __init__(self, responses):
        self.responses = iter(responses)

    def _call_llm(self, **kwargs):
        return next(self.responses)


def test_analysis_generates_reviewable_transitions_then_accepts_group():
    content = "Minh was injured."
    digest = hashlib.sha256(content.encode()).hexdigest()
    repo = InMemoryNarrativeRepository()
    llm = FakeLLM([
        json.dumps([{"phrase": "Minh", "entity": "PER", "score": 0.99}]),
        json.dumps({"events": [{"participants": ["Minh"], "event_type": "injury", "summary": content}]}),
        json.dumps({"transitions": [{"entity": "Minh", "attribute_key": "health", "new_value": 80, "confidence": 0.9}]})])
    service = RevisionAnalysisService(repo, InMemoryRevisionContentProvider([
        RevisionContent(revision_id="r1", novel_id="n1", chapter_id="c1", content=content, content_hash=digest, chapter_number=1)]),
        EntityPipeline("test", "test"), llm)
    kwargs = dict(tenant_id="t1", novel_id="n1", chapter_id="c1", revision_id="r1",
        content_hash=digest, operation="analysis", idempotency_key="key",
        options={"extract_state_transitions": True})
    result = service.analyze(**kwargs)
    assert [p.proposal_type for p in result.proposals] == ["entity", "event", "state_transition"]
    assert repo.get_current_state("n1") == {}
    assert service.analyze(**kwargs).deduplicated
    repo.accept_proposal_group("n1", [p.proposal_id for p in result.proposals], 1)
    assert next(iter(repo.get_current_state("n1")["entities"].values()))["health"] == 80


@pytest.mark.parametrize("output", ["not json", '{"transitions":[{"entity":"Minh"}]}'])
def test_bad_provider_output_is_explicit_failure(output):
    with pytest.raises(StateExtractionError):
        generate_state_transition_proposals(event_group()[0], FakeLLM([output]))


def test_relationship_inference_is_proposed_with_evidence():
    event = event_group()[0]
    result = generate_state_transition_proposals(event, FakeLLM([json.dumps({"transitions": [{
        "entity": "Minh", "attribute_key": "active_relationships", "new_value": {"Lan": "ALLY_OF"},
        "confidence": 0.9}]})]))
    assert result[0].payload["event_id"] == event.proposal_id
    assert result[0].payload["new_value"] == {"Lan": "ALLY_OF"}
    assert result[0].status.value == "pending"


def test_hitl_transition_for_non_participant_is_dropped_not_fatal():
    """Live round 4: one off-event subject failed a chapter's continue; it is now skipped."""
    import json as _json
    from types import SimpleNamespace
    from services.state_transition_proposals import generate_state_transition_proposals

    event = SimpleNamespace(payload={"participants": ["e1"], "event_id": "ev1"}, proposal_id="p1",
                            analysis_run_id="r1", dependency_group_id="g1", materialization_order=0,
                            evidence=(), expected_brain_version=1)

    class LLM:
        def _call_structured(self, **_kw):
            return _json.dumps({"transitions": [
                {"entity": "e2", "attribute_key": "location", "new_value": "bến", "confidence": 0.9},
                {"entity": "e1", "attribute_key": "location", "new_value": "chợ", "confidence": 0.9}]})

    out = generate_state_transition_proposals(event, LLM(), identity_inventory=[], identity_resolver=lambda x: x)
    assert [p.payload["entity_id"] for p in out] == ["e1"]
