from __future__ import annotations

import logging

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
    ) -> None:
        self._repository = repository
        self._embedding_provider = embedding_provider
        self.embedding_version = embedding_version or embedding_provider.version
        self.default_limit = max(1, int(default_limit))
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

        try:
            raw_vector = self._embedding_provider.embed_query(query)
            query_vector = l2_normalize(
                raw_vector,
                expected_dimension=self._embedding_provider.dimension,
            )
            matches = self._repository.search_semantic_memories(
                story_id,
                query_embedding=query_vector,
                embedding_version=self.embedding_version,
                chapter_number=chapter_number,
                limit=limit or self.default_limit,
            )
            return SemanticRetrievalResult(
                matches=tuple(matches),
                status="ok",
                embedding_version=self.embedding_version,
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
