from __future__ import annotations

import hashlib
import os
import unittest
from dataclasses import replace
from unittest.mock import patch

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_llm_service, get_writing_service
from application.ports import RevisionContent
from application.writing_service import WritingService
from domain.models import NarrativeEntity, NarrativeEvent
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from tests.harness.fake_llm import FakeDeterministicLLMService


class P65R1TemporalHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000001"
        self.novel_id = "11111111-1111-1111-1111-111111111111"
        self.chapter_id = "22222222-2222-2222-2222-222222222222"
        self.revision_id = "33333333-3333-3333-3333-333333333333"

        self.sample_text = "Tiêu Viêm đi vào rừng rậm, bắt đầu thu thập dược liệu quý giá."
        self.content_hash = hashlib.sha256(self.sample_text.encode("utf-8")).hexdigest()

        self.revision = RevisionContent(
            revision_id=self.revision_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            content=self.sample_text,
            content_hash=self.content_hash,
        )

        self.repository = InMemoryNarrativeRepository()
        self.repository.get_story_brain(self.novel_id)

        self.revision_provider = InMemoryRevisionContentProvider([self.revision])
        self.fake_llm = FakeDeterministicLLMService()
        self.writing_service = WritingService(
            repository=self.repository,
            llm_service=self.fake_llm,
            revision_provider=self.revision_provider,
        )

        app.dependency_overrides[get_writing_service] = lambda: self.writing_service
        app.dependency_overrides[get_llm_service] = lambda: self.fake_llm
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_facts_filtered_by_chapter_cutoff(self) -> None:
        """Finding 4: Facts from later chapters must NOT leak into earlier chapter writing context."""
        brain = self.repository.get_story_brain(self.novel_id)

        # Fact 1: Established in chapter 1
        fact_ch1 = {
            "id": "fact_ch1",
            "fact_type": "world_rule",
            "fact_key": "rule_dan_duoc",
            "fact_value": "Đan dược tam phẩm cần đan hỏa cấp 3",
            "chapter_number": 1,
            "is_locked": True,
        }
        # Fact 2: Discovered only in chapter 5
        fact_ch5 = {
            "id": "fact_ch5",
            "fact_type": "world_rule",
            "fact_key": "rule_di_hoa",
            "fact_value": "Dị hỏa Thôn Thiên có thể nuốt chửng linh hồn",
            "chapter_number": 5,
            "is_locked": False,
        }

        self.repository._brains[self.novel_id] = replace(
            brain,
            facts=(fact_ch1, fact_ch5),
        )

        # Query context with cutoff at chapter 2
        context = self.repository.get_structured_context(self.novel_id, chapter_number=2)
        fact_keys = [r.get("fact_key") for r in context.world_rules]

        self.assertIn("rule_dan_duoc", fact_keys)
        self.assertNotIn("rule_di_hoa", fact_keys, "Fact from Chapter 5 leaked into Chapter 2 context!")

    def test_fail_closed_on_projection_error(self) -> None:
        """Finding 4: When state projection fails, repository must fail-closed (empty dynamic states)."""
        brain = self.repository.get_story_brain(self.novel_id)

        # Create entity and transition
        duoc_lao_id = self.repository.upsert_entity(
            self.novel_id,
            {"name": "Dược Lão", "type": "PER", "status": "Alive"},
        )
        evt_ch2 = NarrativeEvent(
            event_id="evt_ch2",
            event_type="PLOT",
            summary="Dược Lão truyền thụ công pháp",
            participants=("Dược Lão",),
            chapter=2,
        )
        self.repository._brains[self.novel_id] = replace(
            brain,
            events=(evt_ch2,),
            transitions=({
                "transition_id": "trans_1",
                "entity_id": duoc_lao_id,
                "event_id": "evt_ch2",
                "attribute_key": "status",
                "new_value": "Injured",
            },),
        )

        # Mock project to simulate runtime error during state projection
        with patch("infrastructure.in_memory_narrative_repository.project", side_effect=RuntimeError("Corrupt graph state")):
            context = self.repository.get_structured_context(self.novel_id, chapter_number=2)
            # Must fail closed: dynamic states are empty, NOT corrupted or falling back open
            self.assertEqual(len(context.current_states), 0, "Failed projection must fail-closed with empty entity states")

    def test_suggest_next_delegates_to_writing_service(self) -> None:
        """Finding 8: Legacy /suggest-next delegates generation to WritingService and returns valid response."""
        response = self.client.post(
            "/suggest-next",
            json={
                "character_name": "Tiêu Viêm",
                "current_text": self.sample_text,
                "story_id": self.novel_id,
                "mood": "neutral",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["character_name"], "Tiêu Viêm")
        self.assertIn("suggestions", data)
        self.assertIn("validations", data)
        self.assertEqual(response.headers.get("deprecation"), "true")
        self.assertIn("/v1/writing/generations", response.headers.get("link", ""))
