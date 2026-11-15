"""Where each entity was last seen, from approved events.

Live retest 3 (N8): no flow ever wrote an entity's location, so every character showed "Unknown" in
memory, in the writing context and in the canon fact check, although approved events record their
places (`locations`) and participants. An author-set or projected location always wins; this only
fills an unknown one and says where it came from.
"""
from __future__ import annotations

from typing import Any, Iterable

UNKNOWN = {"", "unknown", "không rõ", "chưa rõ"}
PLACE_TYPES = {"LOC", "LOCATION"}


def is_unknown(location: Any) -> bool:
    return str(location or "").strip().casefold() in UNKNOWN


def _resolver(entities: Iterable[tuple[str, str, str]]):
    by_id = {str(i): (str(n), str(t).upper()) for i, n, t in entities}
    by_name = {n.casefold(): i for i, (n, _) in by_id.items()}

    def resolve(ref: Any) -> str | None:
        ref = str(ref or "").strip()
        if ref in by_id:
            return ref
        return by_name.get(ref.casefold())
    return by_id, resolve


def last_seen_locations(entities: Iterable[tuple[str, str, str]],
                        events: Iterable[tuple[int, Iterable[Any], Iterable[Any]]]) -> dict[str, dict[str, Any]]:
    """{entity_id: {"location", "location_id", "chapter"}} from the latest event, in the given
    narrative order, that the entity took part in and that names a known place.

    entities: (entity_id, name, entity_type). events: (chapter, participants, locations), in
    narrative order; participants and locations are entity IDs or names."""
    by_id, resolve = _resolver(entities)
    seen: dict[str, dict[str, Any]] = {}
    for chapter, participants, locations in events:
        places = [p for p in (resolve(ref) for ref in locations or ()) if p and by_id[p][1] in PLACE_TYPES]
        if not places:
            continue
        place = places[0]
        for ref in participants or ():
            entity_id = resolve(ref)
            if entity_id is None or entity_id == place or by_id[entity_id][1] in PLACE_TYPES:
                continue
            seen[entity_id] = {"location": by_id[place][0], "location_id": place, "chapter": int(chapter or 0)}
    return seen


def from_brain(brain: Any) -> dict[str, dict[str, Any]]:
    """last_seen_locations for a StoryBrain (NarrativeEntity / NarrativeEvent), skipping superseded events."""
    events = list(getattr(brain, "events", ()))
    meta = lambda e: getattr(e, "metadata", None) or {}
    superseded = {str(meta(e).get("supersedes_id")) for e in events if meta(e).get("supersedes_id")}
    return last_seen_locations(
        ((e.entity_id, e.name, getattr(e, "entity_type", "")) for e in getattr(brain, "entities", ()) if e.entity_id),
        ((getattr(e, "chapter", 0), getattr(e, "participants", ()), meta(e).get("locations", ())) for e in events
         if getattr(e, "event_id", None) not in superseded and not meta(e).get("is_retired")))
