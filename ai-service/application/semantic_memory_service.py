from __future__ import annotations

import hashlib
import logging
import uuid

from domain.embeddings import EmbeddingProvider, EmbeddingProviderError, l2_normalize
from domain.models import SemanticMemoryEmbedding
from domain.repositories import SemanticMemoryRepository


EVENT_MEMORY_TYPE = "event_summary"
logger = logging.getLogger(__name__)


class SemanticMemoryMaterializationService:
    """Builds rebuildable semantic memory without mutating canonical Story Brain data."""

    def __init__(
        self,
        repository: SemanticMemoryRepository,
        embedding_provider: EmbeddingProvider,
    ) -> None:
        self._repository = repository
        self._embedding_provider = embedding_provider

    def materialize_event_memories(self, story_id: str) -> dict[str, int | str]:
        sources = self._repository.list_event_memory_sources(story_id)
        usable_sources = [source for source in sources if source.summary.strip()]
        active_source_keys = {
            self._event_source_key(source.event_id) for source in usable_sources
        }

        removed_chunks = self._repository.delete_memory_chunks_not_in_sources(
            story_id,
            memory_type=EVENT_MEMORY_TYPE,
            active_source_keys=active_source_keys,
        )

        chunk_count = 0
        embedded_count = 0
        reused_embedding_count = 0

        for source in usable_sources:
            content = source.summary.strip()
            content_hash = self._content_hash(content)
            source_key = self._event_source_key(source.event_id)
            chunk = self._repository.upsert_memory_chunk(
                story_id,
                source_key=source_key,
                memory_type=EVENT_MEMORY_TYPE,
                content=content,
                content_hash=content_hash,
                importance_score=float(source.metadata.get("importance_score", 0.5)),
                narrative_order=source.narrative_order,
                chapter_id=source.chapter_id,
                revision_id=source.revision_id,
                event_id=source.event_id,
                entity_id=None,
                entity_ids=source.entity_ids,
                metadata={
                    **source.metadata,
                    "chapter_number": source.chapter_number,
                },
            )
            chunk_count += 1

            existing = self._repository.get_embedding(
                story_id,
                chunk.memory_chunk_id,
                self._embedding_provider.version,
            )
            if existing is not None and existing.content_hash == chunk.content_hash:
                reused_embedding_count += 1
                continue

            try:
                raw_vector = self._embedding_provider.embed_document(chunk.content)
                normalized = l2_normalize(
                    raw_vector,
                    expected_dimension=self._embedding_provider.dimension,
                )
            except EmbeddingProviderError as exc:
                raise EmbeddingProviderError(
                    f"Embedding failed for semantic memory {chunk.memory_chunk_id}"
                ) from exc

            embedding_id = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"memory-embedding:{chunk.memory_chunk_id}:{self._embedding_provider.version}",
                )
            )
            self._repository.upsert_embedding(
                story_id,
                SemanticMemoryEmbedding(
                    embedding_id=embedding_id,
                    memory_chunk_id=chunk.memory_chunk_id,
                    story_brain_id=chunk.story_brain_id,
                    tenant_id=chunk.tenant_id,
                    novel_id=chunk.novel_id,
                    embedding_model=self._embedding_provider.model,
                    embedding_version=self._embedding_provider.version,
                    embedding_dimension=self._embedding_provider.dimension,
                    normalization="l2",
                    content_hash=chunk.content_hash,
                    embedding=normalized,
                ),
            )
            embedded_count += 1

        coverage = self._repository.embedding_coverage(
            story_id,
            self._embedding_provider.version,
        )
        fresh_count = int(coverage.get("current", coverage.get("fresh_embeddings", 0)))
        stale_count = int(coverage.get("stale", 0))
        missing_count = int(
            coverage.get(
                "missing",
                max(0, int(coverage.get("memory_chunks", 0)) - fresh_count - stale_count),
            )
        )
        return {
            "embedding_version": self._embedding_provider.version,
            "source_count": len(sources),
            "memory_chunk_count": chunk_count,
            "removed_chunk_count": removed_chunks,
            "embedded_count": embedded_count,
            "reused_embedding_count": reused_embedding_count,
            "fresh_embedding_count": fresh_count,
            "stale_embedding_count": stale_count,
            "missing_embedding_count": missing_count,
        }

    @staticmethod
    def _event_source_key(event_id: str) -> str:
        return f"event:{event_id}"

    @staticmethod
    def _content_hash(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


def refresh_semantic_memory_safely(
    service: SemanticMemoryMaterializationService | None,
    story_id: str,
) -> dict[str, int | str]:
    """Best-effort post-commit refresh; never rolls back canonical acceptance."""
    if service is None:
        return {"status": "disabled"}
    try:
        result = service.materialize_event_memories(story_id)
        return {"status": "ok", **result}
    except Exception as exc:
        logger.warning(
            "Semantic-memory refresh failed for story %s (%s); "
            "canonical Story Brain remains authoritative",
            story_id,
            type(exc).__name__,
        )
        return {"status": "fallback", "reason": type(exc).__name__}
