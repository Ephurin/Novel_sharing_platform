from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from application.semantic_memory_service import SemanticMemoryMaterializationService
from application.semantic_retriever import SemanticRetrieverService
from core.settings import Settings
from domain.embeddings import EmbeddingProviderError
from infrastructure.database import create_database_engine, create_session_factory
from infrastructure.embedding_providers import (
    DeterministicFakeEmbeddingProvider,
    GeminiEmbeddingProvider,
)
from infrastructure.postgres_semantic_memory_repository import (
    PostgresSemanticMemoryRepository,
)


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SemanticRuntime:
    retriever: SemanticRetrieverService | None = None
    materializer: SemanticMemoryMaterializationService | None = None
    engine: Any | None = None


def build_semantic_runtime(settings: Settings) -> SemanticRuntime:
    if not settings.semantic_retrieval_enabled:
        return SemanticRuntime()
    if settings.narrative_repository != "postgres":
        logger.warning(
            "Semantic retrieval disabled because NARRATIVE_REPOSITORY is not postgres"
        )
        return SemanticRuntime()

    try:
        if settings.embedding_provider == "gemini":
            provider = GeminiEmbeddingProvider()
        elif settings.embedding_provider == "fake":
            provider = DeterministicFakeEmbeddingProvider()
        else:
            logger.warning(
                "Semantic retrieval enabled without an embedding provider; "
                "Phase 6 fallback remains active"
            )
            return SemanticRuntime()

        if settings.active_embedding_version != provider.version:
            raise ValueError(
                "ACTIVE_EMBEDDING_VERSION must match the configured query/document "
                "embedding provider version"
            )

        engine = create_database_engine(settings.database_url)
        repository = PostgresSemanticMemoryRepository(
            create_session_factory(engine),
            tenant_id=settings.default_tenant_id,
        )
        return SemanticRuntime(
            retriever=SemanticRetrieverService(
                repository,
                provider,
                embedding_version=settings.active_embedding_version,
                default_limit=settings.semantic_retrieval_limit,
            ),
            materializer=SemanticMemoryMaterializationService(repository, provider),
            engine=engine,
        )
    except (EmbeddingProviderError, ValueError) as exc:
        logger.warning(
            "Semantic runtime unavailable at startup (%s); "
            "Phase 6 fallback remains active",
            type(exc).__name__,
        )
        return SemanticRuntime()


def build_semantic_retriever(settings: Settings) -> SemanticRetrieverService | None:
    """Compatibility helper for focused callers/tests."""
    return build_semantic_runtime(settings).retriever
