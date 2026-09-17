from __future__ import annotations

from core.settings import Settings
from core.story_kb_manager import StoryKBManager
from domain.repositories import NarrativeRepository
from infrastructure.database import create_database_engine, create_session_factory
from infrastructure.json_narrative_repository import JsonNarrativeRepository
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


def build_narrative_repository(
    settings: Settings, json_manager: StoryKBManager
) -> NarrativeRepository:
    if settings.narrative_repository == "json":
        return JsonNarrativeRepository(json_manager)

    engine = create_database_engine(settings.database_url)
    repository = PostgresNarrativeRepository(
        create_session_factory(engine),
        tenant_id=settings.default_tenant_id,
        actor_id=settings.default_actor_id,
    )
    repository.engine = engine
    return repository
