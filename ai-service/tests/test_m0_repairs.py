"""Regression coverage for real-provider M0 failures; no external API calls."""
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from application.bootstrap_service import ManuscriptBootstrapService
from core.llm_service import LLMService, LLMServiceError
from core.structured_call import source_scope, structured_request
from domain.confidence import score_to_confidence, validate_confidence
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


@pytest.mark.parametrize("score,expected", [(10, 1), (9.5, .95), (1, .1), (.5, .05), (0, 0)])
def test_entity_score_scale_is_unambiguous(score, expected):
    assert score_to_confidence(score) == expected


@pytest.mark.parametrize("value", [10, -1, float("nan"), float("inf"), True])
def test_proposal_confidence_rejects_invalid_values(value):
    with pytest.raises(ValueError, match="confidence"):
        validate_confidence(value)


def fake_google(response, captured):
    def generate(**kwargs):
        captured.append(kwargs)
        return response
    return SimpleNamespace(Client=lambda **kwargs: SimpleNamespace(models=SimpleNamespace(generate_content=generate)))


def test_gemini_structured_budget_json_mode_and_source_trace(caplog):
    captured = []
    response = SimpleNamespace(text='{"entities":[]}', candidates=[SimpleNamespace(finish_reason="STOP")],
                               response_id="provider-test-id", usage_metadata=SimpleNamespace(prompt_token_count=42))
    service = LLMService(provider="gemini", api_key="test-key", model="test-model", structured_max_tokens=4096)
    with patch.dict("sys.modules", {"google": SimpleNamespace(genai=fake_google(response, captured)), "google.genai": fake_google(response, captured)}), caplog.at_level("INFO"):
        with source_scope(revision_id="revision-123", content_hash="a" * 64):
            assert service._call_structured(operation="entity_extraction", system_prompt="JSON only", user_prompt="PRIVATE_MANUSCRIPT") == response.text
        service._call_llm(system_prompt="normal", user_prompt="normal")
    assert captured[0]["config"]["max_output_tokens"] == 4096
    assert captured[0]["config"]["response_mime_type"] == "application/json"
    assert captured[1]["config"]["max_output_tokens"] == 512
    assert "response_mime_type" not in captured[1]["config"]
    assert "revision-123" in caplog.text and "provider-test-id" in caplog.text
    assert hashlib.sha256(b"PRIVATE_MANUSCRIPT").hexdigest() in caplog.text
    assert "PRIVATE_MANUSCRIPT" not in caplog.text and "test-key" not in caplog.text
    assert structured_request.get() is None


@pytest.mark.parametrize("finish,text,error", [
    ("MAX_TOKENS", '{"entities":', "TRUNCATED"),
    ("MAX_TOKENS", '{"entities":[]}', "TRUNCATED"),
    ("SAFETY", '{}', "INCOMPLETE"),
    ("STOP", '{"entities":', "INVALID_JSON"),
])
def test_partial_or_invalid_provider_output_never_becomes_success(finish, text, error):
    captured = []
    response = SimpleNamespace(text=text, candidates=[SimpleNamespace(finish_reason=finish)])
    service = LLMService(provider="gemini", api_key="test-key", model="test-model")
    with patch.dict("sys.modules", {"google": SimpleNamespace(genai=fake_google(response, captured)), "google.genai": fake_google(response, captured)}):
        with pytest.raises(LLMServiceError, match=error):
            service._call_structured(operation="event_extraction", system_prompt="JSON", user_prompt="source")
    assert len(captured) == 1  # no silent repair or unbounded provider retry
    assert structured_request.get() is None


def test_openai_structured_budget_and_length_guard():
    captured = []
    def create(**kwargs):
        captured.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{}'), finish_reason="length")])
    module = SimpleNamespace(OpenAI=lambda **kwargs: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    service = LLMService(provider="openai", api_key="test-key", structured_max_tokens=4096)
    with patch.dict("sys.modules", {"openai": module}), pytest.raises(LLMServiceError, match="TRUNCATED"):
        service._call_structured(operation="entity_extraction", system_prompt="JSON", user_prompt="source")
    assert captured[0]["max_tokens"] == 4096
    assert captured[0]["response_format"] == {"type": "json_object"}


def test_idea_status_is_reviewed_and_materialized_without_alive_default():
    class BlueprintLLM:
        def _call_llm(self, **kwargs):
            assert "START" in kwargs["system_prompt"]
            return json.dumps({"premise": "A daughter investigates her deceased father.",
                               "world_rules": ["Father is dead; no revival."],
                               "entities": [{"name": "Father", "entity_type": "character", "score": 10, "initial_status": "Dead"},
                                            {"name": "Harbor", "entity_type": "location", "score": 8}]})
    repo = InMemoryNarrativeRepository()
    service = ManuscriptBootstrapService(repo, None, None, llm_service=BlueprintLLM())
    job = service.start_from_idea(tenant_id="tenant", novel_id="idea-dead", idea="A daughter investigates her deceased father.")
    assert repo.list_entities("idea-dead") == []
    proposals = repo.list_proposals("idea-dead")
    father = next(p for p in proposals if p.payload.get("canonical_name") == "Father")
    assert father.payload["initial_status"] == "Dead" and father.confidence == 1
    repo.accept_proposal_group("idea-dead", [p.proposal_id for p in proposals], expected_brain_version=1)
    service.activate_baseline(novel_id="idea-dead", job_id=job.job_id)
    entities = {e.name: e.status for e in repo.list_entities("idea-dead")}
    assert entities == {"Father": "Dead", "Harbor": "Unknown"}
    context = repo.get_structured_context("idea-dead", chapter_number=1)
    assert next(e for e in context.current_states if e["name"] == "Father")["status"] == "Dead"

