from __future__ import annotations

import math

import pytest

from benchmarks.p7_embedding_benchmark import (
    aggregate_metrics,
    cosine_similarity,
    evaluate_ranked_ids,
    l2_normalize,
    recent_rank,
    semantic_rank,
)


def test_l2_normalize_and_cosine_similarity() -> None:
    vector = l2_normalize([3.0, 4.0])
    assert math.isclose(math.sqrt(sum(value * value for value in vector)), 1.0)
    assert cosine_similarity(vector, vector) == pytest.approx(1.0)


def test_recent_rank_enforces_cutoff_and_orders_newest_first() -> None:
    memories = [
        {"memory_id": "mem-001", "chapter_number": 2},
        {"memory_id": "mem-002", "chapter_number": 5},
        {"memory_id": "mem-003", "chapter_number": 5},
        {"memory_id": "mem-004", "chapter_number": 9},
    ]

    assert recent_rank(memories, chapter_cutoff=5) == [
        "mem-003",
        "mem-002",
        "mem-001",
    ]


def test_semantic_rank_enforces_cutoff_before_similarity() -> None:
    memories = [
        {"memory_id": "old", "chapter_number": 2},
        {"memory_id": "current", "chapter_number": 5},
        {"memory_id": "future", "chapter_number": 6},
    ]
    vectors = {
        "old": [1.0, 0.0],
        "current": [0.8, 0.2],
        "future": [1.0, 0.0],
    }

    ranked = semantic_rank(
        memories,
        vectors,
        query_vector=[1.0, 0.0],
        chapter_cutoff=5,
    )

    assert ranked == ["old", "current"]
    assert "future" not in ranked


def test_evaluate_ranked_ids_uses_graded_relevance() -> None:
    query = {
        "query_id": "q1",
        "labels": [
            {"memory_id": "best", "grade": 3},
            {"memory_id": "relevant", "grade": 2},
            {"memory_id": "acceptable", "grade": 1},
            {"memory_id": "negative", "grade": 0},
            {"memory_id": "future", "grade": -1},
        ],
    }

    result = evaluate_ranked_ids(
        query,
        ["negative", "best", "relevant", "unjudged", "acceptable"],
        ks=(5,),
    )["5"]

    assert result["recall"] == pytest.approx(1.0)
    assert result["reciprocal_rank"] == pytest.approx(0.5)
    assert 0.0 < result["ndcg"] < 1.0


def test_aggregate_metrics_averages_query_metrics() -> None:
    per_query = [
        {
            "query_id": "q1",
            "metrics": {
                "5": {
                    "recall": 1.0,
                    "reciprocal_rank": 1.0,
                    "ndcg": 1.0,
                }
            },
        },
        {
            "query_id": "q2",
            "metrics": {
                "5": {
                    "recall": 0.0,
                    "reciprocal_rank": 0.0,
                    "ndcg": 0.0,
                }
            },
        },
    ]

    aggregate = aggregate_metrics(per_query, ks=(5,))["5"]

    assert aggregate["recall_at_k"] == pytest.approx(0.5)
    assert aggregate["mrr_at_k"] == pytest.approx(0.5)
    assert aggregate["ndcg_at_k"] == pytest.approx(0.5)
    assert aggregate["hit_query_rate"] == pytest.approx(0.5)
