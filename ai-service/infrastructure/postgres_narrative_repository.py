from __future__ import annotations

import hashlib
import json
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, sessionmaker

from domain.projection import ProjectionError, validate_payload, project, resolve_entity, transition_from_payload
from domain.errors import IdempotencyConflictError, OptimisticLockError
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
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    CurrentEntityStateRecord,
    EventParticipantRecord,
    StateTransitionRecord,
    AnalysisRunRecord,
    EntityAliasRecord,
    EntityMentionRecord,
    EntityRecord,
    EventRecord,
    FactRecord,
    ProposalDecisionRecord,
    ProposalRecord,
    RelationshipRecord,
    StoryBrainRecord,
)


class PostgresNarrativeRepository:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        *,
        tenant_id: str | uuid.UUID,
        actor_id: str | uuid.UUID,
    ) -> None:
        self._session_factory = session_factory
        self.engine = session_factory.kw.get("bind")
        self._tenant_id = uuid.UUID(str(tenant_id))
        self._actor_id = uuid.UUID(str(actor_id))

    def get_story_brain(self, story_id: str) -> StoryBrain:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            entities = session.scalars(
                select(EntityRecord).where(*self._scope(EntityRecord, novel_id))
            ).all()
            aliases = session.scalars(
                select(EntityAliasRecord)
                .join(EntityRecord, EntityRecord.id == EntityAliasRecord.entity_id)
                .where(*self._scope(EntityRecord, novel_id))
            ).all()
            mentions = session.scalars(
                select(EntityMentionRecord).where(
                    EntityMentionRecord.tenant_id == self._tenant_id,
                    EntityMentionRecord.novel_id == novel_id,
                )
            ).all()
            relations = session.scalars(
                select(RelationshipRecord).where(*self._scope(RelationshipRecord, novel_id))
            ).all()
            events = session.scalars(
                select(EventRecord)
                .where(*self._scope(EventRecord, novel_id))
                .order_by(EventRecord.narrative_order)
            ).all()
            facts = session.scalars(
                select(FactRecord).where(*self._scope(FactRecord, novel_id))
            ).all()
            proposals = session.scalars(
                select(ProposalRecord).where(*self._scope(ProposalRecord, novel_id))
            ).all()
            return StoryBrain(
                story_id=story_id,
                entities=tuple(self._to_entity(item) for item in entities),
                aliases=tuple(
                    NarrativeAlias(
                        alias_id=str(item.id),
                        entity_id=str(item.entity_id),
                        alias=item.alias,
                        normalized_alias=item.normalized_alias,
                    )
                    for item in aliases
                ),
                mentions=tuple(
                    NarrativeMention(
                        mention_id=str(item.id),
                        entity_id=str(item.entity_id),
                        chapter_id=str(item.chapter_id),
                        revision_id=str(item.revision_id),
                        surface_text=item.surface_text,
                        source_start=item.source_start,
                        source_end=item.source_end,
                        source_text_hash=item.source_text_hash,
                        extractor_version=item.extractor_version,
                    )
                    for item in mentions
                ),
                facts=tuple(
                    {
                        "fact_id": str(item.id),
                        "subject_entity_id": str(item.subject_entity_id) if item.subject_entity_id else None,
                        "fact_type": item.fact_type,
                        "fact_key": item.fact_key,
                        "fact_value": item.fact_value,
                        "is_locked": item.is_locked,
                    }
                    for item in facts
                ),
                relations=tuple(
                    NarrativeRelation(
                        subject=item.subject_name,
                        relation=item.relation_type,
                        object=item.object_name,
                        metadata=dict(item.relation_metadata),
                        source=item.source_type,
                        locked=item.is_locked,
                    )
                    for item in relations
                ),
                events=tuple(self._to_event(item) for item in events),
                proposals=tuple(self._to_proposal(item) for item in proposals),
                transitions=tuple(self._projection_inputs(session, novel_id)[3]),
                current_state=self._read_projection(session, novel_id),
                metadata={
                    "brain_id": str(brain.id),
                    "brain_version": str(brain.brain_version),
                    "status": brain.status,
                },
            )

    def list_entities(self, story_id: str) -> list[NarrativeEntity]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            self._get_or_create_brain(session, novel_id)
            records = session.scalars(
                select(EntityRecord).where(*self._scope(EntityRecord, novel_id))
            ).all()
            return [self._to_entity(item) for item in records]

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

        novel_id = self._novel_id(story_id)
        normalized = name.casefold()
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            record = session.scalar(
                select(EntityRecord).where(
                    *self._scope(EntityRecord, novel_id),
                    EntityRecord.normalized_name == normalized,
                )
            )
            if record is None:
                record = EntityRecord(
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    entity_type=entity_type,
                    canonical_name=name,
                    normalized_name=normalized,
                    static_attributes={"mentions": 1, "status": "Alive", "location": "Unknown"},
                    source_type="legacy",
                    confirmation_status="confirmed",
                    confidence=self._decimal(entity_data.get("score")),
                )
                session.add(record)
            else:
                attributes = dict(record.static_attributes)
                attributes["mentions"] = int(attributes.get("mentions", 1)) + 1
                record.static_attributes = attributes
                if record.entity_type == "UNKNOWN" and entity_type != "UNKNOWN":
                    record.entity_type = entity_type
        return {"entity": name, "label": entity_type, "story_id": story_id, "status": "updated"}

    def add_entity_alias(self, story_id: str, entity_id: str, alias: str) -> str:
        novel_id = self._novel_id(story_id)
        entity_uuid = uuid.UUID(entity_id)
        normalized = alias.casefold()
        with session_scope(self._session_factory) as session:
            entity = session.scalar(
                select(EntityRecord).where(
                    EntityRecord.id == entity_uuid,
                    *self._scope(EntityRecord, novel_id),
                )
            )
            if entity is None:
                raise KeyError(f"Entity not found: {entity_id}")
            existing = session.scalar(
                select(EntityAliasRecord).where(
                    EntityAliasRecord.entity_id == entity_uuid,
                    EntityAliasRecord.normalized_alias == normalized,
                )
            )
            if existing is not None:
                return str(existing.id)
            record = EntityAliasRecord(
                entity_id=entity_uuid,
                alias=alias,
                normalized_alias=normalized,
                source_type="author",
                confirmation_status="confirmed",
            )
            session.add(record)
            session.flush()
            return str(record.id)

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
        if source_start < 0 or source_end <= source_start:
            raise ValueError("Invalid evidence span")
        novel_id = self._novel_id(story_id)
        entity_uuid = uuid.UUID(entity_id)
        chapter_uuid = self._stable_uuid("chapter", chapter_id)
        revision_uuid = self._stable_uuid("revision", revision_id)
        with session_scope(self._session_factory) as session:
            entity = session.scalar(
                select(EntityRecord).where(
                    EntityRecord.id == entity_uuid,
                    *self._scope(EntityRecord, novel_id),
                )
            )
            if entity is None:
                raise KeyError(f"Entity not found: {entity_id}")
            existing = session.scalar(
                select(EntityMentionRecord).where(
                    EntityMentionRecord.revision_id == revision_uuid,
                    EntityMentionRecord.entity_id == entity_uuid,
                    EntityMentionRecord.source_start == source_start,
                    EntityMentionRecord.source_end == source_end,
                    EntityMentionRecord.extractor_version == extractor_version,
                    EntityMentionRecord.tenant_id == self._tenant_id,
                    EntityMentionRecord.novel_id == novel_id,
                )
            )
            if existing is not None:
                return str(existing.id)
            record = EntityMentionRecord(
                story_brain_id=entity.story_brain_id,
                entity_id=entity_uuid,
                tenant_id=self._tenant_id,
                novel_id=novel_id,
                chapter_id=chapter_uuid,
                revision_id=revision_uuid,
                surface_text=surface_text,
                source_start=source_start,
                source_end=source_end,
                source_text_hash=source_text_hash,
                extractor_version=extractor_version,
            )
            session.add(record)
            session.flush()
            return str(record.id)

    def append_event(self, story_id: str, event: NarrativeEvent) -> None:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            current_order = session.scalar(
                select(func.max(EventRecord.narrative_order)).where(
                    *self._scope(EventRecord, novel_id)
                )
            )
            session.add(
                EventRecord(
                    id=self._stable_uuid("event", event.event_id),
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    narrative_order=(current_order or 0) + 1024,
                    event_type=event.event_type,
                    summary=event.summary,
                    participants=list(event.participants),
                    event_metadata=event.metadata,
                    chapter_number=event.chapter,
                )
            )

    def save_proposals(
        self, story_id: str, proposals: list[NarrativeProposal]
    ) -> list[NarrativeProposal]:
        if not proposals:
            return []
        novel_id = self._novel_id(story_id)
        digest = hashlib.sha256(
            json.dumps(
                [(item.proposal_id, item.payload) for item in proposals],
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        key = f"{self._tenant_id}:proposal-batch:{digest}"
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            run = None
            if proposals[0].analysis_run_id:
                run = session.scalar(
                    select(AnalysisRunRecord).where(
                        AnalysisRunRecord.id
                        == self._stable_uuid("analysis", proposals[0].analysis_run_id),
                        *self._scope(AnalysisRunRecord, novel_id),
                    )
                )
            if run is None:
                run = self._get_or_create_analysis_run_record(
                    session,
                    brain,
                    novel_id,
                    idempotency_key=key,
                    input_hash=digest,
                    operation="proposal_batch",
                    pipeline_version="legacy-v1",
                )
            for index, proposal in enumerate(proposals):
                proposal_id = self._stable_uuid("proposal", proposal.proposal_id)
                existing = session.scalar(
                    select(ProposalRecord).where(
                        ProposalRecord.id == proposal_id,
                        *self._scope(ProposalRecord, novel_id),
                    )
                )
                if existing is None:
                    session.add(
                        ProposalRecord(
                            id=proposal_id,
                            analysis_run_id=run.id,
                            story_brain_id=brain.id,
                            tenant_id=self._tenant_id,
                            novel_id=novel_id,
                            dependency_group_id=(
                                self._stable_uuid("proposal-group", proposal.dependency_group_id)
                                if proposal.dependency_group_id
                                else run.id
                            ),
                            materialization_order=proposal.materialization_order or index,
                            proposal_type=proposal.proposal_type,
                            payload=proposal.payload,
                            evidence=list(proposal.evidence),
                            confidence=self._decimal(proposal.confidence),
                            status=proposal.status.value,
                            expected_brain_version=proposal.expected_brain_version,
                            decision_reason=proposal.decision_reason,
                        )
                    )
        return proposals

    def list_proposals(
        self,
        story_id: str,
        *,
        status: str | None = None,
        proposal_type: str | None = None,
        analysis_run_id: str | None = None,
    ) -> list[NarrativeProposal]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            statement = select(ProposalRecord).where(
                *self._scope(ProposalRecord, novel_id)
            )
            if status:
                statement = statement.where(ProposalRecord.status == status)
            if proposal_type:
                statement = statement.where(ProposalRecord.proposal_type == proposal_type)
            if analysis_run_id:
                statement = statement.where(
                    ProposalRecord.analysis_run_id
                    == self._stable_uuid("analysis", analysis_run_id)
                )
            records = session.scalars(
                statement.order_by(ProposalRecord.materialization_order, ProposalRecord.created_at)
            ).all()
            return [self._to_proposal(item) for item in records]

    def locate_proposal(self, proposal_id: str) -> tuple[str, NarrativeProposal]:
        with session_scope(self._session_factory) as session:
            record = session.scalar(
                select(ProposalRecord).where(
                    ProposalRecord.id == self._stable_uuid("proposal", proposal_id),
                    ProposalRecord.tenant_id == self._tenant_id,
                )
            )
            if record is None:
                raise KeyError(f"Proposal not found: {proposal_id}")
            return str(record.novel_id), self._to_proposal(record)

    def accept_proposal_group(
        self,
        story_id: str,
        proposal_ids: list[str],
        expected_brain_version: int,
        *,
        edited_payloads: dict[str, dict[str, Any]] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        from domain.errors import ProposalAlreadyDecidedError

        novel_id = self._novel_id(story_id)
        proposal_uuids = [self._stable_uuid("proposal", item) for item in proposal_ids]
        edited_payloads = edited_payloads or {}
        with session_scope(self._session_factory) as session:
            brain = session.scalar(
                select(StoryBrainRecord)
                .where(*self._scope(StoryBrainRecord, novel_id))
                .with_for_update()
            )
            if brain is None:
                raise KeyError(f"Story Brain not found: {story_id}")
            if brain.brain_version != expected_brain_version:
                raise OptimisticLockError(story_id)
            proposals = session.scalars(
                select(ProposalRecord)
                .where(
                    ProposalRecord.id.in_(proposal_uuids),
                    *self._scope(ProposalRecord, novel_id),
                )
                .order_by(ProposalRecord.materialization_order)
                .with_for_update()
            ).all()
            if len(proposals) != len(set(proposal_uuids)):
                raise KeyError("Proposal group is incomplete")
            if any(item.status != ProposalStatus.PENDING.value for item in proposals):
                raise ProposalAlreadyDecidedError("Proposal group contains a decided proposal")
            groups = {item.dependency_group_id for item in proposals}
            if len(proposals) > 1 and len(groups) != 1:
                raise ValueError("All proposals must belong to the same dependency group")
            if any(item.expected_brain_version != expected_brain_version for item in proposals):
                raise OptimisticLockError(story_id)

            artifact_ids: list[str] = []
            for proposal in proposals:
                external_id = next(
                    item for item in proposal_ids if self._stable_uuid("proposal", item) == proposal.id
                )
                payload = edited_payloads.get(external_id, proposal.payload)
                validate_payload(proposal.proposal_type, payload)
                if proposal.proposal_type == "entity":
                    normalized = str(payload["normalized_name"]).casefold()
                    entity = session.scalar(
                        select(EntityRecord).where(
                            *self._scope(EntityRecord, novel_id),
                            EntityRecord.normalized_name == normalized,
                        )
                    )
                    if entity and entity.is_locked and entity.entity_type != payload["entity_type"]:
                        raise OptimisticLockError("Author-locked entity conflicts with proposal")
                    if entity is None:
                        entity = EntityRecord(
                            story_brain_id=brain.id,
                            tenant_id=self._tenant_id,
                            novel_id=novel_id,
                            entity_type=str(payload["entity_type"]),
                            canonical_name=str(payload["canonical_name"]),
                            normalized_name=normalized,
                            static_attributes={"mentions": 1, "status": "Alive", "location": "Unknown"},
                            source_type="AI",
                            confirmation_status="confirmed",
                            confidence=proposal.confidence,
                        )
                        session.add(entity)
                        session.flush()
                    artifact_ids.append(str(entity.id))
                elif proposal.proposal_type == "event":
                    event_uuid = self._stable_uuid("event", str(payload.get("event_id") or external_id))
                    if session.scalar(select(EventRecord.id).where(EventRecord.id == event_uuid, *self._scope(EventRecord, novel_id))):
                        raise ProjectionError("Historical event IDs are immutable and unique")
                    current_order = session.scalar(
                        select(func.max(EventRecord.narrative_order)).where(
                            *self._scope(EventRecord, novel_id)
                        )
                    )
                    event = EventRecord(
                        id=self._stable_uuid("event", str(payload.get("event_id") or external_id)),
                        story_brain_id=brain.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        narrative_order=(current_order or 0) + 1024,
                        event_type=str(payload["event_type"]),
                        summary=str(payload["summary"]),
                        participants=list(payload.get("participants", [])),
                        event_metadata={**payload, "evidence": list(proposal.evidence)},
                        chapter_number=int(payload.get("chapter", 1)),
                        source_type="AI",
                        confirmation_status="confirmed",
                    )
                    session.add(event)
                    session.flush()
                    entities = [self._to_entity(e) for e in session.scalars(
                        select(EntityRecord).where(*self._scope(EntityRecord, novel_id))).all()]
                    for entity_id in {resolve_entity(p, entities) for p in event.participants}:
                        session.add(EventParticipantRecord(event_id=event.id, entity_id=uuid.UUID(entity_id)))
                    artifact_ids.append(str(event.id))
                elif proposal.proposal_type == "state_transition":
                    entities, facts, events, transitions = self._projection_inputs(session, novel_id)
                    transition = transition_from_payload(str(proposal.id), payload, entities, events, facts)
                    session.add(StateTransitionRecord(
                        id=proposal.id, story_brain_id=brain.id, tenant_id=self._tenant_id, novel_id=novel_id,
                        entity_id=uuid.UUID(transition["entity_id"]),
                        event_id=uuid.UUID(transition["event_id"]) if transition["event_id"] else None,
                        fact_id=uuid.UUID(transition["fact_id"]) if transition["fact_id"] else None,
                        attribute_key=transition["attribute_key"], new_value=transition["new_value"],
                        sequence=len(transitions) + 1))
                    session.flush()
                    artifact_ids.append(str(proposal.id))
                elif proposal.proposal_type == "alias":
                    alias = EntityAliasRecord(
                        entity_id=uuid.UUID(str(payload["entity_id"])),
                        alias=str(payload["alias"]),
                        normalized_alias=str(payload["alias"]).casefold(),
                        source_type="AI",
                        confirmation_status="confirmed",
                        confidence=proposal.confidence,
                    )
                    session.add(alias)
                    session.flush()
                    artifact_ids.append(str(alias.id))
                elif proposal.proposal_type == "fact":
                    evidence = proposal.evidence[0] if proposal.evidence else {}
                    fact = FactRecord(
                        story_brain_id=brain.id,
                        tenant_id=self._tenant_id,
                        novel_id=novel_id,
                        subject_entity_id=(
                            uuid.UUID(str(payload["subject_entity_id"]))
                            if payload.get("subject_entity_id")
                            else None
                        ),
                        fact_type=str(payload.get("fact_type", "world_rule")),
                        fact_key=str(payload["fact_key"]),
                        fact_value=payload["fact_value"],
                        source_type="AI",
                        confirmation_status="confirmed",
                        confidence=proposal.confidence,
                        priority=int(payload.get("priority", 0)),
                        source_revision_id=(
                            self._stable_uuid("revision", str(evidence["revision_id"]))
                            if evidence.get("revision_id")
                            else None
                        ),
                        source_start=evidence.get("start"),
                        source_end=evidence.get("end"),
                        created_by=self._actor_id,
                    )
                    session.add(fact)
                    session.flush()
                    artifact_ids.append(str(fact.id))
                    if fact.subject_entity_id:
                        entities, facts, events, transitions = self._projection_inputs(session, novel_id)
                        transition = transition_from_payload(
                            str(uuid.uuid5(uuid.NAMESPACE_URL, f"initial:{fact.id}")),
                            {"entity_id": str(fact.subject_entity_id), "fact_id": str(fact.id),
                             "attribute_key": fact.fact_key, "new_value": fact.fact_value},
                            entities, events, facts)
                        session.add(StateTransitionRecord(
                            id=uuid.UUID(transition["transition_id"]), story_brain_id=brain.id,
                            tenant_id=self._tenant_id, novel_id=novel_id, entity_id=fact.subject_entity_id,
                            fact_id=fact.id, attribute_key=fact.fact_key, new_value=fact.fact_value,
                            sequence=len(transitions) + 1))
                        session.flush()
                else:
                    raise ValueError(f"Unsupported proposal type: {proposal.proposal_type}")

                proposal.payload = payload
                proposal.status = ProposalStatus.ACCEPTED.value
                proposal.decision_reason = reason
                session.add(
                    ProposalDecisionRecord(
                        proposal_id=proposal.id,
                        actor_id=self._actor_id,
                        decision="edit_accept" if external_id in edited_payloads else "accept",
                        edited_payload=payload if external_id in edited_payloads else None,
                        reason=reason,
                    )
                )
            self._persist_projection(session, brain, novel_id)
            brain.brain_version += 1
            session.flush()
            return {
                "proposal_ids": proposal_ids,
                "canonical_artifact_ids": artifact_ids,
                "brain_version": brain.brain_version,
                "status": "accepted",
            }

    def decide_proposal(
        self, story_id: str, proposal_id: str, accepted: bool, reason: str | None = None
    ) -> NarrativeProposal:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            proposal = session.scalar(
                select(ProposalRecord).where(
                    ProposalRecord.id == self._stable_uuid("proposal", proposal_id),
                    *self._scope(ProposalRecord, novel_id),
                )
            )
            if proposal is None:
                raise KeyError(f"Proposal not found: {proposal_id}")
            if proposal.status != ProposalStatus.PENDING.value:
                return self._to_proposal(proposal)
            if accepted:
                result = session.execute(
                    update(StoryBrainRecord)
                    .where(
                        StoryBrainRecord.id == proposal.story_brain_id,
                        *self._scope(StoryBrainRecord, novel_id),
                        StoryBrainRecord.brain_version == proposal.expected_brain_version,
                    )
                    .values(brain_version=StoryBrainRecord.brain_version + 1)
                )
                if result.rowcount != 1:
                    raise OptimisticLockError(f"Story Brain version conflict: {story_id}")
            proposal.status = (
                ProposalStatus.ACCEPTED.value if accepted else ProposalStatus.REJECTED.value
            )
            proposal.decision_reason = reason
            session.add(
                ProposalDecisionRecord(
                    proposal_id=proposal.id,
                    actor_id=self._actor_id,
                    decision="accept" if accepted else "reject",
                    reason=reason,
                )
            )
            session.flush()
            return self._to_proposal(proposal)

    def get_current_state(self, story_id: str) -> dict[str, Any]:
        with session_scope(self._session_factory) as session:
            return self._read_projection(session, self._novel_id(story_id))

    def rebuild_projection(self, story_id: str, expected_brain_version: int) -> dict[str, Any]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = session.scalar(select(StoryBrainRecord).where(
                *self._scope(StoryBrainRecord, novel_id)).with_for_update())
            if brain is None:
                raise KeyError(story_id)
            if brain.brain_version != expected_brain_version:
                raise OptimisticLockError(story_id)
            return self._persist_projection(session, brain, novel_id)

    def _projection_inputs(self, session, novel_id):
        entities = [self._to_entity(e) for e in session.scalars(
            select(EntityRecord).where(*self._scope(EntityRecord, novel_id))).all()]
        facts = [{"fact_id": str(f.id), "subject_entity_id": str(f.subject_entity_id) if f.subject_entity_id else None,
                  "fact_key": f.fact_key, "fact_value": f.fact_value, "is_locked": f.is_locked}
                 for f in session.scalars(select(FactRecord).where(*self._scope(FactRecord, novel_id))).all()]
        events = [self._to_event(e) for e in session.scalars(select(EventRecord).where(
            *self._scope(EventRecord, novel_id)).order_by(EventRecord.narrative_order)).all()]
        transitions = [{"transition_id": str(t.id), "entity_id": str(t.entity_id),
                        "event_id": str(t.event_id) if t.event_id else None,
                        "fact_id": str(t.fact_id) if t.fact_id else None,
                        "attribute_key": t.attribute_key, "new_value": t.new_value}
                       for t in session.scalars(select(StateTransitionRecord).where(
                           *self._scope(StateTransitionRecord, novel_id)).order_by(StateTransitionRecord.sequence)).all()]
        return entities, facts, events, transitions

    def _persist_projection(self, session, brain, novel_id):
        state = project(*self._projection_inputs(session, novel_id))
        session.execute(delete(CurrentEntityStateRecord).where(*self._scope(CurrentEntityStateRecord, novel_id)))
        for entity_id, attributes in state["entities"].items():
            session.add(CurrentEntityStateRecord(
                story_brain_id=brain.id, entity_id=uuid.UUID(entity_id), tenant_id=self._tenant_id,
                novel_id=novel_id, state=attributes, provenance=state["provenance"][entity_id]))
        session.execute(delete(RelationshipRecord).where(
            *self._scope(RelationshipRecord, novel_id), RelationshipRecord.source_type == "projection",
            RelationshipRecord.is_locked.is_(False)))
        entities = {str(e.id): e.canonical_name for e in session.scalars(
            select(EntityRecord).where(*self._scope(EntityRecord, novel_id))).all()}
        for relation in state["relationships"]:
            subject, target = entities[relation["subject_entity_id"]], entities[relation["object_entity_id"]]
            locked = session.scalar(select(RelationshipRecord).where(
                *self._scope(RelationshipRecord, novel_id), RelationshipRecord.subject_name == subject,
                RelationshipRecord.object_name == target, RelationshipRecord.is_locked.is_(True)))
            if locked:
                if locked.relation_type != relation["relation"]:
                    raise OptimisticLockError("Projection conflicts with an author-locked relationship")
                continue
            session.add(RelationshipRecord(story_brain_id=brain.id, tenant_id=self._tenant_id, novel_id=novel_id,
                subject_name=subject, object_name=target, relation_type=relation["relation"],
                source_type="projection", relation_metadata=relation))
        session.flush()
        return state

    def _read_projection(self, session, novel_id):
        records = session.scalars(select(CurrentEntityStateRecord).where(
            *self._scope(CurrentEntityStateRecord, novel_id))).all()
        entities = [self._to_entity(e) for e in session.scalars(select(EntityRecord).where(
            *self._scope(EntityRecord, novel_id))).all()]
        relationships = []
        for record in records:
            for target, relation in record.state.get("active_relationships", {}).items():
                relationships.append({"subject_entity_id": str(record.entity_id),
                    "object_entity_id": resolve_entity(target, entities), "relation": relation,
                    **record.provenance["active_relationships"]})
        relationships.sort(key=lambda r: (r["subject_entity_id"], r["object_entity_id"], r["relation"]))
        return {"entities": {str(r.entity_id): r.state for r in records},
                "provenance": {str(r.entity_id): r.provenance for r in records},
                "relationships": relationships, "projection_version": 1}

    def get_or_create_analysis_run(
        self,
        story_id: str,
        *,
        idempotency_key: str,
        input_hash: str,
        operation: str,
        pipeline_version: str,
    ) -> AnalysisRun:
        if not idempotency_key.startswith(f"{self._tenant_id}:"):
            raise ValueError("idempotency_key must start with the scoped tenant_id")
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            record = self._get_or_create_analysis_run_record(
                session,
                brain,
                novel_id,
                idempotency_key=idempotency_key,
                input_hash=input_hash,
                operation=operation,
                pipeline_version=pipeline_version,
            )
            return self._to_analysis_run(record)

    def get_related_entities(
        self, story_id: str, entity_name: str, limit: int = 10
    ) -> list[dict[str, str]]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            records = session.scalars(
                select(RelationshipRecord)
                .where(
                    *self._scope(RelationshipRecord, novel_id),
                    (
                        (func.lower(RelationshipRecord.subject_name) == entity_name.casefold())
                        | (func.lower(RelationshipRecord.object_name) == entity_name.casefold())
                    ),
                )
                .limit(limit)
            ).all()
            return [
                {
                    "name": (
                        item.object_name
                        if item.subject_name.casefold() == entity_name.casefold()
                        else item.subject_name
                    ),
                    "relation": item.relation_type,
                }
                for item in records
            ]

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
        entity = next(
            (
                item
                for item in self.list_entities(story_id)
                if item.name.casefold() == character_name.casefold()
            ),
            None,
        )
        if entity is None:
            return []
        return [{"name": entity.name, "status": entity.status, "location": entity.location}]

    def get_known_locations(self, story_id: str) -> set[str]:
        return {
            item.name
            for item in self.list_entities(story_id)
            if item.entity_type.casefold() in {"location", "loc"}
        }

    def override_relation(
        self, story_id: str, subject: str, relation_type: str, object_name: str
    ) -> dict[str, Any]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._get_or_create_brain(session, novel_id)
            session.execute(
                delete(RelationshipRecord).where(
                    *self._scope(RelationshipRecord, novel_id),
                    RelationshipRecord.subject_name == subject,
                    RelationshipRecord.object_name == object_name,
                )
            )
            session.add(
                RelationshipRecord(
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    subject_name=subject,
                    relation_type=relation_type,
                    object_name=object_name,
                    source_type="author",
                    is_locked=True,
                )
            )
        return {"status": "success", "relation": relation_type, "locked": True}

    def export_snapshot(self, story_id: str) -> dict[str, Any]:
        brain = self.get_story_brain(story_id)
        return {
            "story_id": story_id,
            "metadata": brain.metadata,
            "entities": {
                item.name.casefold(): {
                    "name": item.name,
                    "entity_type": item.entity_type,
                    "status": item.status,
                    "location": item.location,
                    "mentions": item.mentions,
                }
                for item in brain.entities
            },
            "relations": [
                {
                    "subject": item.subject,
                    "relation": item.relation,
                    "object": item.object,
                    "metadata": item.metadata,
                    "source": item.source,
                    "locked": item.locked,
                }
                for item in brain.relations
            ],
            "events": [],
            "enhanced_events": [
                {
                    "event_id": item.event_id,
                    "event_type": item.event_type,
                    "participants": list(item.participants),
                    "summary": item.summary,
                    "chapter": item.chapter,
                    **item.metadata,
                }
                for item in brain.events
            ],
            "proposals": [
                {
                    "proposal_id": item.proposal_id,
                    "proposal_type": item.proposal_type,
                    "payload": item.payload,
                    "status": item.status.value,
                    "decision_reason": item.decision_reason,
                }
                for item in brain.proposals
            ],
            "relation_history": [],
            "entity_states": {},
            "event_history": [],
            "current_world_state": {"characters": {}},
            "narrative_projection": brain.current_state,
            "state_transitions": list(brain.transitions),
        }

    def _get_or_create_brain(
        self, session: Session, novel_id: uuid.UUID
    ) -> StoryBrainRecord:
        brain = session.scalar(
            select(StoryBrainRecord).where(*self._scope(StoryBrainRecord, novel_id))
        )
        if brain is None:
            brain = StoryBrainRecord(
                tenant_id=self._tenant_id,
                novel_id=novel_id,
                status="active",
            )
            session.add(brain)
            session.flush()
        return brain

    def _get_or_create_analysis_run_record(
        self,
        session: Session,
        brain: StoryBrainRecord,
        novel_id: uuid.UUID,
        *,
        idempotency_key: str,
        input_hash: str,
        operation: str,
        pipeline_version: str,
    ) -> AnalysisRunRecord:
        record = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == idempotency_key,
                *self._scope(AnalysisRunRecord, novel_id),
            )
        )
        if record is not None:
            if record.input_hash != input_hash:
                raise IdempotencyConflictError(idempotency_key)
            return record
        record = AnalysisRunRecord(
            story_brain_id=brain.id,
            tenant_id=self._tenant_id,
            novel_id=novel_id,
            operation=operation,
            status="pending",
            idempotency_key=idempotency_key,
            input_hash=input_hash,
            pipeline_version=pipeline_version,
        )
        session.add(record)
        session.flush()
        return record

    def _scope(self, model: type, novel_id: uuid.UUID) -> tuple[Any, Any]:
        return model.tenant_id == self._tenant_id, model.novel_id == novel_id

    @staticmethod
    def _novel_id(story_id: str) -> uuid.UUID:
        try:
            return uuid.UUID(story_id)
        except ValueError:
            return uuid.uuid5(uuid.NAMESPACE_URL, f"novel:{story_id}")

    @staticmethod
    def _stable_uuid(kind: str, value: str) -> uuid.UUID:
        try:
            return uuid.UUID(value)
        except ValueError:
            return uuid.uuid5(uuid.NAMESPACE_URL, f"{kind}:{value}")

    @staticmethod
    def _decimal(value: Any) -> Decimal | None:
        try:
            return Decimal(str(value)) if value is not None else None
        except Exception:
            return None

    @staticmethod
    def _to_entity(record: EntityRecord) -> NarrativeEntity:
        attributes = record.static_attributes or {}
        return NarrativeEntity(
            name=record.canonical_name,
            entity_id=str(record.id),
            entity_type=record.entity_type,
            status=str(attributes.get("status", "Alive")),
            location=str(attributes.get("location", "Unknown")),
            mentions=int(attributes.get("mentions", 1)),
            is_locked=record.is_locked,
        )

    @staticmethod
    def _to_event(record: EventRecord) -> NarrativeEvent:
        return NarrativeEvent(
            event_id=str(record.id),
            event_type=record.event_type,
            participants=tuple(record.participants),
            summary=record.summary,
            chapter=record.chapter_number,
            metadata=dict(record.event_metadata),
        )

    @staticmethod
    def _to_proposal(record: ProposalRecord) -> NarrativeProposal:
        return NarrativeProposal(
            proposal_id=str(record.id),
            proposal_type=record.proposal_type,
            payload=dict(record.payload),
            analysis_run_id=str(record.analysis_run_id),
            dependency_group_id=str(record.dependency_group_id),
            materialization_order=record.materialization_order,
            evidence=tuple(record.evidence),
            confidence=float(record.confidence) if record.confidence is not None else None,
            expected_brain_version=record.expected_brain_version,
            status=ProposalStatus(record.status),
            decision_reason=record.decision_reason,
        )

    @staticmethod
    def _to_analysis_run(record: AnalysisRunRecord) -> AnalysisRun:
        return AnalysisRun(
            run_id=str(record.id),
            idempotency_key=record.idempotency_key,
            input_hash=record.input_hash,
            operation=record.operation,
            status=record.status,
            pipeline_version=record.pipeline_version,
        )
