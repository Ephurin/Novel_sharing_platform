"""Repository regression (SQLite SQL backend); real PostgreSQL is tested by P1 HTTP E2E."""
import uuid
import hashlib

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from domain.models import NarrativeProposal
from application.writing_service import WritingService
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


def test_approved_entity_cutoff_comes_from_scoped_revision_provenance():
    engine = create_engine("sqlite://", execution_options={"schema_translate_map": {SCHEMA: None}})
    Base.metadata.create_all(engine)
    repo = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
                                      tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    novel = str(uuid.uuid4())
    try:
        def approve(chapter):
            revision = str(uuid.uuid4())
            repo.record_revision_provenance(novel, str(uuid.uuid4()), revision, chapter)
            version = int(repo.get_story_brain(novel).metadata["brain_version"])
            proposal = NarrativeProposal(str(uuid.uuid4()), "entity", {
                "canonical_name": "Later Arrival", "normalized_name": "later arrival", "entity_type": "PER"},
                dependency_group_id=str(uuid.uuid4()), expected_brain_version=version,
                evidence=({"revision_id": revision, "quote": "Later Arrival", "start": 0, "end": 13},))
            repo.save_proposals(novel, [proposal])
            repo.accept_proposal_group(novel, [proposal.proposal_id], version)

        def names(cutoff):
            return {e["name"] for e in repo.get_structured_context(novel, chapter_number=cutoff,
                                                                 enforce_token_budget=False).entities}

        approve(4)
        assert "Later Arrival" in names(4)
        assert "Later Arrival" not in names(3)
        # Earlier canonical evidence may be approved later; use minimum source chapter.
        approve(2)
        assert "Later Arrival" in names(2)
        assert "Later Arrival" not in names(1)
    finally:
        engine.dispose()


def test_multiple_generations_without_client_key_have_unique_durable_identity():
    engine = create_engine("sqlite://", execution_options={"schema_translate_map": {SCHEMA: None}})
    Base.metadata.create_all(engine)
    repo = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
                                      tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    service = WritingService(repo, None)
    text = "Source chapter."
    args = dict(tenant_id=str(repo._tenant_id), novel_id=str(uuid.uuid4()),
                chapter_id=str(uuid.uuid4()), revision_id=str(uuid.uuid4()),
                content_hash=hashlib.sha256(text.encode()).hexdigest(), source_text=text,
                selection={}, instruction="Continue", operation="continue", process_inline=False)
    try:
        first = service.start_generation(**args)
        second = service.start_generation(**args)
        assert first.job_id != second.job_id
        assert first.idempotency_key != second.idempotency_key
        keyed = service.start_generation(**args, idempotency_key="retry-once")
        assert service.start_generation(**args, idempotency_key="retry-once").job_id == keyed.job_id
    finally:
        engine.dispose()
