"""Deterministic projection of confirmed, append-only narrative artifacts."""
from copy import deepcopy
from typing import Any

from domain.errors import OptimisticLockError
from domain.models import NarrativeEntity, NarrativeEvent, NarrativeRelation


class ProjectionError(ValueError):
    """Invalid provenance or an ambiguous correction; nothing may be committed."""


_GLOBAL_SETUP_WORLD_RULE_ROOT_SOURCES = frozenset({"author_setup", "author", "model_suggestion"})
_GLOBAL_SETUP_WORLD_RULE_SUCCESSOR_SOURCES = frozenset({"author_setup", "author"})


def _fact_identity(fact: dict[str, Any]) -> str:
    raw = fact.get("fact_id") or fact.get("id")
    if raw is None or not str(raw).strip():
        raise ProjectionError("Fact requires a canonical fact_id")
    return str(raw)


def _is_global_setup_world_rule(fact: dict[str, Any], *, is_successor: bool = False) -> bool:
    if (fact.get("fact_type") or fact.get("type", "world_rule")) != "world_rule":
        return False
    if fact.get("subject_entity_id") is not None:
        return False
    if fact.get("source_revision_id") is not None:
        return False
    if fact.get("chapter_number") is not None or fact.get("chapter") is not None:
        return False
    if fact.get("source_start") is not None or fact.get("source_end") is not None:
        return False
    value = fact.get("fact_value", fact.get("statement"))
    if isinstance(value, dict) and (
        value.get("chapter_number") is not None or value.get("chapter") is not None
    ):
        return False
    key = fact.get("fact_key")
    if not isinstance(key, str) or not key.strip():
        return False
    if value is None or (isinstance(value, str) and not value.strip()):
        return False
    source_type = fact.get("source_type")
    if is_successor:
        return source_type in _GLOBAL_SETUP_WORLD_RULE_SUCCESSOR_SOURCES
    if source_type is not None and source_type not in _GLOBAL_SETUP_WORLD_RULE_ROOT_SOURCES:
        return False
    return True


def resolve_effective_facts(
    facts: list[dict[str, Any]] | tuple[dict[str, Any], ...],
    *,
    tenant_id: str | None = None,
    novel_id: str | None = None,
    story_brain_id: str | None = None,
    expected_setup_actor: str | None = None,
) -> list[dict[str, Any]]:
    """Resolve one deterministic effective head per global World Setup rule chain.

    Fail closed with ProjectionError on any malformed, cyclic, forked, orphaned,
    cross-scope, unconfirmed, unapproved, or terminal-retired lineage.
    """
    confirmed_by_id: dict[str, dict[str, Any]] = {}
    ordered_confirmed: list[dict[str, Any]] = []
    for raw_fact in facts:
        fact = dict(raw_fact)
        fact_id = _fact_identity(fact)
        fact.setdefault("fact_id", fact_id)
        for scope_key, expected_val in (
            ("tenant_id", tenant_id),
            ("novel_id", novel_id),
            ("story_brain_id", story_brain_id),
        ):
            if expected_val is not None and fact.get(scope_key) is not None:
                if str(fact[scope_key]) != str(expected_val):
                    raise ProjectionError(f"Fact {scope_key} scope mismatch")
        status = fact.get("confirmation_status", "confirmed")
        if status != "confirmed":
            if fact.get("supersedes_id") is not None:
                raise ProjectionError("Unconfirmed fact cannot supersede an active World Setup rule")
            continue
        if fact_id in confirmed_by_id:
            raise ProjectionError("Historical fact IDs are immutable and unique")
        if (
            expected_setup_actor is not None
            and _is_global_setup_world_rule(fact)
            and fact.get("source_type") in _GLOBAL_SETUP_WORLD_RULE_ROOT_SOURCES
            and "created_by" in fact
            and (not fact.get("created_by") or str(fact.get("created_by")) != str(expected_setup_actor))
        ):
            raise ProjectionError("World Setup rule actor mismatch")
        confirmed_by_id[fact_id] = fact
        ordered_confirmed.append(fact)

    successor_by_parent: dict[str, str] = {}
    for fact in ordered_confirmed:
        child_id = _fact_identity(fact)
        parent_raw = fact.get("supersedes_id")
        if parent_raw is None:
            continue
        parent_id = str(parent_raw).strip()
        if not parent_id or parent_id == child_id:
            raise ProjectionError("World Setup rule cannot supersede itself")
        parent = confirmed_by_id.get(parent_id)
        if parent is None:
            raise ProjectionError("World Setup rule supersedes an unknown or out-of-scope parent")
        for scope_key in ("tenant_id", "novel_id", "story_brain_id"):
            c_val = fact.get(scope_key)
            p_val = parent.get(scope_key)
            if (c_val is not None or p_val is not None) and str(c_val or "") != str(p_val or ""):
                raise ProjectionError(f"World Setup supersession {scope_key} mismatch")
        if not _is_global_setup_world_rule(parent, is_successor=bool(parent.get("supersedes_id"))):
            raise ProjectionError("Superseded parent is not a valid global World Setup rule")
        if not _is_global_setup_world_rule(fact, is_successor=True):
            raise ProjectionError("Successor is not a valid author-approved global World Setup rule")
        if "created_by" in fact or "created_by" in parent:
            child_actor = fact.get("created_by")
            parent_actor = parent.get("created_by")
            if not child_actor or not parent_actor or str(child_actor) != str(parent_actor):
                raise ProjectionError("World Setup rule successor author provenance mismatch")
            if expected_setup_actor is not None and str(child_actor) != str(expected_setup_actor):
                raise ProjectionError("World Setup rule successor actor mismatch")
        if parent_id in successor_by_parent:
            raise ProjectionError("Ambiguous forked World Setup rule lineage")
        successor_by_parent[parent_id] = child_id

    for start_id in confirmed_by_id:
        seen: set[str] = set()
        cursor: str | None = start_id
        while cursor is not None:
            if cursor in seen:
                raise ProjectionError("Cyclic World Setup rule lineage")
            seen.add(cursor)
            cursor = successor_by_parent.get(cursor)

    effective: list[dict[str, Any]] = []
    for fact in ordered_confirmed:
        fact_id = _fact_identity(fact)
        if fact_id in successor_by_parent:
            continue
        if fact.get("is_retired"):
            if (
                fact.get("supersedes_id") is not None
                or (fact.get("fact_type") or fact.get("type", "world_rule")) == "world_rule"
            ):
                raise ProjectionError("Retired World Setup rule has no active successor")
            continue
        effective.append(fact)
    return effective



def validate_author_edit(kind, original, edited, entity_ids):
    """Full replacement edits cannot change source authority or reserved identities."""
    editable = {'entity': {'canonical_name', 'normalized_name'},
                'event': {'summary', 'event_type', 'participants'},
                'fact': {'fact_key', 'fact_value', 'subject_entity_id'},
                'state_transition': {'attribute_key', 'new_value', 'entity_id'}}.get(kind, set())
    for key in original.keys() | edited.keys():
        if kind == 'entity' and key == 'entity_id' and key not in edited:
            continue  # Persistence restores the frozen reserved ID; never allocate a replacement.
        if key not in editable and (key not in original or key not in edited or original[key] != edited[key]):
            raise ProjectionError(f'Author edit cannot change protected field: {key}')
    validate_payload(kind, edited)
    if kind == 'entity' and (not isinstance(edited.get('canonical_name'), str)
            or not edited['canonical_name'].strip()
            or edited.get('normalized_name') != edited['canonical_name'].casefold()):
        raise ProjectionError('Entity display label and normalized label must agree')
    references = []
    if (kind == 'fact' and original.get('subject_entity_name')
            and edited.get('subject_entity_id') != original.get('subject_entity_id')):
        raise ProjectionError('Legacy name-bound fact subject requires an identity-safe correction proposal')
    if kind == 'event' and edited.get('participants') != original.get('participants'):
        references.extend(edited.get('participants', []))
    for key in ('subject_entity_id', 'entity_id'):
        if edited.get(key) != original.get(key) and edited.get(key):
            references.append(edited[key])
    if kind == 'state_transition' and edited.get('attribute_key') == 'active_relationships':
        value = edited.get('new_value')
        if not isinstance(value, dict):
            raise ProjectionError('Relationships require exact target IDs')
        references.extend(value)
    if any(not isinstance(reference, str) or reference not in entity_ids for reference in references):
        raise ProjectionError('Author edit references an unapproved or unreviewed identity')


def resolve_entity(reference: str, entities: list[NarrativeEntity]) -> str:
    exact = [e for e in entities if e.entity_id == reference]
    matches = exact or [e for e in entities if e.name.casefold() == reference.casefold()]
    if len(matches) != 1:
        raise ProjectionError(f"Unknown or ambiguous entity: {reference}")
    return str(matches[0].entity_id)


def validate_payload(kind, payload):
    if kind == 'entity' and payload.get('entity_id') is not None:
        import uuid
        try:
            uuid.UUID(payload['entity_id'])
        except (ValueError, TypeError, AttributeError) as exc:
            raise ProjectionError('Entity identity must be a UUID') from exc
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
    facts = resolve_effective_facts(facts)
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


def relationship_identity(relation, entities):
    """Authoritative complete ID pair, or provably unique legacy names. Never pick a homonym."""
    subject = relation.metadata.get('subject_entity_id')
    target = relation.metadata.get('object_entity_id')
    if bool(subject) != bool(target):
        raise ProjectionError('Relationship has an incomplete identity pair')
    if subject:
        ids = {str(e.entity_id) for e in entities}
        if subject not in ids or target not in ids:
            raise ProjectionError('Relationship references an unknown identity')
        return subject, target
    return resolve_entity(relation.subject, entities), resolve_entity(relation.object, entities)


def author_relationship(entities, relations, subject, relation_type, target):
    def endpoint(reference):
        import uuid
        matches = [e for e in entities if str(e.entity_id) == reference or e.name.casefold() == reference.casefold()]
        if not matches:
            try:
                uuid.UUID(reference)
            except ValueError:
                return None  # Historical author API permits an unresolved name, never an invented ID.
        return resolve_entity(reference, entities)
    pair = endpoint(subject), endpoint(target)
    if None in pair:
        retained = tuple(r for r in relations if r.subject != subject or r.object != target
            or r.metadata.get('subject_entity_id') or r.metadata.get('object_entity_id'))
        return retained + (NarrativeRelation(subject=subject, object=target, relation=relation_type,
            source='author', locked=True, metadata={'identity_resolution':'unresolved'}),)
    # Validate every affected legacy row before replacing anything.
    retained = tuple(r for r in relations if (r.source == 'system' and r.relation == 'MENTIONED_IN' and not r.locked)
        or relationship_identity(r, entities) != pair)
    names = {str(e.entity_id): e.name for e in entities}
    previous = next((r.metadata for r in relations if r not in retained), {})
    return retained + (NarrativeRelation(subject=names[pair[0]], object=names[pair[1]],
        relation=relation_type, source='author', locked=True,
        metadata={**previous, 'subject_entity_id':pair[0], 'object_entity_id':pair[1]}),)


def project_relations(entities, relations, state):
    names = {str(e.entity_id): e.name for e in entities}
    result, locks = [], {}
    for r in relations:
        if r.source == 'projection' and not r.locked:
            continue
        if r.source == 'system' and r.relation == 'MENTIONED_IN' and not r.locked:
            result.append(r)
            continue
        pair = relationship_identity(r, entities)
        if r.locked:
            if pair in locks and locks[pair] != r.relation:
                raise OptimisticLockError('Conflicting author locks for the same identity pair')
            locks[pair] = r.relation
        result.append(NarrativeRelation(subject=r.subject, object=r.object, relation=r.relation,
            source=r.source, locked=r.locked, metadata={**r.metadata,
                'subject_entity_id':pair[0], 'object_entity_id':pair[1]}))
    for relation in state['relationships']:
        pair = relation['subject_entity_id'], relation['object_entity_id']
        if pair in locks:
            if locks[pair] != relation['relation']:
                raise OptimisticLockError('Projection conflicts with an author-locked relationship')
            continue
        result.append(NarrativeRelation(subject=names[pair[0]], object=names[pair[1]],
            relation=relation['relation'], source='projection', metadata=deepcopy(relation)))
    return tuple(result)
