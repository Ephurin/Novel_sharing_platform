"""Explicit conversion between extractor relevance scores and proposal confidence."""
import math


def score_to_confidence(score: float) -> float:
    if isinstance(score, bool):
        raise ValueError("Entity score must be a finite number in [0, 10]")
    value = float(score)
    if not math.isfinite(value) or not 0 <= value <= 10:
        raise ValueError("Entity score must be a finite number in [0, 10]")
    # The entity output contract is always 0..10, including values below 1.
    return value / 10.0


def validate_confidence(confidence: float | None) -> None:
    if confidence is None:
        return
    if isinstance(confidence, bool) or not math.isfinite(float(confidence)) or not 0 <= float(confidence) <= 1:
        raise ValueError("Proposal confidence must be a finite number in [0, 1]")
