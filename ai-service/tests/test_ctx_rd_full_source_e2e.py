from __future__ import annotations

import json
import subprocess
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

    def test_dry_run_contract_execution(self) -> None:
        cmd = [sys.executable, str(SCRIPTS / "run_ctx_rd_01_full_source_e2e.py"), "--dry-run"]
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Dry-run failed: {proc.stderr}\n{proc.stdout}")

        evidence_path = ROOT / "docs" / "development" / "CTX-RD-01-OPT-IN-CANARY" / "full-source-e2e.json"
        self.assertTrue(evidence_path.exists())

        data = json.loads(evidence_path.read_text(encoding="utf-8"))
        self.assertEqual(data["canary_gate_verdict"], "FULL_SOURCE_E2E_DEMONSTRATED")
        self.assertEqual(data["production_default"], "legacy-v1")
        self.assertFalse(data["default_changed"])
        self.assertTrue(data["p8_05_blocked"])
        self.assertTrue(data["summary"]["all_hash_matched"])
        self.assertTrue(data["summary"]["all_zero_dropped"])
        self.assertTrue(data["summary"]["all_protected_overflow_false"])


if __name__ == "__main__":
    unittest.main()
