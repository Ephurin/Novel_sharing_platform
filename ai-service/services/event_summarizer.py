import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from core.exceptions import EventExtractionError
from core.structured_call import call_structured
from core.story_kb_manager import EventHistoryEntry
from core.structured_outputs import EventExtractionOutput, NarrativeEventOutput, PipelineMetadata
from services.source_grounding import quote_span, resolve_grounded_quote


logger = logging.getLogger(__name__)


def extract_narrative_events(
    text: str,
    approved_entities: list[dict[str, Any]],
    llm_service: Any,
    chapter_num: int = 1,
    pipeline_version: str = "event-v1",
    prompt_version: str = "event-extraction-v1",
) -> list[EventHistoryEntry]:
    if not text or not text.strip():
        return []

    entity_names = sorted(
        {
            str(name).strip()
            for entity in approved_entities
            if (name := entity.get("normalized_name") or entity.get("raw_name") or entity.get("word") or entity.get("name"))
            and str(name).strip()
        }
    )
    if not entity_names:
        return []
    if llm_service is None:
        raise EventExtractionError("LLM provider is unavailable")

    system_prompt = (
        "You are a narrative event extractor. Only extract significant events involving the supplied known entities. "
        "Return only valid JSON with an 'events' array. Every event must contain participants, locations, summary, "
        "event_type, emotion_tags, importance_score between 0 and 1, and consequences. Return an empty array when "
        "there is no significant event. participants, locations, emotion_tags and consequences are arrays of strings, never strings. "
        "evidence_quote must be the smallest sufficient exact contiguous quote from the passage supporting this event. "
        "Include only people actually present and the location where the event happens, not places merely mentioned. "
        "Preserve reported speech, uncertainty and negation; do not turn hypotheses into established conclusions. "
        "Schema: " + json.dumps(NarrativeEventOutput.model_json_schema(), ensure_ascii=False)
    )
    user_prompt = (
        f"Text passage: {text.strip()}\n"
        f"Known entities: {', '.join(entity_names)}\n"
        f"Verified name mappings: {json.dumps({e['raw_name']: e['normalized_name'] for e in approved_entities if e.get('raw_name') and e.get('normalized_name') and e['raw_name'] != e['normalized_name']}, ensure_ascii=False)}\n"
        "Extract narrative events."
    )

    try:
        raw_output = call_structured(llm_service, operation="event_extraction", system_prompt=system_prompt, user_prompt=user_prompt)
    except Exception as exc:
        raise EventExtractionError(f"provider call failed: {exc}") from exc

    raw_events = _parse_items(raw_output, "events")
    try:
        extraction = EventExtractionOutput(
            events=[NarrativeEventOutput.model_validate(item) for item in raw_events],
            metadata=PipelineMetadata(
                pipeline_version=pipeline_version,
                model_name=str(getattr(llm_service, "model", "unknown") or "unknown"),
                prompt_version=prompt_version,
            ),
        )
    except ValidationError as exc:
        raise EventExtractionError(f"model output failed schema validation: {exc}") from exc

    known_names = {name.casefold(): name for name in entity_names}
    results: list[EventHistoryEntry] = []
    for event in extraction.events:
        # Legacy adapters can omit a quote only when their summary is itself an exact source excerpt.
        evidence_quote = event.evidence_quote or event.summary
        _, _, resolved_quote = resolve_grounded_quote(
            text,
            evidence_quote,
            context_hint=event.summary,
            llm_service=llm_service,
            max_retries=2,
        )
        evidence_quote = resolved_quote
        participants = []
        for participant in event.participants:
            normalized_participant = participant.strip().casefold()
            match = next(
                (
                    canonical
                    for known, canonical in known_names.items()
                    if normalized_participant == known
                ),
                None,
            )
            if match and match not in participants:
                participants.append(match)

        results.append(
            EventHistoryEntry(
                evidence_quote=evidence_quote,
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                chapter=chapter_num,
                timestamp=datetime.now(timezone.utc).isoformat(),
                participants=participants or event.participants,
                locations=event.locations,
                summary=event.summary,
                event_type=event.event_type,
                emotion_tags=event.emotion_tags,
                importance_score=event.importance_score,
                consequences=event.consequences,
                source="AI",
            )
        )

    logger.info("Event summarizer: extracted %d events from text", len(results))
    return results


def _parse_items(raw_output: Any, key: str) -> list[Any]:
    if raw_output is None or not str(raw_output).strip():
        raise EventExtractionError("provider returned empty output")
    cleaned = str(raw_output).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise EventExtractionError("model output is not valid JSON") from exc
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and isinstance(parsed.get(key), list):
        return parsed[key]
    raise EventExtractionError(f"model output must be an array or an object containing '{key}'")
