from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
AI_SERVICE = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE))

from run_ctx_rd_01_full_source_e2e import (
    evaluate_rq0011_checklist,
    evaluate_rq0025_checklist,
    build_run_attestation,
)


class TestFullSourceE2EContract(unittest.TestCase):
    def test_checklist_heuristics_rq0011(self) -> None:
        draft_valid = (
            "Chương 27 ghi nhận Alan, Bram, Elena và Brand rèn thanh kiếm Thần Tinh tại lò rèn Frostspine. "
            "Tuy nhiên, Chương 32 lại nhắc đến một vũ khí Thần Tinh khác bị nứt khi chịu áp lực cao. "
            "Sự mâu thuẫn này phản ánh các ghi chép khác nhau."
        )
        res = evaluate_rq0011_checklist(draft_valid)
        self.assertIn("canonical_source_status_correctness", res)
        self.assertIn("chronology_causality", res)

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

    def test_fake_dry_run_never_claims_real_e2e(self) -> None:
        record = build_run_attestation(
            dry_run=True, document_calls=999, query_calls=999, successful_model_attempts=999,
        )
        self.assertEqual(record["mode"], "offline_fake")
        self.assertEqual(record["canary_gate_verdict"], "DRY_RUN_ONLY")
        self.assertEqual(record["source_grounded_live_vector_query"], "NOT_DEMONSTRATED")

    def test_live_e2e_rejects_missing_provider_calls(self) -> None:
        for d, q, s in ((0, 4, 1), (11, 0, 1), (11, 4, 0)):
            with self.subTest(document_calls=d, query_calls=q, success=s):
                with self.assertRaisesRegex(RuntimeError, "BLOCKED"):
                    build_run_attestation(
                        dry_run=False, document_calls=d,
                        query_calls=q, successful_model_attempts=s,
                    )

    def test_real_provider_claim_is_explicitly_mixed_provenance(self) -> None:
        record = build_run_attestation(
            dry_run=False, document_calls=11,
            query_calls=6, successful_model_attempts=2,
        )
        self.assertEqual(record["mode"], "live")
        self.assertEqual(record["source_grounded_live_vector_query"], "DEMONSTRATED")
        self.assertEqual(record["canary_gate_verdict"], "MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED")


if __name__ == "__main__":
    unittest.main()
