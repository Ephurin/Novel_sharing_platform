from __future__ import annotations

import logging

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


def build_semantic_retriever(settings: Settings) -> SemanticRetrieverService | None:
    if not settings.semantic_retrieval_enabled:
        return None
    if settings.narrative_repository != "postgres":
        logger.warning(
            "Semantic retrieval disabled because NARRATIVE_REPOSITORY is not postgres"
        )
        return None

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
            return None

        engine = create_database_engine(settings.database_url)
        repository = PostgresSemanticMemoryRepository(
            create_session_factory(engine),
            tenant_id=settings.default_tenant_id,
        )
        service = SemanticRetrieverService(
            repository,
            provider,
            embedding_version=settings.active_embedding_version,
            default_limit=settings.semantic_retrieval_limit,
        )
        service.engine = engine
        return service
    except (EmbeddingProviderError, ValueError) as exc:
        logger.warning(
            "Semantic retriever unavailable at startup (%s); "
            "Phase 6 fallback remains active",
            type(exc).__name__,
        )
        return None
