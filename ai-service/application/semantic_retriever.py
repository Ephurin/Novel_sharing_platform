from __future__ import annotations

import logging

from application.hybrid_ranker import HybridRanker
from domain.embeddings import EmbeddingProvider, l2_normalize
from domain.models import SemanticRetrievalResult
from domain.repositories import SemanticMemoryRepository


logger = logging.getLogger(__name__)


class SemanticRetrieverService:
    """Exact pgvector retrieval; semantic failure falls back to Phase 6 context."""

    def __init__(
        self,
        repository: SemanticMemoryRepository,
        embedding_provider: EmbeddingProvider,
        *,
        embedding_version: str | None = None,
        default_limit: int = 8,
        tenant_id: str | None = None,
        hybrid_ranker: HybridRanker | None = None,
    ) -> None:
        self._repository = repository
        self._embedding_provider = embedding_provider
        self.embedding_version = embedding_version or embedding_provider.version
        self.default_limit = max(1, int(default_limit))
        self.tenant_id = tenant_id
        self._hybrid_ranker = hybrid_ranker
        if self.embedding_version != embedding_provider.version:
            raise ValueError(
                "Query embedding provider version must match active document embedding version"
            )

    def retrieve(
        self,
        story_id: str,
        *,
        query_text: str,
        chapter_number: int | None,
        limit: int | None = None,
        tenant_id: str | None = None,
    ) -> SemanticRetrievalResult:
        query = query_text.strip()
        if not query:
            return SemanticRetrievalResult(
                status="skipped",
                embedding_version=self.embedding_version,
            )
        if chapter_number is None:
            return SemanticRetrievalResult(
                status="skipped",
                embedding_version=self.embedding_version,
                fallback_reason="missing_temporal_cutoff",
            )
        if self.tenant_id is not None and tenant_id is not None and tenant_id != self.tenant_id:
            return SemanticRetrievalResult(
                status="skipped",
                embedding_version=self.embedding_version,
                fallback_reason="tenant_scope_mismatch",
            )

        try:
            raw_vector = self._embedding_provider.embed_query(query)
            query_vector = l2_normalize(
                raw_vector,
                expected_dimension=self._embedding_provider.dimension,
            )
            final_limit = min(64, max(1, int(limit or self.default_limit)))
            candidate_limit = (
                min(64, max(final_limit * 4, 20))
                if self._hybrid_ranker is not None
                else final_limit
            )
            matches = self._repository.search_semantic_memories(
                story_id,
                query_embedding=query_vector,
                embedding_version=self.embedding_version,
                chapter_number=chapter_number,
                limit=candidate_limit,
            )

            if self._hybrid_ranker is None:
                return SemanticRetrievalResult(
                    matches=tuple(matches[:final_limit]),
                    status="ok",
                    embedding_version=self.embedding_version,
                    ranking_version="semantic-only-v1",
                )

            try:
                signals = self._repository.get_hybrid_ranking_signals(
                    story_id,
                    query_text=query,
                    chapter_number=chapter_number,
                )
                ranked = self._hybrid_ranker.rank(
                    matches,
                    signals=signals,
                    chapter_number=chapter_number,
                    limit=final_limit,
                )
                return SemanticRetrievalResult(
                    matches=ranked,
                    status="ok",
                    embedding_version=self.embedding_version,
                    ranking_version=self._hybrid_ranker.ranking_version,
                )
            except Exception as hybrid_exc:
                reason = type(hybrid_exc).__name__
                logger.warning(
                    "Hybrid ranking fallback to semantic-only for story %s (%s)",
                    story_id,
                    reason,
                )
                return SemanticRetrievalResult(
                    matches=tuple(matches[:final_limit]),
                    status="ok",
                    embedding_version=self.embedding_version,
                    ranking_version="semantic-only-fallback-v1",
                    fallback_reason=f"hybrid:{reason}",
                )
        except Exception as exc:
            reason = type(exc).__name__
            logger.warning(
                "Semantic retrieval fallback for story %s (%s)",
                story_id,
                reason,
            )
            return SemanticRetrievalResult(
                status="fallback",
                embedding_version=self.embedding_version,
                fallback_reason=reason,
            )
