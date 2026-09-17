"""Deterministic projection of confirmed, append-only narrative artifacts."""
from copy import deepcopy
from typing import Any

from domain.errors import OptimisticLockError
from domain.models import NarrativeEntity, NarrativeEvent, NarrativeRelation


class ProjectionError(ValueError):
    """Invalid provenance or an ambiguous correction; nothing may be committed."""


def resolve_entity(reference: str, entities: list[NarrativeEntity]) -> str:
    matches = [e for e in entities if e.entity_id == reference or e.name.casefold() == reference.casefold()]
    if len(matches) != 1:
        raise ProjectionError(f"Unknown or ambiguous entity: {reference}")
    return str(matches[0].entity_id)


def validate_payload(kind, payload):
    required = {"event": ("event_type", "summary"),
                "state_transition": ("entity_id", "attribute_key"),
                "fact": ("fact_key",)}.get(kind, ())
    for key in required:
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            raise ProjectionError(f"{kind} requires a nonempty {key}")
    if kind == "event":
        participants = payload.get("participants", [])
        if not isinstance(participants, list) or any(not isinstance(p, str) or not p for p in participants):
            raise ProjectionError("Participants must be a list of entity names or IDs")
        chapter = payload.get("chapter", 1)
        if type(chapter) is not int or chapter < 1:
            raise ProjectionError("Chapter must be a positive integer")
    if kind == "fact" and "fact_value" not in payload:
        raise ProjectionError("Fact requires fact_value")


def transition_from_payload(transition_id, payload, entities, events, facts):
    validate_payload("state_transition", payload)
    entity_id = resolve_entity(str(payload["entity_id"]), entities)
    event_id, fact_id = payload.get("event_id"), payload.get("fact_id")
    if bool(event_id) == bool(fact_id):
        raise ProjectionError("A transition must reference exactly one event or initial fact")
    if event_id:
        event = next((e for e in events if e.event_id == event_id), None)
        if event is None or entity_id not in {resolve_entity(p, entities) for p in event.participants}:
            raise ProjectionError("Transition entity must participate in its confirmed event")
    if fact_id and not any(f["fact_id"] == fact_id and f.get("subject_entity_id") == entity_id for f in facts):
        raise ProjectionError("Initial fact must belong to the transition entity")
    key = payload.get("attribute_key")
    if not isinstance(key, str) or not key.strip() or len(key) > 100:
        raise ProjectionError("Invalid state attribute")
    if "new_value" not in payload:
        raise ProjectionError("Missing new_value")
    value = payload["new_value"]
    if key == "health" and (type(value) not in (int, float) or not 0 <= value <= 100):
        raise ProjectionError("Health must be a number between 0 and 100")
    return {"transition_id": transition_id, "entity_id": entity_id,
            "event_id": event_id, "fact_id": fact_id, "attribute_key": key,
            "new_value": deepcopy(value)}


def project(entities, facts, events, transitions) -> dict[str, Any]:
    """Replay corrections at the original event position, preserving later events."""
    by_id = {}
    replacements = {}
    for event in events:
        if event.event_id in by_id:
            raise ProjectionError("Historical event IDs are immutable and unique")
        target = event.metadata.get("supersedes_id")
        if target:
            if target not in by_id or target in replacements:
                raise ProjectionError("Correction must supersede an existing, active event")
            replacements[target] = event.event_id
        by_id[event.event_id] = event
    ordered = []
    for event in events:
        if event.metadata.get("supersedes_id"):
            continue
        active = event.event_id
        while active in replacements:
            active = replacements[active]
        ordered.append(active)
    entity_ids = {str(e.entity_id) for e in entities}
    states, provenance = {}, {}
    seen = set()
    for transition in transitions:
        transition_from_payload(transition["transition_id"], transition, entities, events, facts)
        identity = (transition.get("event_id"), transition.get("fact_id"), transition["entity_id"], transition["attribute_key"])
        if identity in seen:
            raise ProjectionError("A source may change each entity attribute only once; use an event correction")
        seen.add(identity)
    locked = {(f.get("subject_entity_id"), f.get("fact_key")): f["fact_value"]
              for f in facts if f.get("is_locked")}
    # Facts are applied only through transitions, so every attribute has provenance.
    sequence = [t for t in transitions if t.get("fact_id")]
    for event_id in ordered:
        sequence.extend(t for t in transitions if t.get("event_id") == event_id)
    for t in sequence:
        entity_id, key, value = t["entity_id"], t["attribute_key"], t["new_value"]
        if entity_id not in entity_ids:
            raise ProjectionError("Transition references an unknown entity")
        if (entity_id, key) in locked and locked[entity_id, key] != value:
            raise OptimisticLockError("State conflicts with an author-locked fact")
        if any(e.entity_id == entity_id and e.is_locked for e in entities):
            raise OptimisticLockError("Cannot project changes onto an author-locked entity")
        states.setdefault(entity_id, {})[key] = deepcopy(value)
        provenance.setdefault(entity_id, {})[key] = {
            "transition_id": t["transition_id"], "event_id": t.get("event_id"), "fact_id": t.get("fact_id")}
    relationships = []
    for entity_id, state in states.items():
        relations = state.get("active_relationships", {})
        if not isinstance(relations, dict):
            raise ProjectionError("active_relationships must be an object")
        for target, relation in relations.items():
            if not isinstance(relation, str) or not relation:
                raise ProjectionError("Relationship type must be a nonempty string")
            relationships.append({"subject_entity_id": entity_id,
                                  "object_entity_id": resolve_entity(target, entities),
                                  "relation": relation, **provenance[entity_id]["active_relationships"]})
    relationships.sort(key=lambda r: (r["subject_entity_id"], r["object_entity_id"], r["relation"]))
    return {"entities": states, "provenance": provenance, "relationships": relationships,
            "projection_version": 1}


def project_relations(entities, relations, state):
    names = {str(e.entity_id): e.name for e in entities}
    result = [r for r in relations if r.source != "projection" or r.locked]
    for relation in state["relationships"]:
        subject, target = names[relation["subject_entity_id"]], names[relation["object_entity_id"]]
        locked = next((r for r in result if r.subject == subject and r.object == target and r.locked), None)
        if locked:
            if locked.relation != relation["relation"]:
                raise OptimisticLockError("Projection conflicts with an author-locked relationship")
            continue
        result.append(NarrativeRelation(subject=subject, object=target,
            relation=relation["relation"], source="projection", metadata=relation))
    return tuple(result)
