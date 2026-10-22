"""Harness unit tests only; not substitutes for durable HTTP core evidence."""
import json
import sys

from Pipeline_test.tools import run_p123_headless as runner


def test_empty_exception_never_becomes_success(tmp_path, monkeypatch):
    class FailingProbe:
        def __init__(self, *args):
            self.project = "test-only"
            self.novel = None
            self.stage = "injected_failure"
            self.checks = []
            self.source_dirty = False
            self.source_sha = "test-only"

        def run(self):
            raise AssertionError()

        def save(self, name, data):
            (tmp_path / (name + ".json")).write_text(json.dumps(data))

    monkeypatch.setattr(runner, "Probe", FailingProbe)
    monkeypatch.setattr(sys, "argv", ["runner", "--env-file", "unused", "--output", str(tmp_path)])
    assert runner.main() == 1
    evidence = json.loads((tmp_path / "validation.json").read_text())
    assert evidence["verdict"] == "P1_CORE_BLOCKED"
    assert evidence["failure"]["type"] == "AssertionError"


def test_diagnostic_sql_cannot_mutate():
    probe = object.__new__(runner.Probe)
    import pytest
    for query in ["insert into users values (1)", "update users set role='ADMIN'", "delete from users"]:
        with pytest.raises(ValueError, match="SELECT"):
            probe.sql(query)


def test_evidence_redacts_nested_credentials():
    assert runner.sanitize({"password": "secret", "nested": [{"accessToken": "jwt"}],
                            "context_hash": "abc"}) == {
        "password": "[REDACTED]", "nested": [{"accessToken": "[REDACTED]"}], "context_hash": "abc"}


def test_fake_append_only_reconciliation_reuses_old_value_and_proposes_new():
    from Pipeline_test.tools.fake_p123_scenario import reconciliation
    data = {"approved": {"old": {"kind": "fact", "payload": {
        "fact_key": "scene", "fact_value": {"value": "Source observation"}}}},
        "candidates": [{"proposal_id": "same", "kind": "fact", "payload": {
            "fact_key": "scene", "fact_value": "Source observation"}},
            {"proposal_id": "new", "kind": "fact", "payload": {
                "fact_key": "note", "fact_value": "New source note"}}]}
    result = reconciliation(json.dumps(data))
    assert [(d["action"], d["target_id"]) for d in result["decisions"]] == [("reuse", "old"), ("new", "")]
    assert result["removed_ids"] == []
