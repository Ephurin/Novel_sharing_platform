from __future__ import annotations

import hashlib
import os
import unittest

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_writing_service
from application.ports import RevisionContent
from application.writing_service import WritingService
from domain.models import NarrativeEntity
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from tests.harness.fake_llm import FakeDeterministicLLMService


class WritingValidationGoldenTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000099"
        self.novel_id = "10000000-0000-0000-0000-000000000099"
        self.chapter_id = "20000000-0000-0000-0000-000000000099"
        self.revision_id = "30000000-0000-0000-0000-000000000099"

        self.sample_text = (
            "Tiêu Viêm đứng trên đỉnh núi, nhìn xuống thung lũng mịt mù sương khói.\n"
            "Không khí lạnh buốt đến thấu xương. Hắn vận chuyển đấu khí toàn thân."
        )
        self.content_hash = hashlib.sha256(self.sample_text.encode("utf-8")).hexdigest()

        self.revision = RevisionContent(
            revision_id=self.revision_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            content=self.sample_text,
            content_hash=self.content_hash,
        )

        self.repository = InMemoryNarrativeRepository()
        # Seed brain with version 1
        brain = self.repository.get_story_brain(self.novel_id)

        # Seed characters: Tiêu Viêm (alive), Hải Ba Đông (dead)
        self.repository.upsert_entity(
            self.novel_id,
            {
                "name": "Tiêu Viêm",
                "entity_type": "PER",
                "status": "active",
                "location": "Đỉnh núi",
                "is_locked": True,
            },
        )
        self.repository.upsert_entity(
            self.novel_id,
            {
                "name": "Hải Ba Đông",
                "entity_type": "PER",
                "status": "dead",
                "location": "Mạc Gia",
                "is_locked": True,
            },
        )

        from dataclasses import replace
        # Seed locked world rule: "Không thể dịch chuyển trong kết giới phong tỏa"
        fresh_brain = self.repository.get_story_brain(self.novel_id)
        rule = {
            "id": "rule-barrier-1",
            "type": "world_rule",
            "fact_type": "world_rule",
            "statement": "Cấm dịch chuyển trong kết giới phong tỏa",
            "is_locked": True,
        }
        self.repository._brains[self.novel_id] = replace(fresh_brain, facts=fresh_brain.facts + (rule,))

        self.provider = InMemoryRevisionContentProvider([self.revision])
        self.fake_llm = FakeDeterministicLLMService()
        self.writing_service = WritingService(
            repository=self.repository,
            llm_service=self.fake_llm,
            revision_provider=self.provider,
        )

        app.dependency_overrides[get_writing_service] = lambda: self.writing_service
        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Request-Id": "req-writing-golden-1",
        }

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_01_context_preview_budget_and_rules(self) -> None:
        """Verify context preview returns brain version, entities, states, and locked rules."""
        resp = self.client.get(
            f"/v1/story-brains/{self.novel_id}/context-preview?token_budget=5000",
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertEqual(data["brain_version"], 1)
        entity_names = [e["name"] for e in data["entities"]]
        self.assertIn("Tiêu Viêm", entity_names)
        self.assertIn("Hải Ba Đông", entity_names)
        self.assertGreaterEqual(len(data["world_rules"]), 1)
        self.assertEqual(data["token_budget"]["maximum"], 5000)

    def test_02_out_of_bounds_selection_rejected_422(self) -> None:
        """Golden check: Selection offset exceeding text length rejected with 422 before LLM."""
        text_len = len(self.sample_text)
        payload = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": self.content_hash,
            "operation": "rewrite",
            "selection": {"start": text_len + 10, "end": text_len + 50, "cursor": text_len + 10},
            "instruction": "Viết lại đoạn văn này",
        }
        resp = self.client.post("/v1/writing/generations", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 422)
        err = resp.json()
        self.assertEqual(err["detail"]["code"], "SELECTION_OUT_OF_BOUNDS")

    def test_03_content_hash_mismatch_rejected_409(self) -> None:
        """Golden check: Stale content hash rejected with 409 conflict."""
        bad_hash = "a" * 64
        payload = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": bad_hash,
            "operation": "continue",
            "selection": {"start": 0, "end": 0, "cursor": 10},
            "instruction": "Viết tiếp",
        }
        resp = self.client.post("/v1/writing/generations", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()["detail"]["code"], "CONTENT_HASH_MISMATCH")

    def test_04_brain_version_conflict_rejected_409(self) -> None:
        """Golden check: Stale brain version rejected with 409."""
        payload = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": self.content_hash,
            "operation": "continue",
            "selection": {"start": 0, "end": 0, "cursor": 10},
            "instruction": "Viết tiếp",
            "expected_brain_version": 999,  # actual is 1
        }
        resp = self.client.post("/v1/writing/generations", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()["detail"]["code"], "OPTIMISTIC_LOCK_CONFLICT")

    def test_05_idempotency_returns_same_job(self) -> None:
        """Golden check: Same idempotency key returns exact same job."""
        key = "idemp-key-test-42"
        payload = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": self.content_hash,
            "operation": "continue",
            "selection": {"start": 0, "end": 0, "cursor": 20},
            "instruction": "Tiêu Viêm chuẩn bị ra chiêu",
            "idempotency_key": key,
        }
        resp1 = self.client.post("/v1/writing/generations", json=payload, headers=self.headers)
        self.assertEqual(resp1.status_code, 202)
        job_id1 = resp1.json()["data"]["job_id"]

        resp2 = self.client.post("/v1/writing/generations", json=payload, headers=self.headers)
        self.assertEqual(resp2.status_code, 202)
        job_id2 = resp2.json()["data"]["job_id"]

        self.assertEqual(job_id1, job_id2)

    def test_06_dead_character_rule_violation_caught(self) -> None:
        """Golden check: Dead character (Hải Ba Đông) acting in draft triggers validation failure."""
        payload = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": self.content_hash,
            "operation": "dialogue",
            "selection": {"start": 0, "end": 0, "cursor": 15},
            "instruction": "dead character test: hải ba đông sống lại nói chuyện",
        }
        # Start generation and process synchronously for test
        job = self.writing_service.start_generation(
            tenant_id=self.tenant_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            revision_id=self.revision_id,
            content_hash=self.content_hash,
            operation="dialogue",
            selection={"start": 0, "end": 0, "cursor": 15},
            instruction="dead character test: hải ba đông sống lại nói chuyện",
            process_inline=True,
        )

        self.assertEqual(job.status, "completed")
        self.assertEqual(job.validation_status, "failed")
        codes = [v.code for v in job.validations if not v.passed]
        self.assertIn("DEAD_CHARACTER_ACTION", codes)

    def test_07_locked_world_rule_violation_caught(self) -> None:
        """Golden check: Teleporting in barrier triggers WORLD_RULE_VIOLATION."""
        job = self.writing_service.start_generation(
            tenant_id=self.tenant_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            revision_id=self.revision_id,
            content_hash=self.content_hash,
            operation="continue",
            selection={"start": 0, "end": 0, "cursor": 10},
            instruction="Tiêu Viêm dịch chuyển kết giới phong tỏa",
            process_inline=True,
        )

        self.assertEqual(job.status, "completed")
        self.assertEqual(job.validation_status, "failed")
        codes = [v.code for v in job.validations if not v.passed]
        self.assertIn("WORLD_RULE_VIOLATION", codes)

    def test_08_polymorphic_get_job_and_internal_api(self) -> None:
        """Verify polymorphic GET /v1/jobs/{job_id} and internal server-to-server endpoint."""
        job = self.writing_service.start_generation(
            tenant_id=self.tenant_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            revision_id=self.revision_id,
            content_hash=self.content_hash,
            operation="continue",
            selection={"start": 0, "end": 0, "cursor": 10},
            instruction="Viết tiếp đoạn văn",
            process_inline=True,
        )

        # 1. Polymorphic GET /v1/jobs/{job_id}
        resp = self.client.get(f"/v1/jobs/{job.job_id}", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertEqual(data["type"], "writing_generation")
        self.assertEqual(data["job_id"], job.job_id)
        self.assertEqual(data["status"], "completed")

        # 2. Internal Server-to-Server GET /internal/v1/writing/generations/{generation_id}
        internal_resp = self.client.get(f"/internal/v1/writing/generations/{job.job_id}")
        self.assertEqual(internal_resp.status_code, 200)
        internal_data = internal_resp.json()["data"]
        self.assertEqual(internal_data["job_id"], job.job_id)
        self.assertIsNotNone(internal_data["draft"])
        self.assertIsNotNone(internal_data["patch"])
        self.assertEqual(internal_data["validation_status"], "passed")

    def test_09_astra_probe_postgres_fact_value_rule_caught(self) -> None:
        """Astra probe: fact_value='không thể dịch chuyển trong kết giới', draft='Hắn dịch chuyển trong kết giới.' MUST fail."""
        from domain.models import WritingContextPackage, WritingPatch

        # Context package with fact_value exactly as stored in PostgreSQL narrative repository
        ctx = WritingContextPackage(
            brain_version=1,
            world_rules=(
                {
                    "entity_id": "world-1",
                    "fact_type": "world_rule",
                    "fact_value": "không thể dịch chuyển trong kết giới",
                    "is_locked": True,
                },
            ),
        )
        patch = WritingPatch(start=0, end=10, replacement="Hắn dịch chuyển trong kết giới.")
        validations = self.writing_service._validate_draft(
            draft_text="Hắn dịch chuyển trong kết giới.",
            patch=patch,
            context_package=ctx,
            constraints=(),
            instruction="dịch chuyển trong kết giới",
            base_content_length=100,
        )

        codes = [v.code for v in validations if not v.passed]
        self.assertIn("WORLD_RULE_VIOLATION", codes)

    def test_10_patch_upper_bound_violation_caught(self) -> None:
        """Patch end offset exceeding base content length MUST trigger PATCH_OUT_OF_BOUNDS."""
        from domain.models import WritingContextPackage, WritingPatch

        ctx = WritingContextPackage(brain_version=1)
        patch = WritingPatch(start=0, end=999999, replacement="văn bản mới")
        validations = self.writing_service._validate_draft(
            draft_text="văn bản mới",
            patch=patch,
            context_package=ctx,
            constraints=(),
            instruction="viết tiếp",
            base_content_length=100,
        )

        codes = [v.code for v in validations if not v.passed]
        self.assertIn("PATCH_OUT_OF_BOUNDS", codes)

    def test_11_idempotency_key_conflict_different_input_rejected_409(self) -> None:
        """Reusing same idempotency_key with different payload parameters MUST return HTTP 409."""
        key = "idem-key-conflict-test-1"
        payload1 = {
            "novel_id": self.novel_id,
            "chapter_id": self.chapter_id,
            "revision_id": self.revision_id,
            "content_hash": self.content_hash,
            "operation": "continue",
            "selection": {"start": 0, "end": 0, "cursor": 0},
            "instruction": "Lệnh ban đầu",
            "idempotency_key": key,
        }
        resp1 = self.client.post("/v1/writing/generations", json=payload1, headers=self.headers)
        self.assertEqual(resp1.status_code, 202)

        # Same key, but different instruction
        payload2 = dict(payload1)
        payload2["instruction"] = "Lệnh thứ hai hoàn toàn khác biệt"
        resp2 = self.client.post("/v1/writing/generations", json=payload2, headers=self.headers)
        self.assertEqual(resp2.status_code, 409)
        self.assertEqual(resp2.json()["detail"]["code"], "IDEMPOTENCY_CONFLICT")

    def test_12_internal_endpoint_service_token_auth(self) -> None:
        """Internal server-to-server endpoint enforces service token when configured."""
        job = self.writing_service.start_generation(
            tenant_id=self.tenant_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            revision_id=self.revision_id,
            content_hash=self.content_hash,
            operation="continue",
            selection={"start": 0, "end": 0, "cursor": 10},
            instruction="Viết tiếp",
            process_inline=True,
        )

        from api.deps import get_settings
        from core.settings import Settings

        class MockSettings:
            platform_service_token = "secret-service-token-123"

        app.dependency_overrides[get_settings] = lambda: MockSettings()

        try:
            # 1. Missing token -> 401
            resp_no_token = self.client.get(f"/internal/v1/writing/generations/{job.job_id}")
            self.assertEqual(resp_no_token.status_code, 401)

            # 2. Wrong token -> 403
            resp_wrong = self.client.get(
                f"/internal/v1/writing/generations/{job.job_id}",
                headers={"Authorization": "Bearer wrong-token"},
            )
            self.assertEqual(resp_wrong.status_code, 403)

            # 3. Correct token -> 200
            resp_correct = self.client.get(
                f"/internal/v1/writing/generations/{job.job_id}",
                headers={"Authorization": "Bearer secret-service-token-123"},
            )
            self.assertEqual(resp_correct.status_code, 200)
            self.assertEqual(resp_correct.json()["data"]["job_id"], job.job_id)
        finally:
            app.dependency_overrides.pop(get_settings, None)

