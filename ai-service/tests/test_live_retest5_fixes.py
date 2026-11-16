"""Findings from the fifth P2 live retest (2026-11-16): S1 a provider outage reported as a budget
denial, S2 a chapter re-proposing the previous chapter's last event."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from application.writing_service import writing_failure_error
from core.llm_service import LLMService, LLMServiceError


def guarded_call(message):
    service = LLMService(provider="gemini", api_key="unused")
    calls = []

    def generate_content(**kwargs):
        calls.append(kwargs)
        raise RuntimeError(message)

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    with patch.object(service, "_guard_proxy_config", return_value=("http://gateway.invalid", "token")), \
            patch.object(service, "_budget_guard_reserve", return_value=None), \
            patch.object(service, "_gemini_model_candidates", return_value=["m"]), \
            patch("google.genai.Client", return_value=client), patch("time.sleep"):
        with pytest.raises(LLMServiceError) as raised:
            service._call_gemini("s", "u")
    return str(raised.value), len(calls)


def test_s1_a_provider_outage_after_retries_is_not_a_budget_denial():
    message, calls = guarded_call("403 {'code': 'provider_timeout', 'upstream_status': 504}")
    assert message.startswith("PROVIDER_UNAVAILABLE") and calls == 3
    error = writing_failure_error(LLMServiceError(message))
    assert error["code"] == "AI_PROVIDER_UNAVAILABLE" and "tạm thời không phản hồi" in error["message"]


def test_s1_a_real_guard_denial_keeps_its_code():
    message, calls = guarded_call("403 {'code': 'max_calls_reached'}")
    assert message == "BUDGET_GUARD_DENIED" and calls == 1


def test_s2_the_event_prompt_gets_earlier_chapters_latest_events():
    from application.entity_hitl import HITL_EVENT_INSTRUCTIONS, recorded_events_before
    from domain.models import NarrativeEvent

    events = [NarrativeEvent(event_id=f"e{i}", event_type="x", summary=f"Sự kiện {i}", chapter=c)
              for i, c in enumerate([5, 6, 7, 7, 7, 7, 7, 7, 8])]
    events.insert(3, NarrativeEvent(event_id="old", event_type="x", summary="Đã bỏ", chapter=7, metadata={"is_retired": True}))
    repo = SimpleNamespace(get_story_brain=lambda novel_id, read_only=False: SimpleNamespace(events=tuple(events)))
    recorded = recorded_events_before(repo, "n", 8)
    assert len(recorded) == 6 and recorded[-1] == {"chapter": 7, "summary": "Sự kiện 7"}
    assert all(r["chapter"] < 8 and r["summary"] != "Đã bỏ" for r in recorded)
    assert "do not list it again" in HITL_EVENT_INSTRUCTIONS
