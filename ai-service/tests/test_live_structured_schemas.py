"""Phase 2 live finding F-LIVE-03: the schema Gemini is constrained to must match the validator."""
import json

import pytest
from pydantic import ValidationError

from core.llm_service import response_schema_for
from core.structured_outputs import HitlEventBatch


def test_hitl_event_extraction_is_constrained_to_the_hitl_schema():
    schema = response_schema_for("hitl_event_extraction")
    assert schema == HitlEventBatch.model_json_schema()
    event = schema["$defs"]["HitlEventOutput"]
    assert "quote" in event["required"]
    assert "importance_score" not in event["properties"]
    assert "emotion_tags" not in event["properties"]


def test_hitl_validator_accepts_schema_shaped_output_and_rejects_legacy_fields():
    ok = {"events": [{"event_type": "journey", "summary": "Lâm Phong rời bến.", "participants": ["e1"],
                      "locations": [], "consequences": [], "quote": "chèo đò về phía bắc"}]}
    assert HitlEventBatch.model_validate_json(json.dumps(ok)).events[0].quote == "chèo đò về phía bắc"
    legacy = {"events": [{**ok["events"][0], "importance_score": 0.85}]}
    with pytest.raises(ValidationError):
        HitlEventBatch.model_validate_json(json.dumps(legacy))


def test_legacy_event_extraction_keeps_its_schema():
    schema = response_schema_for("event_extraction")
    assert "importance_score" in json.dumps(schema)
    assert response_schema_for("unknown_operation") is None
