from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from domain.models import EventMemorySource, SemanticMemoryChunk, SemanticMemoryEmbedding
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    EventParticipantRecord,
    EventRecord,
    MemoryChunkRecord,
    MemoryEmbeddingRecord,
    StoryBrainRecord,
)


class PostgresSemanticMemoryRepository:
    """PostgreSQL persistence for derived semantic-memory artifacts.

    This repository is intentionally separate from NarrativeRepository so JSON and
    in-memory canonical adapters are not required to emulate vector storage.
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        *,
        tenant_id: str | uuid.UUID,
    ) -> None:
        self._session_factory = session_factory
        self._tenant_id = uuid.UUID(str(tenant_id))

    def list_event_memory_sources(self, story_id: str) -> list[EventMemorySource]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            events = list(
                session.scalars(
                    select(EventRecord)
                    .where(
                        EventRecord.story_brain_id == brain.id,
                        EventRecord.tenant_id == self._tenant_id,
                        EventRecord.novel_id == novel_id,
                        EventRecord.confirmation_status == "confirmed",
                    )
                    .order_by(EventRecord.narrative_order, EventRecord.id)
                ).all()
            )

            # Corrections/supersession are represented in event metadata in the
            # current Phase 4 model. Only the newest active event source is
            # eligible for semantic-memory materialization.
            superseded: set[str] = set()
            for event in events:
                target = str((event.event_metadata or {}).get("supersedes_id") or "").strip()
                if target:
                    superseded.add(target)

            active = [event for event in events if str(event.id) not in superseded]
            result: list[EventMemorySource] = []
            for event in active:
                participant_ids = tuple(
                    str(value)
                    for value in session.scalars(
                        select(EventParticipantRecord.entity_id).where(
                            EventParticipantRecord.event_id == event.id
                        )
                    ).all()
                )
                metadata = dict(event.event_metadata or {})
                evidence = metadata.get("evidence")
                first_evidence = (
                    evidence[0]
                    if isinstance(evidence, list) and evidence and isinstance(evidence[0], dict)
                    else {}
                )
                result.append(
                    EventMemorySource(
                        event_id=str(event.id),
                        story_brain_id=str(brain.id),
                        tenant_id=str(self._tenant_id),
                        novel_id=str(novel_id),
                        summary=event.summary,
                        narrative_order=int(event.narrative_order),
                        chapter_number=int(event.chapter_number),
                        chapter_id=self._optional_source_id(first_evidence.get("chapter_id")),
                        revision_id=self._optional_source_id(first_evidence.get("revision_id")),
                        entity_ids=participant_ids,
                        metadata={
                            "event_type": event.event_type,
                            "chapter_number": int(event.chapter_number),
                            "source_type": event.source_type,
                        },
                    )
                )
            return result

    def upsert_memory_chunk(
        self,
        story_id: str,
        *,
        source_key: str,
        memory_type: str,
        content: str,
        content_hash: str,
        importance_score: float,
        narrative_order: int | None,
        chapter_id: str | None,
        revision_id: str | None,
        event_id: str | None,
        entity_id: str | None,
        entity_ids: tuple[str, ...],
        metadata: dict[str, Any],
    ) -> SemanticMemoryChunk:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            record = session.scalar(
                select(MemoryChunkRecord).where(
                    MemoryChunkRecord.story_brain_id == brain.id,
                    MemoryChunkRecord.tenant_id == self._tenant_id,
                    MemoryChunkRecord.novel_id == novel_id,
                    MemoryChunkRecord.memory_type == memory_type,
                    MemoryChunkRecord.source_key == source_key,
                )
            )
            if record is None:
                record = MemoryChunkRecord(
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    source_key=source_key,
                    memory_type=memory_type,
                    content=content,
                    content_hash=content_hash,
                    importance_score=Decimal(str(importance_score)),
                    narrative_order=narrative_order,
                    chapter_id=self._stable_uuid("chapter", chapter_id) if chapter_id else None,
                    revision_id=self._stable_uuid("revision", revision_id) if revision_id else None,
                    event_id=self._stable_uuid("event", event_id) if event_id else None,
                    entity_id=self._stable_uuid("entity", entity_id) if entity_id else None,
                    entity_ids=list(entity_ids),
                    memory_metadata=dict(metadata),
                )
                session.add(record)
                session.flush()
            else:
                record.content = content
                record.content_hash = content_hash
                record.importance_score = Decimal(str(importance_score))
                record.narrative_order = narrative_order
                record.chapter_id = (
                    self._stable_uuid("chapter", chapter_id) if chapter_id else None
                )
                record.revision_id = (
                    self._stable_uuid("revision", revision_id) if revision_id else None
                )
                record.event_id = self._stable_uuid("event", event_id) if event_id else None
                record.entity_id = self._stable_uuid("entity", entity_id) if entity_id else None
                record.entity_ids = list(entity_ids)
                record.memory_metadata = dict(metadata)
                session.flush()
            return self._to_chunk(record)

    def list_memory_chunks(
        self,
        story_id: str,
        *,
        memory_type: str | None = None,
    ) -> list[SemanticMemoryChunk]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            statement = select(MemoryChunkRecord).where(
                MemoryChunkRecord.story_brain_id == brain.id,
                MemoryChunkRecord.tenant_id == self._tenant_id,
                MemoryChunkRecord.novel_id == novel_id,
            )
            if memory_type:
                statement = statement.where(MemoryChunkRecord.memory_type == memory_type)
            records = session.scalars(
                statement.order_by(
                    MemoryChunkRecord.narrative_order.asc().nullslast(),
                    MemoryChunkRecord.id,
                )
            ).all()
            return [self._to_chunk(record) for record in records]

    def delete_memory_chunks_not_in_sources(
        self,
        story_id: str,
        *,
        memory_type: str,
        active_source_keys: set[str],
    ) -> int:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            statement = delete(MemoryChunkRecord).where(
                MemoryChunkRecord.story_brain_id == brain.id,
                MemoryChunkRecord.tenant_id == self._tenant_id,
                MemoryChunkRecord.novel_id == novel_id,
                MemoryChunkRecord.memory_type == memory_type,
            )
            if active_source_keys:
                statement = statement.where(
                    MemoryChunkRecord.source_key.not_in(sorted(active_source_keys))
                )
            result = session.execute(statement)
            return int(result.rowcount or 0)

    def get_embedding(
        self,
        story_id: str,
        memory_chunk_id: str,
        embedding_version: str,
    ) -> SemanticMemoryEmbedding | None:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            record = session.scalar(
                select(MemoryEmbeddingRecord).where(
                    MemoryEmbeddingRecord.memory_chunk_id == uuid.UUID(memory_chunk_id),
                    MemoryEmbeddingRecord.story_brain_id == brain.id,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                )
            )
            return self._to_embedding(record) if record else None

    def upsert_embedding(
        self,
        story_id: str,
        embedding: SemanticMemoryEmbedding,
    ) -> SemanticMemoryEmbedding:
        if embedding.embedding_dimension != 768 or len(embedding.embedding) != 768:
            raise ValueError("P7 embedding-v1 requires exactly 768 dimensions")
        if embedding.normalization != "l2":
            raise ValueError("P7 embedding-v1 requires l2 normalization")

        novel_id = self._novel_id(story_id)
        chunk_id = uuid.UUID(embedding.memory_chunk_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            chunk = session.scalar(
                select(MemoryChunkRecord).where(
                    MemoryChunkRecord.id == chunk_id,
                    MemoryChunkRecord.story_brain_id == brain.id,
                    MemoryChunkRecord.tenant_id == self._tenant_id,
                    MemoryChunkRecord.novel_id == novel_id,
                )
            )
            if chunk is None:
                raise KeyError(f"Memory chunk not found in scope: {embedding.memory_chunk_id}")

            record = session.scalar(
                select(MemoryEmbeddingRecord).where(
                    MemoryEmbeddingRecord.memory_chunk_id == chunk_id,
                    MemoryEmbeddingRecord.embedding_version == embedding.embedding_version,
                )
            )
            if record is None:
                record = MemoryEmbeddingRecord(
                    id=uuid.UUID(embedding.embedding_id),
                    memory_chunk_id=chunk_id,
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    embedding_model=embedding.embedding_model,
                    embedding_version=embedding.embedding_version,
                    embedding_dimension=embedding.embedding_dimension,
                    normalization=embedding.normalization,
                    content_hash=embedding.content_hash,
                    embedding=list(embedding.embedding),
                )
                session.add(record)
            else:
                record.embedding_model = embedding.embedding_model
                record.embedding_dimension = embedding.embedding_dimension
                record.normalization = embedding.normalization
                record.content_hash = embedding.content_hash
                record.embedding = list(embedding.embedding)
            session.flush()
            return self._to_embedding(record)

    def list_embeddings_for_version(
        self,
        story_id: str,
        embedding_version: str,
    ) -> list[SemanticMemoryEmbedding]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            records = session.scalars(
                select(MemoryEmbeddingRecord)
                .where(
                    MemoryEmbeddingRecord.story_brain_id == brain.id,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                )
                .order_by(MemoryEmbeddingRecord.memory_chunk_id)
            ).all()
            return [self._to_embedding(record) for record in records]

    def delete_embedding_version(
        self,
        story_id: str,
        embedding_version: str,
    ) -> int:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            result = session.execute(
                delete(MemoryEmbeddingRecord).where(
                    MemoryEmbeddingRecord.story_brain_id == brain.id,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                )
            )
            return int(result.rowcount or 0)

    def embedding_coverage(
        self,
        story_id: str,
        embedding_version: str,
    ) -> dict[str, int]:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            brain = self._brain(session, novel_id)
            chunks = list(
                session.scalars(
                    select(MemoryChunkRecord).where(
                        MemoryChunkRecord.story_brain_id == brain.id,
                        MemoryChunkRecord.tenant_id == self._tenant_id,
                        MemoryChunkRecord.novel_id == novel_id,
                    )
                ).all()
            )
            embeddings = list(
                session.scalars(
                    select(MemoryEmbeddingRecord).where(
                        MemoryEmbeddingRecord.story_brain_id == brain.id,
                        MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                        MemoryEmbeddingRecord.novel_id == novel_id,
                        MemoryEmbeddingRecord.embedding_version == embedding_version,
                    )
                ).all()
            )
            by_chunk = {record.memory_chunk_id: record for record in embeddings}
            current = 0
            stale = 0
            for chunk in chunks:
                embedded = by_chunk.get(chunk.id)
                if embedded is None:
                    continue
                if embedded.content_hash == chunk.content_hash:
                    current += 1
                else:
                    stale += 1
            return {
                "total_chunks": len(chunks),
                "embedded": len(embeddings),
                "current": current,
                "stale": stale,
                "missing": max(0, len(chunks) - current - stale),
            }

    def _brain(self, session: Session, novel_id: uuid.UUID) -> StoryBrainRecord:
        brain = session.scalar(
            select(StoryBrainRecord).where(
                StoryBrainRecord.tenant_id == self._tenant_id,
                StoryBrainRecord.novel_id == novel_id,
            )
        )
        if brain is None:
            raise KeyError(f"Story Brain not found for novel {novel_id}")
        return brain

    @staticmethod
    def _optional_source_id(value: Any) -> str | None:
        text_value = str(value or "").strip()
        return text_value or None

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
    def _to_chunk(record: MemoryChunkRecord) -> SemanticMemoryChunk:
        return SemanticMemoryChunk(
            memory_chunk_id=str(record.id),
            story_brain_id=str(record.story_brain_id),
            tenant_id=str(record.tenant_id),
            novel_id=str(record.novel_id),
            source_key=record.source_key,
            memory_type=record.memory_type,
            content=record.content,
            content_hash=record.content_hash,
            importance_score=float(record.importance_score),
            narrative_order=record.narrative_order,
            chapter_id=str(record.chapter_id) if record.chapter_id else None,
            revision_id=str(record.revision_id) if record.revision_id else None,
            event_id=str(record.event_id) if record.event_id else None,
            entity_id=str(record.entity_id) if record.entity_id else None,
            entity_ids=tuple(str(value) for value in (record.entity_ids or [])),
            metadata=dict(record.memory_metadata or {}),
        )

    @staticmethod
    def _to_embedding(record: MemoryEmbeddingRecord) -> SemanticMemoryEmbedding:
        values = tuple(float(value) for value in (record.embedding or []))
        return SemanticMemoryEmbedding(
            embedding_id=str(record.id),
            memory_chunk_id=str(record.memory_chunk_id),
            story_brain_id=str(record.story_brain_id),
            tenant_id=str(record.tenant_id),
            novel_id=str(record.novel_id),
            embedding_model=record.embedding_model,
            embedding_version=record.embedding_version,
            embedding_dimension=int(record.embedding_dimension),
            normalization=record.normalization,
            content_hash=record.content_hash,
            embedding=values,
        )
