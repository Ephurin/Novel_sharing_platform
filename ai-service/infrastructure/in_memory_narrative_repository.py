from __future__ import annotations

from dataclasses import asdict, replace
from typing import Any
import uuid

from domain.projection import ProjectionError, validate_payload, project, project_relations, resolve_entity, transition_from_payload
from domain.errors import ActiveRunConflictError, IdempotencyConflictError, OptimisticLockError, ProposalAlreadyDecidedError
from domain.models import (
    AnalysisRun,
    BootstrapJob,
    NarrativeAlias,
    NarrativeEntity,
    NarrativeEvent,
    NarrativeMention,
    NarrativeProposal,
    NarrativeRelation,
    ProposalStatus,
    StoryBrain,
    StoryPlan,
    StoryPlanObjective,
    AutonomousRun,
    WritingContextPackage,
    WritingGenerationJob,
)


class InMemoryNarrativeRepository:
    def __init__(self) -> None:
        self._brains: dict[str, StoryBrain] = {}
        self._analysis_runs: dict[str, AnalysisRun] = {}
        self._bootstrap_jobs: dict[str, BootstrapJob] = {}
        self._writing_jobs: dict[str, WritingGenerationJob] = {}
        self._revision_provenance: dict[tuple[str, str], int] = {}
        self._story_plans: dict[str, StoryPlan] = {}
        self._autonomous_runs: dict[str, AutonomousRun] = {}

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
                    status=str(entity_data.get("status") or "Alive"),
                    location=str(entity_data.get("location") or "Unknown"),
                    is_locked=bool(entity_data.get("is_locked", False)),
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
                status=str(entity_data.get("status") or current.status),
                location=str(entity_data.get("location") or current.location),
                is_locked=bool(entity_data.get("is_locked", current.is_locked)),
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

    def locate_proposal_group(self, group_id: str) -> tuple[str, list[NarrativeProposal]]:
        for story_id, brain in self._brains.items():
            matching = [p for p in brain.proposals if str(getattr(p, "dependency_group_id", "")) == group_id]
            if matching:
                return story_id, matching
        raise KeyError(f"Proposal group not found: {group_id}")

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
                evidence = proposal.evidence[0] if proposal.evidence else {}
                rev_id = evidence.get("revision_id")
                event_ch = None
                if rev_id:
                    event_ch = self._revision_provenance.get((story_id, str(rev_id)))
                if event_ch is None:
                    event_ch = evidence.get("chapter_number")
                if event_ch is None:
                    event_ch = payload.get("chapter_number") or payload.get("chapter")
                if event_ch is None:
                    raise ValueError(f"Event proposal {proposal.proposal_id} lacks canonical chapter provenance")
                events.append(
                    NarrativeEvent(
                        event_id=event_id,
                        event_type=str(payload["event_type"]),
                        participants=tuple(payload.get("participants", [])),
                        summary=str(payload["summary"]),
                        chapter=int(event_ch),
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
                evidence = proposal.evidence[0] if proposal.evidence else {}
                rev_id = evidence.get("revision_id")
                fact_ch = payload.get("chapter_number")
                if fact_ch is None and rev_id:
                    fact_ch = self._revision_provenance.get((story_id, str(rev_id)))
                facts.append({
                    "fact_id": fact_id,
                    **payload,
                    "chapter_number": fact_ch,
                    "source_revision_id": rev_id,
                    "is_locked": False,
                })
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

    def create_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        self._bootstrap_jobs[job.job_id] = job
        for idx, rev in enumerate(job.revisions):
            r_id = getattr(rev, "revision_id", None)
            if r_id:
                ch_val = getattr(rev, "chapter_number", None)
                ch_num = ch_val if ch_val is not None else (idx + 1)
                self._revision_provenance[(job.novel_id, str(r_id))] = ch_num
        return job

    def record_revision_provenance(
        self,
        story_id: str,
        chapter_id: str,
        revision_id: str,
        chapter_number: int,
    ) -> None:
        self._revision_provenance[(story_id, str(revision_id))] = chapter_number

    def get_revision_provenance(
        self,
        story_id: str,
        revision_id: str,
    ) -> dict[str, Any] | None:
        ch_num = self._revision_provenance.get((story_id, str(revision_id)))
        if ch_num is None:
            return None
        return {
            "story_id": story_id,
            "revision_id": str(revision_id),
            "chapter_number": ch_num,
        }

    def get_bootstrap_job(self, job_id: str) -> BootstrapJob:
        if job_id not in self._bootstrap_jobs:
            raise KeyError(f"Bootstrap job not found: {job_id}")
        return self._bootstrap_jobs[job_id]

    def save_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        if job.job_id not in self._bootstrap_jobs:
            raise KeyError(f"Bootstrap job not found: {job.job_id}")
        self._bootstrap_jobs[job.job_id] = job
        return job

    def activate_baseline(
        self, story_id: str, job_id: str, baseline_revision_id: str
    ) -> dict[str, Any]:
        job = self.get_bootstrap_job(job_id)
        if job.novel_id != story_id:
            raise KeyError(job_id)
        brain = self.get_story_brain(story_id)
        self._brains[story_id] = replace(
            brain,
            metadata={
                **brain.metadata,
                "status": "active",
                "baseline_revision_id": baseline_revision_id,
            },
        )
        return {
            "story_brain_id": story_id,
            "status": "active",
            "baseline_revision_id": baseline_revision_id,
            "brain_version": int(brain.metadata.get("brain_version", "1")),
        }

    def merge_entities(
        self,
        story_id: str,
        source_entity_id: str,
        target_entity_id: str,
        expected_brain_version: int,
    ) -> dict[str, Any]:
        if source_entity_id == target_entity_id:
            raise ValueError("Source and target entity must differ")
        brain = self.get_story_brain(story_id)
        current_version = int(brain.metadata.get("brain_version", "1"))
        if current_version != expected_brain_version:
            raise OptimisticLockError(story_id)
        source = next((item for item in brain.entities if item.entity_id == source_entity_id), None)
        target = next((item for item in brain.entities if item.entity_id == target_entity_id), None)
        if source is None or target is None:
            raise KeyError("Entity not found")
        aliases = {
            (item.entity_id, item.normalized_alias): item for item in brain.aliases
            if item.entity_id != source_entity_id
        }
        source_alias = NarrativeAlias(
            str(uuid.uuid5(uuid.NAMESPACE_URL, f"alias:{target_entity_id}:{source.name.casefold()}")),
            target_entity_id,
            source.name,
            source.name.casefold(),
        )
        aliases[(target_entity_id, source_alias.normalized_alias)] = source_alias
        for item in brain.aliases:
            if item.entity_id == source_entity_id:
                moved = replace(item, entity_id=target_entity_id)
                aliases[(target_entity_id, moved.normalized_alias)] = moved
        mentions = tuple(
            replace(item, entity_id=target_entity_id)
            if item.entity_id == source_entity_id else item
            for item in brain.mentions
        )
        transitions = tuple(
            {**item, "entity_id": target_entity_id}
            if item.get("entity_id") == source_entity_id else item
            for item in brain.transitions
        )
        facts = tuple(
            {**item, "subject_entity_id": target_entity_id}
            if item.get("subject_entity_id") == source_entity_id else item
            for item in brain.facts
        )
        entities = tuple(item for item in brain.entities if item.entity_id != source_entity_id)
        state = project(entities, facts, brain.events, transitions)
        self._brains[story_id] = replace(
            brain,
            entities=entities,
            aliases=tuple(aliases.values()),
            mentions=mentions,
            facts=facts,
            transitions=transitions,
            current_state=state,
            metadata={**brain.metadata, "brain_version": str(current_version + 1)},
        )
        return {
            "source_entity_id": source_entity_id,
            "target_entity_id": target_entity_id,
            "brain_version": current_version + 1,
            "status": "merged",
        }

    def create_writing_job(self, job: WritingGenerationJob) -> WritingGenerationJob:
        for existing in self._writing_jobs.values():
            if (
                existing.tenant_id == job.tenant_id
                and existing.novel_id == job.novel_id
                and existing.idempotency_key
                and existing.idempotency_key == job.idempotency_key
            ):
                if existing.input_hash != job.input_hash:
                    raise IdempotencyConflictError(
                        f"Idempotency key {job.idempotency_key} reused with different input"
                    )
                return existing
        self._writing_jobs[job.job_id] = job
        return job

    def get_writing_job(self, job_id: str) -> WritingGenerationJob:
        if job_id not in self._writing_jobs:
            raise KeyError(f"Writing generation job not found: {job_id}")
        return self._writing_jobs[job_id]

    def save_writing_job(self, job: WritingGenerationJob) -> WritingGenerationJob:
        if job.job_id not in self._writing_jobs:
            raise KeyError(f"Writing generation job not found: {job.job_id}")
        self._writing_jobs[job.job_id] = job
        return job

    def get_structured_context(
        self,
        story_id: str,
        *,
        chapter_number: int | None = None,
        character_name: str | None = None,
        limit_recent_events: int = 20,
        token_budget: int | None = None,
        enforce_token_budget: bool = True,
    ) -> WritingContextPackage:
        brain = self.get_story_brain(story_id)
        brain_version = int(brain.metadata.get("brain_version", "1"))

        # 1. Confirmed Events with temporal cutoff and supersede resolution
        candidate_events = []
        for ev in brain.events:
            ev_chapter = getattr(ev, "chapter", 1) or getattr(ev, "chapter_number", 1) or 1
            if chapter_number is not None and ev_chapter > chapter_number:
                continue
            candidate_events.append(ev)

        candidate_events = sorted(
            candidate_events,
            key=lambda x: (getattr(x, "narrative_order", 0) or getattr(x, "chapter", 0) or 0, getattr(x, "event_id", "")),
        )

        by_id = {}
        replacements = {}
        for ev in candidate_events:
            meta = getattr(ev, "metadata", {}) or {}
            target = meta.get("supersedes_id")
            if target:
                replacements[str(target)] = str(ev.event_id)
            by_id[str(ev.event_id)] = ev

        active_events = [ev for ev in candidate_events if str(ev.event_id) not in replacements]
        events_for_output = active_events[-limit_recent_events:]

        def _is_fact_allowed(fact: dict[str, Any]) -> bool:
            if chapter_number is None:
                return True
            f_ch = fact.get("chapter_number") or fact.get("chapter")
            if f_ch is None and isinstance(fact.get("fact_value"), dict):
                f_ch = fact["fact_value"].get("chapter_number") or fact["fact_value"].get("chapter")
            if f_ch is None and fact.get("source_revision_id"):
                f_ch = self._revision_provenance.get((story_id, str(fact["source_revision_id"])))
            if f_ch is not None and int(f_ch) > chapter_number:
                return False
            return True

        active_facts = [f for f in brain.facts if _is_fact_allowed(f)]

        # 2. Entity State Resolution (as-of chapter cutoff if chapter_number specified)
        as_of_states: dict[str, dict[str, Any]] = {}
        if chapter_number is not None and getattr(brain, "transitions", None):
            active_event_ids = {str(ev.event_id) for ev in active_events}
            active_fact_ids = {str(f.get("id") or f.get("fact_id")) for f in active_facts}
            active_transitions = [
                t for t in brain.transitions
                if (t.get("fact_id") and str(t.get("fact_id")) in active_fact_ids)
                or (t.get("event_id") and str(t.get("event_id")) in active_event_ids)
            ]
            try:
                proj = project(brain.entities, active_facts, active_events, active_transitions)
                as_of_states = proj.get("entities", {})
            except Exception:
                as_of_states = {}

        # 3. Facts and World rules separation
        locked_rules = []
        other_rules = []
        for fact in active_facts:
            f_id = str(fact.get("id") or fact.get("fact_id") or "")
            f_type = fact.get("fact_type") or fact.get("type", "")
            f_locked = bool(fact.get("is_locked", False))
            f_dict = {
                "id": f_id,
                "fact_type": f_type,
                "fact_key": fact.get("fact_key", ""),
                "fact_value": fact.get("fact_value", fact.get("statement", "")),
                "is_locked": f_locked,
            }
            if f_locked:
                locked_rules.append(f_dict)
            elif f_type in ("world_rule", "character_trait"):
                other_rules.append(f_dict)

        # 4. Phase 6 compatibility budget. P7-05 production calls this
        # repository with enforcement disabled, then packs the combined
        # canonical + semantic context once in the application layer.
        target_maximum = token_budget if (token_budget is not None and token_budget > 0) else 12000
        base_overhead = 300
        locked_rules_cost = len(locked_rules) * 35

        sorted_entities = sorted(
            brain.entities,
            key=lambda e: (
                0 if e.is_locked else 1,
                0 if (character_name and e.name.lower() == character_name.lower()) else 1,
                e.name,
            ),
        )
        raw_current_state = (
            brain.current_state.get("entities", brain.current_state)
            if isinstance(brain.current_state, dict)
            else {}
        )

        def _all_entity_outputs() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
            entities_all: list[dict[str, Any]] = []
            states_all: list[dict[str, Any]] = []
            for entity in sorted_entities:
                e_id = str(entity.entity_id or entity.name)
                e_state = (
                    as_of_states.get(e_id)
                    or as_of_states.get(entity.name)
                    or raw_current_state.get(e_id)
                    or raw_current_state.get(entity.name)
                    or {}
                )
                status = str(e_state.get("status", entity.status or "Alive"))
                location = str(e_state.get("location", entity.location or "Unknown"))
                entities_all.append({
                    "entity_id": e_id,
                    "name": entity.name,
                    "entity_type": entity.entity_type,
                    "status": status,
                    "location": location,
                    "is_locked": entity.is_locked,
                })
                states_all.append({
                    "entity_id": e_id,
                    "name": entity.name,
                    "status": status,
                    "location": location,
                    "state": e_state,
                })
            return entities_all, states_all

        def _event_outputs(selected: list[Any]) -> list[dict[str, Any]]:
            return [
                {
                    "event_id": str(ev.event_id),
                    "narrative_order": getattr(ev, "narrative_order", 0)
                    or getattr(ev, "chapter", 1),
                    "chapter_number": getattr(ev, "chapter", 1)
                    or getattr(ev, "chapter_number", 1)
                    or 1,
                    "event_type": ev.event_type,
                    "summary": ev.summary,
                    "participants": list(ev.participants),
                    "metadata": dict(getattr(ev, "metadata", {}) or {}),
                }
                for ev in selected
            ]

        if not enforce_token_budget:
            rules_out = [*locked_rules, *other_rules]
            entities_out, states_out = _all_entity_outputs()
            events_out = _event_outputs(events_for_output)
            used_tokens = (
                base_overhead
                + len(rules_out) * 35
                + len(entities_out) * 45
                + len(events_out) * 55
            )
            budget_info = {
                "used": used_tokens,
                "maximum": target_maximum,
                "budget_overflow": used_tokens > target_maximum,
                "locked_overflow": locked_rules_cost + base_overhead > target_maximum,
                "budget_enforced": False,
            }
        elif locked_rules_cost + base_overhead > target_maximum:
            budget_info = {
                "used": locked_rules_cost + base_overhead,
                "maximum": target_maximum,
                "budget_overflow": True,
                "locked_overflow": True,
                "budget_enforced": True,
            }
            rules_out = locked_rules
            entities_out = []
            states_out = []
            events_out = []
        else:
            remaining = target_maximum - (locked_rules_cost + base_overhead)
            rules_out = list(locked_rules)
            for rule in other_rules:
                if remaining >= 35:
                    rules_out.append(rule)
                    remaining -= 35

            entities_out = []
            states_out = []
            for entity, state in zip(*_all_entity_outputs()):
                if remaining >= 45 or bool(entity.get("is_locked")):
                    entities_out.append(entity)
                    states_out.append(state)
                    remaining = max(0, remaining - 45)

            selected_events = []
            for event in reversed(events_for_output):
                if remaining >= 55:
                    selected_events.append(event)
                    remaining -= 55
                else:
                    break
            selected_events.reverse()
            events_out = _event_outputs(selected_events)

            used_tokens = (
                base_overhead
                + len(rules_out) * 35
                + len(entities_out) * 45
                + len(events_out) * 55
            )
            budget_info = {
                "used": used_tokens,
                "maximum": target_maximum,
                "budget_overflow": used_tokens > target_maximum,
                "locked_overflow": False,
                "budget_enforced": True,
            }

        context_summary = {
            "entity_ids": [str(e["entity_id"]) for e in entities_out],
            "event_ids": [str(e["event_id"]) for e in events_out],
            "fact_ids": [str(f.get("id") or f.get("fact_id", i)) for i, f in enumerate(rules_out)],
            "cutoff_chapter": chapter_number,
        }

        active_plan = self.get_active_story_plan(story_id)
        planning_context = None
        current_objective = None
        if active_plan:
            matching_obj = None
            if chapter_number is not None:
                for obj in active_plan.objectives:
                    if obj.target_chapter == chapter_number:
                        matching_obj = obj
                        break
            if not matching_obj:
                for obj in active_plan.objectives:
                    if obj.status in ("in_progress", "pending"):
                        matching_obj = obj
                        break

            planning_context = {
                "plan_id": active_plan.plan_id,
                "plan_version": active_plan.plan_version,
                "status": active_plan.status,
                "source_outline_hash": active_plan.source_outline_hash,
                "total_objectives": len(active_plan.objectives),
                "active_objective_id": matching_obj.objective_id if matching_obj else None,
            }
            if matching_obj:
                current_objective = {
                    "objective_id": matching_obj.objective_id,
                    "order_index": matching_obj.order_index,
                    "target_chapter": matching_obj.target_chapter,
                    "objective_type": matching_obj.objective_type,
                    "title": matching_obj.title,
                    "description": matching_obj.description,
                    "status": matching_obj.status,
                }
            context_summary["plan_id"] = [active_plan.plan_id]
            context_summary["plan_version"] = [str(active_plan.plan_version)]
            if matching_obj:
                context_summary["active_objective_id"] = [matching_obj.objective_id]
                context_summary["active_objective_title"] = [matching_obj.title]

        return WritingContextPackage(
            brain_version=brain_version,
            entities=tuple(entities_out),
            current_states=tuple(states_out),
            recent_events=tuple(events_out),
            world_rules=tuple(rules_out),
            author_constraints=(),
            token_budget=budget_info,
            context_summary=context_summary,
            planning_context=planning_context,
            current_objective=current_objective,
        )

    def create_story_plan(self, plan: StoryPlan) -> StoryPlan:
        plan_id = plan.plan_id or str(uuid.uuid4())
        if plan.idempotency_key:
            for p in self._story_plans.values():
                if p.novel_id == plan.novel_id and p.idempotency_key == plan.idempotency_key:
                    if p.input_hash != plan.input_hash:
                        raise IdempotencyConflictError(
                            f"Idempotency key {plan.idempotency_key} reused with conflicting payload"
                        )
                    return p
        existing_versions = [p.plan_version for p in self._story_plans.values() if p.novel_id == plan.novel_id]
        next_version = (max(existing_versions) + 1) if existing_versions else 1
        saved = StoryPlan(
            plan_id=plan_id,
            novel_id=plan.novel_id,
            tenant_id=plan.tenant_id,
            plan_version=next_version,
            status=plan.status,
            objectives=plan.objectives,
            source_outline=plan.source_outline,
            source_outline_hash=plan.source_outline_hash,
            idempotency_key=plan.idempotency_key,
            input_hash=plan.input_hash,
            created_by=plan.created_by,
        )
        self._story_plans[plan_id] = saved
        return saved

    def get_story_plan(self, plan_id: str) -> StoryPlan | None:
        return self._story_plans.get(plan_id)

    def get_active_story_plan(self, novel_id: str) -> StoryPlan | None:
        active = [
            p for p in self._story_plans.values()
            if p.novel_id == novel_id and p.status == "active"
        ]
        if not active:
            return None
        return max(active, key=lambda p: p.plan_version)

    def list_story_plans(self, novel_id: str) -> list[StoryPlan]:
        plans = [p for p in self._story_plans.values() if p.novel_id == novel_id]
        return sorted(plans, key=lambda p: p.plan_version)

    def activate_story_plan(self, novel_id: str, plan_id: str) -> StoryPlan:
        target = self._story_plans.get(plan_id)
        if not target or target.novel_id != novel_id:
            raise KeyError(f"StoryPlan {plan_id} not found for novel {novel_id}")
        # Supersede all existing active plans
        for pid, p in list(self._story_plans.items()):
            if p.novel_id == novel_id and p.status == "active":
                self._story_plans[pid] = replace(p, status="superseded")
        activated = replace(target, status="active")
        self._story_plans[plan_id] = activated
        return activated

    def update_objective_status(
        self,
        novel_id: str,
        plan_id: str,
        objective_id: str,
        status: str,
    ) -> StoryPlanObjective:
        plan = self._story_plans.get(plan_id)
        if not plan or plan.novel_id != novel_id:
            raise KeyError(f"StoryPlan {plan_id} not found")
        updated_objs = []
        target_obj = None
        for obj in plan.objectives:
            if obj.objective_id == objective_id:
                target_obj = replace(obj, status=status)
                updated_objs.append(target_obj)
            else:
                updated_objs.append(obj)
        if not target_obj:
            raise KeyError(f"Objective {objective_id} not found in plan {plan_id}")
        self._story_plans[plan_id] = replace(plan, objectives=tuple(updated_objs))
        return target_obj

    def create_autonomous_run(self, run: AutonomousRun) -> AutonomousRun:
        run_id = run.run_id or str(uuid.uuid4())
        if run.idempotency_key:
            for r in self._autonomous_runs.values():
                if r.novel_id == run.novel_id and r.idempotency_key == run.idempotency_key:
                    return r
        for r in self._autonomous_runs.values():
            if r.novel_id == run.novel_id and r.status in ("queued", "running"):
                raise ActiveRunConflictError(f"Active autonomous run {r.run_id} already exists for novel {run.novel_id}")
        saved = replace(run, run_id=run_id)
        self._autonomous_runs[run_id] = saved
        return saved

    def get_autonomous_run(self, run_id: str) -> AutonomousRun | None:
        return self._autonomous_runs.get(run_id)

    def get_active_autonomous_run(self, novel_id: str) -> AutonomousRun | None:
        active = [
            r for r in self._autonomous_runs.values()
            if r.novel_id == novel_id and r.status in ("queued", "running")
        ]
        return active[-1] if active else None

    def update_autonomous_run(self, run: AutonomousRun) -> AutonomousRun:
        if run.run_id not in self._autonomous_runs:
            raise KeyError(f"AutonomousRun {run.run_id} not found")
        self._autonomous_runs[run.run_id] = run
        return run


