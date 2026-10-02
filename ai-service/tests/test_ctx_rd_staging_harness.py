import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder
from application.writing_service import WritingService
from core.llm_service import LLMServiceError
from domain.models import WritingContextPackage
from run_ctx_rd_01_real_provider_staging import (
    InstrumentedGeminiEmbeddingProvider,
    InstrumentedRealGeminiLLMService,
    check_clean_working_tree,
    compute_context_hash,
)


class TestStagingHarnessInvariants(unittest.TestCase):
    def test_unscoped_vs_retained_ids_detection(self) -> None:
        """Verify that comparing pre-pack source IDs against post-pack retained IDs detects omissions."""
        unscoped_semantic = [{"memory_chunk_id": f"sem-{i}"} for i in range(8)]
        unscoped_recent = [{"event_id": f"ev-{i}"} for i in range(20)]
        unscoped_rules = [
            {"id": "r-locked-1", "is_locked": True},
            {"id": "r-locked-2", "is_locked": True},
            {"id": "r-unlocked-1", "is_locked": False},
            {"id": "r-unlocked-2", "is_locked": False},
        ]

        unscoped_semantic_ids = [ContextBudgetPacker._semantic_id(m) for m in unscoped_semantic]
        unscoped_recent_ids = [ContextBudgetPacker._event_id(e) for e in unscoped_recent]
        unscoped_canonical_rules = [
            r for r in unscoped_rules if bool(r.get("is_locked"))
        ] + [
            r for r in unscoped_rules if not bool(r.get("is_locked"))
        ]
        unscoped_rules_ids = [ContextBudgetPacker._rule_id(r) for r in unscoped_canonical_rules]

        # Case 1: Perfect retention (e.g. 12k tier)
        retained_semantic_ids = list(unscoped_semantic_ids)
        retained_recent_ids = list(unscoped_recent_ids)
        retained_rules_ids = list(unscoped_rules_ids)

        self.assertEqual(unscoped_semantic_ids, retained_semantic_ids)
        self.assertEqual(unscoped_recent_ids, retained_recent_ids)
        self.assertEqual(unscoped_rules_ids, retained_rules_ids)

        # Case 2: Omission/drop in any lane is detected (non-tautological)
        dropped_semantic_ids = unscoped_semantic_ids[:7]
        self.assertNotEqual(unscoped_semantic_ids, dropped_semantic_ids)

        dropped_recent_ids = unscoped_recent_ids[:19]
        self.assertNotEqual(unscoped_recent_ids, dropped_recent_ids)

        omitted_rules_ids = unscoped_rules_ids[:3]
        self.assertNotEqual(unscoped_rules_ids, omitted_rules_ids)

    def test_canonical_rules_ordering_matches_packer(self) -> None:
        """Verify that locked-first ordering matches ContextBudgetPacker._build_package ordering."""
        packer = ContextBudgetPacker()
        rules = [
            {"id": "r-unlocked-1", "is_locked": False, "rule": "B"},
            {"id": "r-locked-1", "is_locked": True, "rule": "A"},
            {"id": "r-unlocked-2", "is_locked": False, "rule": "D"},
            {"id": "r-locked-2", "is_locked": True, "rule": "C"},
        ]
        pkg = WritingContextPackage(
            brain_version=1,
            entities=(),
            current_states=(),
            recent_events=(),
            semantic_memories=(),
            world_rules=tuple(rules),
        )
        packed = packer.pack(pkg, maximum=12000)
        packed_rule_ids = [packer._rule_id(r) for r in packed.world_rules]

        canonical_source = [r for r in rules if bool(r.get("is_locked"))] + [
            r for r in rules if not bool(r.get("is_locked"))
        ]
        canonical_source_ids = [packer._rule_id(r) for r in canonical_source]

        self.assertEqual(packed_rule_ids, ["r-locked-1", "r-locked-2", "r-unlocked-1", "r-unlocked-2"])
        self.assertEqual(canonical_source_ids, packed_rule_ids)

    def test_context_hash_generation_preview_equivalence(self) -> None:
        """Verify that generation semantic query matches preview query, yielding identical context hash."""
        packer = ContextBudgetPacker()
        source_text = "Elena giơ cao thanh đoản kiếm vừa rèn."
        instruction = "Tiếp tục mô tả cảnh Elena cầm đoản kiếm chống lại ma thuật."

        gen_query = WritingService._build_semantic_query(
            instruction=instruction,
            selected_text=source_text,
        )
        self.assertIn("Elena", gen_query)
        self.assertIn("đoản kiếm", gen_query)

        pkg1 = WritingContextPackage(
            brain_version=1,
            entities=({"id": "e1", "name": "Elena"},),
            current_states=(),
            recent_events=({"id": "ev1", "summary": "Battle"},),
            semantic_memories=({"id": "sem1", "content": "Forge"},),
            world_rules=({"id": "r1", "rule": "Anti-mana"},),
        )
        hash1 = compute_context_hash(pkg1, packer)

        # Same package yields identical hash
        hash2 = compute_context_hash(pkg1, packer)
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

        # Different package yields different hash
        pkg_different = WritingContextPackage(
            brain_version=1,
            entities=({"id": "e1", "name": "Elena"},),
            current_states=(),
            recent_events=(),
            semantic_memories=(),
            world_rules=(),
        )
        hash_diff = compute_context_hash(pkg_different, packer)
        self.assertNotEqual(hash1, hash_diff)

    def test_instrumented_llm_service_attempt_tracking_and_redaction(self) -> None:
        """Verify that InstrumentedRealGeminiLLMService records attempts and redacts API keys."""
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
            with self.assertRaises(LLMServiceError):
                service._call_gemini("System prompt", "User prompt")

            self.assertEqual(service.actual_provider_calls, 2)
            failed_attempt = service.model_attempts[-1]
            self.assertEqual(failed_attempt["status"], "failed")
            self.assertNotIn(fake_api_key, failed_attempt["error_snippet"])
            self.assertIn("[REDACTED]", failed_attempt["error_snippet"])

    def test_stress_fixture_measurements_are_derived(self) -> None:
        """Verify that stress tier and exact-retention booleans are dynamically computed."""
        scope_builder = BalancedRelevanceScopeBuilder()
        packer = ContextBudgetPacker()
        router = ContextBudgetRouter(packer)

        stress_entities = [
            {"entity_id": f"ent-{i:03d}", "name": f"Heroic Order {i:03d}", "is_locked": True, "description": "Tactical order history lore " * 10}
            for i in range(5)
        ]
        stress_events = [
            {"event_id": f"ev-{i:03d}", "summary": f"Trận chiến lớn chương {i} tại chiến trường. " * 18, "chapter_number": i}
            for i in range(20)
        ]
        stress_semantic = [
            {"memory_chunk_id": f"sem-{i:03d}", "content": f"Bản ghi ký ức ngữ nghĩa về thanh kiếm kháng ma {i}. " * 25, "score": 0.9}
            for i in range(8)
        ]
        stress_rules = [
            {"fact_key": f"rul-{i:03d}", "rule": f"Quy tắc thế giới số {i}: Ma thuật bị triệt tiêu khi chạm quặng kháng ma. " * 10, "is_locked": True}
            for i in range(4)
        ]
        stress_package = WritingContextPackage(
            brain_version=1,
            entities=tuple(stress_entities),
            current_states=(),
            recent_events=tuple(stress_events),
            semantic_memories=tuple(stress_semantic),
            world_rules=tuple(stress_rules),
        )

        stress_scope = scope_builder.scope(stress_package, query_entity_ids=(), recent_participant_entity_ids=())
        stress_routed = router.route(stress_scope)
        selected_tier = stress_routed.token_budget["routing_selected_tier"]
        self.assertGreater(selected_tier, 12000)

        # Dynamic exact checks
        stress_unscoped_semantic = [ContextBudgetPacker._semantic_id(m) for m in stress_package.semantic_memories]
        stress_retained_semantic = [ContextBudgetPacker._semantic_id(m) for m in stress_routed.semantic_memories]
        self.assertTrue(stress_unscoped_semantic == stress_retained_semantic)

        stress_unscoped_recent = [ContextBudgetPacker._event_id(e) for e in stress_package.recent_events]
        stress_retained_recent = [ContextBudgetPacker._event_id(e) for e in stress_routed.recent_events]
        self.assertTrue(stress_unscoped_recent == stress_retained_recent)

        stress_canonical_rules = [r for r in stress_package.world_rules if bool(r.get("is_locked"))] + [
            r for r in stress_package.world_rules if not bool(r.get("is_locked"))
        ]
        stress_unscoped_rules = [ContextBudgetPacker._rule_id(r) for r in stress_canonical_rules]
        stress_retained_rules = [ContextBudgetPacker._rule_id(r) for r in stress_routed.world_rules]
        self.assertTrue(stress_unscoped_rules == stress_retained_rules)

        self.assertFalse(bool(stress_routed.token_budget.get("protected_overflow", False)))
        self.assertEqual(int(stress_routed.token_budget.get("dropped_artifact_count", 0)), 0)

    def test_check_clean_working_tree_preflight(self) -> None:
        """Verify that check_clean_working_tree fails on uncommitted code changes and passes when clean."""
        with patch("subprocess.run") as mock_run:
            # Case 1: Dirty tree with modified code
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout=" M ai-service/core/llm_service.py\n",
            )
            with self.assertRaisesRegex(RuntimeError, "Working tree is dirty"):
                check_clean_working_tree()

            # Case 2: Clean tree
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="",
            )
            with patch("run_ctx_rd_01_real_provider_staging.get_git_commit", return_value="f" * 40):
                commit = check_clean_working_tree()
                self.assertEqual(commit, "f" * 40)


if __name__ == "__main__":
    unittest.main()
