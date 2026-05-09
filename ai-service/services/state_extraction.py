"""
State Extraction Service
========================
Uses LLM to extract entity state changes (health, location, emotion, status)
from narrative text. Only extracts states for known/anchored entities.
"""
import logging
import re
from typing import List

from models.entity_state import EntityState

logger = logging.getLogger(__name__)

# Allowed attributes — anything outside this set is discarded
VALID_ATTRIBUTES = {"health", "location", "emotion", "status"}


def extract_states(text: str, entities: list[dict], llm_service) -> List[EntityState]:
    """Extract entity state changes from text using LLM inference.

    Args:
        text: The raw narrative text.
        entities: List of resolved entity dicts (must have 'resolved_name' or 'word').
        llm_service: An initialised LLMService instance.

    Returns:
        A list of validated EntityState objects.
    """
    if not text or not text.strip():
        return []

    if not entities:
        return []

    # Build entity name set for anchoring
    entity_names = [
        e.get("resolved_name", e.get("word", ""))
        for e in entities
        if e.get("resolved_name", e.get("word", ""))
    ]
    entity_names = list(set(entity_names))
    if not entity_names:
        return []

    entity_names_str = ", ".join(entity_names)

    system_prompt = (
        "You are an expert narrative analyst specializing in character state tracking. "
        "Your task is to extract STATE CHANGES of entities from the given text passage.\n"
        "Only extract states for entities in the provided list.\n"
        "Valid state types: health (physical condition), location (current place), "
        "emotion (feelings), status (general state like alive, dead, captured).\n"
        "Return ONLY valid JSON, no explanations. Required format:\n"
        "{\n"
        "  \"states\": [\n"
        "    {\n"
        "      \"entity\": \"Entity Name\",\n"
        "      \"attribute\": \"health | location | emotion | status\",\n"
        "      \"value\": \"state value (e.g.: wounded, happy, Ashenhold, dead)\",\n"
        "      \"confidence\": 0.9\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "If no state changes are detected, return an empty states array."
    )

    user_prompt = (
        f"Text passage: {text.strip()}\n"
        f"Known entities (ONLY extract states for these): {entity_names_str}\n"
        "Extract all state changes."
    )

    try:
        raw_output = llm_service._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt
        )
    except Exception as exc:
        logger.error("LLM State Extraction failed: %s", exc)
        return []

    # Parse JSON output
    cleaned = raw_output.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    parsed = llm_service._parse_json_like_output(cleaned)

    raw_states = []
    if isinstance(parsed, dict) and "states" in parsed:
        raw_states = parsed["states"]
    elif isinstance(parsed, list):
        raw_states = parsed

    # Validate and build EntityState objects
    results: List[EntityState] = []
    entity_names_lower = {n.casefold() for n in entity_names}

    for raw in raw_states:
        entity_name = raw.get("entity", "")
        attribute = raw.get("attribute", "").lower().strip()
        value = raw.get("value", "")
        confidence = float(raw.get("confidence", 0.8))

        # Guard: only extract for known entities
        if entity_name.casefold() not in entity_names_lower:
            logger.debug("State extraction skipped unknown entity: %s", entity_name)
            continue

        # Guard: only allow valid attributes
        if attribute not in VALID_ATTRIBUTES:
            logger.debug("State extraction skipped invalid attribute: %s", attribute)
            continue

        # Guard: reject empty values
        if not value or not str(value).strip():
            continue

        # Guard: reject low confidence noise
        if confidence < 0.5:
            logger.debug("State extraction skipped low confidence (%.2f): %s.%s", confidence, entity_name, attribute)
            continue

        results.append(EntityState(
            entity_id=entity_name,
            attribute=attribute,
            value=str(value).strip(),
            confidence=confidence,
            source="AI",
            raw_text=text
        ))

    logger.info("State extraction: %d states from %d entities", len(results), len(entity_names))
    return results
