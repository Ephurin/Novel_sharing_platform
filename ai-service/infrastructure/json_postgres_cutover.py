from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from core.story_kb_manager import StoryKB, StoryKBManager
from domain.models import NarrativeEntity, NarrativeEvent, NarrativeRelation, StoryBrain
from domain.projection import project
from infrastructure.json_narrative_repository import JsonNarrativeRepository
from infrastructure.orm_models import (
    AnalysisRunRecord,
    CurrentEntityStateRecord,
    EntityAliasRecord,
    EntityMentionRecord,
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    FactRecord,
    ProposalRecord,
    RelationshipRecord,
    StateTransitionRecord,
    StoryBrainRecord,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


class CutoverMigrationError(RuntimeError):
    """Raised when legacy data cannot be migrated without semantic ambiguity."""


def stable_uuid(kind: str, value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return uuid.uuid5(uuid.NAMESPACE_URL, f"{kind}:{value}")


def novel_uuid(story_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(story_id)
    except ValueError:
        return uuid.uuid5(uuid.NAMESPACE_URL, f"novel:{story_id}")


def legacy_entity_uuid(story_id: str, name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:{name.casefold()}")


def canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): canonicalize(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, (list, tuple)):
        return [canonicalize(item) for item in value]
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _clean_event_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    ignored = {
        "id",
        "event_id",
        "event_type",
        "participants",
        "summary",
        "raw_text",
        "chapter",
        "narrative_order",
    }
    return canonicalize({key: value for key, value in metadata.items() if key not in ignored})


def canonical_snapshot(brain: StoryBrain) -> dict[str, Any]:
    entities = sorted(
        (
            {
                "entity_id": str(entity.entity_id or legacy_entity_uuid(brain.story_id, entity.name)),
                "name": entity.name,
                "entity_type": entity.entity_type,
                "status": entity.status,
                "location": entity.location,
                "mentions": int(entity.mentions),
                "is_locked": bool(entity.is_locked),
            }
            for entity in brain.entities
        ),
        key=lambda item: (item["entity_id"], item["name"].casefold()),
    )

    entity_ids_by_ref: dict[str, str] = {}
    for entity in brain.entities:
        entity_id = str(entity.entity_id or legacy_entity_uuid(brain.story_id, entity.name))
        entity_ids_by_ref[entity_id] = entity_id
        entity_ids_by_ref[entity.name.casefold()] = entity_id

    facts = []
    for index, fact in enumerate(brain.facts):
        raw_id = fact.get("fact_id") or fact.get("id") or f"{fact.get('fact_key', 'fact')}:{index}"
        facts.append(
            {
                "fact_id": str(stable_uuid("fact", str(raw_id))),
                "subject_entity_id": (
                    entity_ids_by_ref.get(
                        str(fact["subject_entity_id"]),
                        entity_ids_by_ref.get(str(fact["subject_entity_id"]).casefold()),
                    )
                    if fact.get("subject_entity_id")
                    else None
                ),
                "fact_type": str(fact.get("fact_type") or "fact"),
                "fact_key": str(fact.get("fact_key") or f"legacy.fact.{index}"),
                "fact_value": canonicalize(fact.get("fact_value")),
                "is_locked": bool(fact.get("is_locked", False)),
            }
        )
    facts.sort(key=lambda item: item["fact_id"])

    relations = sorted(
        (
            {
                "subject": item.subject,
                "relation": item.relation,
                "object": item.object,
                "metadata": canonicalize(item.metadata),
                "source": item.source,
                "locked": bool(item.locked),
            }
            for item in brain.relations
            if item.source != "projection" or item.locked
        ),
        key=lambda item: (
            item["subject"].casefold(),
            item["relation"],
            item["object"].casefold(),
            item["source"],
        ),
    )

    events = []
    for index, event in enumerate(brain.events):
        narrative_order = int(
            event.metadata.get("narrative_order")
            if event.metadata.get("narrative_order") is not None
            else (index + 1) * 1024
        )
        events.append(
            {
                "event_id": str(stable_uuid("event", event.event_id)),
                "narrative_order": narrative_order,
                "event_type": event.event_type,
                "summary": event.summary,
                "chapter": int(event.chapter),
                "participants": sorted(str(value) for value in event.participants),
                "metadata": _clean_event_metadata(event.metadata),
            }
        )
    events.sort(key=lambda item: (item["narrative_order"], item["event_id"]))

    aliases = sorted(
        (
            {
                "alias_id": str(stable_uuid("alias", item.alias_id)),
                "entity_id": str(stable_uuid("entity", item.entity_id)),
                "alias": item.alias,
                "normalized_alias": item.normalized_alias,
            }
            for item in brain.aliases
        ),
        key=lambda item: item["alias_id"],
    )
    mentions = sorted(
        (
            {
                "mention_id": str(stable_uuid("mention", item.mention_id)),
                "entity_id": str(stable_uuid("entity", item.entity_id)),
                "chapter_id": str(stable_uuid("chapter", item.chapter_id)),
                "revision_id": str(stable_uuid("revision", item.revision_id)),
                "surface_text": item.surface_text,
                "source_start": int(item.source_start),
                "source_end": int(item.source_end),
                "source_text_hash": item.source_text_hash,
                "extractor_version": item.extractor_version,
            }
            for item in brain.mentions
        ),
        key=lambda item: item["mention_id"],
    )
    proposals = []
    for index, item in enumerate(brain.proposals):
        proposals.append(
            {
                "proposal_id": str(stable_uuid("proposal", item.proposal_id)),
                "analysis_run_id": str(
                    stable_uuid(
                        "analysis",
                        item.analysis_run_id or f"legacy-cutover:{item.proposal_id}",
                    )
                ),
                "dependency_group_id": str(
                    stable_uuid(
                        "proposal-group",
                        item.dependency_group_id or f"{brain.story_id}:{index}",
                    )
                ),
                "materialization_order": int(item.materialization_order),
                "proposal_type": item.proposal_type,
                "payload": canonicalize(item.payload),
                "evidence": canonicalize(list(item.evidence)),
                "confidence": item.confidence,
                "expected_brain_version": int(item.expected_brain_version),
                "status": item.status.value,
                "decision_reason": item.decision_reason,
            }
        )
    proposals.sort(key=lambda item: item["proposal_id"])

    transitions = []
    for index, item in enumerate(brain.transitions):
        raw = dict(item)
        entity_ref = raw.get("entity_id")
        transitions.append({
            "transition_id": str(
                stable_uuid(
                    "transition",
                    str(raw.get("transition_id") or f"{brain.story_id}:{index}"),
                )
            ),
            "entity_id": (
                entity_ids_by_ref.get(
                    str(entity_ref),
                    entity_ids_by_ref.get(str(entity_ref).casefold()),
                )
                if entity_ref is not None
                else None
            ),
            "event_id": (
                str(stable_uuid("event", str(raw["event_id"])))
                if raw.get("event_id")
                else None
            ),
            "fact_id": (
                str(stable_uuid("fact", str(raw["fact_id"])))
                if raw.get("fact_id")
                else None
            ),
            "attribute_key": raw.get("attribute_key"),
            "new_value": canonicalize(raw.get("new_value")),
            "sequence": int(raw.get("sequence", index + 1) or index + 1),
        })
    transitions.sort(
        key=lambda item: (
            int(item.get("sequence", 0) or 0),
            str(item.get("transition_id", "")),
        )
    )

    raw_state = brain.current_state or {
        "entities": {},
        "provenance": {},
        "relationships": [],
        "projection_version": 1,
    }
    state_entities: dict[str, Any] = {}
    state_provenance: dict[str, Any] = {}
    for raw_entity_id, value in (raw_state.get("entities") or {}).items():
        normalized_entity_id = entity_ids_by_ref.get(
            str(raw_entity_id),
            entity_ids_by_ref.get(str(raw_entity_id).casefold(), str(raw_entity_id)),
        )
        state_entities[normalized_entity_id] = canonicalize(value)

    for raw_entity_id, attributes in (raw_state.get("provenance") or {}).items():
        normalized_entity_id = entity_ids_by_ref.get(
            str(raw_entity_id),
            entity_ids_by_ref.get(str(raw_entity_id).casefold(), str(raw_entity_id)),
        )
        normalized_attributes: dict[str, Any] = {}
        for attribute, provenance in (attributes or {}).items():
            item = dict(provenance or {})
            if item.get("transition_id"):
                item["transition_id"] = str(stable_uuid("transition", str(item["transition_id"])))
            if item.get("event_id"):
                item["event_id"] = str(stable_uuid("event", str(item["event_id"])))
            if item.get("fact_id"):
                item["fact_id"] = str(stable_uuid("fact", str(item["fact_id"])))
            normalized_attributes[str(attribute)] = canonicalize(item)
        state_provenance[normalized_entity_id] = normalized_attributes

    relationships = []
    for relationship in raw_state.get("relationships") or []:
        item = dict(relationship)
        for key in ("subject_entity_id", "object_entity_id"):
            if item.get(key):
                item[key] = entity_ids_by_ref.get(
                    str(item[key]),
                    entity_ids_by_ref.get(str(item[key]).casefold(), str(item[key])),
                )
        if item.get("transition_id"):
            item["transition_id"] = str(stable_uuid("transition", str(item["transition_id"])))
        if item.get("event_id"):
            item["event_id"] = str(stable_uuid("event", str(item["event_id"])))
        if item.get("fact_id"):
            item["fact_id"] = str(stable_uuid("fact", str(item["fact_id"])))
        relationships.append(canonicalize(item))
    relationships.sort(
        key=lambda item: (
            str(item.get("subject_entity_id", "")),
            str(item.get("object_entity_id", "")),
            str(item.get("relation", "")),
        )
    )
    state = {
        "entities": canonicalize(state_entities),
        "provenance": canonicalize(state_provenance),
        "relationships": relationships,
        "projection_version": int(raw_state.get("projection_version", 1) or 1),
    }

    metadata = {
        "brain_version": int(brain.metadata.get("brain_version", "1") or 1),
        "status": str(brain.metadata.get("status", "initializing")),
        "baseline_revision_id": (
            str(stable_uuid("revision", brain.metadata["baseline_revision_id"]))
            if brain.metadata.get("baseline_revision_id")
            else None
        ),
    }
    return {
        "story_id": brain.story_id,
        "metadata": metadata,
        "entities": entities,
        "aliases": aliases,
        "mentions": mentions,
        "facts": facts,
        "relations": relations,
        "events": events,
        "proposals": proposals,
        "transitions": transitions,
        "state": state,
    }


class JsonPostgresCutoverMigrator:
    """One-way legacy JSON -> PostgreSQL cutover helper. Source JSON is never mutated."""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        *,
        tenant_id: str | uuid.UUID,
        actor_id: str | uuid.UUID,
        json_storage: str | Path,
    ) -> None:
        self._session_factory = session_factory
        self._tenant_id = uuid.UUID(str(tenant_id))
        self._actor_id = uuid.UUID(str(actor_id))
        self._manager = StoryKBManager(json_storage)
        self._source = JsonNarrativeRepository(self._manager)
        self._target = PostgresNarrativeRepository(
            session_factory,
            tenant_id=self._tenant_id,
            actor_id=self._actor_id,
        )

    def story_ids(self) -> list[str]:
        return sorted(path.stem for path in self._manager.storage_dir.glob("*.json"))

    def source_file(self, story_id: str) -> Path:
        return self._manager._get_file_path(story_id)

    def source_hash(self, story_id: str) -> str:
        path = self.source_file(story_id)
        if not path.exists():
            raise FileNotFoundError(path)
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def raw_legacy_diagnostics(self, story_id: str) -> dict[str, Any]:
        raw = self._source.export_snapshot(story_id)
        unsupported: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []

        def nonempty(value: Any) -> bool:
            if isinstance(value, dict):
                return any(nonempty(item) for item in value.values())
            if isinstance(value, (list, tuple, set)):
                return bool(value)
            return value not in (None, "", 0, False)

        # These fields belong to older StoryKB pipelines but are intentionally
        # ignored by JsonNarrativeRepository.get_story_brain(). P8-01 migrates
        # the adapter-backed canonical view; legacy-only fields remain archived
        # in the untouched source JSON until the final post-release cleanup gate.
        for key in ("events", "event_history", "entity_states", "relation_history"):
            if nonempty(raw.get(key)):
                warnings.append({
                    "field": key,
                    "count": len(raw.get(key) or {}),
                    "reason": (
                        "legacy-only field is not part of the current "
                        "JsonNarrativeRepository canonical StoryBrain view; "
                        "retained in source JSON archive"
                    ),
                })
        world = raw.get("current_world_state") or {}
        if nonempty(world.get("characters")):
            warnings.append({
                "field": "current_world_state.characters",
                "count": len(world.get("characters") or {}),
                "reason": (
                    "legacy-only world state is not part of the current "
                    "JsonNarrativeRepository canonical StoryBrain view; "
                    "retained in source JSON archive"
                ),
            })
        return {"unsupported": unsupported, "warnings": warnings}

    def plan(self, story_id: str) -> dict[str, Any]:
        self._strict_validate_source_file(story_id)
        source_brain = self._source.get_story_brain(story_id)
        source_snapshot = canonical_snapshot(source_brain)
        diagnostics = self.raw_legacy_diagnostics(story_id)
        diagnostics["warnings"].extend(
            self._canonical_reference_warnings(source_brain)
        )

        validation_error: str | None = None
        try:
            self._validate_source(source_brain)
        except CutoverMigrationError as exc:
            validation_error = str(exc)

        id_collisions = self._global_id_collisions(story_id, source_snapshot)
        target_exists, target_nonempty = self._target_status(story_id)

        parity = None
        target_snapshot = None
        if target_exists:
            target_snapshot = canonical_snapshot(self._target.get_story_brain(story_id))
            parity = target_snapshot == source_snapshot

        action = (
            "blocked_unsupported"
            if diagnostics["unsupported"]
            else "blocked_validation"
            if validation_error
            else "blocked_id_collision"
            if id_collisions
            else "already_migrated"
            if parity is True
            else "blocked_conflict"
            if target_nonempty
            else "ready"
        )
        return {
            "story_id": story_id,
            "mode": "dry-run",
            "source_sha256": self.source_hash(story_id),
            "source_counts": self._counts(source_snapshot),
            "target_exists": target_exists,
            "target_nonempty": target_nonempty,
            "target_counts": self._counts(target_snapshot) if target_snapshot else {},
            "parity": parity,
            "safe_to_apply": action in {"ready", "already_migrated"},
            "action": action,
            "unsupported": diagnostics["unsupported"],
            "warnings": diagnostics["warnings"],
            "validation_error": validation_error,
            "id_collisions": id_collisions,
        }

    def apply(self, story_id: str) -> dict[str, Any]:
        before_hash = self.source_hash(story_id)
        plan = self.plan(story_id)
        if plan["action"] == "already_migrated":
            return {**plan, "mode": "apply", "applied": False, "idempotent": True}
        if plan["action"] != "ready":
            raise CutoverMigrationError(
                f"Migration blocked for {story_id}: {plan['action']} "
                f"unsupported={plan['unsupported']} "
                f"validation_error={plan.get('validation_error')} "
                f"id_collisions={plan.get('id_collisions')}"
            )

        self._strict_validate_source_file(story_id)
        source_brain = self._source.get_story_brain(story_id)
        if self.source_hash(story_id) != before_hash:
            raise CutoverMigrationError("Source JSON changed between preflight and apply")
        self._validate_source(source_brain)
        self._apply_brain(source_brain, expected_source_hash=before_hash)

        after_hash = self.source_hash(story_id)
        if after_hash != before_hash:
            raise CutoverMigrationError("Source JSON changed during migration")

        source_snapshot = canonical_snapshot(source_brain)
        target_snapshot = canonical_snapshot(self._target.get_story_brain(story_id))
        if source_snapshot != target_snapshot:
            raise CutoverMigrationError("Post-apply canonical snapshot parity failed")

        result = self.plan(story_id)
        return {
            **result,
            "mode": "apply",
            "applied": True,
            "idempotent": False,
            "source_unchanged": after_hash == before_hash,
        }

    def _strict_validate_source_file(self, story_id: str) -> None:
        path = self.source_file(story_id)
        if not path.exists():
            raise FileNotFoundError(path)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            validated = StoryKB.model_validate(raw)
        except Exception as exc:
            raise CutoverMigrationError(
                f"Invalid legacy StoryKB JSON for {story_id}: {exc}"
            ) from exc
        if validated.story_id != story_id:
            raise CutoverMigrationError(
                f"Story ID mismatch: file requested as {story_id} but contains {validated.story_id}"
            )

    @staticmethod
    def _canonical_reference_warnings(brain: StoryBrain) -> list[dict[str, Any]]:
        entity_ids = {
            str(entity.entity_id or legacy_entity_uuid(brain.story_id, entity.name))
            for entity in brain.entities
        }
        entity_names = {entity.name.casefold() for entity in brain.entities}

        def known(reference: Any) -> bool:
            value = str(reference)
            return value in entity_ids or value.casefold() in entity_names

        warnings: list[dict[str, Any]] = []
        for event in brain.events:
            unresolved = sorted(
                {str(value) for value in event.participants if not known(value)}
            )
            if unresolved:
                warnings.append({
                    "field": f"event:{event.event_id}.participants",
                    "count": len(unresolved),
                    "values": unresolved,
                    "reason": (
                        "unresolved legacy participant labels are preserved in "
                        "EventRecord.participants but cannot create entity join rows"
                    ),
                })

        for index, relation in enumerate(brain.relations):
            if relation.source == "projection" and not relation.locked:
                continue
            unresolved = [
                value
                for value in (relation.subject, relation.object)
                if not known(value)
            ]
            if unresolved:
                warnings.append({
                    "field": f"relationship:{index}.endpoints",
                    "count": len(unresolved),
                    "values": unresolved,
                    "reason": (
                        "unresolved legacy relationship labels are preserved by "
                        "name; they are not promoted to new canonical entities"
                    ),
                })
        return warnings

    def _validate_source(self, brain: StoryBrain) -> None:
        entity_by_id = {
            str(entity.entity_id or legacy_entity_uuid(brain.story_id, entity.name)): entity
            for entity in brain.entities
        }
        entity_by_name = {entity.name.casefold(): entity for entity in brain.entities}

        def resolve(reference: Any, *, label: str) -> NarrativeEntity:
            value = str(reference)
            entity = entity_by_id.get(value) or entity_by_name.get(value.casefold())
            if entity is None:
                raise CutoverMigrationError(
                    f"{label} references unknown legacy entity: {value}"
                )
            return entity

        for alias in brain.aliases:
            resolve(alias.entity_id, label=f"Alias {alias.alias_id}")
        for mention in brain.mentions:
            resolve(mention.entity_id, label=f"Mention {mention.mention_id}")
        for index, fact in enumerate(brain.facts):
            if not isinstance(fact.get("fact_key"), str) or not fact["fact_key"].strip():
                raise CutoverMigrationError(
                    f"Fact {fact.get('fact_id') or fact.get('id') or index} has no fact_key"
                )
            if "fact_value" not in fact:
                raise CutoverMigrationError(
                    f"Fact {fact.get('fact_id') or fact.get('id') or index} has no fact_value"
                )
            if fact.get("subject_entity_id"):
                resolve(
                    fact["subject_entity_id"],
                    label=f"Fact {fact.get('fact_id') or fact.get('id') or index}",
                )
        previous_order: int | None = None
        seen_orders: set[int] = set()
        for index, event in enumerate(brain.events):
            if not event.event_type.strip() or not event.summary.strip():
                raise CutoverMigrationError(
                    f"Event {event.event_id} requires nonempty type and summary"
                )
            if int(event.chapter) < 1:
                raise CutoverMigrationError(
                    f"Event {event.event_id} has invalid chapter {event.chapter}"
                )
            narrative_order = int(
                event.metadata.get("narrative_order")
                if event.metadata.get("narrative_order") is not None
                else (index + 1) * 1024
            )
            if narrative_order in seen_orders:
                raise CutoverMigrationError(
                    f"Duplicate event narrative_order: {narrative_order}"
                )
            if previous_order is not None and narrative_order <= previous_order:
                raise CutoverMigrationError(
                    "Legacy enhanced_events order disagrees with narrative_order"
                )
            seen_orders.add(narrative_order)
            previous_order = narrative_order
            # Legacy enhanced events may contain free-form participant names that
            # never became canonical entities. PostgreSQL preserves the participant
            # strings in EventRecord; only resolvable entities receive join rows.
        # RelationshipRecord deliberately stores canonical names/labels rather than
        # entity foreign keys. Preserve legacy free-form endpoints exactly; hybrid
        # entity signals will only attach to endpoints that resolve to known entities.

        state = brain.current_state or {}
        for entity_id in (state.get("entities") or {}):
            resolve(entity_id, label="Narrative projection")
        for entity_id in (state.get("provenance") or {}):
            resolve(entity_id, label="Narrative projection provenance")
        for relationship in state.get("relationships") or []:
            resolve(
                relationship.get("subject_entity_id"),
                label="Projected relationship subject",
            )
            resolve(
                relationship.get("object_entity_id"),
                label="Projected relationship object",
            )

        self._validate_projection(brain)

    def _global_id_collisions(
        self,
        story_id: str,
        snapshot: dict[str, Any],
    ) -> list[dict[str, str]]:
        """Return source IDs already owned by another tenant/novel.

        PostgreSQL primary keys are global even where the logical repository scope
        is tenant + novel. A legacy string ID reused in two JSON files must be
        blocked rather than silently remapped during cutover.
        """

        target_novel_id = novel_uuid(story_id)
        collisions: list[dict[str, str]] = []

        def foreign_scope(record: Any) -> bool:
            tenant = getattr(record, "tenant_id", None)
            novel = getattr(record, "novel_id", None)
            return (
                tenant is not None
                and novel is not None
                and (
                    uuid.UUID(str(tenant)) != self._tenant_id
                    or uuid.UUID(str(novel)) != target_novel_id
                )
            )

        with self._session_factory() as session:
            checks: tuple[tuple[str, type[Any], list[dict[str, Any]], str], ...] = (
                ("entity", EntityRecord, snapshot["entities"], "entity_id"),
                ("mention", EntityMentionRecord, snapshot["mentions"], "mention_id"),
                ("fact", FactRecord, snapshot["facts"], "fact_id"),
                ("event", EventRecord, snapshot["events"], "event_id"),
                ("proposal", ProposalRecord, snapshot["proposals"], "proposal_id"),
                ("transition", StateTransitionRecord, snapshot["transitions"], "transition_id"),
            )
            for kind, model, items, key in checks:
                for item in items:
                    record = session.get(model, uuid.UUID(item[key]))
                    if record is not None and foreign_scope(record):
                        collisions.append({
                            "kind": kind,
                            "id": item[key],
                            "reason": "primary key is already owned by another tenant/novel",
                        })

            analysis_run_ids = sorted(
                {item["analysis_run_id"] for item in snapshot["proposals"]}
            )
            for analysis_run_id in analysis_run_ids:
                record = session.get(AnalysisRunRecord, uuid.UUID(analysis_run_id))
                if record is not None and foreign_scope(record):
                    collisions.append({
                        "kind": "analysis_run",
                        "id": analysis_run_id,
                        "reason": "primary key is already owned by another tenant/novel",
                    })

            for item in snapshot["aliases"]:
                alias = session.get(EntityAliasRecord, uuid.UUID(item["alias_id"]))
                if alias is None:
                    continue
                owner = session.get(EntityRecord, alias.entity_id)
                if owner is None or foreign_scope(owner):
                    collisions.append({
                        "kind": "alias",
                        "id": item["alias_id"],
                        "reason": "primary key is already owned by another tenant/novel",
                    })

        collisions.sort(key=lambda item: (item["kind"], item["id"]))
        return collisions

    def _target_status(self, story_id: str) -> tuple[bool, bool]:
        novel_id = novel_uuid(story_id)
        with self._session_factory() as session:
            brain = session.scalar(
                select(StoryBrainRecord).where(
                    StoryBrainRecord.tenant_id == self._tenant_id,
                    StoryBrainRecord.novel_id == novel_id,
                )
            )
            if brain is None:
                return False, False
            canonical_models = (
                EntityRecord,
                EntityMentionRecord,
                FactRecord,
                RelationshipRecord,
                EventRecord,
                ProposalRecord,
                StateTransitionRecord,
                CurrentEntityStateRecord,
            )
            for model in canonical_models:
                conditions = []
                if hasattr(model, "tenant_id"):
                    conditions.append(model.tenant_id == self._tenant_id)
                if hasattr(model, "novel_id"):
                    conditions.append(model.novel_id == novel_id)
                elif hasattr(model, "story_brain_id"):
                    conditions.append(model.story_brain_id == brain.id)
                count = session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0
                if count:
                    return True, True
            return True, False

    @staticmethod
    def _counts(snapshot: dict[str, Any] | None) -> dict[str, int]:
        if not snapshot:
            return {}
        return {
            key: len(snapshot.get(key, []))
            for key in (
                "entities",
                "aliases",
                "mentions",
                "facts",
                "relations",
                "events",
                "proposals",
                "transitions",
            )
        }

    def _validate_projection(self, brain: StoryBrain) -> None:
        if not brain.transitions:
            expected = brain.current_state or {}
            entities = expected.get("entities", {}) if isinstance(expected, dict) else {}
            provenance = expected.get("provenance", {}) if isinstance(expected, dict) else {}
            relationships = expected.get("relationships", []) if isinstance(expected, dict) else []
            if entities or provenance or relationships:
                raise CutoverMigrationError(
                    "Canonical narrative_projection is non-empty but state_transitions are absent; "
                    "refusing to invent projection provenance"
                )
            return

        replayed = project(
            list(brain.entities),
            [dict(item) for item in brain.facts],
            list(brain.events),
            [dict(item) for item in brain.transitions],
        )
        if canonicalize(replayed) != canonicalize(brain.current_state):
            raise CutoverMigrationError(
                "Legacy state_transitions do not replay to the canonical narrative_projection"
            )

    def _apply_brain(
        self,
        brain: StoryBrain,
        *,
        expected_source_hash: str | None = None,
    ) -> None:
        story_id = brain.story_id
        novel_id = novel_uuid(story_id)
        source_snapshot = canonical_snapshot(brain)
        with self._session_factory.begin() as session:
            existing = session.scalar(
                select(StoryBrainRecord).where(
                    StoryBrainRecord.tenant_id == self._tenant_id,
                    StoryBrainRecord.novel_id == novel_id,
                )
            )
            if existing is None:
                brain_record = StoryBrainRecord(
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                )
                session.add(brain_record)
                session.flush()
            else:
                brain_record = existing

            meta = source_snapshot["metadata"]
            brain_record.status = meta["status"]
            brain_record.brain_version = meta["brain_version"]
            brain_record.baseline_revision_id = (
                uuid.UUID(meta["baseline_revision_id"])
                if meta["baseline_revision_id"]
                else None
            )

            entity_by_id: dict[str, EntityRecord] = {}
            entity_by_name: dict[str, EntityRecord] = {}
            for item in source_snapshot["entities"]:
                entity = EntityRecord(
                    id=uuid.UUID(item["entity_id"]),
                    story_brain_id=brain_record.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    entity_type=item["entity_type"],
                    canonical_name=item["name"],
                    normalized_name=item["name"].casefold(),
                    static_attributes={
                        "status": item["status"],
                        "location": item["location"],
                        "mentions": item["mentions"],
                    },
                    source_type="legacy",
                    confirmation_status="confirmed",
                    is_locked=item["is_locked"],
                    created_by=self._actor_id,
                )
                session.add(entity)
                entity_by_id[item["entity_id"]] = entity
                entity_by_name[item["name"].casefold()] = entity
            session.flush()

            for item in source_snapshot["aliases"]:
                entity = entity_by_id.get(item["entity_id"])
                if entity is None:
                    raise CutoverMigrationError(
                        f"Alias {item['alias_id']} references unknown entity {item['entity_id']}"
                    )
                session.add(
                    EntityAliasRecord(
                        id=uuid.UUID(item["alias_id"]),
                        entity_id=entity.id,
                        alias=item["alias"],
                        normalized_alias=item["normalized_alias"],
                        source_type="legacy",
                        confirmation_status="confirmed",
                    )
                )

            for item in source_snapshot["mentions"]:
                entity = entity_by_id.get(item["entity_id"])
                if entity is None:
                    raise CutoverMigrationError(
                        f"Mention {item['mention_id']} references unknown entity {item['entity_id']}"
                    )
                session.add(
                    EntityMentionRecord(
                        id=uuid.UUID(item["mention_id"]),
                        story_brain_id=brain_record.id,
                        entity_id=entity.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        chapter_id=uuid.UUID(item["chapter_id"]),
                        revision_id=uuid.UUID(item["revision_id"]),
                        surface_text=item["surface_text"],
                        source_start=item["source_start"],
                        source_end=item["source_end"],
                        source_text_hash=item["source_text_hash"],
                        extractor_version=item["extractor_version"],
                    )
                )

            fact_ids: dict[str, uuid.UUID] = {}
            for index, raw in enumerate(brain.facts):
                raw_id = str(raw.get("fact_id") or raw.get("id") or f"{raw.get('fact_key', 'fact')}:{index}")
                fact_id = stable_uuid("fact", raw_id)
                subject = self._resolve_entity_reference(
                    raw.get("subject_entity_id"),
                    entity_by_id,
                    entity_by_name,
                    required=False,
                )
                session.add(
                    FactRecord(
                        id=fact_id,
                        story_brain_id=brain_record.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        subject_entity_id=subject.id if subject else None,
                        fact_type=str(raw.get("fact_type") or "fact"),
                        fact_key=str(raw.get("fact_key") or f"legacy.fact.{index}"),
                        fact_value=raw.get("fact_value"),
                        source_type=str(raw.get("source_type") or "legacy"),
                        confirmation_status="confirmed",
                        confidence=self._decimal(raw.get("confidence")),
                        priority=int(raw.get("priority", 0) or 0),
                        is_locked=bool(raw.get("is_locked", False)),
                        source_revision_id=(
                            stable_uuid("revision", str(raw["source_revision_id"]))
                            if raw.get("source_revision_id")
                            else None
                        ),
                        chapter_number=(
                            int(raw["chapter_number"])
                            if raw.get("chapter_number") is not None
                            else None
                        ),
                        source_start=raw.get("source_start"),
                        source_end=raw.get("source_end"),
                        created_by=self._actor_id,
                    )
                )
                fact_ids[raw_id] = fact_id
                fact_ids[str(fact_id)] = fact_id

            explicit_relations = [
                relation
                for relation in brain.relations
                if relation.source != "projection" or relation.locked
            ]
            for relation in explicit_relations:
                session.add(
                    RelationshipRecord(
                        story_brain_id=brain_record.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        subject_name=relation.subject,
                        relation_type=relation.relation,
                        object_name=relation.object,
                        source_type=relation.source or "legacy",
                        is_locked=relation.locked,
                        relation_metadata=dict(relation.metadata),
                    )
                )

            event_ids: dict[str, uuid.UUID] = {}
            ordered_events = list(brain.events)
            snapshot_events = {
                item["event_id"]: item for item in source_snapshot["events"]
            }
            for index, event in enumerate(ordered_events):
                event_id = stable_uuid("event", event.event_id)
                narrative_order = snapshot_events[str(event_id)]["narrative_order"]
                metadata = dict(event.metadata)
                metadata["narrative_order"] = narrative_order
                record = EventRecord(
                    id=event_id,
                    story_brain_id=brain_record.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    narrative_order=narrative_order,
                    event_type=event.event_type,
                    summary=event.summary,
                    participants=list(event.participants),
                    event_metadata=metadata,
                    chapter_number=int(event.chapter),
                    source_type=str(metadata.get("source_type") or metadata.get("source") or "legacy"),
                    confirmation_status="confirmed",
                )
                session.add(record)
                event_ids[event.event_id] = event_id
                event_ids[str(event_id)] = event_id
            session.flush()

            for event in ordered_events:
                event_id = event_ids[event.event_id]
                seen: set[uuid.UUID] = set()
                for participant in event.participants:
                    entity = self._resolve_entity_reference(
                        participant,
                        entity_by_id,
                        entity_by_name,
                        required=False,
                    )
                    if entity is None or entity.id in seen:
                        continue
                    seen.add(entity.id)
                    session.add(
                        EventParticipantRecord(
                            event_id=event_id,
                            entity_id=entity.id,
                            participant_role="actor",
                        )
                    )

            if brain.proposals:
                snapshot_proposals = {
                    item["proposal_id"]: item for item in source_snapshot["proposals"]
                }
                proposals_by_run: dict[str, list[Any]] = {}
                for proposal in brain.proposals:
                    proposal_id = str(stable_uuid("proposal", proposal.proposal_id))
                    run_id = snapshot_proposals[proposal_id]["analysis_run_id"]
                    proposals_by_run.setdefault(run_id, []).append(proposal)

                for run_id, run_proposals in proposals_by_run.items():
                    digest = hashlib.sha256(
                        json.dumps(
                            [asdict(item) for item in run_proposals],
                            ensure_ascii=False,
                            sort_keys=True,
                            default=str,
                        ).encode("utf-8")
                    ).hexdigest()
                    session.add(
                        AnalysisRunRecord(
                            id=uuid.UUID(run_id),
                            story_brain_id=brain_record.id,
                            tenant_id=self._tenant_id,
                            novel_id=novel_id,
                            operation="legacy_cutover",
                            status="completed",
                            idempotency_key=(
                                f"{self._tenant_id}:legacy-cutover:{story_id}:{run_id}"
                            ),
                            input_hash=digest,
                            pipeline_version="phase8-cutover-v1",
                        )
                    )

                for proposal in brain.proposals:
                    proposal_id = str(stable_uuid("proposal", proposal.proposal_id))
                    snapshot = snapshot_proposals[proposal_id]
                    session.add(
                        ProposalRecord(
                            id=uuid.UUID(proposal_id),
                            analysis_run_id=uuid.UUID(snapshot["analysis_run_id"]),
                            story_brain_id=brain_record.id,
                            tenant_id=self._tenant_id,
                            novel_id=novel_id,
                            dependency_group_id=uuid.UUID(snapshot["dependency_group_id"]),
                            materialization_order=int(proposal.materialization_order),
                            proposal_type=proposal.proposal_type,
                            payload=dict(proposal.payload),
                            evidence=list(proposal.evidence),
                            confidence=self._decimal(proposal.confidence),
                            status=proposal.status.value,
                            expected_brain_version=int(proposal.expected_brain_version),
                            decision_reason=proposal.decision_reason,
                        )
                    )

            for index, transition in enumerate(brain.transitions):
                entity = self._resolve_entity_reference(
                    transition.get("entity_id"),
                    entity_by_id,
                    entity_by_name,
                    required=True,
                )
                event_ref = transition.get("event_id")
                fact_ref = transition.get("fact_id")
                if bool(event_ref) == bool(fact_ref):
                    raise CutoverMigrationError(
                        f"Transition {transition.get('transition_id', index)} must reference exactly one event/fact"
                    )
                event_id = (
                    event_ids.get(str(event_ref)) or stable_uuid("event", str(event_ref))
                    if event_ref
                    else None
                )
                fact_id = (
                    fact_ids.get(str(fact_ref)) or stable_uuid("fact", str(fact_ref))
                    if fact_ref
                    else None
                )
                session.add(
                    StateTransitionRecord(
                        id=stable_uuid(
                            "transition",
                            str(transition.get("transition_id") or f"{story_id}:{index}"),
                        ),
                        story_brain_id=brain_record.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        entity_id=entity.id,
                        event_id=event_id,
                        fact_id=fact_id,
                        attribute_key=str(transition["attribute_key"]),
                        new_value=transition.get("new_value"),
                        sequence=int(transition.get("sequence", index + 1) or index + 1),
                    )
                )

            state = source_snapshot["state"]
            for entity_id, entity_state in (state.get("entities") or {}).items():
                entity = self._resolve_entity_reference(
                    entity_id,
                    entity_by_id,
                    entity_by_name,
                    required=True,
                )
                provenance = dict((state.get("provenance") or {}).get(entity_id) or {})
                session.add(
                    CurrentEntityStateRecord(
                        story_brain_id=brain_record.id,
                        entity_id=entity.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        state=dict(entity_state),
                        provenance=provenance,
                        projection_version=int(state.get("projection_version", 1) or 1),
                    )
                )

            # Preserve projection relationships as derived rows; explicit/locked
            # relations above remain authoritative when present.
            for relation in state.get("relationships") or []:
                subject = self._resolve_entity_reference(
                    relation.get("subject_entity_id"),
                    entity_by_id,
                    entity_by_name,
                    required=True,
                )
                target = self._resolve_entity_reference(
                    relation.get("object_entity_id"),
                    entity_by_id,
                    entity_by_name,
                    required=True,
                )
                conflict = next(
                    (
                        item
                        for item in explicit_relations
                        if item.locked
                        and item.subject.casefold() == subject.canonical_name.casefold()
                        and item.object.casefold() == target.canonical_name.casefold()
                    ),
                    None,
                )
                if conflict is not None:
                    if conflict.relation != relation.get("relation"):
                        raise CutoverMigrationError(
                            "Projection relationship conflicts with locked legacy relationship"
                        )
                    continue
                session.add(
                    RelationshipRecord(
                        story_brain_id=brain_record.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        subject_name=subject.canonical_name,
                        relation_type=str(relation.get("relation") or ""),
                        object_name=target.canonical_name,
                        source_type="projection",
                        is_locked=False,
                        relation_metadata=dict(relation),
                    )
                )

            if (
                expected_source_hash is not None
                and self.source_hash(story_id) != expected_source_hash
            ):
                raise CutoverMigrationError(
                    "Source JSON changed before PostgreSQL transaction commit"
                )

    @staticmethod
    def _resolve_entity_reference(
        reference: Any,
        by_id: dict[str, EntityRecord],
        by_name: dict[str, EntityRecord],
        *,
        required: bool,
    ) -> EntityRecord | None:
        if reference is None:
            if required:
                raise CutoverMigrationError("Missing required entity reference")
            return None
        text = str(reference)
        entity = by_id.get(text) or by_name.get(text.casefold())
        if entity is None:
            # Legacy JSON adapter generates entity IDs from story/name; aliases
            # or stale IDs that cannot be resolved are unsafe to invent.
            if required:
                raise CutoverMigrationError(f"Unknown legacy entity reference: {text}")
            return None
        return entity

    @staticmethod
    def _decimal(value: Any) -> Decimal | None:
        try:
            return Decimal(str(value)) if value is not None else None
        except Exception:
            return None
