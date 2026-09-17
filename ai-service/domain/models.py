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
