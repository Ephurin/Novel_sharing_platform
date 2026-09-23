from __future__ import annotations

import math
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from domain.models import (
    EventMemorySource,
    SemanticMemoryChunk,
    SemanticMemoryEmbedding,
    SemanticMemoryMatch,
)
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    EventParticipantRecord,
    EventRecord,
    MemoryChunkRecord,
    MemoryEmbeddingRecord,
    RevisionProvenanceRecord,
    StoryBrainRecord,
)


class PostgresSemanticMemoryRepository:
    """PostgreSQL adapter for rebuildable semantic-memory artifacts."""

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
        with self._session_factory() as session:
            brain = self._find_brain(session, novel_id)
            if brain is None:
                return []

            events = session.scalars(
                select(EventRecord)
                .where(
                    EventRecord.story_brain_id == brain.id,
                    EventRecord.tenant_id == self._tenant_id,
                    EventRecord.novel_id == novel_id,
                    EventRecord.confirmation_status == "confirmed",
                )
                .order_by(EventRecord.narrative_order.asc(), EventRecord.id.asc())
            ).all()

            superseded_ids: set[str] = set()
            for event in events:
                target = (event.event_metadata or {}).get("supersedes_id")
                if target:
                    superseded_ids.add(str(self._stable_uuid("event", str(target))))

            active_events = [event for event in events if str(event.id) not in superseded_ids]
            if not active_events:
                return []

            participant_rows = session.execute(
                select(EventParticipantRecord.event_id, EventParticipantRecord.entity_id).where(
                    EventParticipantRecord.event_id.in_([event.id for event in active_events])
                )
            ).all()
            participant_ids: dict[uuid.UUID, list[str]] = {}
            for event_id, entity_id in participant_rows:
                participant_ids.setdefault(event_id, []).append(str(entity_id))

            provenance_rows = session.scalars(
                select(RevisionProvenanceRecord).where(
                    RevisionProvenanceRecord.tenant_id == self._tenant_id,
                    RevisionProvenanceRecord.novel_id == novel_id,
                )
            ).all()
            provenance_by_revision = {row.revision_id: row for row in provenance_rows}

            sources: list[EventMemorySource] = []
            for event in active_events:
                event_metadata = dict(event.event_metadata or {})
                evidence_items = event_metadata.get("evidence")
                evidence = (
                    evidence_items[0]
                    if isinstance(evidence_items, list) and evidence_items
                    and isinstance(evidence_items[0], dict)
                    else {}
                )

                revision_uuid: uuid.UUID | None = None
                chapter_uuid: uuid.UUID | None = None
                raw_revision_id = evidence.get("revision_id")
                if raw_revision_id:
                    revision_uuid = self._stable_uuid("revision", str(raw_revision_id))
                    provenance = provenance_by_revision.get(revision_uuid)
                    if provenance is not None:
                        revision_uuid = provenance.revision_id
                        chapter_uuid = provenance.chapter_id
                if chapter_uuid is None and evidence.get("chapter_id"):
                    chapter_uuid = self._stable_uuid("chapter", str(evidence["chapter_id"]))

                sources.append(
                    EventMemorySource(
                        event_id=str(event.id),
                        story_brain_id=str(brain.id),
                        tenant_id=str(self._tenant_id),
                        novel_id=str(novel_id),
                        summary=event.summary,
                        narrative_order=int(event.narrative_order),
                        chapter_number=int(event.chapter_number),
                        chapter_id=str(chapter_uuid) if chapter_uuid else None,
                        revision_id=str(revision_uuid) if revision_uuid else None,
                        entity_ids=tuple(sorted(participant_ids.get(event.id, []))),
                        metadata={
                            "event_type": event.event_type,
                            "chapter_number": int(event.chapter_number),
                            "source_type": event.source_type,
                        },
                    )
                )
            return sources

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
            brain = self._require_brain(session, novel_id)
            record = session.scalar(
                select(MemoryChunkRecord).where(
                    MemoryChunkRecord.story_brain_id == brain.id,
                    MemoryChunkRecord.tenant_id == self._tenant_id,
                    MemoryChunkRecord.novel_id == novel_id,
                    MemoryChunkRecord.memory_type == memory_type,
                    MemoryChunkRecord.source_key == source_key,
                )
            )

            values = {
                "chapter_id": self._optional_uuid("chapter", chapter_id),
                "revision_id": self._optional_uuid("revision", revision_id),
                "event_id": self._optional_uuid("event", event_id),
                "entity_id": self._optional_uuid("entity", entity_id),
                "content": content,
                "content_hash": content_hash,
                "importance_score": Decimal(str(importance_score)),
                "narrative_order": narrative_order,
                "entity_ids": list(entity_ids),
                "memory_metadata": dict(metadata),
            }
            if record is None:
                record = MemoryChunkRecord(
                    id=uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"memory-chunk:{brain.id}:{memory_type}:{source_key}",
                    ),
                    story_brain_id=brain.id,
                    tenant_id=self._tenant_id,
                    novel_id=novel_id,
                    source_key=source_key,
                    memory_type=memory_type,
                    **values,
                )
                session.add(record)
                session.flush()
            else:
                for name, value in values.items():
                    setattr(record, name, value)
                session.flush()
            return self._to_chunk(record)

    def list_memory_chunks(
        self,
        story_id: str,
        *,
        memory_type: str | None = None,
    ) -> list[SemanticMemoryChunk]:
        novel_id = self._novel_id(story_id)
        with self._session_factory() as session:
            brain = self._find_brain(session, novel_id)
            if brain is None:
                return []
            statement = select(MemoryChunkRecord).where(
                MemoryChunkRecord.story_brain_id == brain.id,
                MemoryChunkRecord.tenant_id == self._tenant_id,
                MemoryChunkRecord.novel_id == novel_id,
            )
            if memory_type is not None:
                statement = statement.where(MemoryChunkRecord.memory_type == memory_type)
            records = session.scalars(
                statement.order_by(
                    MemoryChunkRecord.narrative_order.asc().nullslast(),
                    MemoryChunkRecord.id.asc(),
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
            brain = self._find_brain(session, novel_id)
            if brain is None:
                return 0
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
        chunk_uuid = self._stable_uuid("memory-chunk", memory_chunk_id)
        with self._session_factory() as session:
            record = session.scalar(
                select(MemoryEmbeddingRecord).where(
                    MemoryEmbeddingRecord.memory_chunk_id == chunk_uuid,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                )
            )
            return self._to_embedding(record) if record is not None else None

    def upsert_embedding(
        self,
        story_id: str,
        embedding: SemanticMemoryEmbedding,
    ) -> SemanticMemoryEmbedding:
        novel_id = self._novel_id(story_id)
        chunk_id_text = embedding.memory_chunk_id
        chunk_uuid = self._stable_uuid("memory-chunk", chunk_id_text)
        if embedding.embedding_dimension != 768 or len(embedding.embedding) != 768:
            raise ValueError("embedding-v1 requires exactly 768 dimensions")
        if embedding.normalization != "l2":
            raise ValueError("embedding-v1 requires l2 normalization")
        norm = math.sqrt(sum(float(value) * float(value) for value in embedding.embedding))
        if not math.isclose(norm, 1.0, rel_tol=1e-6, abs_tol=1e-6):
            raise ValueError("Persisted embedding must be L2-normalized")

        with session_scope(self._session_factory) as session:
            brain = self._require_brain(session, novel_id)
            chunk = session.scalar(
                select(MemoryChunkRecord).where(
                    MemoryChunkRecord.id == chunk_uuid,
                    MemoryChunkRecord.story_brain_id == brain.id,
                    MemoryChunkRecord.tenant_id == self._tenant_id,
                    MemoryChunkRecord.novel_id == novel_id,
                )
            )
            if chunk is None:
                raise KeyError(chunk_id_text)
            if embedding.content_hash != chunk.content_hash:
                raise ValueError(
                    f"Cannot persist stale embedding for memory chunk {chunk_id_text}"
                )
            if uuid.UUID(str(embedding.story_brain_id)) != brain.id:
                raise ValueError("Embedding story_brain_id does not match persisted memory chunk")
            if uuid.UUID(str(embedding.tenant_id)) != self._tenant_id:
                raise ValueError("Embedding tenant_id does not match repository scope")
            if uuid.UUID(str(embedding.novel_id)) != novel_id:
                raise ValueError("Embedding novel_id does not match repository scope")

            record = session.scalar(
                select(MemoryEmbeddingRecord).where(
                    MemoryEmbeddingRecord.memory_chunk_id == chunk.id,
                    MemoryEmbeddingRecord.embedding_version == embedding.embedding_version,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                )
            )
            if record is None:
                record = MemoryEmbeddingRecord(
                    id=self._stable_uuid("memory-embedding", embedding.embedding_id),
                    memory_chunk_id=chunk.id,
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
                if record.embedding_model != embedding.embedding_model:
                    raise ValueError(
                        "Embedding version cannot be reused with a different embedding model"
                    )
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
        with self._session_factory() as session:
            records = session.scalars(
                select(MemoryEmbeddingRecord)
                .where(
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                )
                .order_by(MemoryEmbeddingRecord.memory_chunk_id.asc())
            ).all()
            return [self._to_embedding(record) for record in records]

    def delete_embedding_version(
        self,
        story_id: str,
        embedding_version: str,
    ) -> int:
        novel_id = self._novel_id(story_id)
        with session_scope(self._session_factory) as session:
            result = session.execute(
                delete(MemoryEmbeddingRecord).where(
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
        with self._session_factory() as session:
            brain = self._find_brain(session, novel_id)
            if brain is None:
                return {
                    "total_chunks": 0,
                    "embedded": 0,
                    "current": 0,
                    "stale": 0,
                    "missing": 0,
                    "fresh_embeddings": 0,
                }

            chunk_filters = (
                MemoryChunkRecord.story_brain_id == brain.id,
                MemoryChunkRecord.tenant_id == self._tenant_id,
                MemoryChunkRecord.novel_id == novel_id,
            )
            total_chunks = session.scalar(
                select(func.count()).select_from(MemoryChunkRecord).where(*chunk_filters)
            ) or 0
            total_embeddings = session.scalar(
                select(func.count())
                .select_from(MemoryEmbeddingRecord)
                .where(
                    MemoryEmbeddingRecord.story_brain_id == brain.id,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                )
            ) or 0
            fresh_embeddings = session.scalar(
                select(func.count())
                .select_from(MemoryEmbeddingRecord)
                .join(
                    MemoryChunkRecord,
                    MemoryChunkRecord.id == MemoryEmbeddingRecord.memory_chunk_id,
                )
                .where(
                    *chunk_filters,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                    MemoryEmbeddingRecord.content_hash == MemoryChunkRecord.content_hash,
                )
            ) or 0
            stale_embeddings = max(0, int(total_embeddings) - int(fresh_embeddings))
            missing_embeddings = max(0, int(total_chunks) - int(fresh_embeddings) - stale_embeddings)
            return {
                "total_chunks": int(total_chunks),
                "embedded": int(total_embeddings),
                "current": int(fresh_embeddings),
                "stale": stale_embeddings,
                "missing": missing_embeddings,
                # Compatibility alias for early P7-02 callers.
                "fresh_embeddings": int(fresh_embeddings),
            }

    def search_semantic_memories(
        self,
        story_id: str,
        *,
        query_embedding: tuple[float, ...],
        embedding_version: str,
        chapter_number: int | None,
        limit: int = 10,
        memory_type: str = "event_summary",
    ) -> list[SemanticMemoryMatch]:
        """Exact cosine retrieval with scope/version/freshness/temporal filters."""

        if limit <= 0:
            return []
        if chapter_number is None:
            raise ValueError("semantic event retrieval requires a chapter cutoff")
        if len(query_embedding) != 768:
            raise ValueError("semantic query requires exactly 768 dimensions")
        norm = math.sqrt(sum(float(value) * float(value) for value in query_embedding))
        if not math.isclose(norm, 1.0, rel_tol=1e-6, abs_tol=1e-6):
            raise ValueError("semantic query embedding must be L2-normalized")

        novel_id = self._novel_id(story_id)
        with self._session_factory() as session:
            brain = self._find_brain(session, novel_id)
            if brain is None:
                return []

            # A correction can be accepted immediately before the background
            # materializer removes the superseded chunk. Derive the inactive
            # event IDs here as an additional fail-closed guard so superseded
            # memories never enter vector candidate ranking during that race.
            confirmed_events = session.scalars(
                select(EventRecord).where(
                    EventRecord.story_brain_id == brain.id,
                    EventRecord.tenant_id == self._tenant_id,
                    EventRecord.novel_id == novel_id,
                    EventRecord.confirmation_status == "confirmed",
                )
            ).all()
            superseded_ids: set[uuid.UUID] = set()
            for event_record in confirmed_events:
                target = (event_record.event_metadata or {}).get("supersedes_id")
                if target:
                    superseded_ids.add(
                        self._stable_uuid("event", str(target))
                    )

            distance = MemoryEmbeddingRecord.embedding.cosine_distance(
                list(query_embedding)
            ).label("cosine_distance")
            statement = (
                select(MemoryChunkRecord, MemoryEmbeddingRecord, EventRecord, distance)
                .join(
                    MemoryEmbeddingRecord,
                    MemoryEmbeddingRecord.memory_chunk_id == MemoryChunkRecord.id,
                )
                .join(EventRecord, EventRecord.id == MemoryChunkRecord.event_id)
                .where(
                    MemoryChunkRecord.story_brain_id == brain.id,
                    MemoryChunkRecord.tenant_id == self._tenant_id,
                    MemoryChunkRecord.novel_id == novel_id,
                    MemoryChunkRecord.memory_type == memory_type,
                    MemoryEmbeddingRecord.story_brain_id == brain.id,
                    MemoryEmbeddingRecord.tenant_id == self._tenant_id,
                    MemoryEmbeddingRecord.novel_id == novel_id,
                    MemoryEmbeddingRecord.embedding_version == embedding_version,
                    MemoryEmbeddingRecord.embedding_dimension == 768,
                    MemoryEmbeddingRecord.normalization == "l2",
                    MemoryEmbeddingRecord.content_hash == MemoryChunkRecord.content_hash,
                    EventRecord.story_brain_id == brain.id,
                    EventRecord.tenant_id == self._tenant_id,
                    EventRecord.novel_id == novel_id,
                    EventRecord.confirmation_status == "confirmed",
                )
            )
            statement = statement.where(EventRecord.chapter_number <= chapter_number)
            if superseded_ids:
                statement = statement.where(EventRecord.id.not_in(superseded_ids))

            rows = session.execute(
                statement.order_by(distance.asc(), MemoryChunkRecord.id.asc()).limit(limit)
            ).all()
            return [
                SemanticMemoryMatch(
                    memory_chunk_id=str(chunk.id),
                    story_brain_id=str(chunk.story_brain_id),
                    tenant_id=str(chunk.tenant_id),
                    novel_id=str(chunk.novel_id),
                    source_key=chunk.source_key,
                    memory_type=chunk.memory_type,
                    content=chunk.content,
                    content_hash=chunk.content_hash,
                    embedding_version=embedding.embedding_version,
                    cosine_distance=float(cosine_distance),
                    narrative_order=chunk.narrative_order,
                    chapter_number=int(event.chapter_number),
                    chapter_id=str(chunk.chapter_id) if chunk.chapter_id else None,
                    revision_id=str(chunk.revision_id) if chunk.revision_id else None,
                    event_id=str(chunk.event_id) if chunk.event_id else None,
                    entity_id=str(chunk.entity_id) if chunk.entity_id else None,
                    entity_ids=tuple(chunk.entity_ids or ()),
                    importance_score=float(chunk.importance_score),
                    metadata=dict(chunk.memory_metadata or {}),
                )
                for chunk, embedding, event, cosine_distance in rows
            ]

    def _find_brain(
        self,
        session: Session,
        novel_id: uuid.UUID,
    ) -> StoryBrainRecord | None:
        return session.scalar(
            select(StoryBrainRecord).where(
                StoryBrainRecord.tenant_id == self._tenant_id,
                StoryBrainRecord.novel_id == novel_id,
            )
        )

    def _require_brain(self, session: Session, novel_id: uuid.UUID) -> StoryBrainRecord:
        brain = self._find_brain(session, novel_id)
        if brain is None:
            raise KeyError(f"Story Brain not found for novel {novel_id}")
        return brain

    @staticmethod
    def _novel_id(story_id: str) -> uuid.UUID:
        try:
            return uuid.UUID(story_id)
        except ValueError:
            return uuid.uuid5(uuid.NAMESPACE_URL, f"novel:{story_id}")

    @staticmethod
    def _stable_uuid(kind: str, value: str) -> uuid.UUID:
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return uuid.uuid5(uuid.NAMESPACE_URL, f"{kind}:{value}")

    @classmethod
    def _optional_uuid(cls, kind: str, value: str | None) -> uuid.UUID | None:
        return cls._stable_uuid(kind, value) if value else None

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
            entity_ids=tuple(record.entity_ids or ()),
            metadata=dict(record.memory_metadata or {}),
        )

    @staticmethod
    def _to_embedding(record: MemoryEmbeddingRecord) -> SemanticMemoryEmbedding:
        return SemanticMemoryEmbedding(
            embedding_id=str(record.id),
            memory_chunk_id=str(record.memory_chunk_id),
            story_brain_id=str(record.story_brain_id),
            tenant_id=str(record.tenant_id),
            novel_id=str(record.novel_id),
            embedding_model=record.embedding_model,
            embedding_version=record.embedding_version,
            embedding_dimension=record.embedding_dimension,
            normalization=record.normalization,
            content_hash=record.content_hash,
            embedding=tuple(float(value) for value in record.embedding),
        )
