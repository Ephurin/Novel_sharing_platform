from __future__ import annotations

import hashlib
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
import sys
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT / "ai-service"))

from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder
from application.ports import RevisionContent
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from domain.models import StoryBrain, WritingContextPackage
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from run_ctx_rd_01_opt_in_canary import (
    InstrumentedRealGeminiLLMService,
    check_clean_working_tree,
    compute_context_hash,
)
from verify_ctx_rd_01_opt_in_canary_evidence import (
    build_valid_fixture,
    validate,
)


class TestCanaryHarnessInvariants(unittest.TestCase):
    def test_canary_evidence_validator_accepts_clean_evidence(self) -> None:
        canary, safety, cfg = build_valid_fixture()
        errors = validate(canary, safety, cfg)
        self.assertEqual(errors, [])

    def test_canary_evidence_validator_rejects_hash_mismatch(self) -> None:
        canary, safety, cfg = build_valid_fixture()
        canary["cases"][0]["job_context_hash"] = "0" * 64
        errors = validate(canary, safety, cfg)
        self.assertTrue(any("context_hash_mismatch" in e for e in errors))

    def test_canary_evidence_validator_rejects_missing_cases(self) -> None:
        canary, safety, cfg = build_valid_fixture()
        canary["cases"] = canary["cases"][:2]
        errors = validate(canary, safety, cfg)
        self.assertIn("insufficient_canary_cases", errors)

    def test_canary_evidence_validator_rejects_leakage(self) -> None:
        canary, safety, cfg = build_valid_fixture()
        safety["future_participant_leakage"] = 1
        errors = validate(canary, safety, cfg)
        self.assertIn("future_participant_leakage", errors)

    def test_instrumented_llm_service_attempt_tracking_and_redaction(self) -> None:
        fake_api_key = "AIzaSySecretApiKey123456789"
        service = InstrumentedRealGeminiLLMService(api_key=fake_api_key, model="gemini-3.8-flash")
        self.assertEqual(service.actual_provider_calls, 0)
        self.assertEqual(len(service.model_attempts), 0)

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_response = MagicMock()
            mock_response.text = '{"draft_text": "Draft output"}'
            mock_client.models.generate_content.return_value = mock_response

            result = service._call_gemini("System prompt", "User prompt")
            self.assertEqual(result, '{"draft_text": "Draft output"}')
            self.assertEqual(service.actual_provider_calls, 1)
            self.assertEqual(len(service.model_attempts), 1)
            self.assertEqual(service.model_attempts[0]["model"], "models/gemini-3.8-flash")
            self.assertEqual(service.model_attempts[0]["status"], "success")

            mock_client.models.generate_content.side_effect = RuntimeError(
                f"Invalid request with key {fake_api_key} from server"
            )
            with self.assertRaises(Exception) as ctx:
                service._call_gemini("System prompt", "User prompt")

            self.assertNotIn(fake_api_key, str(ctx.exception))
            self.assertIn("[REDACTED_API_KEY]", str(ctx.exception))
            self.assertEqual(len(service.model_attempts), 2)
            self.assertEqual(service.model_attempts[1]["status"], "failed")

    def test_writing_service_opt_in_canary_parity(self) -> None:
        repo = InMemoryNarrativeRepository()
        tenant_id = "00000000-0000-0000-0000-000000000001"
        novel_id = "10000000-0000-0000-0000-000000000001"
        chapter_id = "chapter-49"
        revision_id = "rev-49"
        source_text = "Đoàn kỵ binh ba ngàn quân của Roland tiến vào khe núi."
        instruction = "Tiếp tục mô tả tình trạng đoàn kỵ binh 3000 quân của Roland."
        content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()

        repo._brains[novel_id] = StoryBrain(
            story_id=novel_id,
            metadata={"brain_version": "1"},
        )

        rev_provider = InMemoryRevisionContentProvider([
            RevisionContent(
                revision_id=revision_id,
                novel_id=novel_id,
                chapter_id=chapter_id,
                content=source_text,
                content_hash=content_hash,
                chapter_number=49,
            )
        ])

        packer = ContextBudgetPacker()
        router = ContextBudgetRouter(packer)
        scope_builder = BalancedRelevanceScopeBuilder()

        service = WritingService(
            repository=repo,
            llm_service=FakeDeterministicLLMService(),
            context_routing_policy="balanced-scope-v1",
            context_scope_builder=scope_builder,
            context_budget_router=router,
            revision_provider=rev_provider,
        )

        gen_query = WritingService._build_semantic_query(
            instruction=instruction,
            selected_text=source_text,
        )
        preview = service.preview_context(
            tenant_id=tenant_id,
            story_id=novel_id,
            chapter_number=49,
            semantic_query=gen_query,
        )
        preview_hash = compute_context_hash(preview, packer)

        job = service.start_generation(
            tenant_id=tenant_id,
            novel_id=novel_id,
            chapter_id=chapter_id,
            revision_id=revision_id,
            content_hash=content_hash,
            operation="continue",
            source_text=source_text,
            selection={"start": 0, "end": len(source_text), "cursor": len(source_text)},
            instruction=instruction,
            chapter_number=49,
        )

        self.assertEqual(job.status, "completed")
        self.assertEqual(job.context_hash, preview_hash)


if __name__ == "__main__":
    unittest.main()
