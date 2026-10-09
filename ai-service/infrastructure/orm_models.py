from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector


SCHEMA = "narrative"
JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")
VECTOR_768_TYPE = Vector(768).with_variant(JSON(), "sqlite")


class Base(DeclarativeBase):
    pass


class StoryBrainRecord(Base):
    __tablename__ = "story_brains"
    __table_args__ = (UniqueConstraint("tenant_id", "novel_id", name="uq_story_brain_tenant_novel"), {"schema": SCHEMA})

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="initializing")
    baseline_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    brain_version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EntityRecord(Base):
    __tablename__ = "entities"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    static_attributes: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="legacy")
    confirmation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed")
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EntityAliasRecord(Base):
    __tablename__ = "entity_aliases"
    __table_args__ = (
        UniqueConstraint("entity_id", "normalized_alias", name="uq_entity_alias_normalized"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.entities.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    confirmation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EntityMentionRecord(Base):
    __tablename__ = "entity_mentions"
    __table_args__ = (
        CheckConstraint("source_start >= 0", name="ck_entity_mention_start"),
        CheckConstraint("source_end > source_start", name="ck_entity_mention_span"),
        UniqueConstraint(
            "revision_id",
            "entity_id",
            "source_start",
            "source_end",
            "extractor_version",
            name="uq_entity_mention_evidence",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.entities.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    chapter_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    surface_text: Mapped[str] = mapped_column(String(255), nullable=False)
    source_start: Mapped[int] = mapped_column(Integer, nullable=False)
    source_end: Mapped[int] = mapped_column(Integer, nullable=False)
    source_text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    extractor_version: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventRecord(Base):
    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("story_brain_id", "narrative_order", name="uq_event_narrative_order"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    narrative_order: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    participants: Mapped[list[str]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    event_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="legacy")
    confirmation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FactRecord(Base):
    __tablename__ = "facts"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    subject_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.entities.id")
    )
    fact_type: Mapped[str] = mapped_column(String(40), nullable=False)
    fact_key: Mapped[str] = mapped_column(String(100), nullable=False)
    fact_value: Mapped[Any] = mapped_column(JSON_TYPE, nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="AI")
    confirmation_status: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed")
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    chapter_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_start: Mapped[int | None] = mapped_column(Integer)
    source_end: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RevisionProvenanceRecord(Base):
    __tablename__ = "revision_provenances"
    __table_args__ = (
        UniqueConstraint("tenant_id", "novel_id", "revision_id", name="uq_rev_provenance_revision"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    chapter_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemoryChunkRecord(Base):
    __tablename__ = "memory_chunks"
    __table_args__ = (
        UniqueConstraint(
            "story_brain_id",
            "memory_type",
            "source_key",
            name="uq_memory_chunk_source",
        ),
        Index(
            "ix_memory_chunks_story_order",
            "story_brain_id",
            "narrative_order",
        ),
        Index(
            "ix_memory_chunks_story_hash",
            "story_brain_id",
            "content_hash",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.events.id", ondelete="CASCADE")
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.entities.id", ondelete="SET NULL")
    )
    source_key: Mapped[str] = mapped_column(String(255), nullable=False)
    memory_type: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    importance_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, default=Decimal("0.5000")
    )
    narrative_order: Mapped[int | None] = mapped_column(BigInteger)
    entity_ids: Mapped[list[str]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    memory_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSON_TYPE,
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MemoryEmbeddingRecord(Base):
    __tablename__ = "memory_embeddings"
    __table_args__ = (
        UniqueConstraint(
            "memory_chunk_id",
            "embedding_version",
            name="uq_memory_embedding_chunk_version",
        ),
        CheckConstraint(
            "embedding_dimension = 768",
            name="ck_memory_embedding_dimension_768",
        ),
        CheckConstraint(
            "normalization = 'l2'",
            name="ck_memory_embedding_normalization_l2",
        ),
        Index(
            "ix_memory_embeddings_story_version",
            "story_brain_id",
            "embedding_version",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    memory_chunk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey(f"{SCHEMA}.memory_chunks.id", ondelete="CASCADE"),
        nullable=False,
    )
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False)
    embedding_version: Mapped[str] = mapped_column(String(100), nullable=False)
    embedding_dimension: Mapped[int] = mapped_column(Integer, nullable=False, default=768)
    normalization: Mapped[str] = mapped_column(String(32), nullable=False, default="l2")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(VECTOR_768_TYPE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalysisRunRecord(Base):

    __tablename__ = "analysis_runs"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BootstrapJobRecord(Base):
    __tablename__ = "bootstrap_jobs"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="vi-VN")
    options: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    revisions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    progress_current: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProposalRecord(Base):
    __tablename__ = "proposals"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.analysis_runs.id", ondelete="CASCADE"), nullable=False
    )
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    dependency_group_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    materialization_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    proposal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    expected_brain_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    decision_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProposalDecisionRecord(Base):
    __tablename__ = "proposal_decisions"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('accept', 'reject', 'edit_accept')",
            name="ck_proposal_decision_value",
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.proposals.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    edited_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    reason: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RelationshipRecord(Base):
    __tablename__ = "relationships"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_brains.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    subject_name: Mapped[str] = mapped_column(String(255), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(80), nullable=False)
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="author")
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    relation_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventParticipantRecord(Base):
    __tablename__ = "event_participants"
    __table_args__ = ({"schema": SCHEMA},)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.events.id"), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.entities.id"), primary_key=True)
    participant_role: Mapped[str] = mapped_column(String(40), primary_key=True, default="actor")


class StateTransitionRecord(Base):
    __tablename__ = "state_transitions"
    __table_args__ = (
        CheckConstraint("(event_id IS NOT NULL AND fact_id IS NULL) OR (event_id IS NULL AND fact_id IS NOT NULL)", name="ck_transition_source"),
        {"schema": SCHEMA},
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.story_brains.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.entities.id"), nullable=False)
    event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.events.id"))
    fact_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.facts.id"))
    attribute_key: Mapped[str] = mapped_column(String(100), nullable=False)
    new_value: Mapped[Any] = mapped_column(JSON_TYPE, nullable=False)
    sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)


class CurrentEntityStateRecord(Base):
    __tablename__ = "current_entity_states"
    __table_args__ = ({"schema": SCHEMA},)
    story_brain_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.story_brains.id"), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey(f"{SCHEMA}.entities.id"), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    state: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    projection_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class WritingGenerationRecord(Base):
    __tablename__ = "writing_generations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "novel_id", "idempotency_key", name="uq_writing_gen_tenant_idempotency"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, unique=True, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    chapter_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    base_content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    brain_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    selection_start: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selection_end: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    constraints: Mapped[list[str]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    style: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    draft: Mapped[str | None] = mapped_column(Text)
    patch: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    validation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    validations: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON_TYPE, nullable=False, default=list, server_default=text("'[]'")
    )
    context_summary: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    model_name: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(50))
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StoryPlanRecord(Base):
    __tablename__ = "story_plans"
    __table_args__ = (
        UniqueConstraint("tenant_id", "novel_id", "plan_version", name="uq_story_plan_tenant_novel_version"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    plan_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    source_outline: Mapped[str | None] = mapped_column(Text)
    source_outline_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StoryPlanObjectiveRecord(Base):
    __tablename__ = "story_plan_objectives"
    __table_args__ = (
        UniqueConstraint("plan_id", "order_index", name="uq_story_plan_objective_order"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey(f"{SCHEMA}.story_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    novel_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    target_chapter: Mapped[int | None] = mapped_column(Integer)
    objective_type: Mapped[str] = mapped_column(String(30), nullable=False, default="chapter_goal")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    objective_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


