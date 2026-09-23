from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Sequence

from domain.models import HybridRankingSignals, SemanticMemoryMatch


HYBRID_RANKING_VERSION = "hybrid-v1"


@dataclass(frozen=True, slots=True)
class HybridRankingWeights:
    semantic: float = 0.55
    entity_overlap: float = 0.10
    temporal: float = 0.10
    importance: float = 0.10
    relationship: float = 0.15

    def __post_init__(self) -> None:
        values = (
            self.semantic,
            self.entity_overlap,
            self.temporal,
            self.importance,
            self.relationship,
        )
        if any(value < 0.0 for value in values):
            raise ValueError("Hybrid ranking weights must be non-negative")
        if not math.isclose(sum(values), 1.0, rel_tol=1e-9, abs_tol=1e-9):
            raise ValueError("Hybrid ranking weights must sum to 1.0")


class HybridRanker:
    """Deterministic re-ranker for already-filtered semantic candidates."""

    def __init__(
        self,
        weights: HybridRankingWeights | None = None,
        *,
        temporal_half_life_chapters: float = 12.0,
        ranking_version: str = HYBRID_RANKING_VERSION,
    ) -> None:
        if temporal_half_life_chapters <= 0:
            raise ValueError("temporal_half_life_chapters must be positive")
        self.weights = weights or HybridRankingWeights()
        self.temporal_half_life_chapters = float(temporal_half_life_chapters)
        self.ranking_version = ranking_version

    def rank(
        self,
        candidates: Sequence[SemanticMemoryMatch],
        *,
        signals: HybridRankingSignals,
        chapter_number: int,
        limit: int,
    ) -> tuple[SemanticMemoryMatch, ...]:
        if limit <= 0 or not candidates:
            return ()

        query_entities = set(signals.query_entity_ids)
        related_entities = set(signals.related_entity_ids)
        scored: list[tuple[float, int, str, SemanticMemoryMatch]] = []

        for semantic_rank, match in enumerate(candidates):
            memory_entities = set(match.entity_ids)
            semantic_score = self._clamp(
                1.0 / math.log2(float(semantic_rank) + 2.0)
            )
            entity_overlap_score = (
                self._clamp(len(query_entities & memory_entities) / len(query_entities))
                if query_entities
                else 0.0
            )
            age = max(0, int(chapter_number) - int(match.chapter_number or chapter_number))
            temporal_score = self._clamp(
                1.0 / (1.0 + (age / self.temporal_half_life_chapters))
            )
            importance_score = self._clamp(float(match.importance_score))
            relationship_score = (
                self._clamp(
                    len(
                        (memory_entities - query_entities)
                        & related_entities
                    )
                    / max(1, len(memory_entities))
                )
                if related_entities and memory_entities
                else 0.0
            )

            hybrid_score = self._clamp(
                self.weights.semantic * semantic_score
                + self.weights.entity_overlap * entity_overlap_score
                + self.weights.temporal * temporal_score
                + self.weights.importance * importance_score
                + self.weights.relationship * relationship_score
            )
            enriched = replace(
                match,
                semantic_score=semantic_score,
                entity_overlap_score=entity_overlap_score,
                temporal_score=temporal_score,
                relationship_score=relationship_score,
                hybrid_score=hybrid_score,
            )
            scored.append(
                (
                    hybrid_score,
                    semantic_rank,
                    match.memory_chunk_id,
                    enriched,
                )
            )

        scored.sort(key=lambda row: (-row[0], row[1], row[2]))
        return tuple(row[3] for row in scored[:limit])

    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, float(value)))
