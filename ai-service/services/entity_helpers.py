"""
Helper functions để chuyển đổi kết quả từ EntityPipeline
sang các format khác nhau mà các endpoint cần.

Trước refactor, các đoạn code chuyển đổi này bị lặp lại
ở extract-entities, sync-story, analyze/chapter, và process-interactions.
"""

from typing import Any


def pipeline_to_entity_out(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chuyển pipeline output → format cho /extract-entities và /analyze/chapter.

    Output format:
        {"Entity": ..., "word": ..., "Label": ..., "entity": ..., "Score": ..., "score": ...}
    """
    entities = []
    for r in results:
        label = r.get("label", r.get("entity", "UNKNOWN"))
        score = r["score"] / 10.0
        entities.append({
            "Entity": r["phrase"],
            "word": r["phrase"],
            "Label": label,
            "entity": label,
            "Score": score,
            "score": score,
        })
    return entities


def pipeline_to_sync_format(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chuyển pipeline output → format cho /sync-story.

    Output format:
        {"word": ..., "entity": ..., "score": ...}
    """
    return [
        {
            "word": r["phrase"],
            "entity": r.get("entity", "UNKNOWN"),
            "score": r["score"] / 10.0,
        }
        for r in results
    ]


def pipeline_to_interaction_format(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chuyển pipeline output → format cho /enhanced/process-interactions.

    Output format:
        {"word": ..., "Entity": ..., "entity": ..., "score": ..., "source": "hybrid_pipeline"}
    """
    return [
        {
            "word": r["phrase"],
            "Entity": r["phrase"],
            "entity": r.get("entity", "UNKNOWN"),
            "score": r["score"] / 10.0,
            "source": "hybrid_pipeline",
        }
        for r in results
    ]


def normalize_db_updates(
    db_updates: list[dict[str, Any]],
    fallback_story_id: str,
) -> list[dict[str, Any]]:
    """Chuẩn hóa kết quả DB update thành format thống nhất cho response."""
    return [
        {
            "entity": str(item.get("entity", "")),
            "label": str(item.get("label", "")),
            "story_id": str(item.get("story_id", fallback_story_id)),
            "status": str(item.get("status", "unknown")),
            "reason": str(item.get("reason")) if item.get("reason") is not None else None,
        }
        for item in db_updates
    ]
