"""Generate reviewable state changes; the LLM never mutates canonical state."""
import json
import logging
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.exceptions import StateExtractionError
from domain.models import NarrativeProposal
from services.state_extraction import _parse_items

logger = logging.getLogger(__name__)


class TransitionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: str = Field(min_length=1)
    attribute_key: str = Field(min_length=1, max_length=100)
    new_value: Any
    confidence: float = Field(ge=0, le=1)


def generate_state_transition_proposals(event: NarrativeProposal, llm_service, *, identity_inventory=None, identity_resolver=None) -> list[NarrativeProposal]:
    participants = event.payload.get("participants", [])
    if not participants:
        return []
    try:
        if identity_inventory is not None:
            from core.structured_call import call_structured
            raw = call_structured(llm_service, operation='hitl_state_extraction',
                system_prompt='Extract only explicit state changes supported by this event. Return JSON with a transitions array, fields entity (exact reviewed entity_id), attribute_key, new_value, confidence (0..1). active_relationships uses exact entity_id keys. Names are not unique; never infer or merge identities.',
                user_prompt=json.dumps({**event.payload, 'known_entities':identity_inventory}, ensure_ascii=False))
        else:
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
        if identity_resolver is not None:
            identity = identity_resolver(change.entity)
            if identity not in participants:
                # The model sometimes attributes a change to someone outside the event (live round 4).
                # Like the legacy path, drop that suggestion instead of failing the whole chapter.
                logger.warning('Dropped state transition whose subject is not an event participant')
                continue
            if change.attribute_key == 'active_relationships':
                if not isinstance(change.new_value, dict):
                    raise ValueError('Relationship state must be a mapping')
                targets = {}
                for key,value in change.new_value.items():
                    target = identity_resolver(key)
                    if target in targets and targets[target] != value:
                        raise ValueError('Conflicting relationship values for one reviewed identity')
                    targets[target] = value
                change.new_value = targets
        else:
            if change.entity.casefold() not in names:
                continue
            identity = names[change.entity.casefold()]
        if change.confidence < 0.5:
            continue
        payload = {"event_id": event.payload.get("event_id", event.proposal_id),
                   "entity_id": identity,
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
