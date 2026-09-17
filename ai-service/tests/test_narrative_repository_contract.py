from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.story_kb_manager import StoryKBManager
from domain.errors import IdempotencyConflictError, OptimisticLockError
from domain.models import NarrativeEvent, NarrativeProposal, ProposalStatus, StoryBrain
from domain.repositories import NarrativeRepository
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.json_narrative_repository import JsonNarrativeRepository
from infrastructure.orm_models import Base, EntityRecord, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


EVENT_ONE_ID = "10000000-0000-0000-0000-000000000001"
EVENT_TWO_ID = "10000000-0000-0000-0000-000000000002"
PROPOSAL_ONE_ID = "20000000-0000-0000-0000-000000000001"


class NarrativeRepositoryContract:
    repository: NarrativeRepository

    def test_empty_story_brain_is_created_on_read(self) -> None:
        brain = self.repository.get_story_brain("story-empty")

        self.assertIsInstance(brain, StoryBrain)
        self.assertEqual(brain.story_id, "story-empty")
        self.assertEqual(brain.entities, ())

    def test_entity_upsert_is_case_insensitive_and_counts_mentions(self) -> None:
        self.repository.upsert_entity(
            "story-entity", {"word": "Minh", "entity": "CHARACTER"}
        )
        self.repository.upsert_entity(
            "story-entity", {"word": "minh", "entity": "CHARACTER"}
        )

        entities = self.repository.list_entities("story-entity")
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0].mentions, 2)

    def test_alias_and_evidence_mention_are_idempotent(self) -> None:
        self.repository.upsert_entity(
            "story-evidence", {"word": "Minh", "entity": "CHARACTER"}
        )
        entity_id = self.repository.list_entities("story-evidence")[0].entity_id
        self.assertIsNotNone(entity_id)

        alias_one = self.repository.add_entity_alias("story-evidence", entity_id, "A Minh")
        alias_two = self.repository.add_entity_alias("story-evidence", entity_id, "A Minh")
        mention_kwargs = {
            "chapter_id": "chapter-1",
            "revision_id": "revision-1",
            "surface_text": "Minh",
            "source_start": 0,
            "source_end": 4,
            "source_text_hash": "c" * 64,
            "extractor_version": "test-v1",
        }
        mention_one = self.repository.add_entity_mention(
            "story-evidence", entity_id, **mention_kwargs
        )
        mention_two = self.repository.add_entity_mention(
            "story-evidence", entity_id, **mention_kwargs
        )

        brain = self.repository.get_story_brain("story-evidence")
        self.assertEqual(alias_one, alias_two)
        self.assertEqual(mention_one, mention_two)
        self.assertEqual(len(brain.aliases), 1)
        self.assertEqual(len(brain.mentions), 1)

    def test_event_is_appended_without_overwriting_history(self) -> None:
        first = NarrativeEvent(
            event_id=EVENT_ONE_ID,
            event_type="meeting",
            participants=("Minh", "Lan"),
            summary="Minh meets Lan",
        )
        second = NarrativeEvent(
            event_id=EVENT_TWO_ID,
            event_type="departure",
            participants=("Lan",),
            summary="Lan leaves",
        )

        self.repository.append_event("story-event", first)
        self.repository.append_event("story-event", second)

        self.assertEqual(
            [event.event_id for event in self.repository.get_story_brain("story-event").events],
            [EVENT_ONE_ID, EVENT_TWO_ID],
        )

    def test_proposal_save_is_idempotent_and_decision_is_explicit(self) -> None:
        proposal = NarrativeProposal(
            proposal_id=PROPOSAL_ONE_ID,
            proposal_type="fact",
            payload={"subject": "Minh", "fact": "is alive"},
        )

        self.repository.save_proposals("story-proposal", [proposal])
        self.repository.save_proposals("story-proposal", [proposal])
        decided = self.repository.decide_proposal(
            "story-proposal", PROPOSAL_ONE_ID, accepted=True, reason="author approved"
        )

        brain = self.repository.get_story_brain("story-proposal")
        self.assertEqual(len(brain.proposals), 1)
        self.assertEqual(decided.status, ProposalStatus.ACCEPTED)
        self.assertEqual(decided.decision_reason, "author approved")

    def test_analysis_run_is_idempotent_and_rejects_changed_input(self) -> None:
        kwargs = {
            "idempotency_key": "contract:analysis-1",
            "input_hash": "a" * 64,
            "operation": "extract_entities",
            "pipeline_version": "test-v1",
        }

        first = self.repository.get_or_create_analysis_run("story-run", **kwargs)
        second = self.repository.get_or_create_analysis_run("story-run", **kwargs)

        self.assertEqual(first.run_id, second.run_id)
        with self.assertRaises(IdempotencyConflictError):
            self.repository.get_or_create_analysis_run(
                "story-run", **{**kwargs, "input_hash": "b" * 64}
            )

    def test_missing_proposal_cannot_be_decided(self) -> None:
        with self.assertRaises(KeyError):
            self.repository.decide_proposal("story-missing", "unknown", accepted=False)

    def test_dependency_group_materializes_atomically_and_increments_once(self) -> None:
        group_id = "30000000-0000-0000-0000-000000000001"
        proposals = [
            NarrativeProposal(
                proposal_id="30000000-0000-0000-0000-000000000011",
                proposal_type="entity",
                payload={
                    "canonical_name": "Minh",
                    "normalized_name": "minh",
                    "entity_type": "PER",
                },
                dependency_group_id=group_id,
                materialization_order=10,
            ),
            NarrativeProposal(
                proposal_id="30000000-0000-0000-0000-000000000012",
                proposal_type="event",
                payload={
                    "event_type": "arrival",
                    "participants": ["Minh"],
                    "summary": "Minh arrives.",
                    "chapter": 1,
                },
                dependency_group_id=group_id,
                materialization_order=20,
            ),
            NarrativeProposal(
                proposal_id="30000000-0000-0000-0000-000000000013",
                proposal_type="fact",
                payload={
                    "fact_type": "world_rule",
                    "fact_key": "revival_forbidden",
                    "fact_value": {"forbidden": True},
                },
                dependency_group_id=group_id,
                materialization_order=30,
            ),
        ]
        self.repository.save_proposals("story-group", proposals)

        result = self.repository.accept_proposal_group(
            "story-group",
            [item.proposal_id for item in proposals],
            expected_brain_version=1,
        )

        brain = self.repository.get_story_brain("story-group")
        self.assertEqual(result["brain_version"], 2)
        self.assertEqual(len(brain.entities), 1)
        self.assertEqual(len(brain.events), 1)
        self.assertEqual(len(brain.facts), 1)
        self.assertTrue(all(item.status == ProposalStatus.ACCEPTED for item in brain.proposals))


class InMemoryNarrativeRepositoryTests(
    NarrativeRepositoryContract, unittest.TestCase
):
    def setUp(self) -> None:
        self.repository = InMemoryNarrativeRepository()
        self.assertIsInstance(self.repository, NarrativeRepository)


class JsonNarrativeRepositoryTests(NarrativeRepositoryContract, unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        manager = StoryKBManager(storage_dir=Path(self.temp_dir.name))
        self.repository = JsonNarrativeRepository(manager)
        self.assertIsInstance(self.repository, NarrativeRepository)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()


class PostgresNarrativeRepositoryTests(NarrativeRepositoryContract, unittest.TestCase):
    tenant_id = "00000000-0000-0000-0000-000000000001"

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            execution_options={"schema_translate_map": {SCHEMA: None}},
        )
        Base.metadata.create_all(self.engine)
        factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.repository = PostgresNarrativeRepository(
            factory,
            tenant_id=self.tenant_id,
            actor_id=self.tenant_id,
        )
        self.assertIsInstance(self.repository, NarrativeRepository)

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_analysis_run_is_idempotent_and_rejects_changed_input(self) -> None:
        kwargs = {
            "idempotency_key": f"{self.tenant_id}:analysis-1",
            "input_hash": "a" * 64,
            "operation": "extract_entities",
            "pipeline_version": "test-v1",
        }
        first = self.repository.get_or_create_analysis_run("story-run", **kwargs)
        second = self.repository.get_or_create_analysis_run("story-run", **kwargs)
        self.assertEqual(first.run_id, second.run_id)
        with self.assertRaises(IdempotencyConflictError):
            self.repository.get_or_create_analysis_run(
                "story-run", **{**kwargs, "input_hash": "b" * 64}
            )

    def test_tenant_scope_prevents_cross_tenant_reads(self) -> None:
        other_tenant = "00000000-0000-0000-0000-000000000002"
        other = PostgresNarrativeRepository(
            self.repository._session_factory,
            tenant_id=other_tenant,
            actor_id=other_tenant,
        )
        self.repository.upsert_entity(
            "shared-story", {"word": "Tenant A Hero", "entity": "CHARACTER"}
        )

        self.assertEqual(other.list_entities("shared-story"), [])

    def test_stale_proposal_version_is_rejected(self) -> None:
        first = NarrativeProposal(
            proposal_id="20000000-0000-0000-0000-000000000011",
            proposal_type="fact",
            payload={"value": "first"},
        )
        second = NarrativeProposal(
            proposal_id="20000000-0000-0000-0000-000000000012",
            proposal_type="fact",
            payload={"value": "second"},
        )
        self.repository.save_proposals("story-lock", [first, second])
        self.repository.decide_proposal("story-lock", first.proposal_id, accepted=True)

        with self.assertRaises(OptimisticLockError):
            self.repository.decide_proposal("story-lock", second.proposal_id, accepted=True)

    def test_author_locked_entity_rolls_back_conflicting_group(self) -> None:
        self.repository.upsert_entity(
            "story-author-lock", {"word": "Minh", "entity": "PER"}
        )
        with self.repository._session_factory.begin() as session:
            session.execute(
                update(EntityRecord)
                .where(EntityRecord.normalized_name == "minh")
                .values(is_locked=True)
            )
        proposal = NarrativeProposal(
            proposal_id="40000000-0000-0000-0000-000000000001",
            proposal_type="entity",
            payload={
                "canonical_name": "Minh",
                "normalized_name": "minh",
                "entity_type": "LOC",
            },
        )
        self.repository.save_proposals("story-author-lock", [proposal])

        with self.assertRaises(OptimisticLockError):
            self.repository.accept_proposal_group(
                "story-author-lock", [proposal.proposal_id], expected_brain_version=1
            )

        brain = self.repository.get_story_brain("story-author-lock")
        self.assertEqual(brain.entities[0].entity_type, "PER")
        self.assertEqual(brain.proposals[0].status, ProposalStatus.PENDING)
