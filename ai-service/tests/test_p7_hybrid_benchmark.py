from __future__ import annotations

from benchmarks.p7_hybrid_ranker_benchmark import run_proxy


def test_frozen_hybrid_proxy_beats_recent_and_does_not_regress_semantic_at_10():
    result = run_proxy()

    recent = result["recent"]["10"]
    semantic = result["semantic"]["10"]
    hybrid = result["hybrid"]["10"]

    assert recent["recall_at_k"] == 0.4095238095238095
    assert recent["mrr_at_k"] == 0.32857142857142857
    assert recent["ndcg_at_k"] == 0.3159955542693409

    assert hybrid["recall_at_k"] >= semantic["recall_at_k"]
    assert hybrid["mrr_at_k"] >= semantic["mrr_at_k"]
    assert hybrid["ndcg_at_k"] >= semantic["ndcg_at_k"]

    assert hybrid["recall_at_k"] > recent["recall_at_k"]
    assert hybrid["mrr_at_k"] > recent["mrr_at_k"]
    assert hybrid["ndcg_at_k"] > recent["ndcg_at_k"]
