"""Catalog deparse compatibility; real DB parity is tested by the CI rehearsal."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("p8_readback", Path(__file__).resolve().parents[1] / "p8_rollback_readback.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SchemaComparisonTests(unittest.TestCase):
    def setUp(self):
        self.source = {"tables": {"narrative.fixture": {
            "constraints": [["status_check", "CHECK ((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[]))"]],
            "indexes": [["active_index", "CREATE UNIQUE INDEX active_index ON narrative.fixture (id) WHERE ((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[]))"]],
            "columns": [["status", "character varying", True]],
            "rows": [{"status": "queued"}],
        }}}
        self.restored = copy.deepcopy(self.source)
        for key in ("constraints", "indexes"):
            self.restored["tables"]["narrative.fixture"][key][0][1] = self.source["tables"]["narrative.fixture"][key][0][1].replace(
                "(ARRAY['queued'::character varying, 'running'::character varying])::text[]",
                "ARRAY[('queued'::character varying)::text, ('running'::character varying)::text]",
            )

    def test_equivalent_pg16_deparse_retains_raw_evidence(self):
        before = copy.deepcopy(self.source)
        self.assertEqual(module.comparable(self.source), module.comparable(self.restored))
        self.assertEqual(self.source, before)
        self.assertNotEqual(self.source, self.restored)

    def test_real_schema_or_data_changes_are_not_normalized_away(self):
        for kind in ("constraints", "indexes", "columns", "rows"):
            changed = copy.deepcopy(self.restored)
            changed["tables"]["narrative.fixture"][kind] = []
            with self.subTest(kind=kind):
                self.assertNotEqual(module.comparable(self.source), module.comparable(changed))
        changed = copy.deepcopy(self.restored)
        changed["tables"]["narrative.fixture"]["indexes"][0][1] = changed["tables"]["narrative.fixture"]["indexes"][0][1].replace("'running'", "'completed'")
        self.assertNotEqual(module.comparable(self.source), module.comparable(changed))

    def test_casts_with_other_types_are_not_rewritten(self):
        changed = copy.deepcopy(self.source)
        changed["tables"]["narrative.fixture"]["constraints"][0][1] = "CHECK (n = ANY ((ARRAY[1, 2])::bigint[]))"
        self.assertEqual(module.comparable(changed), changed)


if __name__ == "__main__":
    unittest.main()
