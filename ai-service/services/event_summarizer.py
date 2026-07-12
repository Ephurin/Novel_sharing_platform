"""
Event Summarizer Service
========================
Uses LLM to extract and summarize events from narrative text, matching them against approved entities.
"""
import logging
import uuid
import re
from typing import List, Dict, Any
from datetime import datetime, timezone

from core.story_kb_manager import EventHistoryEntry

logger = logging.getLogger(__name__)

def extract_narrative_events(
    text: str,
    approved_entities: List[Dict[str, Any]],
    llm_service,
    chapter_num: int = 1
) -> List[EventHistoryEntry]:
    """
    Extracts structured events from text using LLM, filtering/matching with approved entities.
    """
    if not text or not text.strip():
        return []

    # Get active/approved entity names for context
    entity_names = []
    for ent in approved_entities:
        name = ent.get("normalized_name") or ent.get("raw_name") or ent.get("word") or ent.get("name")
        if name:
            entity_names.append(name)
    
    entity_names = list(set(entity_names))
    if not entity_names:
        return []

    entity_names_str = ", ".join(entity_names)

    system_prompt = (
        "You are an expert narrative analyst specializing in event extraction and narrative memory.\n"
        "Your task is to identify and extract narrative EVENTS from the given text passage.\n"
        "An event represents a significant narrative action, interaction, or development involving the entities.\n"
        "Keep the event summaries concise but informative. Do not extract tiny, insignificant actions (like 'A walked 2 steps').\n"
        "Only extract events involving the known entities listed in the prompt.\n"
        "Return ONLY valid JSON. Required format:\n"
        "{\n"
        "  \"events\": [\n"
        "    {\n"
        "      \"participants\": [\"Entity A\", \"Entity B\"],\n"
        "      \"locations\": [\"Location X\"],\n"
        "      \"summary\": \"Concise Vietnamese summary of the event (e.g., Tiêu Trần cùng Lâm Nguyệt Nhi lao nhanh xuống núi để lánh nạn).\",\n"
        "      \"event_type\": \"battle | movement | meeting | training | dialogue | general\",\n"
        "      \"emotion_tags\": [\"fear\", \"anger\", \"revenge\", \"concern\", \"neutral\"],\n"
        "      \"importance_score\": 0.8,\n"
        "      \"consequences\": [\"Consequence A (e.g., Tiêu Trần lo lắng)\", \"Consequence B (e.g., Tiêu Gia bị đe dọa)\"]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "If no significant narrative events are found, return an empty events list."
    )

    user_prompt = (
        f"Text passage: {text.strip()}\n"
        f"Known entities (ONLY extract events related to these): {entity_names_str}\n"
        "Extract all narrative events."
    )

    try:
        raw_output = llm_service._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt
        )
    except Exception as exc:
        logger.error("LLM Event Summarization failed: %s", exc)
        return []

    # Parse JSON output
    cleaned = raw_output.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    parsed = llm_service._parse_json_like_output(cleaned)

    raw_events = []
    if isinstance(parsed, dict) and "events" in parsed:
        raw_events = parsed["events"]
    elif isinstance(parsed, list):
        raw_events = parsed

    results: List[EventHistoryEntry] = []
    for raw in raw_events:
        summary = raw.get("summary", "").strip()
        if not summary:
            continue

        participants = [str(p).strip() for p in raw.get("participants", []) if str(p).strip()]
        locations = [str(l).strip() for l in raw.get("locations", []) if str(l).strip()]
        
        # Filter participants to only those who are known entities or have a substring overlap
        valid_participants = []
        for p in participants:
            p_lower = p.lower()
            for known in entity_names:
                if p_lower in known.lower() or known.lower() in p_lower:
                    valid_participants.append(known)
                    break
        valid_participants = list(set(valid_participants))

        # Check importance score
        try:
            importance = float(raw.get("importance_score", 0.5))
        except (TypeError, ValueError):
            importance = 0.5

        # Consequences
        consequences = [str(c).strip() for c in raw.get("consequences", []) if str(c).strip()]

        entry = EventHistoryEntry(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            chapter=chapter_num,
            timestamp=datetime.now(timezone.utc).isoformat(),
            participants=valid_participants if valid_participants else participants,
            locations=locations,
            summary=summary,
            event_type=raw.get("event_type", "general"),
            emotion_tags=raw.get("emotion_tags", []),
            importance_score=importance,
            consequences=consequences,
            source="AI"
        )
        results.append(entry)

    logger.info("Event summarizer: extracted %d events from text", len(results))
    return results
