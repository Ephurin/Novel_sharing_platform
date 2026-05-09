import uuid
from typing import List, Dict, Any
from models.event import Event

# ---- Vietnamese Action Dictionary ----
# Each category maps to (action, intent, emotion, polarity)

HOSTILE_KEYWORDS = {
    "tấn công", "đánh", "giết", "phá hủy", "tiêu diệt",
    "chém", "đâm", "bắn", "ám sát", "đe dọa",
    "truy sát", "trả thù", "thù hận", "căm ghét",
    "hủy diệt", "đánh bại", "khinh miệt",
    "attack", "hit", "kill", "destroy",
}
HOSTILE_ACTION = ("attacked", "harm", "anger", -0.8)

SUPPORTIVE_KEYWORDS = {
    "giúp đỡ", "giúp", "cứu", "bảo vệ", "chữa",
    "hỗ trợ", "che chở", "dạy", "truyền thụ",
    "liên minh", "đồng minh", "hợp tác", "phối hợp",
    "help", "save", "heal", "protect",
}
SUPPORTIVE_ACTION = ("helped", "assist", "gratitude", 0.8)

NEUTRAL_KEYWORDS = {
    "gặp", "nói", "gia nhập", "rời đi", "đến",
    "thăm", "quan sát", "theo dõi", "biết",
    "meet", "join", "visit",
}
NEUTRAL_ACTION = ("interacted_with", "neutral", "neutral", 0.0)


def _classify_action(text: str):
    """
    Classify the dominant action in a text snippet using keyword matching.
    Returns (action, intent, emotion, polarity).
    """
    text_lower = text.lower()

    # Check hostile first (higher priority for conflict detection)
    for kw in HOSTILE_KEYWORDS:
        if kw in text_lower:
            return HOSTILE_ACTION

    # Then supportive
    for kw in SUPPORTIVE_KEYWORDS:
        if kw in text_lower:
            return SUPPORTIVE_ACTION

    # Then neutral specific
    for kw in NEUTRAL_KEYWORDS:
        if kw in text_lower:
            return NEUTRAL_ACTION

    # Default fallback
    return ("interacted_with", "neutral", "neutral", 0.0)


def extract_events(text: str, entities: List[Dict[str, Any]]) -> List[Event]:
    """
    Extracts events (interactions) from the text using the provided entities.
    Uses Vietnamese + English keyword dictionary for action classification.

    Entities are expected to have a 'resolved_name' field (from EntityResolver).
    Falls back to 'word' or 'Entity' if 'resolved_name' is not present.
    """
    events: List[Event] = []

    # Filter to only PER entities for subject/object (skip LOC, ORG, etc.)
    per_entities = [
        e for e in entities
        if (e.get("entity", e.get("Label", "")).upper() in ("PER", "B-PER", "I-PER")
            or e.get("type", "").upper() == "PER")
    ]

    # Need at least 2 person entities for an interaction event
    if len(per_entities) >= 2:
        subject = per_entities[0].get("resolved_name",
                    per_entities[0].get("word", per_entities[0].get("Entity", "Unknown")))
        object_name = per_entities[1].get("resolved_name",
                       per_entities[1].get("word", per_entities[1].get("Entity", "Unknown")))

        action, intent, emotion, polarity = _classify_action(text)

        event = Event(
            id=str(uuid.uuid4()),
            subject_id=subject,
            action=action,
            object_id=object_name,
            intent=intent,
            emotion=emotion,
            polarity=polarity,
            intensity=0.7,
            confidence=0.85,
            source="AI_EventExtractor",
            raw_text=text
        )
        events.append(event)

    return events
