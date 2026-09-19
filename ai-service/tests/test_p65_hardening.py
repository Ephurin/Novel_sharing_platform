from __future__ import annotations

import hashlib
import os
import unittest
from dataclasses import replace

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_writing_service
from application.ports import RevisionContent
from application.writing_service import WritingService
from domain.models import NarrativeEntity, NarrativeEvent
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from tests.harness.fake_llm import FakeDeterministicLLMService


class P65IntegrationHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000001"
        self.novel_id = "11111111-1111-1111-1111-111111111111"
        self.chapter_id = "22222222-2222-2222-2222-222222222222"
        self.revision_id = "33333333-3333-3333-3333-333333333333"

        self.sample_text = "Tiêu Viêm quay lại Ô Thản Thành, gặp gỡ Dược Lão để tu luyện."
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

        self.client = TestClient(app)

    def test_direct_interactions_write_locked(self) -> None:
        """Exit criterion 8: Direct writes to canonical Story Brain via /v1/enhanced/process-interactions are locked (HTTP 403)."""
        response = self.client.post(
            "/v1/enhanced/process-interactions",
            json={
                "story_id": self.novel_id,
                "text": "Tiêu Viêm đi mua thuốc",
            },
        )
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertEqual(data["detail"]["code"], "DIRECT_WRITE_DISABLED")

    def test_suggest_next_deprecation_header(self) -> None:
        """Exit criterion 8: Legacy /suggest-next returns Deprecation header."""
        response = self.client.post(
            "/suggest-next",
            json={
                "character_name": "Tiêu Viêm",
                "current_text": "Tiêu Viêm đứng trước cổng thành.",
                "story_id": self.novel_id,
            },
        )
        self.assertIn("deprecation", response.headers)
        self.assertEqual(response.headers["deprecation"], "true")
        self.assertIn("link", response.headers)
        self.assertIn("/v1/writing/generations", response.headers["link"])

    def test_temporal_cutoff_prevents_future_state_leak(self) -> None:
        """Exit criterion 3: Old chapter rewrite (chapter 2) enforces temporal cutoff and as-of projection without leaking future events/death."""
        # 1. Create character Dược Lão
        duoc_lao_id = self.repository.upsert_entity(
            self.novel_id,
            {
                "name": "Dược Lão",
                "type": "PER",
                "status": "Alive",
                "location": "Nhẫn Cổ",
            },
        )

        # 2. Add events: one in chapter 2, one in chapter 5
        evt_ch2 = NarrativeEvent(
            event_id="evt_ch2",
            event_type="TRAINING",
            summary="Tiêu Viêm và Dược Lão tu luyện",
            participants=("Dược Lão", "Tiêu Viêm"),
            chapter=2,
        )
        evt_ch5 = NarrativeEvent(
            event_id="evt_ch5",
            event_type="BATTLE",
            summary="Hồn Điện bắt Dược Lão",
            participants=("Dược Lão", "Hồn Điện"),
            chapter=5,
        )
        self.repository.append_event(self.novel_id, evt_ch2)
        self.repository.append_event(self.novel_id, evt_ch5)

        # 3. Add transitions to brain: at chapter 2 status is "alive", at chapter 5 status is "dead"
        brain = self.repository.get_story_brain(self.novel_id)
        trans_ch2 = {
            "event_id": "evt_ch2",
            "entity_id": duoc_lao_id,
            "attribute_key": "status",
            "new_value": "Alive",
            "chapter": 2,
        }
        trans_ch5 = {
            "event_id": "evt_ch5",
            "entity_id": duoc_lao_id,
            "attribute_key": "status",
            "new_value": "Dead",
            "chapter": 5,
        }
        self.repository._brains[self.novel_id] = replace(
            brain,
            transitions=(trans_ch2, trans_ch5),
        )

        # 4. Query structured context as-of Chapter 2
        context = self.repository.get_structured_context(self.novel_id, chapter_number=2)

        # Verify temporal cutoff on events: only evt_ch2 is present, evt_ch5 is NOT present
        event_ids = [e["event_id"] for e in context.recent_events]
        self.assertIn("evt_ch2", event_ids)
        self.assertNotIn("evt_ch5", event_ids)

        # Verify as-of projection on entity state: Dược Lão status must NOT be Dead
        duoc_lao_state = next(
            (s for s in context.current_states if s.get("entity_id") == duoc_lao_id or s.get("name") == "Dược Lão"),
            None,
        )
        self.assertIsNotNone(duoc_lao_state)
        # Status as-of chapter 2 is Alive
        self.assertEqual(duoc_lao_state.get("status"), "Alive")

    def test_stale_brain_version_rejection_at_execution(self) -> None:
        """Exit criterion 2: Worker execution rejects stale brain version with STALE_BRAIN_VERSION."""
        # 1. Start generation targeting expected_brain_version = 1
        job = self.writing_service.start_generation(
            tenant_id=self.tenant_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            revision_id=self.revision_id,
            content_hash=self.content_hash,
            operation="continue",
            selection={"start": 0, "end": 0, "cursor": len(self.sample_text)},
            instruction="Tiếp tục đoạn văn",
            expected_brain_version=1,
            chapter_number=1,
            process_inline=False,
        )
        self.assertEqual(job.status, "queued")

        # 2. Simulate concurrent update to Story Brain that bumps version to 2
        brain = self.repository.get_story_brain(self.novel_id)
        self.repository._brains[self.novel_id] = replace(
            brain,
            metadata={**brain.metadata, "brain_version": "2"},
        )

        # 3. Worker executes job
        processed_job = self.writing_service.process_generation(job.job_id)

        # 4. Job must fail due to STALE_BRAIN_VERSION
        self.assertEqual(processed_job.status, "failed")
        self.assertIsNotNone(processed_job.error)
        self.assertEqual(processed_job.error.get("code"), "STALE_BRAIN_VERSION")

    def test_deterministic_token_budget_preserves_locked_rules(self) -> None:
        """Exit criterion 4: Deterministic token budgeting trims events but locked facts/rules are NEVER dropped."""
        # 1. Add locked rule and unlocked rule to brain.facts
        brain = self.repository.get_story_brain(self.novel_id)
        facts = (
            {
                "id": "rule_locked_1",
                "statement": "LOCKED: Đấu Khí Đại Lục tu luyện theo cảnh giới Đấu Giả, Đấu Sư, Đại Đấu Sư.",
                "fact_type": "world_rule",
                "is_locked": True,
            },
            {
                "id": "rule_unlocked_2",
                "statement": "UNLOCKED: Phí giao dịch tại Mễ Đặc Nhĩ đấu giá trường là 5 phần trăm.",
                "fact_type": "world_rule",
                "is_locked": False,
            },
        )
        # Add 15 events to inflate token count
        events = tuple(
            NarrativeEvent(
                event_id=f"evt_bulk_{i}",
                event_type="PLOT",
                summary=f"Sự kiện số {i} với mô tả dài dòng chi tiết nhằm tiêu tốn ngân sách tokens của hệ thống.",
                participants=("Tiêu Viêm",),
                chapter=1,
            )
            for i in range(15)
        )
        self.repository._brains[self.novel_id] = replace(
            brain,
            facts=facts,
            events=events,
        )

        # 2. Request context with very constrained token budget (e.g. 50 tokens)
        context = self.repository.get_structured_context(self.novel_id, token_budget=50)

        # Locked rule MUST be present
        rules = context.world_rules
        locked_rules = [r for r in rules if r.get("is_locked")]
        self.assertGreaterEqual(len(locked_rules), 1)
        self.assertEqual(locked_rules[0]["id"], "rule_locked_1")

        # Events must have been trimmed due to budget constraints
        self.assertLess(len(context.recent_events), len(events))


if __name__ == "__main__":
    unittest.main()
