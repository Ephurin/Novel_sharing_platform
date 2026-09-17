from __future__ import annotations

from dataclasses import asdict, replace
from typing import Any
import uuid

from domain.projection import ProjectionError, validate_payload, project, project_relations, resolve_entity, transition_from_payload
from domain.errors import OptimisticLockError, ProposalAlreadyDecidedError
from domain.models import (
    AnalysisRun,
    NarrativeAlias,
    NarrativeEntity,
    NarrativeEvent,
    NarrativeMention,
    NarrativeProposal,
    NarrativeRelation,
    ProposalStatus,
    StoryBrain,
)


class InMemoryNarrativeRepository:
    def __init__(self) -> None:
        self._brains: dict[str, StoryBrain] = {}
        self._analysis_runs: dict[str, AnalysisRun] = {}

    def get_story_brain(self, story_id: str) -> StoryBrain:
        if story_id not in self._brains:
            self._brains[story_id] = StoryBrain(
                story_id=story_id, metadata={"brain_version": "1", "status": "active"}
            )
        return self._brains[story_id]

    def list_entities(self, story_id: str) -> list[NarrativeEntity]:
        return list(self.get_story_brain(story_id).entities)

    def upsert_entity(self, story_id: str, entity_data: dict[str, Any]) -> dict[str, Any]:
        name = str(
            entity_data.get("word")
            or entity_data.get("Entity")
            or entity_data.get("name")
            or entity_data.get("normalized_name")
            or entity_data.get("raw_name")
            or ""
        ).strip()
        entity_type = str(
            entity_data.get("type")
            or entity_data.get("entity")
            or entity_data.get("Label")
            or "UNKNOWN"
        ).strip()
        if not name:
            return {"status": "skipped", "reason": "empty_entity_name"}

        brain = self.get_story_brain(story_id)
        entities = list(brain.entities)
        match_index = next(
            (index for index, item in enumerate(entities) if item.name.casefold() == name.casefold()),
            None,
        )
        if match_index is None:
            entities.append(
                NarrativeEntity(
                    name=name,
                    entity_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:{name.casefold()}")),
                    entity_type=entity_type,
                )
            )
        else:
            current = entities[match_index]
            entities[match_index] = replace(
                current,
                entity_type=(
                    entity_type
                    if current.entity_type == "UNKNOWN" and entity_type != "UNKNOWN"
                    else current.entity_type
                ),
                mentions=current.mentions + 1,
            )
        self._brains[story_id] = replace(brain, entities=tuple(entities))
        return {
            "entity": name,
            "label": entity_type,
            "story_id": story_id,
            "status": "updated",
        }

    def add_entity_alias(self, story_id: str, entity_id: str, alias: str) -> str:
        brain = self.get_story_brain(story_id)
        if not any(item.entity_id == entity_id for item in brain.entities):
            raise KeyError(f"Entity not found: {entity_id}")
        alias_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"alias:{entity_id}:{alias.casefold()}"))
        if not any(item.alias_id == alias_id for item in brain.aliases):
            self._brains[story_id] = replace(
                brain,
                aliases=(
                    *brain.aliases,
                    NarrativeAlias(alias_id, entity_id, alias, alias.casefold()),
                ),
            )
        return alias_id

    def add_entity_mention(
        self,
        story_id: str,
        entity_id: str,
        *,
        chapter_id: str,
        revision_id: str,
        surface_text: str,
        source_start: int,
        source_end: int,
        source_text_hash: str,
        extractor_version: str | None = None,
    ) -> str:
        brain = self.get_story_brain(story_id)
        if not any(item.entity_id == entity_id for item in brain.entities):
            raise KeyError(f"Entity not found: {entity_id}")
        evidence = f"{revision_id}:{entity_id}:{source_start}:{source_end}:{extractor_version or ''}"
        mention_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mention:{evidence}"))
        if not any(item.mention_id == mention_id for item in brain.mentions):
            self._brains[story_id] = replace(
                brain,
                mentions=(
                    *brain.mentions,
                    NarrativeMention(
                        mention_id=mention_id,
                        entity_id=entity_id,
                        chapter_id=chapter_id,
                        revision_id=revision_id,
                        surface_text=surface_text,
                        source_start=source_start,
                        source_end=source_end,
                        source_text_hash=source_text_hash,
                        extractor_version=extractor_version,
                    ),
                ),
            )
        return mention_id

    def append_event(self, story_id: str, event: NarrativeEvent) -> None:
        brain = self.get_story_brain(story_id)
        self._brains[story_id] = replace(brain, events=(*brain.events, event))

    def save_proposals(
        self, story_id: str, proposals: list[NarrativeProposal]
    ) -> list[NarrativeProposal]:
        brain = self.get_story_brain(story_id)
        saved = {item.proposal_id: item for item in brain.proposals}
        saved.update({item.proposal_id: item for item in proposals})
        self._brains[story_id] = replace(brain, proposals=tuple(saved.values()))
        return proposals

    def list_proposals(
        self,
        story_id: str,
        *,
        status: str | None = None,
        proposal_type: str | None = None,
        analysis_run_id: str | None = None,
    ) -> list[NarrativeProposal]:
        proposals = list(self.get_story_brain(story_id).proposals)
        if status:
            proposals = [item for item in proposals if item.status.value == status]
        if proposal_type:
            proposals = [item for item in proposals if item.proposal_type == proposal_type]
        if analysis_run_id:
            proposals = [item for item in proposals if item.analysis_run_id == analysis_run_id]
        return proposals

    def locate_proposal(self, proposal_id: str) -> tuple[str, NarrativeProposal]:
        for story_id, brain in self._brains.items():
            for proposal in brain.proposals:
                if proposal.proposal_id == proposal_id:
                    return story_id, proposal
        raise KeyError(f"Proposal not found: {proposal_id}")

    def accept_proposal_group(
        self,
        story_id: str,
        proposal_ids: list[str],
        expected_brain_version: int,
        *,
        edited_payloads: dict[str, dict[str, Any]] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        brain = self.get_story_brain(story_id)
        current_version = int(brain.metadata.get("brain_version", "1"))
        if current_version != expected_brain_version:
            raise OptimisticLockError(story_id)
        selected = [item for item in brain.proposals if item.proposal_id in proposal_ids]
        if len(selected) != len(set(proposal_ids)):
            raise KeyError("Proposal group is incomplete")
        if any(item.status != ProposalStatus.PENDING for item in selected):
            raise ProposalAlreadyDecidedError("Proposal group contains a decided proposal")
        groups = {item.dependency_group_id for item in selected}
        if len(selected) > 1 and len(groups) != 1:
            raise ValueError("All proposals must belong to the same dependency group")

        entities = list(brain.entities)
        aliases = list(brain.aliases)
        events = list(brain.events)
        facts = list(brain.facts)
        transitions = list(brain.transitions)
        artifact_ids: list[str] = []
        edited_payloads = edited_payloads or {}
        for proposal in sorted(selected, key=lambda item: item.materialization_order):
            payload = edited_payloads.get(proposal.proposal_id, proposal.payload)
            validate_payload(proposal.proposal_type, payload)
            if proposal.proposal_type == "entity":
                normalized = str(payload["normalized_name"]).casefold()
                existing = next(
                    (item for item in entities if item.name.casefold() == normalized), None
                )
                if existing and existing.is_locked and existing.entity_type != payload["entity_type"]:
                    raise OptimisticLockError("Author-locked entity conflicts with proposal")
                if existing is None:
                    existing = NarrativeEntity(
                        name=str(payload["canonical_name"]),
                        entity_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:{normalized}")),
                        entity_type=str(payload["entity_type"]),
                    )
                    entities.append(existing)
                artifact_ids.append(str(existing.entity_id))
            elif proposal.proposal_type == "event":
                event_id = str(payload.get("event_id") or proposal.proposal_id)
                for participant in payload.get("participants", []):
                    resolve_entity(participant, entities)
                events.append(
                    NarrativeEvent(
                        event_id=event_id,
                        event_type=str(payload["event_type"]),
                        participants=tuple(payload.get("participants", [])),
                        summary=str(payload["summary"]),
                        chapter=int(payload.get("chapter", 1)),
                        metadata={**payload, "evidence": list(proposal.evidence)},
                    )
                )
                artifact_ids.append(event_id)
            elif proposal.proposal_type == "state_transition":
                transition = transition_from_payload(proposal.proposal_id, payload, entities, events, facts)
                transitions.append(transition)
                artifact_ids.append(proposal.proposal_id)
            elif proposal.proposal_type == "alias":
                alias_id = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"alias:{payload['entity_id']}:{str(payload['alias']).casefold()}",
                    )
                )
                aliases.append(
                    NarrativeAlias(
                        alias_id,
                        str(payload["entity_id"]),
                        str(payload["alias"]),
                        str(payload["alias"]).casefold(),
                    )
                )
                artifact_ids.append(alias_id)
            elif proposal.proposal_type == "fact":
                fact_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"fact:{proposal.proposal_id}"))
                facts.append({"fact_id": fact_id, **payload, "is_locked": False})
                artifact_ids.append(fact_id)
                if payload.get("subject_entity_id"):
                    transitions.append(transition_from_payload(
                        str(uuid.uuid5(uuid.NAMESPACE_URL, f"initial:{fact_id}")),
                        {"entity_id": payload["subject_entity_id"], "fact_id": fact_id,
                         "attribute_key": payload["fact_key"], "new_value": payload["fact_value"]},
                        entities, events, facts))
            else:
                raise ValueError(f"Unsupported proposal type: {proposal.proposal_type}")

        state = project(entities, facts, events, transitions)
        relations = project_relations(entities, brain.relations, state)
        accepted_ids = set(proposal_ids)
        proposals = tuple(
            replace(
                item,
                payload=edited_payloads.get(item.proposal_id, item.payload),
                status=ProposalStatus.ACCEPTED,
                decision_reason=reason,
            )
            if item.proposal_id in accepted_ids
            else item
            for item in brain.proposals
        )
        self._brains[story_id] = replace(
            brain,
            entities=tuple(entities),
            aliases=tuple(aliases),
            events=tuple(events),
            facts=tuple(facts),
            proposals=proposals,
            transitions=tuple(transitions),
            current_state=state,
            relations=relations,
            metadata={**brain.metadata, "brain_version": str(current_version + 1)},
        )
        return {
            "proposal_ids": proposal_ids,
            "canonical_artifact_ids": artifact_ids,
            "brain_version": current_version + 1,
            "status": "accepted",
        }

    def decide_proposal(
        self, story_id: str, proposal_id: str, accepted: bool, reason: str | None = None
    ) -> NarrativeProposal:
        brain = self.get_story_brain(story_id)
        proposals = list(brain.proposals)
        for index, proposal in enumerate(proposals):
            if proposal.proposal_id != proposal_id:
                continue
            updated = replace(
                proposal,
                status=ProposalStatus.ACCEPTED if accepted else ProposalStatus.REJECTED,
                decision_reason=reason,
            )
            proposals[index] = updated
            next_version = int(brain.metadata.get("brain_version", "1")) + (1 if accepted else 0)
            self._brains[story_id] = replace(
                brain,
                proposals=tuple(proposals),
                metadata={**brain.metadata, "brain_version": str(next_version)},
            )
            return updated
        raise KeyError(f"Proposal not found: {proposal_id}")

    def rebuild_projection(self, story_id: str, expected_brain_version: int) -> dict[str, Any]:
        brain = self.get_story_brain(story_id)
        if int(brain.metadata.get("brain_version", "1")) != expected_brain_version:
            raise OptimisticLockError(story_id)
        state = project(brain.entities, brain.facts, brain.events, brain.transitions)
        self._brains[story_id] = replace(brain, current_state=state,
            relations=project_relations(brain.entities, brain.relations, state))
        return state

    def get_current_state(self, story_id: str) -> dict[str, Any]:
        return dict(self.get_story_brain(story_id).current_state)

    def get_or_create_analysis_run(
        self,
        story_id: str,
        *,
        idempotency_key: str,
        input_hash: str,
        operation: str,
        pipeline_version: str,
    ) -> AnalysisRun:
        from domain.errors import IdempotencyConflictError

        existing = self._analysis_runs.get(idempotency_key)
        if existing:
            if existing.input_hash != input_hash:
                raise IdempotencyConflictError(idempotency_key)
            return existing
        run = AnalysisRun(
            run_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"analysis:{idempotency_key}")),
            idempotency_key=idempotency_key,
            input_hash=input_hash,
            operation=operation,
            status="pending",
            pipeline_version=pipeline_version,
        )
        self._analysis_runs[idempotency_key] = run
        return run

    def get_related_entities(
        self, story_id: str, entity_name: str, limit: int = 10
    ) -> list[dict[str, str]]:
        target = entity_name.casefold()
        related: list[dict[str, str]] = []
        for relation in self.get_story_brain(story_id).relations:
            if relation.subject.casefold() == target:
                related.append({"name": relation.object, "relation": relation.relation})
            elif relation.object.casefold() == target:
                related.append({"name": relation.subject, "relation": relation.relation})
        return related[:limit]

    def get_story_context(self, story_id: str, character_name: str, limit: int = 50) -> str:
        related = self.get_related_entities(story_id, character_name, limit)
        if not related:
            return f"Character '{character_name.strip()}' has no relationship context in graph."
        lines = [f"Center character: {character_name.strip()}", "One-hop relationships:"]
        lines.extend(
            f"- {character_name.strip()} -[{item['relation']}]- {item['name']}"
            for item in related
        )
        return "\n".join(lines)

    def get_consistency_data(
        self, story_id: str, character_name: str
    ) -> list[dict[str, str]]:
        for entity in self.get_story_brain(story_id).entities:
            if entity.name.casefold() == character_name.casefold():
                return [
                    {"name": entity.name, "status": entity.status, "location": entity.location}
                ]
        return []

    def get_known_locations(self, story_id: str) -> set[str]:
        return {
            entity.name
            for entity in self.get_story_brain(story_id).entities
            if entity.entity_type.casefold() in {"location", "loc"}
        }

    def override_relation(
        self, story_id: str, subject: str, relation_type: str, object_name: str
    ) -> dict[str, Any]:
        brain = self.get_story_brain(story_id)
        relations = tuple(
            relation
            for relation in brain.relations
            if not (relation.subject == subject and relation.object == object_name)
        )
        relations += (
            NarrativeRelation(
                subject=subject,
                relation=relation_type,
                object=object_name,
                source="author",
                locked=True,
            ),
        )
        self._brains[story_id] = replace(brain, relations=relations)
        return {"status": "success", "relation": relation_type, "locked": True}

    def export_snapshot(self, story_id: str) -> dict[str, Any]:
        return asdict(self.get_story_brain(story_id))
