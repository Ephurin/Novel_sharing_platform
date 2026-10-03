from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
AI_SERVICE = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE))

from run_ctx_rd_01_unadapted_narrative_e2e import (
    build_unadapted_run_attestation,
    build_unadapted_summary,
    evaluate_rq0011_checklist,
    evaluate_rq0025_checklist,
    sanitize_database_endpoint,
)
from verify_ctx_rd_01_unadapted_narrative_e2e_evidence import validate, EXPECTED_VERSION
from run_ctx_rd_01_opt_in_canary import (
    DEFAULT_CANARY_GENERATION_MODEL,
    InstrumentedRealGeminiLLMService,
    resolve_canary_generation_model,
)


class TestUnadaptedNarrativeE2EContract(unittest.TestCase):
    def test_default_generation_model_is_35_flash_lite(self) -> None:
        self.assertEqual(DEFAULT_CANARY_GENERATION_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(resolve_canary_generation_model(DEFAULT_CANARY_GENERATION_MODEL), "gemini-3.5-flash-lite")

    def test_31_flash_lite_can_be_selected(self) -> None:
        self.assertEqual(resolve_canary_generation_model("gemini-3.1-flash-lite"), "gemini-3.1-flash-lite")

    def test_38_flash_is_rejected_and_never_silent_fallback(self) -> None:
        with self.assertRaises(ValueError):
            resolve_canary_generation_model("gemini-3.8-flash")
        for model in ("gemini-3.5-flash-lite", "gemini-3.1-flash-lite"):
            service = InstrumentedRealGeminiLLMService(api_key="DUMMY_KEY", model=model)
            self.assertEqual(service._gemini_model_candidates(), [model])
            self.assertNotIn("gemini-3.8-flash", service._gemini_model_candidates())

    def test_sanitize_database_endpoint_redacts_credentials(self) -> None:
        raw_url = "postgresql+psycopg://myuser:secretpassword@localhost:5433/ephurin_staging"
        sanitized = sanitize_database_endpoint(raw_url)
        self.assertEqual(sanitized, "postgresql+psycopg://localhost:5433/ephurin_staging")
        self.assertNotIn("myuser", sanitized)
        self.assertNotIn("secretpassword", sanitized)
        self.assertIn("5433", sanitized)

    def test_sanitize_database_endpoint_preserves_host_without_port(self) -> None:
        raw_url = "postgresql+psycopg://admin:pass@dbserver/ephurin"
        sanitized = sanitize_database_endpoint(raw_url)
        self.assertEqual(sanitized, "postgresql+psycopg://dbserver/ephurin")

    def test_checklist_heuristics_rq0011(self) -> None:
        draft_valid = (
            "Chương 27 ghi nhận nguồn gốc ban đầu khi Alan, Bram, Elena và Brand rèn thanh kiếm Thần Tinh tại lò rèn Frostspine. "
            "Tuy nhiên, Chương 32 lại nhắc đến một vũ khí Thần Tinh khác bị nứt khi chịu áp lực cao. "
            "Sự mâu thuẫn này phản ánh các ghi chép khác nhau."
        )
        res = evaluate_rq0011_checklist(draft_valid)
        self.assertEqual(res["canonical_source_status_correctness"], "PASS")
        self.assertEqual(res["chronology_causality"], "PASS")

    def test_checklist_heuristics_rq0025(self) -> None:
        draft_valid = (
            "Tại Chương 45, báo cáo ban đầu ghi nhận việc chôn vùi trong vụ lở đất. "
            "Đến Chương 47, báo cáo lặp lại với số liệu không khớp và có sự mâu thuẫn. "
            "Dù vậy, ở Chương 49, Roland vẫn trực tiếp chỉ huy đội kỵ binh 3000 quân gần Hẻm Vực Tro Tàn."
        )
        res = evaluate_rq0025_checklist(draft_valid)
        self.assertEqual(res["canonical_source_status_correctness"], "PASS")
        self.assertEqual(res["chronology_causality"], "PASS")
        self.assertEqual(res["ambiguity_handling"], "PASS")
        self.assertTrue(res["chain_45_47_49_verified"])

    def test_dry_run_attestation_never_claims_unadapted_live(self) -> None:
        record = build_unadapted_run_attestation(
            dry_run=True, document_calls=11, query_calls=6, successful_model_attempts=2,
        )
        self.assertEqual(record["mode"], "offline_fake")
        self.assertEqual(record["canary_gate_verdict"], "DRY_RUN_ONLY")
        self.assertEqual(record["source_grounded_live_vector_query"], "NOT_DEMONSTRATED")
        self.assertEqual(record["structured_context_source"], "postgres_narrative_repository_unadapted_dry_run")

    def test_live_attestation_rejects_zero_provider_calls(self) -> None:
        for d, q, s in ((0, 4, 1), (11, 0, 1), (11, 4, 0)):
            with self.subTest(document_calls=d, query_calls=q, success=s):
                with self.assertRaisesRegex(RuntimeError, "BLOCKED"):
                    build_unadapted_run_attestation(
                        dry_run=False, document_calls=d, query_calls=q, successful_model_attempts=s,
                    )

    def test_live_attestation_requires_unadapted_provenance(self) -> None:
        record = build_unadapted_run_attestation(
            dry_run=False, document_calls=11, query_calls=6, successful_model_attempts=2,
        )
        self.assertEqual(record["mode"], "live")
        self.assertEqual(record["structured_context_source"], "postgres_narrative_repository_unadapted")
        self.assertEqual(record["canary_gate_verdict"], "UNADAPTED_NARRATIVE_E2E_DEMONSTRATED")

    def test_summary_distinguishes_technical_content_draft_and_stability(self) -> None:
        cases = [
            {
                "context_hash_match": True,
                "dropped_artifacts": 0,
                "protected_overflow": False,
                "budget_overflow": False,
                "raw_to_packed_semantic_ids_match": True,
                "generation": {"actual_provider_response": True},
                "checklist": {
                    "canonical_source_status_correctness": "PASS",
                    "chronology_causality": "PARTIAL",
                    "ambiguity_handling": "PASS",
                    "completeness": "PASS",
                },
            },
            {
                "context_hash_match": True,
                "dropped_artifacts": 0,
                "protected_overflow": False,
                "budget_overflow": False,
                "raw_to_packed_semantic_ids_match": True,
                "generation": {"actual_provider_response": True},
                "checklist": {
                    "canonical_source_status_correctness": "PASS",
                    "chronology_causality": "PASS",
                    "ambiguity_handling": "PASS",
                    "completeness": "PASS",
                },
            },
        ]
        summary = build_unadapted_summary(
            recorded_cases=cases,
            total_model_attempts=10,
            successful_model_attempts=2,
            failed_model_attempts=8,
        )
        self.assertEqual(summary["technical_execution"], "PASS")
        self.assertEqual(summary["automated_content_check"], "PARTIAL")
        self.assertEqual(summary["checklist_verdict"], "PARTIAL")
        self.assertEqual(summary["independent_full_draft_review"], "NOT_ASSESSED")
        self.assertEqual(summary["provider_stability"], "NOT_ACCEPTED")

    def test_summary_all_pass_content_check(self) -> None:
        cases = [
            {
                "context_hash_match": True,
                "dropped_artifacts": 0,
                "protected_overflow": False,
                "budget_overflow": False,
                "raw_to_packed_semantic_ids_match": True,
                "generation": {"actual_provider_response": True},
                "checklist": {
                    "canonical_source_status_correctness": "PASS",
                    "chronology_causality": "PASS",
                    "ambiguity_handling": "PASS",
                    "completeness": "PASS",
                },
            },
        ]
        summary = build_unadapted_summary(
            recorded_cases=cases,
            total_model_attempts=1,
            successful_model_attempts=1,
            failed_model_attempts=0,
        )
        self.assertEqual(summary["technical_execution"], "PASS")
        self.assertEqual(summary["automated_content_check"], "PASS")
        self.assertEqual(summary["checklist_verdict"], "PASS")
        self.assertEqual(summary["independent_full_draft_review"], "NOT_ASSESSED")
        self.assertEqual(summary["provider_stability"], "INSUFFICIENT")


if __name__ == "__main__":
    unittest.main()
