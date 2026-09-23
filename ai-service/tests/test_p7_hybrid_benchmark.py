from __future__ import annotations

import json
from pathlib import Path

import pytest

from benchmarks.p7_hybrid_ranker_benchmark import run_proxy


REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE = (
    REPO_ROOT
    / "docs"
    / "development"
    / "P7-01-EMBEDDING-BENCHMARK-ADR"
    / "baseline-results.json"
)


def test_frozen_hybrid_proxy_beats_recent_and_does_not_regress_semantic_at_10():
    result = run_proxy()

    recent = result["recent"]["10"]
    semantic = result["semantic"]["10"]
    hybrid = result["hybrid"]["10"]
    accepted_recent = json.loads(BASELINE.read_text(encoding="utf-8"))["metrics"]["10"]

    assert recent["recall_at_k"] == pytest.approx(accepted_recent["recall_at_k"])
    assert recent["mrr_at_k"] == pytest.approx(accepted_recent["mrr_at_k"])
    assert recent["ndcg_at_k"] == pytest.approx(accepted_recent["ndcg_at_k"])

    assert hybrid["recall_at_k"] >= semantic["recall_at_k"]
    assert hybrid["mrr_at_k"] >= semantic["mrr_at_k"]
    assert hybrid["ndcg_at_k"] >= semantic["ndcg_at_k"]

    assert hybrid["recall_at_k"] > recent["recall_at_k"]
    assert hybrid["mrr_at_k"] > recent["mrr_at_k"]
    assert hybrid["ndcg_at_k"] > recent["ndcg_at_k"]
