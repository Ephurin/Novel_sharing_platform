"""Detect event proposals that repeat an event already in Canon, and decide when a pending group made
against an older Story Brain version may still be accepted.

Live retest 3 (P1/P2): re-analysing an already reviewed chapter produced event proposals that
repeated approved events, and every pending group became unacceptable once any other review bumped
the brain version, so those groups stayed in the queue for ever.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# Events only append to the timeline (a new narrative order after the last one) and their references
# are checked again when the projection is rebuilt, so a group made only of events does not depend on
# the exact brain version it was proposed against.
REBASEABLE_TYPES = frozenset({"event"})


def _norm(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().casefold()


def _chapter(payload: dict[str, Any], evidence: Iterable[dict[str, Any]]) -> int | None:
    for item in evidence:
        if item.get("chapter_number") is not None:
            return int(item["chapter_number"])
    value = payload.get("chapter_number", payload.get("chapter"))
    return int(value) if value is not None else None


MIN_SHARED_QUOTE = 20


def _same_passage(a: str, b: str) -> bool:
    short, long = sorted((a, b), key=len)
    return len(short) >= MIN_SHARED_QUOTE and short in long


def duplicate_event(payload: dict[str, Any], evidence: Iterable[dict[str, Any]],
                    events: Iterable[Any]) -> Any | None:
    """The existing event this proposal repeats: the same chapter and an evidence quote that is the
    same passage (one quote contains the other). Summaries alone are not compared: two different
    events can share one. Corrections (supersedes_id) never count. Events are NarrativeEvent-like."""
    if payload.get("supersedes_id") or payload.get("supersedes"):
        return None
    evidence = list(evidence)
    chapter = _chapter(payload, evidence)
    quotes = [q for q in (_norm(e.get("quote")) for e in evidence) if q]
    if not quotes:
        return None
    for event in events:
        if chapter is not None and int(getattr(event, "chapter", 0) or 0) != chapter:
            continue
        metadata = getattr(event, "metadata", None) or {}
        known = [q for q in (_norm(e.get("quote")) for e in metadata.get("evidence", []) if isinstance(e, dict)) if q]
        if any(_same_passage(q, k) for q in quotes for k in known):
            return event
    return None


def can_rebase(proposal_types: Iterable[str]) -> bool:
    types = set(proposal_types)
    return bool(types) and types <= REBASEABLE_TYPES


def duplicate_message(event: Any) -> str:
    return (f"Sự kiện này đã có trong bộ nhớ (chương {getattr(event, 'chapter', '?')}: "
            f"\"{str(getattr(event, 'summary', ''))[:120]}\"). Hãy từ chối đề xuất trùng.")
