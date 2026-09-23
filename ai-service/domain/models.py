from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ProposalStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class NarrativeEntity:
    name: str
    entity_id: str | None = None
    entity_type: str = "UNKNOWN"
    status: str = "Alive"
    location: str = "Unknown"
    mentions: int = 1
    is_locked: bool = False


@dataclass(frozen=True, slots=True)
class NarrativeRelation:
    subject: str
    relation: str
    object: str
    metadata: dict[str, Any] = field(default_factory=dict)
    source: str = "system"
    locked: bool = False


@dataclass(frozen=True, slots=True)
class NarrativeAlias:
    alias_id: str
    entity_id: str
    alias: str
    normalized_alias: str


@dataclass(frozen=True, slots=True)
class NarrativeMention:
    mention_id: str
    entity_id: str
    chapter_id: str
    revision_id: str
    surface_text: str
    source_start: int
    source_end: int
    source_text_hash: str
    extractor_version: str | None = None


@dataclass(frozen=True, slots=True)
class NarrativeEvent:
    event_id: str
    event_type: str
    participants: tuple[str, ...] = ()
    summary: str = ""
    chapter: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class NarrativeProposal:
    proposal_id: str
    proposal_type: str
    payload: dict[str, Any]
    analysis_run_id: str | None = None
    dependency_group_id: str | None = None
    materialization_order: int = 0
    evidence: tuple[dict[str, Any], ...] = ()
    confidence: float | None = None
    expected_brain_version: int = 1
    status: ProposalStatus = ProposalStatus.PENDING
    decision_reason: str | None = None


@dataclass(frozen=True, slots=True)
class AnalysisRun:
    run_id: str
    idempotency_key: str
    input_hash: str
    operation: str
    status: str
    pipeline_version: str


@dataclass(frozen=True, slots=True)
class BootstrapRevision:
    chapter_id: str
    revision_id: str
    content_hash: str
    status: str = "pending"
    proposal_count: int = 0
    analysis_run_id: str | None = None
    chapter_number: int | None = None


@dataclass(frozen=True, slots=True)
class BootstrapJob:
    job_id: str
    novel_id: str
    tenant_id: str
    revisions: tuple[BootstrapRevision, ...]
    locale: str = "vi-VN"
    options: dict[str, bool] = field(default_factory=dict)
    status: str = "queued"
    progress_current: int = 0
    stage: str = "queued"
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class StoryBrain:
    story_id: str
    entities: tuple[NarrativeEntity, ...] = ()
    aliases: tuple[NarrativeAlias, ...] = ()
    mentions: tuple[NarrativeMention, ...] = ()
    facts: tuple[dict[str, Any], ...] = ()
    relations: tuple[NarrativeRelation, ...] = ()
    events: tuple[NarrativeEvent, ...] = ()
    transitions: tuple[dict[str, Any], ...] = ()
    proposals: tuple[NarrativeProposal, ...] = ()
    current_state: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class WritingPatch:
    start: int
    end: int
    replacement: str


@dataclass(frozen=True, slots=True)
class ValidationResult:
    validator: str
    passed: bool
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class WritingContextPackage:
    brain_version: int
    entities: tuple[dict[str, Any], ...] = ()
    current_states: tuple[dict[str, Any], ...] = ()
    recent_events: tuple[dict[str, Any], ...] = ()
    semantic_memories: tuple[dict[str, Any], ...] = ()
    world_rules: tuple[dict[str, Any], ...] = ()
    author_constraints: tuple[str, ...] = ()
    token_budget: dict[str, int] = field(default_factory=dict)
    context_summary: dict[str, list[str]] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class WritingGenerationJob:
    job_id: str
    novel_id: str
    chapter_id: str
    revision_id: str
    content_hash: str
    tenant_id: str
    operation: str
    selection: dict[str, int]
    instruction: str
    constraints: tuple[str, ...] = ()
    style: dict[str, Any] = field(default_factory=dict)
    expected_brain_version: int = 1
    actor_id: str | None = None
    idempotency_key: str = ""
    input_hash: str = ""
    status: str = "queued"
    stage: str = "queued"
    draft: str | None = None
    patch: WritingPatch | None = None
    validation_status: str = "pending"
    validations: tuple[ValidationResult, ...] = ()
    context_summary: dict[str, list[str]] = field(default_factory=dict)
    model_info: dict[str, str] = field(default_factory=dict)
    error: dict[str, Any] | None = None
    brain_version_used: int | None = None
    context_hash: str = ""
    chapter_number: int | None = None



@dataclass(frozen=True, slots=True)
class EventMemorySource:
    event_id: str
    story_brain_id: str
    tenant_id: str
    novel_id: str
    summary: str
    narrative_order: int
    chapter_number: int
    chapter_id: str | None = None
    revision_id: str | None = None
    entity_ids: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SemanticMemoryChunk:
    memory_chunk_id: str
    story_brain_id: str
    tenant_id: str
    novel_id: str
    source_key: str
    memory_type: str
    content: str
    content_hash: str
    importance_score: float
    narrative_order: int | None = None
    chapter_id: str | None = None
    revision_id: str | None = None
    event_id: str | None = None
    entity_id: str | None = None
    entity_ids: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SemanticMemoryEmbedding:
    embedding_id: str
    memory_chunk_id: str
    story_brain_id: str
    tenant_id: str
    novel_id: str
    embedding_model: str
    embedding_version: str
    embedding_dimension: int
    normalization: str
    content_hash: str
    embedding: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class SemanticMemoryMatch:
    memory_chunk_id: str
    story_brain_id: str
    tenant_id: str
    novel_id: str
    source_key: str
    memory_type: str
    content: str
    content_hash: str
    embedding_version: str
    cosine_distance: float
    narrative_order: int | None = None
    chapter_number: int | None = None
    chapter_id: str | None = None
    revision_id: str | None = None
    event_id: str | None = None
    entity_id: str | None = None
    entity_ids: tuple[str, ...] = ()
    importance_score: float = 0.5
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SemanticRetrievalResult:
    matches: tuple[SemanticMemoryMatch, ...] = ()
    status: str = "ok"
    embedding_version: str = ""
    fallback_reason: str | None = None
