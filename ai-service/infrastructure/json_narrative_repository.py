from __future__ import annotations

import uuid
from dataclasses import asdict, replace
from typing import Any

from core.story_kb_manager import KBRelation, KBEntity, StoryKBManager
from domain.errors import IdempotencyConflictError, OptimisticLockError, ProposalAlreadyDecidedError
from domain.models import (
    AnalysisRun,
    BootstrapJob,
    BootstrapRevision,
    NarrativeAlias,
    NarrativeEntity,
    NarrativeEvent,
    NarrativeMention,
    NarrativeProposal,
    NarrativeRelation,
    ProposalStatus,
    StoryBrain,
    WritingContextPackage,
    WritingGenerationJob,
)


class JsonNarrativeRepository:
    def __init__(self, manager: StoryKBManager) -> None:
        self._manager = manager
        self._analysis_runs: dict[str, AnalysisRun] = {}
        self._bootstrap_jobs: dict[str, BootstrapJob] = {}
        self._writing_jobs: dict[str, WritingGenerationJob] = {}

    def get_story_brain(self, story_id: str) -> StoryBrain:
        kb = self._manager.load_kb(story_id)
        proposals = tuple(self._proposal_from_dict(item) for item in kb.proposals)
        events = tuple(
            NarrativeEvent(
                event_id=str(item.get("id") or item.get("event_id") or index),
                event_type=str(item.get("event_type") or item.get("action") or "general"),
                participants=tuple(
                    item.get("participants")
                    or [value for value in (item.get("subject_id"), item.get("object_id")) if value]
                ),
                summary=str(item.get("summary") or item.get("raw_text") or ""),
                chapter=int(item.get("chapter", 1)),
                metadata=dict(item),
            )
            for index, item in enumerate(kb.enhanced_events)
        )
        return StoryBrain(
            story_id=kb.story_id,
            entities=tuple(
                NarrativeEntity(
                    name=entity.name,
                    entity_id=self._entity_id(story_id, entity.name),

                    entity_type=entity.entity_type,
                    status=entity.status,
                    location=entity.location,
                    mentions=entity.mentions,
                    is_locked=entity.is_locked,
                )
                for entity in kb.entities.values()
            ),
            aliases=tuple(
                NarrativeAlias(
                    alias_id=str(item["alias_id"]),
                    entity_id=str(item["entity_id"]),
                    alias=str(item["alias"]),
                    normalized_alias=str(item["normalized_alias"]),
                )
                for item in kb.entity_aliases
            ),
            mentions=tuple(
                NarrativeMention(
                    mention_id=str(item["mention_id"]),
                    entity_id=str(item["entity_id"]),
                    chapter_id=str(item["chapter_id"]),
                    revision_id=str(item["revision_id"]),
                    surface_text=str(item["surface_text"]),
                    source_start=int(item["source_start"]),
                    source_end=int(item["source_end"]),
                    source_text_hash=str(item["source_text_hash"]),
                    extractor_version=item.get("extractor_version"),
                )
                for item in kb.entity_mentions
            ),
            facts=tuple(dict(item) for item in kb.facts),
            relations=tuple(
                NarrativeRelation(
                    subject=relation.subject,
                    relation=relation.relation,
                    object=relation.object,
                    metadata=dict(relation.metadata),
                    source=relation.source,
                    locked=relation.locked,
                )
                for relation in kb.relations
            ),
            events=events,
            proposals=proposals,
            transitions=tuple(kb.state_transitions),
            current_state=kb.narrative_projection or {"entities": {}, "provenance": {}, "relationships": [], "projection_version": 1},
            metadata=dict(kb.metadata),
        )

    def list_entities(self, story_id: str) -> list[NarrativeEntity]:
        return list(self.get_story_brain(story_id).entities)

    def upsert_entity(self, story_id: str, entity_data: dict[str, Any]) -> dict[str, Any]:
        return self._manager.upsert_entity(story_id, entity_data)

    def add_entity_alias(self, story_id: str, entity_id: str, alias: str) -> str:
        kb = self._manager.load_kb(story_id)
        if not any(self._entity_id(story_id, item.name) == entity_id for item in kb.entities.values()):
            raise KeyError(f"Entity not found: {entity_id}")
        alias_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"alias:{entity_id}:{alias.casefold()}"))
        if not any(item.get("alias_id") == alias_id for item in kb.entity_aliases):
            kb.entity_aliases.append(
                {
                    "alias_id": alias_id,
                    "entity_id": entity_id,
                    "alias": alias,
                    "normalized_alias": alias.casefold(),
                }
            )
            self._manager.save_kb(story_id, kb)
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
        kb = self._manager.load_kb(story_id)
        if not any(self._entity_id(story_id, item.name) == entity_id for item in kb.entities.values()):
            raise KeyError(f"Entity not found: {entity_id}")
        evidence = f"{revision_id}:{entity_id}:{source_start}:{source_end}:{extractor_version or ''}"
        mention_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mention:{evidence}"))
        if not any(item.get("mention_id") == mention_id for item in kb.entity_mentions):
            kb.entity_mentions.append(
                {
                    "mention_id": mention_id,
                    "entity_id": entity_id,
                    "chapter_id": chapter_id,
                    "revision_id": revision_id,
                    "surface_text": surface_text,
                    "source_start": source_start,
                    "source_end": source_end,
                    "source_text_hash": source_text_hash,
                    "extractor_version": extractor_version,
                }
            )
            self._manager.save_kb(story_id, kb)
        return mention_id

    def append_event(self, story_id: str, event: NarrativeEvent) -> None:
        kb = self._manager.load_kb(story_id)
        kb.enhanced_events.append(
            {
                **event.metadata,
                "event_id": event.event_id,
                "event_type": event.event_type,
                "participants": list(event.participants),
                "summary": event.summary,
                "chapter": event.chapter,
            }
        )
        self._manager.save_kb(story_id, kb)

    def save_proposals(
        self, story_id: str, proposals: list[NarrativeProposal]
    ) -> list[NarrativeProposal]:
        kb = self._manager.load_kb(story_id)
        saved = {str(item.get("proposal_id")): item for item in kb.proposals}
        for proposal in proposals:
            saved[proposal.proposal_id] = self._proposal_to_dict(proposal)
        kb.proposals = list(saved.values())
        self._manager.save_kb(story_id, kb)
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
        for file_path in self._manager.storage_dir.glob("*.json"):
            kb = self._manager.load_kb(file_path.stem)
            for item in kb.proposals:
                if str(item.get("proposal_id")) == proposal_id:
                    return kb.story_id, self._proposal_from_dict(item)
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
        from dataclasses import asdict
        from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository

        memory = InMemoryNarrativeRepository()
        memory._brains[story_id] = self.get_story_brain(story_id)
        result = memory.accept_proposal_group(
            story_id, proposal_ids, expected_brain_version,
            edited_payloads=edited_payloads, reason=reason)
        brain = memory.get_story_brain(story_id)
        kb = self._manager.load_kb(story_id)
        kb.entities = {e.name.casefold(): KBEntity(
            name=e.name, entity_type=e.entity_type, status=e.status,
            location=e.location, mentions=e.mentions, is_locked=e.is_locked)
            for e in brain.entities}
        kb.entity_aliases = [asdict(a) for a in brain.aliases]
        kb.enhanced_events = [{**e.metadata, "event_id": e.event_id,
                              "event_type": e.event_type, "participants": list(e.participants),
                              "summary": e.summary, "chapter": e.chapter} for e in brain.events]
        kb.facts = list(brain.facts)
        kb.state_transitions = list(brain.transitions)
        kb.narrative_projection = brain.current_state
        kb.proposals = [self._proposal_to_dict(p) for p in brain.proposals]
        kb.relations = [KBRelation(**asdict(r)) for r in brain.relations]
        kb.metadata = brain.metadata
        self._manager.save_narrative_kb(story_id, kb)
        return result

    def rebuild_projection(self, story_id: str, expected_brain_version: int) -> dict[str, Any]:
        from dataclasses import asdict
        from domain.projection import project, project_relations

        brain = self.get_story_brain(story_id)
        if int(brain.metadata.get("brain_version", "1")) != expected_brain_version:
            raise OptimisticLockError(story_id)
        state = project(brain.entities, brain.facts, brain.events, brain.transitions)
        kb = self._manager.load_kb(story_id)
        kb.narrative_projection = state
        kb.relations = [KBRelation(**asdict(r)) for r in project_relations(brain.entities, brain.relations, state)]
        self._manager.save_narrative_kb(story_id, kb)
        return state

    def decide_proposal(
        self, story_id: str, proposal_id: str, accepted: bool, reason: str | None = None
    ) -> NarrativeProposal:
        kb = self._manager.load_kb(story_id)
        for index, item in enumerate(kb.proposals):
            if str(item.get("proposal_id")) != proposal_id:
                continue
            updated = NarrativeProposal(
                proposal_id=proposal_id,
                proposal_type=str(item.get("proposal_type", "unknown")),
                payload=dict(item.get("payload", {})),
                status=ProposalStatus.ACCEPTED if accepted else ProposalStatus.REJECTED,
                decision_reason=reason,
            )
            kb.proposals[index] = self._proposal_to_dict(updated)
            if accepted:
                current_version = int(kb.metadata.get("brain_version", "1"))
                kb.metadata["brain_version"] = str(current_version + 1)
            self._manager.save_kb(story_id, kb)
            return updated
        raise KeyError(f"Proposal not found: {proposal_id}")

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
        return self._manager.adapter_get_related_entities(story_id, entity_name, limit)

    def get_story_context(self, story_id: str, character_name: str, limit: int = 50) -> str:
        return self._manager.adapter_get_story_context(story_id, character_name, limit)

    def get_consistency_data(
        self, story_id: str, character_name: str
    ) -> list[dict[str, str]]:
        return self._manager.adapter_get_consistency_graph_data(story_id, character_name)

    def get_known_locations(self, story_id: str) -> set[str]:
        return self._manager.get_known_locations(story_id)

    def override_relation(
        self, story_id: str, subject: str, relation_type: str, object_name: str
    ) -> dict[str, Any]:
        return self._manager.override_relation(
            story_id, subject, relation_type, object_name, source="author"
        )

    def export_snapshot(self, story_id: str) -> dict[str, Any]:
        return self._manager.load_kb(story_id).model_dump()

    def create_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        kb = self._manager.load_kb(job.novel_id)
        jobs = dict(kb.metadata.get("bootstrap_jobs", {}))
        if job.job_id in jobs:
            return self._job_from_dict(jobs[job.job_id])
        jobs[job.job_id] = asdict(job)
        kb.metadata["bootstrap_jobs"] = jobs
        kb.metadata["status"] = "importing"
        self._manager.save_narrative_kb(job.novel_id, kb)
        return job

    def get_bootstrap_job(self, job_id: str) -> BootstrapJob:
        for file_path in self._manager.storage_dir.glob("*.json"):
            kb = self._manager.load_kb(file_path.stem)
            data = kb.metadata.get("bootstrap_jobs", {}).get(job_id)
            if data:
                return self._job_from_dict(data)
        raise KeyError(f"Bootstrap job not found: {job_id}")

    def save_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        kb = self._manager.load_kb(job.novel_id)
        jobs = dict(kb.metadata.get("bootstrap_jobs", {}))
        if job.job_id not in jobs:
            raise KeyError(f"Bootstrap job not found: {job.job_id}")
        jobs[job.job_id] = asdict(job)
        kb.metadata["bootstrap_jobs"] = jobs
        self._manager.save_narrative_kb(job.novel_id, kb)
        return job

    def activate_baseline(
        self, story_id: str, job_id: str, baseline_revision_id: str
    ) -> dict[str, Any]:
        job = self.get_bootstrap_job(job_id)
        if job.novel_id != story_id:
            raise KeyError(job_id)
        kb = self._manager.load_kb(story_id)
        kb.metadata["status"] = "active"
        kb.metadata["baseline_revision_id"] = baseline_revision_id
        self._manager.save_narrative_kb(story_id, kb)
        return {
            "story_brain_id": story_id,
            "status": "active",
            "baseline_revision_id": baseline_revision_id,
            "brain_version": int(kb.metadata.get("brain_version", "1")),
        }

    def merge_entities(
        self, story_id: str, source_entity_id: str, target_entity_id: str,
        expected_brain_version: int
    ) -> dict[str, Any]:
        from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
        memory = InMemoryNarrativeRepository()
        memory._brains[story_id] = self.get_story_brain(story_id)
        result = memory.merge_entities(
            story_id, source_entity_id, target_entity_id, expected_brain_version
        )
        brain = memory.get_story_brain(story_id)
        kb = self._manager.load_kb(story_id)
        kb.entities = {
            entity.name.casefold(): KBEntity(
                name=entity.name, entity_type=entity.entity_type, status=entity.status,
                location=entity.location, mentions=entity.mentions, is_locked=entity.is_locked
            )
            for entity in brain.entities
        }
        kb.entity_aliases = [asdict(item) for item in brain.aliases]
        kb.entity_mentions = [asdict(item) for item in brain.mentions]
        kb.facts = list(brain.facts)
        kb.state_transitions = list(brain.transitions)
        kb.narrative_projection = brain.current_state
        kb.metadata = brain.metadata
        self._manager.save_narrative_kb(story_id, kb)
        return result

    @staticmethod
    def _proposal_from_dict(item: dict[str, Any]) -> NarrativeProposal:
        return NarrativeProposal(
            proposal_id=str(item["proposal_id"]),
            proposal_type=str(item.get("proposal_type", "unknown")),
            payload=dict(item.get("payload", {})),
            analysis_run_id=item.get("analysis_run_id"),
            dependency_group_id=item.get("dependency_group_id"),
            materialization_order=int(item.get("materialization_order", 0)),
            evidence=tuple(item.get("evidence", [])),
            confidence=item.get("confidence"),
            expected_brain_version=int(item.get("expected_brain_version", 1)),
            status=ProposalStatus(str(item.get("status", ProposalStatus.PENDING.value))),
            decision_reason=item.get("decision_reason"),
        )

    @staticmethod
    def _proposal_to_dict(proposal: NarrativeProposal) -> dict[str, Any]:
        return {
            "proposal_id": proposal.proposal_id,
            "proposal_type": proposal.proposal_type,
            "payload": proposal.payload,
            "analysis_run_id": proposal.analysis_run_id,
            "dependency_group_id": proposal.dependency_group_id,
            "materialization_order": proposal.materialization_order,
            "evidence": list(proposal.evidence),
            "confidence": proposal.confidence,
            "expected_brain_version": proposal.expected_brain_version,
            "status": proposal.status.value,
            "decision_reason": proposal.decision_reason,
        }

    @staticmethod
    def _entity_id(story_id: str, name: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:{name.casefold()}"))

    @staticmethod
    def _job_from_dict(data: dict[str, Any]) -> BootstrapJob:
        return BootstrapJob(
            job_id=str(data["job_id"]),
            novel_id=str(data["novel_id"]),
            tenant_id=str(data["tenant_id"]),
            revisions=tuple(BootstrapRevision(**item) for item in data.get("revisions", [])),
            locale=str(data.get("locale", "vi-VN")),
            options=dict(data.get("options", {})),
            status=str(data.get("status", "queued")),
            progress_current=int(data.get("progress_current", 0)),
            stage=str(data.get("stage", "queued")),
            result=data.get("result"),
            error=data.get("error"),
        )

    def create_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        self._bootstrap_jobs[job.job_id] = job
        return job

    def get_bootstrap_job(self, job_id: str) -> BootstrapJob:
        if job_id not in self._bootstrap_jobs:
            raise KeyError(f"Bootstrap job not found: {job_id}")
        return self._bootstrap_jobs[job_id]

    def save_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob:
        if job.job_id not in self._bootstrap_jobs:
            raise KeyError(f"Bootstrap job not found: {job.job_id}")
        self._bootstrap_jobs[job.job_id] = job
        return job

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
    ) -> WritingContextPackage:
        from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
        memory = InMemoryNarrativeRepository()
        memory._brains[story_id] = self.get_story_brain(story_id)
        return memory.get_structured_context(
            story_id,
            chapter_number=chapter_number,
            character_name=character_name,
            limit_recent_events=limit_recent_events,
            token_budget=token_budget,
        )

