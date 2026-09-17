import json
import logging
import re
from typing import Any

from pydantic import ValidationError

from core.exceptions import StateExtractionError
from core.structured_outputs import PipelineMetadata, StateChangeOutput, StateExtractionOutput
from models.entity_state import EntityState


logger = logging.getLogger(__name__)


def extract_states(
    text: str,
    entities: list[dict[str, Any]],
    llm_service: Any,
    pipeline_version: str = "state-v1",
    prompt_version: str = "state-extraction-v1",
) -> list[EntityState]:
    if not text or not text.strip() or not entities:
        return []

    entity_names = sorted(
        {
            str(name).strip()
            for entity in entities
            if (name := entity.get("resolved_name") or entity.get("word")) and str(name).strip()
        }
    )
    if not entity_names:
        return []
    if llm_service is None:
        raise StateExtractionError("LLM provider is unavailable")

    system_prompt = (
        "You are a narrative state extractor. Only extract state changes for supplied entities. "
        "Valid attributes are health, location, emotion, and status. Return only valid JSON with a 'states' array. "
        "Every state must contain entity, attribute, value, and confidence between 0 and 1."
    )
    user_prompt = (
        f"Text passage: {text.strip()}\n"
        f"Known entities: {', '.join(entity_names)}\n"
        "Extract state changes."
    )

    try:
        raw_output = llm_service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
    except Exception as exc:
        raise StateExtractionError(f"provider call failed: {exc}") from exc

    raw_states = _parse_items(raw_output, "states")
    try:
        extraction = StateExtractionOutput(
            states=[StateChangeOutput.model_validate(item) for item in raw_states],
            metadata=PipelineMetadata(
                pipeline_version=pipeline_version,
                model_name=str(getattr(llm_service, "model", "unknown") or "unknown"),
                prompt_version=prompt_version,
            ),
        )
    except ValidationError as exc:
        raise StateExtractionError(f"model output failed schema validation: {exc}") from exc

    canonical_names = {name.casefold(): name for name in entity_names}
    results: list[EntityState] = []
    for state in extraction.states:
        canonical_name = canonical_names.get(state.entity.casefold())
        if canonical_name is None or state.confidence < 0.5:
            continue
        results.append(
            EntityState(
                entity_id=canonical_name,
                attribute=state.attribute,
                value=state.value.strip(),
                confidence=state.confidence,
                source="AI",
                raw_text=text,
            )
        )

    logger.info("State extraction: %d states from %d entities", len(results), len(entity_names))
    return results


def _parse_items(raw_output: Any, key: str) -> list[Any]:
    if raw_output is None or not str(raw_output).strip():
        raise StateExtractionError("provider returned empty output")
    cleaned = str(raw_output).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise StateExtractionError("model output is not valid JSON") from exc
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and isinstance(parsed.get(key), list):
        return parsed[key]
    raise StateExtractionError(f"model output must be an array or an object containing '{key}'")
