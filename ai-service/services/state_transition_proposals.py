"""Generate reviewable state changes; the LLM never mutates canonical state."""
import json
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.exceptions import StateExtractionError
from domain.models import NarrativeProposal
from services.state_extraction import _parse_items


class TransitionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: str = Field(min_length=1)
    attribute_key: str = Field(min_length=1, max_length=100)
    new_value: Any
    confidence: float = Field(ge=0, le=1)


def generate_state_transition_proposals(event: NarrativeProposal, llm_service) -> list[NarrativeProposal]:
    participants = event.payload.get("participants", [])
    if not participants:
        return []
    try:
        raw = llm_service._call_llm(
            system_prompt=(
                "Extract only state changes explicitly supported by this event. Return JSON with a transitions array. "
                "Each item has entity (exact participant name), attribute_key, new_value and confidence (0..1). "
                "Health is numeric 0..100. active_relationships is a mapping of entity names to relationship types. "
                "Do not invent defaults or infer changes without evidence. Preserve original proper nouns."),
            user_prompt=json.dumps(event.payload, ensure_ascii=False))
        changes = [TransitionOutput.model_validate(item) for item in _parse_items(raw, "transitions")]
    except (ValidationError, ValueError) as exc:
        raise StateExtractionError(f"Invalid transition output: {exc}") from exc
    except Exception as exc:
        raise StateExtractionError(f"State proposal provider failed: {exc}") from exc
    result = []
    names = {name.casefold(): name for name in participants}
    for change in changes:
        if change.entity.casefold() not in names or change.confidence < 0.5:
            continue
        payload = {"event_id": event.payload.get("event_id", event.proposal_id),
                   "entity_id": names[change.entity.casefold()],
                   "attribute_key": change.attribute_key, "new_value": change.new_value}
        identity = json.dumps([event.proposal_id, payload], sort_keys=True, ensure_ascii=False)
        result.append(NarrativeProposal(
            proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, identity)), proposal_type="state_transition",
            payload=payload, analysis_run_id=event.analysis_run_id,
            dependency_group_id=event.dependency_group_id,
            materialization_order=event.materialization_order + 1,
            evidence=event.evidence, confidence=change.confidence,
            expected_brain_version=event.expected_brain_version))
    return result
